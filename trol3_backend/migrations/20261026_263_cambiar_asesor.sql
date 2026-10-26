-- 263 · Cambio de asesor entre el equipo (26-oct, Raúl): cualquier asesor puede pasar un
-- cliente a otro (por el producto que va a cerrar, para apoyarse o por otra razón). Se mueve
-- la cabecera y TODAS las oportunidades abiertas; queda nota en la historia y el evento
-- `cabecera_cambiada`. Quien lo recibe lo ve en Calientes como «Te lo pasó X» hasta que
-- le deja cualquier nota o contacto (o 7 días).

create or replace function trol3.cambiar_cabecera(p_persona uuid, p_nuevo uuid, p_motivo text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare me uuid := trol3.current_miembro_id(); v_de uuid; v_movidas int := 0;
        n_de text; n_a text; n_por text; v_mot text;
begin
  if me is null or not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  if not exists (select 1 from trol3.miembros where id = p_nuevo and coalesce(activo, true)) then raise exception 'asesor_invalido'; end if;
  select cabecera_id into v_de from trol3.personas where id = p_persona and merged_into is null;
  if not found then raise exception 'persona_no_existe'; end if;
  if v_de is not distinct from p_nuevo then
    return jsonb_build_object('ok', true, 'sin_cambio', true);
  end if;
  v_mot := coalesce(nullif(p_motivo, ''), 'otro');

  update trol3.personas set cabecera_id = p_nuevo where id = p_persona;
  update trol3.oportunidades set dueno_id = p_nuevo
   where persona_id = p_persona and estado not in ('ganada', 'perdida', 'no_aplica');
  get diagnostics v_movidas = row_count;

  select nombre into n_de from trol3.miembros where id = v_de;
  select nombre into n_a from trol3.miembros where id = p_nuevo;
  select nombre into n_por from trol3.miembros where id = me;

  perform trol3.registrar_interaccion(p_persona, 'nota', 'asesor', me, 'interna',
    'Cambio de asesor: ' || coalesce(n_de, 'sin asignar') || ' → ' || coalesce(n_a, '?')
    || ' (' || case v_mot when 'producto' then 'por el producto que va a cerrar' when 'apoyo' then 'para apoyar' else 'otro motivo' end || ')'
    || coalesce(' — ' || nullif(p_nota, ''), '')
    || case when v_movidas > 0 then ' · ' || v_movidas || ' oportunidad' || case when v_movidas = 1 then '' else 'es' end || ' pasan con él' else '' end,
    false, jsonb_build_object('via', 'cambiar_cabecera', 'de', v_de, 'a', p_nuevo, 'motivo', v_mot));

  perform trol3.emitir_evento(p_persona, 'cabecera_cambiada', 'asesor', me,
    jsonb_build_object('de', v_de, 'a', p_nuevo, 'por', me, 'motivo', v_mot, 'nota', nullif(p_nota, ''),
                       'de_nombre', n_de, 'a_nombre', n_a, 'por_nombre', n_por));

  return jsonb_build_object('ok', true, 'de', v_de, 'a', p_nuevo, 'a_nombre', n_a, 'oportunidades', v_movidas);
end $$;

revoke all on function trol3.cambiar_cabecera(uuid, uuid, text, text) from public, anon;
grant execute on function trol3.cambiar_cabecera(uuid, uuid, text, text) to authenticated, service_role;

-- carril_de: «te_lo_pasaron» en Calientes, después de «reacciono».
do $mig$
declare src text; a1 text; a2 text; a3 text;
begin
  select pg_get_functiondef('trol3.carril_de(uuid)'::regprocedure) into src;
  a1 := $a$carril text; origen text; vuelve date; toques int; manda boolean := false;$a$;
  a2 := $a$  elsif not manda and (per.created_at at time zone 'America/Mexico_City')::date = hoy then$a$;
  a3 := $a$    'cita_proxima', coalesce(cita, cita_prox),$a$;
  if position(a1 in src) = 0 or position(a2 in src) = 0 or position(a3 in src) = 0 then raise exception '263: ancla carril_de'; end if;
  src := replace(src, a1, a1 || $b$
  pase record;$b$);
  src := replace(src, a2, $b$  elsif not manda and pase.created_at is not null then
    carril := 'calientes'; origen := 'te_lo_pasaron';
$b$ || a2);
  src := replace(src, a3, a3 || $b$
    'pase', case when pase.created_at is not null then jsonb_build_object('en', pase.created_at, 'por', pase.payload->>'por_nombre', 'de', pase.payload->>'de_nombre', 'motivo', pase.payload->>'motivo', 'nota', pase.payload->>'nota') end,$b$);
  -- el pase vigente: al asesor actual, en 7 días, sin nota/contacto suyo después
  src := replace(src, $a$  pot := trol3._potencial(p);$a$, $b$  select e.created_at, e.payload into pase from trol3.eventos e
   where e.persona_id = p and e.tipo = 'cabecera_cambiada' and e.created_at > now() - interval '7 days'
     and (e.payload->>'a')::uuid = per.cabecera_id
     and not exists (select 1 from trol3.interacciones i where i.persona_id = p and i.actor_tipo::text = 'asesor'
                      and i.actor_id = per.cabecera_id and i.created_at >= e.created_at)
   order by e.created_at desc limit 1;
  pot := trol3._potencial(p);$b$);
  execute src;

  select pg_get_functiondef('trol3.mi_calientes(text)'::regprocedure) into src;
  a1 := $a$when 'reacciono' then 1 when 'cita' then 2 when 'llego_hoy' then 3$a$;
  if position(a1 in src) = 0 then raise exception '263: ancla mi_calientes'; end if;
  src := replace(src, a1, $b$when 'reacciono' then 1 when 'te_lo_pasaron' then 2 when 'cita' then 2 when 'llego_hoy' then 3$b$);
  execute src;
end $mig$;
