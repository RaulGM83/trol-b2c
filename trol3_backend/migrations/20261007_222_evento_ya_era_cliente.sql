-- 222 · Evento: quien ya era cliente también cuenta (7-oct-2026, caso Jorge López Pérez; claude/88).
-- 1) alta_web_evento: si la persona ya existía (su CURP no cambia → el trigger curp_consultas no dispara nada)
--    se pide la consulta igual que a un nuevo, con la política del código (fip2026 → Jordan). pedir_consulta se
--    guarda solo (validado vigente 90 días / consulta en curso). Evento `evento_consulta_existente` con el resultado.
-- 2) evento_panel: «del evento» = codigo_origen = código  O  consentimiento con ese código (la atribución no se
--    pisa). `registrado_en` = fecha del consentimiento cuando ya existía; resumen trae `ya_eran_clientes`.
-- Aplicada vía _exec+base64 (el conector retiene `update` dentro de `create function`). Probado con rollback:
-- el panel muestra a Jorge (atorada, Raúl) y el alta de un cliente existente crea su consulta Jordan en_proceso.
--    (la atribución original no se pisa). La fecha de registro es la del consentimiento cuando ya existía.
create or replace function trol3.alta_web_evento(p_codigo text, p_nombre text, p_curp text, p_consentimiento boolean, p_apellidos text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
declare uid uuid := auth.uid(); pid uuid; etiq text; c text; dueno uuid; asesores jsonb; elegido uuid; benef text; nueva boolean := false; cons jsonb; prov text; r jsonb;
  texto constant text := 'Acepta los Términos y Condiciones y el Aviso de Privacidad de El Trol Financiero (trol.mx/privacidad) y autoriza consultar su historial del IMSS para su asesoría básica.';
begin
  if uid is null then raise exception 'sin_sesion'; end if;
  if not coalesce(p_consentimiento, false) then raise exception 'sin_consentimiento'; end if;
  select etiqueta into etiq from trol3.codigos_invitacion where codigo = p_codigo and activo and tipo = 'evento';
  if etiq is null then raise exception 'codigo_de_evento_no_existe'; end if;
  c := upper(regexp_replace(coalesce(p_curp, ''), '\s', '', 'g'));
  if c !~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$' then raise exception 'curp_invalida'; end if;

  nueva := not exists (select 1 from trol3.personas where auth_user_id = uid);
  pid := trol3.vincular_sesion('evento', 'ref:' || p_codigo);

  select p.id into dueno from trol3.personas p where p.curp = c and p.merged_into is null and p.id <> pid limit 1;
  if dueno is not null then
    return jsonb_build_object('ok', false, 'motivo', 'curp_de_otra_persona', 'persona_id', pid);
  end if;

  perform trol3.emitir_evento(pid, 'consentimiento', 'cliente', null,
    jsonb_build_object('canal', 'evento', 'codigo', p_codigo, 'texto', texto, 'version', '2026-09-27', 'via', 'web'));

  if nullif(btrim(p_nombre), '') is not null then
    perform trol3.declarar(pid, 'nombre', to_jsonb(btrim(p_nombre)), 'cliente', null, 'declarado');
  end if;
  if nullif(btrim(p_apellidos), '') is not null then
    update trol3.personas set apellidos = btrim(regexp_replace(p_apellidos, '\s+', ' ', 'g'))
     where id = pid and nullif(btrim(apellidos), '') is null;
  end if;

  select (cf.valor::jsonb) -> p_codigo into asesores from trol3.config cf where cf.clave = 'evento_asesores';
  if asesores is not null and jsonb_typeof(asesores) = 'array' and jsonb_array_length(asesores) > 0 then
    select (a.v #>> '{}')::uuid into elegido
      from jsonb_array_elements(asesores) a(v)
      join trol3.miembros m on m.id = (a.v #>> '{}')::uuid and m.activo
      left join trol3.personas p on p.cabecera_id = m.id and p.codigo_origen = p_codigo and p.merged_into is null
     group by a.v order by count(p.id), random() limit 1;
    if elegido is not null then
      update trol3.personas set cabecera_id = elegido where id = pid and cabecera_id is null;
    end if;
  end if;

  select (cf.valor::jsonb) ->> p_codigo into benef from trol3.config cf where cf.clave = 'evento_beneficio';
  if benef is not null and not trol3.tiene_beneficio(pid, benef) then
    perform trol3._otorgar_beneficio(pid, benef, 'evento', etiq, p_codigo, null);
  end if;

  -- La CURP dispara la consulta (trigger de personas.curp) cuando es nueva o cambia.
  perform trol3.declarar(pid, 'curp', to_jsonb(c), 'cliente', null, 'declarado');

  -- 222 · Si ya era cliente, la CURP no cambió y nada se disparó: pedimos nosotros con la política del código.
  if not nueva and not exists (select 1 from trol3.consultas x where x.persona_id = pid and x.tipo = 'imss_historial' and x.created_at > now() - interval '2 minutes') then
    select case (cf.valor::jsonb) ->> p_codigo when 'jordan_first' then 'jordan' when 'belvo_first' then 'belvo' else null end into prov
      from trol3.config cf where cf.clave = 'politica_proveedor_codigo';
    begin
      r := trol3.pedir_consulta(pid, 'imss_historial', 'cliente', null, 'trol', false, 'registro web ' || etiq || ' (ya era cliente)', false, prov);
    exception when others then
      r := jsonb_build_object('ok', false, 'motivo', 'excepcion', 'detalle', sqlerrm);
    end;
    perform trol3.emitir_evento(pid, 'evento_consulta_existente', 'sistema', null, jsonb_build_object('codigo', p_codigo, 'resultado', r));
  end if;

  select jsonb_build_object('estado', x.estado, 'proveedor', x.proveedor, 'id', x.id) into cons
    from trol3.consultas x where x.persona_id = pid and x.tipo = 'imss_historial' order by x.created_at desc limit 1;

  perform trol3.registrar_interaccion(pid, 'nota', 'cliente', null, 'interna',
    'Se registró desde la web de ' || etiq || ' · aceptó Términos y Aviso de Privacidad' || case when nueva then '' else ' · ya era cliente' end, false, jsonb_build_object('codigo', p_codigo, 'via', 'web'));

  return jsonb_build_object('ok', true, 'persona_id', pid, 'nueva', nueva, 'experto', elegido, 'beneficio', benef, 'consulta', cons);
end $function$;

create or replace function trol3.evento_panel(p_codigo text, p_limit integer default 400)
returns jsonb
language plpgsql
stable security definer
set search_path to 'trol3', 'public'
as $function$
declare filas jsonb; res jsonb; meta jsonb; fecha date; clics int;
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  select (cf.valor::jsonb) -> p_codigo into meta from trol3.config cf where cf.clave = 'evento_meta';
  fecha := nullif(meta ->> 'fecha', '')::date;
  select count(*) into clics from trol3.clics_invitacion where codigo = p_codigo;

  with per as (
    -- 222 · del evento: por código de origen O por consentimiento con ese código (ya era cliente)
    select p.id, p.nombre, p.apellidos, p.curp, p.created_at, p.cabecera_id, p.app_visto_en, p.tako_conversacion_id,
           coalesce((select min(ev.created_at) from trol3.eventos ev where ev.persona_id = p.id and ev.tipo = 'consentimiento' and ev.payload ->> 'codigo' = p_codigo), p.created_at) as registrado_en,
           (p.codigo_origen is distinct from p_codigo) as ya_era_cliente
      from trol3.personas p
     where p.merged_into is null
       and (p.codigo_origen = p_codigo
            or exists (select 1 from trol3.eventos ev where ev.persona_id = p.id and ev.tipo = 'consentimiento' and ev.payload ->> 'codigo' = p_codigo))
     order by 9 desc limit p_limit
  ), fila as (
    select per.*,
      (select ct.normalizado from trol3.contactos ct where ct.persona_id = per.id and ct.tipo = 'telefono' and ct.principal limit 1) as telefono,
      case when exists (select 1 from trol3.eventos ev where ev.persona_id = per.id and ev.tipo = 'consentimiento' and ev.payload ->> 'via' = 'web') then 'web'
           when exists (select 1 from trol3.eventos ev where ev.persona_id = per.id and ev.tipo = 'consentimiento' and ev.payload ->> 'canal' = 'evento') then 'pasillo'
           else 'chat' end as via,
      (select jsonb_build_object('id', x.id, 'estado', x.estado, 'proveedor', x.proveedor, 'error', x.error, 'creada_en', x.created_at, 'completada_en', x.completed_at, 'tipo', x.tipo)
         from trol3.consultas x where x.persona_id = per.id and x.tipo in ('imss_historial', 'imss_ventanilla') order by x.created_at desc limit 1) as consulta,
      (select count(*) from trol3.consultas x where x.persona_id = per.id and x.tipo in ('imss_historial', 'imss_ventanilla')) as intentos,
      exists (select 1 from trol3.consultas x where x.persona_id = per.id and x.tipo = 'imss_historial' and x.estado = 'completada') as tiene_historial,
      exists (select 1 from trol3.documentos d where d.persona_id = per.id and d.tipo = 'constancia_semanas') as tiene_constancia,
      e.ley, e.semanas, e.pension_base,
      trol3._base_listos(per.id) as base_listos,
      (select jsonb_build_object('inicio', c.inicio, 'estado', c.estado, 'miembro_id', c.miembro_id) from trol3.citas c
         where c.persona_id = per.id and c.estado <> 'cancelada' order by (c.inicio >= now()) desc, c.inicio desc limit 1) as cita,
      coalesce((select sum(o.monto) from trol3.ordenes o where o.persona_id = per.id and o.estado = 'cumplida'), 0) as pagado,
      (select m.nombre from trol3.miembros m where m.id = per.cabecera_id) as experto,
      (select jsonb_build_object('que', i.metadata ->> 'evento_accion', 'en', i.created_at, 'quien', (select m.nombre from trol3.miembros m where m.id = i.actor_id))
         from trol3.interacciones i where i.persona_id = per.id and i.metadata ? 'evento_accion' order by i.created_at desc limit 1) as seguimiento,
      exists (select 1 from trol3.interacciones i where i.persona_id = per.id and i.direccion = 'entrante') as escribio
      from per left join trol3.v_expediente e on e.persona_id = per.id
  )
  select coalesce(jsonb_agg(to_jsonb(f) order by f.registrado_en desc), '[]'::jsonb),
         jsonb_build_object(
           'clics', clics,
           'registrados', count(*),
           'ya_eran_clientes', count(*) filter (where f.ya_era_cliente),
           'registrados_previos', count(*) filter (where fecha is null or f.registrado_en::date < fecha),
           'registrados_evento', count(*) filter (where fecha is not null and f.registrado_en::date = fecha),
           'via', jsonb_build_object('web', count(*) filter (where f.via = 'web'), 'chat', count(*) filter (where f.via = 'chat'), 'pasillo', count(*) filter (where f.via = 'pasillo')),
           'sin_curp', count(*) filter (where f.curp is null),
           'con_historial', count(*) filter (where f.tiene_historial or f.tiene_constancia),
           'buscando', count(*) filter (where f.consulta is not null and not f.tiene_historial and not f.tiene_constancia
                                          and (f.consulta ->> 'estado') not in ('sin_resultado', 'error', 'cancelada')),
           'atoradas', count(*) filter (where f.consulta is not null and not f.tiene_historial and not f.tiene_constancia
                                          and (f.consulta ->> 'estado') in ('sin_resultado', 'error')),
           'entraron', count(*) filter (where f.app_visto_en is not null),
           'base_completa', count(*) filter (where f.base_listos >= 5),
           'con_sesion', count(*) filter (where f.cita is not null),
           'sesion_hecha', count(*) filter (where f.cita is not null and (f.cita ->> 'inicio')::timestamptz < now()),
           'pagaron', count(*) filter (where f.pagado > 0),
           'ingresos', coalesce(sum(f.pagado), 0),
           'meta', coalesce(meta, '{}'::jsonb))
    into filas, res
    from fila f;
  return jsonb_build_object('resumen', res, 'filas', filas);
end $function$;
