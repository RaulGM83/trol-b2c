-- 117 — el prompt deja de ser algo que sólo se cambia con un deploy.
--
-- El redactor escribe bien "de entrada", pero afinarlo requiere un ciclo corto:
-- leer el borrador, decir qué faltó, volver a generar y ver si se acercó. Con
-- el prompt viviendo sólo en el repo ese ciclo cuesta un deploy por comentario,
-- y nadie itera así.
--
-- Lo que hace que iterar seguido NO sea riesgoso no es ir despacio, es que cada
-- cambio tenga un alcance declarado. Tres niveles:
--
--   comentario   Se guarda pegado al diagnóstico y a la sección. No afecta a
--                nadie. Sólo lo ve quien puede afinar el redactor.
--   ensayo       Una instrucción que aplica SÓLO a ese diagnóstico al
--                regenerarlo. Se prueba sobre un caso real sin tocar al equipo.
--   vigente      El bloque que se le pega al prompt base para todos. Se
--                promueve a propósito, tiene historial y se puede revertir.
--
-- El prompt BASE sigue en el repo, versionado y revisado. Este bloque es el
-- cuaderno de ajustes que después se consolida ahí — si no se consolida, en
-- tres meses el prompt es un base coherente más veinte parches que se
-- contradicen entre sí.
--
-- Y cada diagnóstico registra qué versión del prompt y qué versión de las
-- instrucciones lo produjeron. Sin eso, cuando la calidad caiga nadie va a
-- poder decir qué cambió — la misma lección que ENGINE_VERSION.

-- ---------------------------------------------------------------------------
-- El bloque vigente y su historia.
-- ---------------------------------------------------------------------------

create sequence if not exists trol3.redactor_instrucciones_version_seq;

create table if not exists trol3.redactor_instrucciones (
  id        uuid primary key default gen_random_uuid(),
  version   int  not null default nextval('trol3.redactor_instrucciones_version_seq'),
  texto     text not null,
  nota      text,
  activa    boolean not null default false,
  creado_por uuid references trol3.miembros(id),
  creado_en  timestamptz not null default now()
);

comment on table trol3.redactor_instrucciones is
  'Ajustes al prompt del redactor, versionados. Una sola versión activa; revertir es reactivar una anterior. Se consolidan al prompt base del repo cada tanto. 117.';

create unique index if not exists redactor_instrucciones_version_uq
  on trol3.redactor_instrucciones (version);

-- Una activa a la vez. El índice parcial lo vuelve imposible de romper, aunque
-- alguien escriba directo en la tabla.
create unique index if not exists redactor_instrucciones_una_activa
  on trol3.redactor_instrucciones ((true)) where activa;

alter table trol3.redactor_instrucciones enable row level security;

-- Cualquier miembro las LEE, porque su sesión es la que genera el borrador.
-- Sólo admin las escribe.
drop policy if exists redactor_instr_lee on trol3.redactor_instrucciones;
create policy redactor_instr_lee on trol3.redactor_instrucciones
  for select to authenticated using (trol3.es_miembro());

drop policy if exists redactor_instr_admin on trol3.redactor_instrucciones;
create policy redactor_instr_admin on trol3.redactor_instrucciones
  for all to authenticated
  using (trol3.tiene_rol('admin')) with check (trol3.tiene_rol('admin'));

revoke all on trol3.redactor_instrucciones from anon;
grant select, insert, update on trol3.redactor_instrucciones to authenticated;
grant usage on sequence trol3.redactor_instrucciones_version_seq to authenticated;


-- ---------------------------------------------------------------------------
-- El comentario, pegado al diagnóstico y a la sección.
-- ---------------------------------------------------------------------------

create table if not exists trol3.diagnostico_feedback (
  id            uuid primary key default gen_random_uuid(),
  diagnostico_id uuid not null references trol3.diagnosticos(id) on delete cascade,

  -- null = sobre el documento entero, no sobre una sección.
  seccion       text,

  -- Lo que se observó, en lenguaje natural.
  comentario    text not null,
  -- La regla ya redactada, cuando existe. Puede llegar después del comentario.
  instruccion   text,

  estado        text not null default 'abierto'
                check (estado in ('abierto', 'probado', 'promovido', 'descartado')),
  -- A qué versión del bloque vigente acabó, si acabó en alguna.
  promovida_version int,

  creado_por    uuid references trol3.miembros(id),
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table trol3.diagnostico_feedback is
  'Observaciones sobre lo que escribió el redactor, atadas al documento y a la sección. La materia prima de los ajustes al prompt. 117.';

create index if not exists diagnostico_feedback_diag_idx
  on trol3.diagnostico_feedback (diagnostico_id, creado_en desc);
create index if not exists diagnostico_feedback_abierto_idx
  on trol3.diagnostico_feedback (estado, creado_en desc);

create or replace function trol3.tg_feedback_touch()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists feedback_touch on trol3.diagnostico_feedback;
create trigger feedback_touch before update on trol3.diagnostico_feedback
  for each row execute function trol3.tg_feedback_touch();

alter table trol3.diagnostico_feedback enable row level security;

drop policy if exists feedback_admin on trol3.diagnostico_feedback;
create policy feedback_admin on trol3.diagnostico_feedback
  for all to authenticated
  using (trol3.tiene_rol('admin')) with check (trol3.tiene_rol('admin'));

revoke all on trol3.diagnostico_feedback from anon;
grant select, insert, update, delete on trol3.diagnostico_feedback to authenticated;


-- ---------------------------------------------------------------------------
-- Qué produjo cada documento, y el ensayo que aplica sólo a él.
-- ---------------------------------------------------------------------------

alter table trol3.diagnosticos
  add column if not exists prompt_version text,
  add column if not exists instrucciones_version int,
  add column if not exists ensayo text;

comment on column trol3.diagnosticos.prompt_version is
  'Versión del prompt base (repo) que escribió esta narrativa. 117.';
comment on column trol3.diagnosticos.instrucciones_version is
  'Versión del bloque vigente que se le pegó. null = ninguna. 117.';
comment on column trol3.diagnosticos.ensayo is
  'Instrucción que aplica SÓLO a este documento al regenerarlo. No toca a nadie más. 117.';