-- 114 — tareas: los compromisos que el equipo adquiere y nadie perseguía.
--
-- Salió revisando los diagnósticos reales. Un asesor escribió, dentro de un
-- párrafo del PDF: "Vamos a revisar tu cuenta del IMSS para ver si aparecen
-- otros NSS". Eso no es prosa, es un compromiso — y vivía en un documento que
-- nadie va a volver a abrir.
--
-- Lo que ya existía no sirve para esto:
--   · `oportunidad_checklist` es de catálogo cerrado: sólo admite items que
--     alguien dio de alta en `checklist_catalogo`.
--   · `checklist_items` se calcula solo desde los datos.
-- Ninguna acepta una frase libre con dueño y fecha.
--
-- Decisión (Raúl, 6-sep-2026): es un módulo propio, no una sub-parte del
-- diagnóstico. El asesor las pone desde donde esté trabajando —un expediente,
-- un diagnóstico, o de la nada— y les da seguimiento en un solo lugar; la
-- dirección ve las de todos.
--
-- `persona_id` es opcional a propósito: un compromiso puede no ser sobre un
-- cliente ("pedirle a Jordan los costos de Infonavit").

create table if not exists trol3.tareas (
  id           uuid primary key default gen_random_uuid(),
  persona_id   uuid references trol3.personas(id) on delete cascade,
  titulo       text not null check (length(btrim(titulo)) between 3 and 300),
  detalle      text,

  -- Quién la debe. Sin dueño una tarea no se persigue sola, así que nunca es
  -- nula: si nadie la toma, se la queda quien la creó.
  responsable_id uuid not null references trol3.miembros(id),
  creado_por     uuid references trol3.miembros(id),

  vence_el     date,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'hecha', 'cancelada')),

  -- De dónde salió, para poder volver: 'manual', 'diagnostico', 'escenario'…
  origen       text not null default 'manual',
  origen_id    uuid,

  hecha_en     timestamptz,
  hecha_por    uuid references trol3.miembros(id),
  nota_cierre  text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Una tarea cerrada tiene que decir cuándo; una abierta no puede fingir que sí.
  constraint tareas_cierre_coherente check (
    (estado = 'pendiente' and hecha_en is null) or
    (estado <> 'pendiente' and hecha_en is not null)
  )
);

comment on table trol3.tareas is
  'Compromisos del equipo, con dueño y fecha. Módulo propio: se crean desde un expediente, un diagnóstico o solas. 114.';
comment on column trol3.tareas.persona_id is
  'Opcional: no todo compromiso es sobre un cliente.';
comment on column trol3.tareas.responsable_id is
  'Quién la debe. Nunca nulo: una tarea sin dueño no se persigue sola.';

create index if not exists tareas_responsable_idx
  on trol3.tareas (responsable_id, estado, vence_el nulls last);
create index if not exists tareas_persona_idx
  on trol3.tareas (persona_id, estado) where persona_id is not null;
create index if not exists tareas_abiertas_idx
  on trol3.tareas (vence_el nulls last) where estado = 'pendiente';

-- updated_at al día, para poder ordenar por "lo último que se movió".
create or replace function trol3.tg_tareas_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tareas_touch on trol3.tareas;
create trigger tareas_touch before update on trol3.tareas
  for each row execute function trol3.tg_tareas_touch();

-- RLS: todos los miembros ven todas. Hoy el equipo es chico y todos son
-- recepcionista + cabecera; la dirección tiene que ver los compromisos de
-- todos, y esconder los de un asesor a otro no resuelve ningún problema real.
-- La pantalla filtra a "las mías" por default, que es distinto de ocultarlas.
alter table trol3.tareas enable row level security;

drop policy if exists tareas_miembros on trol3.tareas;
create policy tareas_miembros on trol3.tareas
  for all to authenticated
  using (trol3.es_miembro())
  with check (trol3.es_miembro());

revoke all on trol3.tareas from anon;
grant select, insert, update on trol3.tareas to authenticated;
