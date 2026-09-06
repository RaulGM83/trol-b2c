-- 118 — los casos congelados: la puerta antes de publicar un ajuste.
--
-- 117 dejó publicar ajustes sin deploy. Eso quita la fricción, pero no el
-- problema de fondo: una regla escrita para el caso de enfrente puede romper
-- los diez anteriores y nadie se entera, porque nadie se acuerda de cómo
-- sonaban. Iterar rápido sin medir no es iterar, es apostar.
--
-- Un caso es un juego de HECHOS CONGELADOS, no un apuntador al escenario. Es
-- la decisión que hace que esto sirva: si el caso leyera el expediente vivo, el
-- diff entre dos corridas mezclaría dos causas —cambió el prompt o cambió el
-- dato— y dejaría de contestar la única pregunta que se le hace. Congelados, la
-- ÚNICA variable entre dos corridas es lo que se le dijo al modelo.
--
-- Por eso también se guarda el TEXTO exacto de los ajustes que se probaron, no
-- sólo su número de versión: se corre antes de publicar, cuando ese texto
-- todavía no tiene versión.

create table if not exists trol3.prueba_casos (
  id        uuid primary key default gen_random_uuid(),
  etiqueta  text not null,
  nota      text,

  -- De dónde salió. Informativo: los números que se usan son los congelados.
  escenario_id uuid references trol3.escenarios(id) on delete set null,
  persona_id   uuid references trol3.personas(id) on delete set null,

  -- El juego de hechos, tal como estaba el día que se congeló.
  hechos    jsonb not null,

  orden     int not null default 0,
  activo    boolean not null default true,
  creado_por uuid references trol3.miembros(id),
  creado_en  timestamptz not null default now(),

  constraint prueba_casos_hechos_obj check (jsonb_typeof(hechos) = 'object')
);

comment on table trol3.prueba_casos is
  'Casos congelados para probar el redactor. Los hechos NO se refrescan: es lo que hace que el diff entre dos corridas hable sólo del prompt. 118.';
comment on column trol3.prueba_casos.hechos is
  'Congelados a propósito. Refrescarlos rompe la comparación con las corridas anteriores.';

create index if not exists prueba_casos_activo_idx
  on trol3.prueba_casos (activo, orden);


-- Una corrida es "todos los casos, con este texto". Se compara contra la
-- anterior.
create table if not exists trol3.prueba_corridas (
  id        uuid primary key default gen_random_uuid(),
  etiqueta  text,
  prompt_version text,
  -- El texto EXACTO que se probó. Puede no tener versión todavía: el punto de
  -- esto es correrlo antes de publicarlo.
  instrucciones_texto text,
  instrucciones_version int,
  creado_por uuid references trol3.miembros(id),
  creado_en  timestamptz not null default now()
);

comment on table trol3.prueba_corridas is
  'Una pasada de todos los casos con un texto de ajustes dado. 118.';

create index if not exists prueba_corridas_fecha_idx
  on trol3.prueba_corridas (creado_en desc);


create table if not exists trol3.prueba_resultados (
  id        uuid primary key default gen_random_uuid(),
  corrida_id uuid not null references trol3.prueba_corridas(id) on delete cascade,
  caso_id    uuid not null references trol3.prueba_casos(id) on delete cascade,
  narrativa  jsonb,
  -- Un fallo se guarda como fallo. Una narrativa vacía y un error son cosas
  -- distintas y el diff tiene que poder distinguirlas.
  error      text,
  modelo     text,
  creado_en  timestamptz not null default now(),
  unique (corrida_id, caso_id)
);

comment on table trol3.prueba_resultados is
  'Lo que escribió el modelo para un caso en una corrida. El error se guarda como error, no como texto vacío. 118.';


alter table trol3.prueba_casos      enable row level security;
alter table trol3.prueba_corridas   enable row level security;
alter table trol3.prueba_resultados enable row level security;

drop policy if exists prueba_casos_admin on trol3.prueba_casos;
create policy prueba_casos_admin on trol3.prueba_casos
  for all to authenticated
  using (trol3.tiene_rol('admin')) with check (trol3.tiene_rol('admin'));

drop policy if exists prueba_corridas_admin on trol3.prueba_corridas;
create policy prueba_corridas_admin on trol3.prueba_corridas
  for all to authenticated
  using (trol3.tiene_rol('admin')) with check (trol3.tiene_rol('admin'));

drop policy if exists prueba_resultados_admin on trol3.prueba_resultados;
create policy prueba_resultados_admin on trol3.prueba_resultados
  for all to authenticated
  using (trol3.tiene_rol('admin')) with check (trol3.tiene_rol('admin'));

revoke all on trol3.prueba_casos      from anon;
revoke all on trol3.prueba_corridas   from anon;
revoke all on trol3.prueba_resultados from anon;
grant select, insert, update, delete on trol3.prueba_casos      to authenticated;
grant select, insert, update, delete on trol3.prueba_corridas   to authenticated;
grant select, insert, update, delete on trol3.prueba_resultados to authenticated;