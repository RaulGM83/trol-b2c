-- 135 · Reuniones (Granola) → expediente (bloque F de claude/57).
-- Cada nota de Granola es una reunión: se casa con la cita (calendar_event_id =
-- citas.gcal_event_id), o con la persona por correo, o con la cita del mismo
-- asesor a ±30 min. La IA saca PROPUESTAS; lo blando (lo que le preocupa, qué
-- espera, prioridades) se aplica solo, lo duro (montos, edades, fechas) espera
-- la confirmación del asesor. Nada se aplica sin quedar trazado.

create table if not exists trol3.reuniones (
  id uuid primary key default gen_random_uuid(),
  nota_id text not null unique,                 -- not_… de Granola
  cita_id uuid references trol3.citas(id) on delete set null,
  persona_id uuid references trol3.personas(id) on delete cascade,
  miembro_id uuid references trol3.miembros(id),
  titulo text,
  inicio timestamptz,
  fin timestamptz,
  asistentes jsonb not null default '[]'::jsonb,   -- [{name,email}]
  resumen_md text,
  transcripcion jsonb,                             -- [{speaker,text,start}] de Granola
  transcripcion_texto text,                        -- plano, para la IA y para buscar
  web_url text,
  propuestas jsonb not null default '[]'::jsonb,   -- [{i, tipo, campo, valor, texto, quien, vence_el, auto, estado, aplicado_en, aplicado_por, ref_id}]
  extraccion_estado text not null default 'pendiente', -- pendiente · lista · error
  extraccion_error text,
  modelo text,
  fuente text not null default 'granola',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reuniones_persona_idx on trol3.reuniones (persona_id, inicio desc);
alter table trol3.reuniones enable row level security;
drop policy if exists reuniones_miembro on trol3.reuniones;
create policy reuniones_miembro on trol3.reuniones for all to authenticated using (trol3.es_miembro()) with check (trol3.es_miembro());
grant select on trol3.reuniones to authenticated;
grant all on trol3.reuniones to service_role;

-- ── Registro (service_role, desde /api/granola/webhook) ─────────────────────
create or replace function trol3.registrar_reunion(
  p_nota_id text, p_titulo text, p_inicio timestamptz, p_fin timestamptz,
  p_calendar_event_id text, p_organizador_email text, p_asistentes jsonb,
  p_resumen_md text, p_transcripcion jsonb, p_transcripcion_texto text, p_web_url text)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3','public'
as $$
declare
  v_id uuid; v_nueva boolean := false;
  v_cita uuid; v_persona uuid; v_miembro uuid;
  v_email text;
begin
  if coalesce(p_nota_id,'') = '' then raise exception 'nota_requerida'; end if;

  -- 1) Por el evento de calendario (la cita ya trae persona y asesor).
  if coalesce(p_calendar_event_id,'') <> '' then
    select id, persona_id, miembro_id into v_cita, v_persona, v_miembro
      from trol3.citas where gcal_event_id = p_calendar_event_id limit 1;
  end if;
  -- 2) Asesor por el organizador o por el primer asistente @trol.mx.
  if v_miembro is null then
    select id into v_miembro from trol3.miembros
     where lower(email) = lower(coalesce(p_organizador_email,'')) or lower(calendario_email) = lower(coalesce(p_organizador_email,'')) limit 1;
  end if;
  if v_miembro is null then
    select m.id into v_miembro from jsonb_array_elements(coalesce(p_asistentes,'[]'::jsonb)) a
      join trol3.miembros m on lower(m.email) = lower(a->>'email') limit 1;
  end if;
  -- 3) Persona por el correo de un asistente externo.
  if v_persona is null then
    for v_email in select lower(a->>'email') from jsonb_array_elements(coalesce(p_asistentes,'[]'::jsonb)) a
                   where a->>'email' is not null and a->>'email' !~* '@trol\.mx$' loop
      select persona_id into v_persona from trol3.contactos where tipo = 'email' and normalizado = v_email order by principal desc limit 1;
      exit when v_persona is not null;
    end loop;
  end if;
  -- 4) Cita del mismo asesor a ±30 min de la hora programada.
  if v_cita is null and v_miembro is not null and p_inicio is not null then
    select id, coalesce(v_persona, persona_id) into v_cita, v_persona from trol3.citas
     where miembro_id = v_miembro and estado <> 'cancelada' and inicio between p_inicio - interval '30 min' and p_inicio + interval '30 min'
     order by abs(extract(epoch from (inicio - p_inicio))) limit 1;
  end if;

  select id into v_id from trol3.reuniones where nota_id = p_nota_id;
  if v_id is null then
    insert into trol3.reuniones (nota_id, cita_id, persona_id, miembro_id, titulo, inicio, fin, asistentes, resumen_md, transcripcion, transcripcion_texto, web_url)
    values (p_nota_id, v_cita, v_persona, v_miembro, p_titulo, p_inicio, p_fin, coalesce(p_asistentes,'[]'::jsonb), p_resumen_md, p_transcripcion, p_transcripcion_texto, p_web_url)
    returning id into v_id;
    v_nueva := true;
  else
    update trol3.reuniones set
      cita_id = coalesce(cita_id, v_cita), persona_id = coalesce(persona_id, v_persona), miembro_id = coalesce(miembro_id, v_miembro),
      titulo = coalesce(p_titulo, titulo), inicio = coalesce(p_inicio, inicio), fin = coalesce(p_fin, fin),
      asistentes = coalesce(p_asistentes, asistentes), resumen_md = coalesce(p_resumen_md, resumen_md),
      transcripcion = coalesce(p_transcripcion, transcripcion), transcripcion_texto = coalesce(p_transcripcion_texto, transcripcion_texto),
      web_url = coalesce(p_web_url, web_url), updated_at = now()
    where id = v_id;
  end if;

  if v_cita is not null then
    update trol3.citas set estado = 'realizada', updated_at = now() where id = v_cita and estado = 'programada';
  end if;
  if v_persona is not null and v_nueva then
    perform trol3.emitir_evento(v_persona, 'reunion_registrada', 'sistema', null,
      jsonb_build_object('reunion_id', v_id, 'nota_id', p_nota_id, 'miembro_id', v_miembro, 'inicio', p_inicio));
  end if;
  return jsonb_build_object('ok', true, 'reunion_id', v_id, 'nueva', v_nueva, 'persona_id', v_persona, 'miembro_id', v_miembro, 'cita_id', v_cita, 'sin_expediente', v_persona is null);
end $$;
revoke all on function trol3.registrar_reunion(text,text,timestamptz,timestamptz,text,text,jsonb,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function trol3.registrar_reunion(text,text,timestamptz,timestamptz,text,text,jsonb,text,jsonb,text,text) to service_role;

-- El equipo liga a mano una reunión sin expediente.
create or replace function trol3.ligar_reunion(p_reunion uuid, p_persona uuid)
returns void language plpgsql security definer set search_path to 'trol3','public' as $$
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  update trol3.reuniones set persona_id = p_persona, updated_at = now() where id = p_reunion;
  perform trol3.emitir_evento(p_persona, 'reunion_registrada', 'asesor', trol3.current_miembro_id(), jsonb_build_object('reunion_id', p_reunion, 'ligada_a_mano', true));
end $$;
grant execute on function trol3.ligar_reunion(uuid, uuid) to authenticated;

-- ── Aplicar una propuesta ───────────────────────────────────────────────────
-- p_actor_id null = lo aplica el sistema (propuestas `auto`); si no, el miembro.
-- Tipos: dato (declarar en capa declarado) · tarea (crear_tarea) · nota (interacción interna).
create or replace function trol3.aplicar_propuesta_reunion(p_reunion uuid, p_i int, p_decision text, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3','public'
as $$
declare
  r trol3.reuniones; pr jsonb; v_actor uuid; v_ref text; v_estado text; v_nuevo jsonb; v_dato bigint; v_uuid uuid;
  v_vence date;
begin
  -- Con sesión: sólo miembros, y el actor es quien llama (p_actor_id se ignora).
  -- Sin sesión (service_role desde la app): p_actor_id o null = sistema.
  if auth.uid() is not null then
    if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
    v_actor := trol3.current_miembro_id();
  else
    v_actor := p_actor_id;
  end if;
  select * into r from trol3.reuniones where id = p_reunion;
  if r.id is null then raise exception 'reunion_no_existe'; end if;
  if r.persona_id is null then raise exception 'reunion_sin_expediente'; end if;
  select x into pr from jsonb_array_elements(r.propuestas) x where (x->>'i')::int = p_i;
  if pr is null then raise exception 'propuesta_no_existe'; end if;
  if coalesce(pr->>'estado','pendiente') <> 'pendiente' then return jsonb_build_object('ok', true, 'estado', pr->>'estado'); end if;

  if p_decision = 'descartar' then
    v_estado := 'descartada';
  else
    case pr->>'tipo'
      when 'dato' then
        if (pr->>'campo') is null or (pr->'valor') is null then raise exception 'propuesta_incompleta'; end if;
        select trol3.declarar(r.persona_id, pr->>'campo', pr->'valor', case when v_actor is null then 'sistema'::trol3.actor_tipo else 'asesor'::trol3.actor_tipo end, v_actor, 'declarado') into v_dato;
        v_ref := v_dato::text;
      when 'tarea' then
        begin v_vence := (pr->>'vence_el')::date; exception when others then v_vence := null; end;
        insert into trol3.tareas (persona_id, titulo, detalle, responsable_id, creado_por, vence_el, origen, origen_id)
        values (r.persona_id, left(coalesce(pr->>'texto','Pendiente de la reunión'), 200), nullif(pr->>'detalle',''), coalesce(v_actor, r.miembro_id), coalesce(v_actor, r.miembro_id), v_vence, 'reunion', r.id)
        returning id into v_uuid;
        v_ref := v_uuid::text;
      when 'nota' then
        select trol3.registrar_interaccion(r.persona_id, 'nota', case when v_actor is null then 'sistema'::trol3.actor_tipo else 'asesor'::trol3.actor_tipo end, v_actor, 'interna',
          'Reunión '||to_char(coalesce(r.inicio, r.created_at) at time zone 'America/Mexico_City', 'DD Mon')||': '||coalesce(pr->>'texto',''), false,
          jsonb_build_object('reunion_id', r.id, 'propuesta', p_i)) into v_uuid;
        v_ref := v_uuid::text;
      else
        raise exception 'tipo_propuesta_desconocido: %', pr->>'tipo';
    end case;
    v_estado := 'aplicada';
  end if;

  v_nuevo := pr || jsonb_build_object('estado', v_estado, 'aplicado_en', now(), 'aplicado_por', v_actor, 'ref_id', v_ref);
  update trol3.reuniones set propuestas = (
    select jsonb_agg(case when (x->>'i')::int = p_i then v_nuevo else x end order by (x->>'i')::int) from jsonb_array_elements(propuestas) x
  ), updated_at = now() where id = p_reunion;
  return jsonb_build_object('ok', true, 'estado', v_estado, 'ref_id', v_ref);
end $$;
grant execute on function trol3.aplicar_propuesta_reunion(uuid, int, text, uuid) to authenticated, service_role;

-- Reuniones para el expediente y para Hoy.
create or replace view trol3.v_reuniones as
select r.id, r.nota_id, r.cita_id, r.persona_id, r.miembro_id, m.nombre as miembro, r.titulo, r.inicio, r.fin, r.asistentes,
       r.resumen_md, r.web_url, r.propuestas, r.extraccion_estado, r.extraccion_error, r.created_at,
       coalesce(trim(p.nombre||' '||coalesce(p.apellidos,'')), null) as persona_nombre,
       r.persona_id is null as sin_expediente,
       (select count(*) from jsonb_array_elements(r.propuestas) x where coalesce(x->>'estado','pendiente') = 'pendiente') as pendientes
from trol3.reuniones r
left join trol3.miembros m on m.id = r.miembro_id
left join trol3.personas p on p.id = r.persona_id;
grant select on trol3.v_reuniones to authenticated, service_role;
