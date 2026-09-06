-- 115 — el diagnóstico avanzado deja de generarse desde la semilla.
--
-- Hasta hoy `solicitar_diagnostico_avanzado` armaba su payload desde
-- `public.clientes.calculo_pensional` y se lo mandaba a n8n, que rellenaba una
-- plantilla de Google Doc. Nada de la sesión viajaba: ni el destino de la
-- vivienda, ni la edad elegida, ni qué fuentes entran. El asesor sólo podía
-- apretar "solicitar" y "regenerar".
--
-- Ahora el diagnóstico es el ACTA DE LA ASESORÍA y se arma de tres capas con
-- reglas distintas (claude/48):
--
--   hechos     Del expediente y del escenario cerrado, con su fecha y fuente.
--              NO editables. Si un número está mal se corrige el dato, no el
--              documento — es lo que impide que alguien tape un $NaN a mano y
--              el error siga vivo en la base para el siguiente cliente.
--   narrativa  Borrador de IA sobre el escenario cerrado. El asesor reescribe
--              libremente: es su documento, no el de la máquina.
--   acuerdos   Sólo del asesor: lo que se platicó y lo que se propuso.
--
-- Lo que sigue (los pendientes) NO vive aquí: son `trol3.tareas` con
-- origen='diagnostico', porque un compromiso tiene que poder perseguirse desde
-- la lista de trabajo y no sólo desde el PDF.
--
-- La fila es mutable, a diferencia de `trol3.escenarios`. Lo inmutable es el
-- escenario que le da los números; el documento se edita hasta entregarse.

create table if not exists trol3.diagnosticos (
  id           uuid primary key default gen_random_uuid(),
  persona_id   uuid not null references trol3.personas(id) on delete cascade,

  -- Los escenarios cerrados sobre los que se escribió. Uno por calculadora;
  -- el documento los junta. Sin al menos uno no hay nada que contar.
  escenario_ids uuid[] not null default '{}',

  estado       text not null default 'borrador'
               check (estado in ('borrador', 'revisado', 'entregado')),

  -- { hechos: {...}, narrativa: {...}, acuerdos: "..." }
  contenido    jsonb not null default '{}'::jsonb,

  -- Qué modelo escribió el borrador y con qué versión del motor se armaron los
  -- hechos. Sin esto, dentro de tres meses nadie sabe si un párrafo raro salió
  -- de un modelo viejo o de datos viejos.
  redactor     text,
  motor_version text,

  creado_por   uuid references trol3.miembros(id),
  creado_en    timestamptz not null default now(),
  actualizado_por uuid references trol3.miembros(id),
  actualizado_en  timestamptz not null default now(),
  entregado_en    timestamptz,

  constraint diagnosticos_contenido_obj check (jsonb_typeof(contenido) = 'object'),
  -- Entregado sin fecha de entrega sería mentira; con fecha sin estar entregado, ruido.
  constraint diagnosticos_entrega_coherente check (
    (estado = 'entregado') = (entregado_en is not null)
  )
);

comment on table trol3.diagnosticos is
  'El acta de la asesoría: hechos del escenario cerrado + narrativa de IA editable + acuerdos del asesor. Los pendientes viven en trol3.tareas. 115.';
comment on column trol3.diagnosticos.escenario_ids is
  'Escenarios cerrados que le dan los números. Inmutables ellos; el documento no.';
comment on column trol3.diagnosticos.contenido is
  'hechos (no editables) · narrativa (IA, editable) · acuerdos (del asesor).';

create index if not exists diagnosticos_persona_idx
  on trol3.diagnosticos (persona_id, creado_en desc);

create or replace function trol3.tg_diagnosticos_touch()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists diagnosticos_touch on trol3.diagnosticos;
create trigger diagnosticos_touch before update on trol3.diagnosticos
  for each row execute function trol3.tg_diagnosticos_touch();

-- RLS solo-miembros, como los escenarios: el borrador trae costos y estrategia
-- interna. Lo que ve el cliente es el PDF entregado, no esta fila.
alter table trol3.diagnosticos enable row level security;

drop policy if exists diagnosticos_miembros on trol3.diagnosticos;
create policy diagnosticos_miembros on trol3.diagnosticos
  for all to authenticated
  using (trol3.es_miembro())
  with check (trol3.es_miembro());

revoke all on trol3.diagnosticos from anon;
grant select, insert, update on trol3.diagnosticos to authenticated;
