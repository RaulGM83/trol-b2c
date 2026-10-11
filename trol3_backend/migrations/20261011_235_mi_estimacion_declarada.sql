-- 235 · Modo declarado en /mi: «mientras encontramos tu información en el IMSS» (11-oct-2026)
--
-- Decisiones de Raul (claude/102 §pendiente, 11-oct): la tarjeta aparece cuando no hay historial y
-- la consulta lleva > 3 min (o está atorada, o no hay consulta); pregunta cotiza hoy · sueldo · años
-- cotizados · (antes de jul-97 si nació antes de 1980) · AFORE · saldo AFORE · saldo Infonavit;
-- las oportunidades siguen corriendo sobre lo declarado; sólo en /mi.
--
-- 1) mi_estimacion(): qué sabemos ya (declarado o validado), si toca mostrar la tarjeta y por qué.
-- 2) mi_estimacion_declarar(jsonb): guarda las respuestas en una sola llamada (capa declarado).
--    `ley` no es editable por el cliente en el catálogo; aquí entra directo a `datos` porque
--    la deriva una pregunta cerrada («¿empezaste a cotizar antes de julio de 1997?»).

create or replace function trol3.mi_estimacion()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'trol3', 'public'
as $$
declare pid uuid := trol3.current_persona_id(); p record; ult record; validado boolean; mostrar boolean; motivo text; d jsonb;
begin
  if pid is null then return null; end if;
  select curp, fecha_nacimiento, sexo into p from trol3.personas where id = pid;

  validado := exists (select 1 from trol3.datos x where x.persona_id = pid and x.campo = 'semanas_cotizadas' and x.capa = 'validado');

  select c.estado::text as estado, c.proveedor, c.created_at into ult
    from trol3.consultas c
   where c.persona_id = pid and c.tipo in ('imss_historial', 'imss_ventanilla')
   order by c.created_at desc limit 1;

  if validado then
    mostrar := false; motivo := 'ya_hay_historial';
  elsif ult.estado is null then
    mostrar := true; motivo := case when p.curp is null then 'sin_curp' else 'sin_consulta' end;
  elsif ult.estado in ('sin_resultado', 'error', 'cancelada') then
    mostrar := true; motivo := 'atorada';
  elsif ult.created_at < now() - interval '3 minutes' then
    mostrar := true; motivo := 'tardando';
  else
    mostrar := false; motivo := 'buscando';
  end if;

  -- lo que ya tenemos, venga de donde venga (el validado gana en v_mejor_dato)
  select jsonb_object_agg(m.campo, jsonb_build_object('valor', m.valor, 'capa', m.capa, 'en', m.obtenido_en)) into d
    from trol3.v_mejor_dato m
   where m.persona_id = pid
     and m.campo in ('ley', 'status_empleo', 'salario_diario', 'semanas_cotizadas', 'afore_actual', 'saldo_rcv97', 'saldo_infonavit');

  return jsonb_build_object(
    'mostrar', mostrar,
    'motivo', motivo,
    'fecha_nacimiento', p.fecha_nacimiento,
    'sexo', p.sexo,
    'curp', p.curp is not null,
    'consulta', case when ult.estado is null then null else jsonb_build_object('estado', ult.estado, 'proveedor', ult.proveedor, 'desde', ult.created_at) end,
    'datos', coalesce(d, '{}'::jsonb),
    'afores', (select to_jsonb(opciones) from trol3.catalogo_campos where campo = 'afore_actual')
  );
end $$;

revoke all on function trol3.mi_estimacion() from public, anon;
grant execute on function trol3.mi_estimacion() to authenticated;

create or replace function trol3.mi_estimacion_declarar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare pid uuid := trol3.current_persona_id(); n int := 0; v jsonb; sal numeric; anios numeric;
begin
  if pid is null then raise exception 'sin_persona'; end if;
  if exists (select 1 from trol3.datos x where x.persona_id = pid and x.campo = 'semanas_cotizadas' and x.capa = 'validado') then
    return jsonb_build_object('ok', false, 'motivo', 'ya_hay_historial');
  end if;

  -- ¿cotizas hoy? → status_empleo (empleado | desempleado)
  if p ? 'cotiza' and jsonb_typeof(p -> 'cotiza') = 'boolean' then
    perform trol3.declarar(pid, 'status_empleo', to_jsonb(case when (p ->> 'cotiza')::boolean then 'empleado' else 'desempleado' end), 'cliente', pid, 'declarado'); n := n + 1;
  end if;
  -- sueldo mensual → salario diario (tope 25 UMA lo pone el motor)
  sal := trol3.to_num_safe(p ->> 'sueldo_mensual');
  if sal is not null and sal > 0 then
    perform trol3.declarar(pid, 'salario_diario', to_jsonb(round(sal / 30.4, 2)), 'cliente', pid, 'declarado'); n := n + 1;
  end if;
  -- años cotizados → semanas
  anios := trol3.to_num_safe(p ->> 'anios_cotizados');
  if anios is not null and anios >= 0 then
    perform trol3.declarar(pid, 'semanas_cotizadas', to_jsonb(round(anios * 52)), 'cliente', pid, 'declarado'); n := n + 1;
  end if;
  -- ¿antes de julio de 1997? → ley. El catálogo no la deja al cliente y `declarar` con otro actor
  -- exige miembro, así que entra directo a datos (capa declarado, origen cliente).
  if p ? 'antes_97' and jsonb_typeof(p -> 'antes_97') = 'boolean' then
    insert into trol3.datos (persona_id, campo, valor, capa, origen_tipo, origen_id, obtenido_en, pagado_por, visibilidad)
    values (pid, 'ley', to_jsonb(case when (p ->> 'antes_97')::boolean then 'Ley73' else 'Ley97' end), 'declarado', 'cliente', pid, now(), 'cliente', '{trol,cliente}');
    n := n + 1;
  end if;
  -- AFORE
  if coalesce(p ->> 'afore', '') <> '' then
    perform trol3.declarar(pid, 'afore_actual', to_jsonb(p ->> 'afore'), 'cliente', pid, 'declarado'); n := n + 1;
  end if;
  -- saldos (0 o vacío = no sabe: no se guarda nada)
  v := p -> 'saldo_afore';
  if trol3.to_num_safe(v #>> '{}') > 0 then perform trol3.declarar(pid, 'saldo_rcv97', to_jsonb(trol3.to_num_safe(v #>> '{}')), 'cliente', pid, 'declarado'); n := n + 1; end if;
  v := p -> 'saldo_infonavit';
  if trol3.to_num_safe(v #>> '{}') > 0 then perform trol3.declarar(pid, 'saldo_infonavit', to_jsonb(trol3.to_num_safe(v #>> '{}')), 'cliente', pid, 'declarado'); n := n + 1; end if;

  perform trol3.emitir_evento(pid, 'estimacion_declarada', 'cliente', pid, jsonb_build_object('campos', n));
  return jsonb_build_object('ok', true, 'campos', n);
end $$;

revoke all on function trol3.mi_estimacion_declarar(jsonb) from public, anon;
grant execute on function trol3.mi_estimacion_declarar(jsonb) to authenticated;
