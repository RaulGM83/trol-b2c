-- 211 · Candados: vistas y funciones de trol3 (claude/96). 3-oct-2026.
--
-- Lo que encontró el linter y se comprobó a mano:
--   · 15 vistas `security definer` con SELECT para `authenticated`: un CLIENTE logueado leía
--     v_expediente (14,359 personas) y v_mejor_dato (421,800 datos) por la Data API.
--   · 184 funciones `security definer` ejecutables por `anon` (privilegios por defecto del
--     esquema): sin login, `persona_por_telefono(tel)` → `resumen_bot(id)` sacaba el resumen
--     pensional de cualquiera. Y como `authenticated`, un cliente podía llamar
--     `evaluar_persona`, `sync_identidad`, `encolar_envio`, `otorgar_puntos_accion`…
--
-- Qué hace:
--   1. Las 12 vistas que no filtran por usuario pasan a `security_invoker` (heredan el RLS).
--      Las 3 de aliados (v_aliado_yo, v_comisiones_aliado, v_referidos_aliado) filtran por
--      `current_aliado_id()` y se quedan como están.
--   2. `anon` pierde EXECUTE en todo `trol3` (y en lo que se cree después). Se le regresa sólo
--      lo público: `registrar_clic`, `marca_evento` y los helpers que usan las políticas RLS.
--   3. `authenticated` pierde EXECUTE en lo que sólo llaman n8n / api-trol / cron con service
--      role, y en los helpers `_*`.
--   4. Candado `_guard_miembro` en las funciones que la app sí llama con la sesión del usuario
--      pero no revisaban quién pregunta: carril_de, origen_de, enlazar_legacy, puede_plantilla,
--      slug_expediente, codigo_referido.
--
-- Nada de esto toca a n8n ni a api-trol: usan service_role, que no pasa por estos grants.

-- ---------------------------------------------------------------------------------------
-- 1. Vistas
-- ---------------------------------------------------------------------------------------
alter view trol3.v_mejor_dato            set (security_invoker = true);
alter view trol3.v_expediente            set (security_invoker = true);
alter view trol3.v_ultima_consulta_imss  set (security_invoker = true);
alter view trol3.v_personas_duplicadas   set (security_invoker = true);
alter view trol3.v_embudo_codigo         set (security_invoker = true);
alter view trol3.v_segmentos_campana     set (security_invoker = true);
alter view trol3.v_segmentos_gestoria    set (security_invoker = true);
alter view trol3.v_segmento_mod10_viraal set (security_invoker = true);
alter view trol3.v_citas_equipo          set (security_invoker = true);
alter view trol3.v_reuniones             set (security_invoker = true);
alter view trol3.v_conversaciones_tako   set (security_invoker = true);
alter view trol3.v_sonda_headers         set (security_invoker = true);

-- ---------------------------------------------------------------------------------------
-- 2. anon
-- ---------------------------------------------------------------------------------------
do $$
begin
  execute 'revoke execute on all functions in schema trol3 from anon';
  execute 'alter default privileges in schema trol3 revoke execute on functions from anon';
  -- Lo público de verdad (links de invitación y la página del evento) y los helpers de RLS.
  execute 'grant execute on function trol3.registrar_clic(text, text, text, text) to anon';
  execute 'grant execute on function trol3.marca_evento(text) to anon';
  execute 'grant execute on function trol3.es_miembro() to anon';
  execute 'grant execute on function trol3.current_miembro_id() to anon';
  execute 'grant execute on function trol3.current_persona_id() to anon';
  execute 'grant execute on function trol3.current_aliado_id() to anon';
  execute 'grant execute on function trol3.current_partner_id() to anon';
  execute 'grant execute on function trol3.tiene_rol(trol3.rol_miembro) to anon';
end $$;

-- ---------------------------------------------------------------------------------------
-- 3. authenticated: lo que sólo llama el servicio
-- ---------------------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'trol3'
       and (p.proname like '\_%' escape '\'
            or p.proname in ('resumen_bot', 'persona_por_telefono', 'persona_por_slug',
                             'sync_desde_cliente', 'sync_identidad', 'sync_saldos_corregidos', 'resultado_consulta',
                             'evaluar_persona', 'evaluar_gestoria', 'evaluar_reactivacion_mod10', 'evaluar_todos',
                             'migrar_desde_public', 'encolar_envio', 'marcar_envio', 'cola_envios_pendientes',
                             'redespachar_pendientes', 'registrar_conversacion_tako', 'registrar_referido_bot',
                             'registrar_salida', 'registrar_nomina_imss', 'otorgar_puntos_accion',
                             'aplicar_regla_cda', 'aplicar_regla_identidad', 'aplicar_nombre_sisec',
                             'derivar_ultima_modalidad', 'generar_checklist_oportunidad', 'cliente_por_codigo_referido',
                             'registrar_referido', 'emitir_evento', 'handoff', 'pendientes_nudge'))
  loop
    execute format('revoke execute on function %s from authenticated, anon', f.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------
-- 4. Candado para lo que la app llama con la sesión del usuario
-- ---------------------------------------------------------------------------------------
-- Pasa si no hay JWT (service role, cron), si es miembro, o si pregunta por su propia persona.
create or replace function trol3._guard_miembro(p_persona uuid default null) returns void
language plpgsql stable security definer set search_path to 'trol3', 'public' as $function$
begin
  if auth.uid() is null then return; end if;
  if trol3.es_miembro() then return; end if;
  if p_persona is not null and p_persona = trol3.current_persona_id() then return; end if;
  raise exception 'no_autorizado';
end $function$;
do $$ begin execute 'revoke execute on function trol3._guard_miembro(uuid) from anon, authenticated'; end $$;

-- Inserta el candado después del primer `begin` de cada función plpgsql (idempotente).
do $$
declare f record; src text; i int; linea text;
begin
  for f in
    select * from (values
      ('carril_de',       'perform trol3._guard_miembro();'),
      ('enlazar_legacy',  'perform trol3._guard_miembro();'),
      ('puede_plantilla', 'perform trol3._guard_miembro();'),
      ('slug_expediente', 'perform trol3._guard_miembro(p_persona);'),
      ('codigo_referido', 'if auth.uid() is not null and not trol3.es_miembro() and p_cliente is distinct from (select legacy_cliente_id from trol3.personas where id = trol3.current_persona_id()) then raise exception ''no_autorizado''; end if;')
    ) v(fn, guard)
  loop
    select pg_get_functiondef(p.oid) into src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'trol3' and p.proname = f.fn;
    if src is null then raise exception '% no existe', f.fn; end if;
    if position('_guard_miembro' in src) > 0 or position('211: candado' in src) > 0 then continue; end if;
    i := position(E'\nbegin\n' in src);
    if i = 0 then raise exception '% sin begin reconocible', f.fn; end if;
    linea := E'\nbegin\n  ' || f.guard || E'  -- 211: candado\n';
    src := left(src, i - 1) || linea || substr(src, i + length(E'\nbegin\n'));
    execute src;
  end loop;
end $$;

-- origen_de era SQL: se reescribe en plpgsql con el candado.
create or replace function trol3.origen_de(p_persona uuid) returns jsonb
language plpgsql stable security definer set search_path to 'trol3', 'public' as $function$
declare r jsonb;
begin
  perform trol3._guard_miembro(p_persona);
  select jsonb_build_object(
    'registrado_en', p.created_at,
    'canal', p.canal_origen, 'campania', p.campania_origen, 'codigo', p.codigo_origen,
    'tipo', case when p.referidor_persona_id is not null then 'cliente'
                 when rf.id is not null then 'aliado'
                 when p.miembro_origen_id is not null then 'equipo'
                 when p.canal_origen is not null then 'otro' end,
    'ref', coalesce(p.referidor_persona_id, rf.aliado_id, p.miembro_origen_id),
    'nombre', coalesce(
      (select nullif(trim(coalesce(x.nombre,'') || ' ' || coalesce(x.apellidos,'')), '') from trol3.personas x where x.id = p.referidor_persona_id),
      (select a.nombre from trol3.aliados a where a.id = rf.aliado_id),
      (select m.nombre from trol3.miembros m where m.id = p.miembro_origen_id)),
    'referido_estado', rf.estado)
  into r
  from trol3.personas p
  left join lateral (select r2.id, r2.aliado_id, r2.estado from trol3.referidos r2 where r2.persona_id = p.id order by r2.creado_en limit 1) rf on true
  where p.id = p_persona;
  return r;
end $function$;

-- Tabla suelta sin RLS (linter): es un respaldo del recálculo del 27-ago; se cierra.
alter table trol3.recalculo_20260827 enable row level security;

comment on function trol3._guard_miembro is '211: pasa sin JWT (service/cron), si es miembro, o si p_persona es la propia. Para funciones security definer que la app llama con la sesión del usuario.';
