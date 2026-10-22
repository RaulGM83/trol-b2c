-- 250 — Régimen de Mod 40 tras el acuerdo del Consejo Técnico (DOF 21-oct-2026).
-- Spec: claude/106. Espejo de pension-core `regimenMod40` (mod40-ventana.ts) y
-- del nodo n8n Calculadora Trol v5.8. Si cambia uno, cambian los tres.
--
-- 1. config: corte, UMA extra, umbral de recuperación.
-- 2. parametros_anuales: UMA y salario mínimo por año (lo que el motor TS trae
--    en tablas.ts; aquí sólo lo que necesita el régimen).
-- 3. catalogo_campos: los campos nuevos que escribe n8n v5.8.
-- 4. trol3.regimen_mod40(persona, fecha) → jsonb.

-- 1 -------------------------------------------------------------------------
insert into trol3.config (clave, valor) values
  ('mod40_regimen_corte', '2026-10-22'),
  ('mod40_uma_extra', '1'),
  ('mod40_umbral_recuperacion_meses', '36')
on conflict (clave) do update set valor = excluded.valor, updated_at = now();

-- 2 -------------------------------------------------------------------------
create table if not exists trol3.parametros_anuales (
  anio int primary key,
  uma numeric not null,
  salario_minimo numeric not null
);
comment on table trol3.parametros_anuales is 'UMA y salario mínimo diarios por año. Fuente: pension-core/src/tablas.ts (250).';
insert into trol3.parametros_anuales (anio, uma, salario_minimo) values
  (2019, 84.49, 102.68), (2020, 86.88, 123.22), (2021, 89.62, 141.70), (2022, 96.22, 172.87),
  (2023, 103.74, 207.44), (2024, 108.57, 248.93), (2025, 113.14, 278.88), (2026, 117.35, 315.04)
on conflict (anio) do update set uma = excluded.uma, salario_minimo = excluded.salario_minimo;
alter table trol3.parametros_anuales enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'trol3' and tablename = 'parametros_anuales' and policyname = 'parametros_anuales_lectura') then
    create policy parametros_anuales_lectura on trol3.parametros_anuales for select to authenticated using (true);
  end if;
end $p$;

-- UMA / SM del año con clamp a los extremos (como `porAnio` del motor).
create or replace function trol3.uma_de(p_anio int) returns numeric
language sql stable set search_path to 'trol3','public' as $$
  select uma from trol3.parametros_anuales
  order by abs(anio - p_anio), anio desc limit 1
$$;
create or replace function trol3.salario_minimo_de(p_anio int) returns numeric
language sql stable set search_path to 'trol3','public' as $$
  select salario_minimo from trol3.parametros_anuales
  order by abs(anio - p_anio), anio desc limit 1
$$;

-- 3 -------------------------------------------------------------------------
insert into trol3.catalogo_campos (campo, nombre, grupo, tipo, unidad, editable_cliente, visible_cliente, visible_aliado, orden) values
  ('mod40_regimen',          'Régimen Mod 40 (anterior/nuevo)',           'calculo', 'text',   null,  false, false, true, 88),
  ('mod40_sbc_tope',         'Tope de salario Mod 40 (SBC + 1 UMA)',      'calculo', 'number', 'mxn', false, true,  true, 89),
  ('mod40_permitida',        'Puede contratar Mod 40',                     'calculo', 'bool',   null,  false, true,  true, 90),
  ('pension_mod10_futuro',   'Pensión con Mod 10 futuro (25 UMA)',         'calculo', 'number', 'mxn', false, true,  true, 91),
  ('costo_mensual_mod40',    'Cuota mensual Mod 40 al tope',               'calculo', 'number', 'mxn', false, true,  true, 92),
  ('costo_mensual_mod10',    'Cuota mensual Mod 10 a 25 UMA',              'calculo', 'number', 'mxn', false, true,  true, 93),
  ('mod40_caminos',          'Caminos: pensión hoy · Mod 40 · Mod 10',     'calculo', 'json',   null,  false, false, true, 94)
on conflict (campo) do update set nombre = excluded.nombre, grupo = excluded.grupo, tipo = excluded.tipo, unidad = excluded.unidad;

-- 4 -------------------------------------------------------------------------
-- Régimen a una fecha de trámite. Lee el historial de la última semilla; si no
-- hay, usa `ultima_modalidad`, `status_empleo` y `salario_diario` del expediente.
-- Nunca lanza. Mismo orden de "último registro" que derivar_ultima_modalidad.
create or replace function trol3.regimen_mod40(p_persona uuid, p_fecha date default null)
returns jsonb
language plpgsql stable security definer set search_path to 'trol3','public'
as $fn$
declare
  v_fecha date := coalesce(p_fecha, trol3._hoy_mx());
  v_corte date := coalesce((select valor::date from trol3.config where clave = 'mod40_regimen_corte'), '2026-10-22');
  v_uma_extra numeric := coalesce((select valor::numeric from trol3.config where clave = 'mod40_uma_extra'), 1);
  v_anio int := extract(year from v_fecha)::int;
  v_uma numeric := trol3.uma_de(v_anio);
  v_sm numeric := trol3.salario_minimo_de(v_anio);
  hist jsonb; u jsonb; emp text; rp text;
  v_mod text; v_sin_baja boolean; v_alta date; v_sbc numeric; v_lim date;
  v_regimen text; v_tope40 numeric; v_tope10 numeric := v_uma * 25;
  v_permitida boolean; v_motivo text; v_antes boolean;
begin
  perform trol3._guard_miembro(p_persona);

  select valor->'historial' into hist from trol3.v_mejor_dato
   where persona_id = p_persona and campo = 'semilla' limit 1;
  if hist is not null and jsonb_typeof(hist) = 'array' and jsonb_array_length(hist) > 0 then
    select h.value into u from jsonb_array_elements(hist) h
    order by coalesce(trol3.to_date_safe(h.value->>'fecha_fin'), '2099-01-01'::date) desc,
             trol3.to_date_safe(h.value->>'fecha_inicio') desc nulls last
    limit 1;
  end if;

  if u is not null then
    emp := upper(coalesce(u->>'empleador',''));
    rp  := coalesce(u->>'registro_patronal','');
    v_mod := case
      when emp like '%CONTINUACION VOLUNTARIA%' or rp ~ '9999940$' then 'mod40'
      when emp like '%TRABAJADORAS INDEPENDIENTES%' then 'independiente'
      when emp like '%INCORPORACION VOLUNTARIA%' then 'otra_voluntaria'
      else 'obligatorio' end;
    v_sin_baja := trol3.to_date_safe(u->>'fecha_fin') is null;
    v_alta := case when v_mod = 'mod40' then trol3.to_date_safe(u->>'fecha_inicio') end;
    v_sbc := trol3.to_num_safe(u->>'salario_base');
  else
    select valor#>>'{}' into v_mod from trol3.v_mejor_dato where persona_id = p_persona and campo = 'ultima_modalidad';
    v_sin_baja := coalesce((select valor#>>'{}' from trol3.v_mejor_dato where persona_id = p_persona and campo = 'status_empleo') = 'empleado', false);
  end if;
  if v_sbc is null then
    select trol3.jnum(valor) into v_sbc from trol3.v_mejor_dato where persona_id = p_persona and campo = 'salario_diario';
  end if;
  select trol3.to_date_safe(valor#>>'{}') into v_lim from trol3.v_mejor_dato where persona_id = p_persona and campo = 'limite_inscripcion_mod40';

  v_antes := v_fecha < v_corte;
  if v_antes then
    return jsonb_build_object('regimen','anterior','antes_del_corte',true,'corte',v_corte,
      'ultima_modalidad',v_mod,'alta_mod40',v_alta,'ultimo_sbc',v_sbc,'sbc_piso',v_sm,
      'sbc_tope_mod40',v_tope10,'sbc_tope_mod10',v_tope10,'mod40_permitida',true,'motivo_no_permitida',null,'retro_aplica',true);
  end if;

  v_regimen := case when v_mod = 'mod40' and v_sin_baja and (v_alta is null or v_alta < v_corte) then 'anterior' else 'nuevo' end;
  v_tope40 := case when v_sbc is null then null
                   else least(v_tope10, greatest(v_sm, v_sbc + (case when v_regimen = 'anterior' then 0 else v_uma_extra end) * v_uma)) end;
  -- Ventana 218/220: manda el expediente; sin baja no hay ventana que vencer.
  v_permitida := v_mod is distinct from 'independiente' and not (not v_sin_baja and v_lim is not null and v_lim < v_fecha);
  v_motivo := case when v_mod = 'independiente' then 'mod10_previa'
                   when not v_permitida then 'ventana_vencida' end;

  return jsonb_build_object('regimen',v_regimen,'antes_del_corte',false,'corte',v_corte,
    'ultima_modalidad',v_mod,'alta_mod40',v_alta,'ultimo_sbc',v_sbc,'sbc_piso',v_sm,
    'sbc_tope_mod40',v_tope40,'sbc_tope_mod10',v_tope10,'mod40_permitida',v_permitida,
    'motivo_no_permitida',v_motivo,'retro_aplica',false);
end $fn$;

revoke all on function trol3.regimen_mod40(uuid, date) from public, anon;
grant execute on function trol3.regimen_mod40(uuid, date) to authenticated, service_role;
revoke all on function trol3.uma_de(int), trol3.salario_minimo_de(int) from public, anon;
grant execute on function trol3.uma_de(int), trol3.salario_minimo_de(int) to authenticated, service_role;
