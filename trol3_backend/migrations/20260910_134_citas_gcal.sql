-- 134 · Citas con Google Calendar (bloque E de claude/57).
-- Las ligas de reserva viven en la base (miembros.link_citas + una general);
-- la cita agendada en Google regresa sola a trol3.citas por api-trol /cita
-- (workflow n8n con Google Calendar Trigger) y se liga a la persona por
-- teléfono o correo. Una cita sin persona se queda "sin expediente" para que
-- el equipo la ligue a mano en Hoy. Esto es lo que Granola necesita después:
-- la cita lleva persona_id y el evento de calendario la hereda.

-- ── 1. Ligas de reserva ──────────────────────────────────────────────────────
update trol3.miembros set link_citas = 'https://calendar.app.google/P8DWMFhJoqxyanyLA' where email = 'raul@trol.mx';
update trol3.miembros set link_citas = 'https://calendar.app.google/2r4EUCH9s9t5s4r49' where email = 'andrea@trol.mx';
insert into trol3.config (clave, valor) values ('citas_link_general', 'https://calendar.app.google/2r4EUCH9s9t5s4r49')
on conflict (clave) do update set valor = excluded.valor;

-- La liga que le toca a una persona: la de su cabecera si tiene, si no la general.
create or replace function trol3.link_citas_para(p_persona uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'trol3','public'
as $$
  select coalesce(
    (select jsonb_build_object('link', m.link_citas, 'miembro_id', m.id, 'miembro', m.nombre, 'general', false)
       from trol3.personas p join trol3.miembros m on m.id = p.cabecera_id
      where p.id = p_persona and m.activo and coalesce(m.link_citas,'') <> ''),
    (select jsonb_build_object('link', c.valor, 'miembro_id', null, 'miembro', null, 'general', true)
       from trol3.config c where c.clave = 'citas_link_general' and coalesce(c.valor,'') <> ''),
    '{}'::jsonb);
$$;
grant execute on function trol3.link_citas_para(uuid) to authenticated, service_role;

-- ── 2. La cita sabe de dónde vino ───────────────────────────────────────────
alter table trol3.citas alter column persona_id drop not null;
alter table trol3.citas
  add column if not exists gcal_event_id text,
  add column if not exists calendario_email text,
  add column if not exists titulo text,
  add column if not exists meet_url text,
  add column if not exists invitado_nombre text,
  add column if not exists invitado_email text,
  add column if not exists invitado_telefono text,
  add column if not exists fuente text not null default 'manual',
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists citas_gcal_event_uk on trol3.citas (gcal_event_id) where gcal_event_id is not null;
create index if not exists citas_inicio_idx on trol3.citas (inicio);
comment on column trol3.citas.fuente is 'manual (asesor/cliente en la app) · gcal (llegó del calendario).';
comment on column trol3.citas.estado is 'programada · realizada · cancelada · no_asistio';

-- ── 3. Registro desde el calendario (sólo service_role, vía api-trol /cita) ──
create or replace function trol3.registrar_cita_externa(
  p_calendario_email text, p_evento_id text, p_inicio timestamptz, p_fin timestamptz,
  p_titulo text, p_estado text, p_meet_url text,
  p_invitado_nombre text, p_invitado_email text, p_invitado_telefono text,
  p_descripcion text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3','public'
as $$
declare
  v_miembro uuid; v_persona uuid; v_cita uuid; v_nueva boolean := false;
  v_tel text; v_estado text; v_email text;
begin
  if coalesce(p_evento_id,'') = '' then raise exception 'evento_requerido'; end if;
  select id into v_miembro from trol3.miembros where lower(calendario_email) = lower(p_calendario_email) or lower(email) = lower(p_calendario_email) limit 1;

  -- El teléfono puede venir del formulario de reserva o dentro de la descripción del evento.
  v_tel := trol3.tel10(coalesce(nullif(p_invitado_telefono,''), substring(coalesce(p_descripcion,'') from '(\+?52\s?1?[\s-]?\d[\d\s-]{9,14}\d)'), ''));
  v_email := lower(nullif(trim(p_invitado_email),''));
  if length(coalesce(v_tel,'')) = 10 then
    select persona_id into v_persona from trol3.contactos where tipo = 'telefono' and normalizado = v_tel order by principal desc limit 1;
  end if;
  if v_persona is null and v_email is not null and v_email !~ '@trol\.mx$' then
    select persona_id into v_persona from trol3.contactos where tipo = 'email' and normalizado = v_email order by principal desc limit 1;
  end if;

  v_estado := case lower(coalesce(p_estado,'confirmed'))
    when 'cancelled' then 'cancelada' when 'cancelada' then 'cancelada'
    when 'realizada' then 'realizada' when 'no_asistio' then 'no_asistio'
    else 'programada' end;

  select id into v_cita from trol3.citas where gcal_event_id = p_evento_id;
  if v_cita is null then
    insert into trol3.citas (persona_id, miembro_id, inicio, fin, estado, origen, notas, gcal_event_id, calendario_email, titulo, meet_url, invitado_nombre, invitado_email, invitado_telefono, fuente)
    values (v_persona, v_miembro, p_inicio, p_fin, v_estado, 'cliente', null, p_evento_id, lower(p_calendario_email), p_titulo, p_meet_url, p_invitado_nombre, v_email, nullif(v_tel,''), 'gcal')
    returning id into v_cita;
    v_nueva := true;
  else
    update trol3.citas set
      persona_id = coalesce(persona_id, v_persona), miembro_id = coalesce(miembro_id, v_miembro),
      inicio = p_inicio, fin = p_fin, estado = case when estado in ('realizada','no_asistio') then estado else v_estado end,
      titulo = coalesce(p_titulo, titulo), meet_url = coalesce(p_meet_url, meet_url),
      invitado_nombre = coalesce(p_invitado_nombre, invitado_nombre), invitado_email = coalesce(v_email, invitado_email),
      invitado_telefono = coalesce(nullif(v_tel,''), invitado_telefono), updated_at = now()
    where id = v_cita;
  end if;

  if v_persona is not null and v_nueva then
    perform trol3.emitir_evento(v_persona, 'cita_agendada', 'cliente', null,
      jsonb_build_object('cita_id', v_cita, 'inicio', p_inicio, 'miembro_id', v_miembro, 'meet_url', p_meet_url, 'fuente', 'gcal'));
  elsif v_persona is not null and v_estado = 'cancelada' then
    perform trol3.emitir_evento(v_persona, 'cita_cancelada', 'cliente', null, jsonb_build_object('cita_id', v_cita, 'inicio', p_inicio));
  end if;

  return jsonb_build_object('ok', true, 'cita_id', v_cita, 'nueva', v_nueva, 'persona_id', v_persona, 'miembro_id', v_miembro, 'estado', v_estado, 'sin_expediente', v_persona is null);
end $$;
revoke all on function trol3.registrar_cita_externa(text,text,timestamptz,timestamptz,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function trol3.registrar_cita_externa(text,text,timestamptz,timestamptz,text,text,text,text,text,text,text) to service_role;

-- El equipo liga a mano una cita que llegó sin expediente.
create or replace function trol3.ligar_cita(p_cita uuid, p_persona uuid)
returns void
language plpgsql
security definer
set search_path to 'trol3','public'
as $$
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  update trol3.citas set persona_id = p_persona, updated_at = now() where id = p_cita;
  perform trol3.emitir_evento(p_persona, 'cita_agendada', 'asesor', trol3.current_miembro_id(),
    jsonb_build_object('cita_id', p_cita, 'ligada_a_mano', true));
end $$;
grant execute on function trol3.ligar_cita(uuid, uuid) to authenticated;

-- ── 4. Citas para Hoy: próximas 7 días + sin expediente ──────────────────────
create or replace view trol3.v_citas_equipo as
select c.id, c.persona_id, c.miembro_id, m.nombre as miembro, c.inicio, c.fin, c.estado, c.fuente, c.titulo, c.meet_url,
       coalesce(trim(p.nombre||' '||coalesce(p.apellidos,'')), c.invitado_nombre) as nombre, c.invitado_telefono, c.invitado_email,
       c.persona_id is null as sin_expediente
from trol3.citas c
left join trol3.miembros m on m.id = c.miembro_id
left join trol3.personas p on p.id = c.persona_id;
grant select on trol3.v_citas_equipo to authenticated, service_role;
