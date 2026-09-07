-- 122 — el aliado que REFIERE, que no es el aliado que COMPRA.
--
-- Hoy "aliado" cubre dos relaciones opuestas bajo la misma palabra:
--
--   Aliado de servicio (`public.partners` + `trol3.consultas_aliados`, 658
--   filas): manda una CURP, paga créditos, recibe un diagnóstico. El cliente es
--   SUYO y Trol es su proveedor.
--
--   Aliado referidor (esto): nos presenta a una persona que desde el día uno es
--   CLIENTE DE TROL, y a cambio quiere ver qué va pasando con ella y cobrar por
--   lo que se le venda.
--
-- Son opuestas en quién es dueño del cliente, y por eso van separadas aunque a
-- veces sea la misma persona (`aliados.partner_id` las liga). Mezclarlas en una
-- tabla es lo que un día haría que un aliado de servicio vea un expediente que
-- no le toca.
--
-- Nota sobre `trol3.persona_partner`: existe, está vacía y su forma se parece a
-- esto, pero se liga a `public.partners` —la tabla del modelo de servicio—, así
-- que usarla volvería a mezclar las dos relaciones. Se deja para el modelo
-- viejo.

create table if not exists trol3.aliados (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  empresa     text,
  email       text,
  telefono    text,

  tipo        text not null default 'asesor_seguros'
              check (tipo in ('asesor_seguros', 'contador', 'despacho', 'promotor', 'otro')),

  -- Su login. Independiente del portal viejo: un referidor puede no ser nunca
  -- aliado de servicio.
  auth_user_id uuid unique,
  -- Si además es aliado de servicio, aquí se liga con su cuenta del portal.
  partner_id   uuid,

  -- Términos de comisión. SIN default a propósito: un porcentaje inventado en
  -- el esquema acaba aplicándose a alguien. Se captura al dar de alta.
  comision_pct  numeric check (comision_pct > 0 and comision_pct <= 1),
  comision_nota text,

  activo      boolean not null default true,
  nota        text,
  creado_por  uuid references trol3.miembros(id),
  creado_en   timestamptz not null default now()
);

comment on table trol3.aliados is
  'Aliados que REFIEREN clientes (el cliente es de Trol desde el día uno). Distinto de public.partners, que compra consultas. 122.';
comment on column trol3.aliados.comision_pct is
  'Sobre el valor de la oportunidad ganada. Sin default: se pacta por aliado.';

create index if not exists aliados_activo_idx on trol3.aliados (activo, nombre);


-- ---------------------------------------------------------------------------
-- A quién refirió, y si esa referencia cuenta.
-- ---------------------------------------------------------------------------

create table if not exists trol3.referidos (
  id         uuid primary key default gen_random_uuid(),
  aliado_id  uuid not null references trol3.aliados(id) on delete cascade,
  persona_id uuid not null references trol3.personas(id) on delete cascade,

  origen     text not null default 'link'
             check (origen in ('link', 'qr', 'alta_manual')),

  -- La persona YA existía en Trol cuando llegó la referencia. No decide nada
  -- por sí solo: decide el estado.
  ya_existia boolean not null default false,

  -- `atribuido` es el único estado que genera comisión. Una persona que ya
  -- existía entra como `por_revisar` y la decide una persona de Trol: es la
  -- regla que Raúl eligió sobre automatizarla, porque el caso gris es real y
  -- una regla de meses siempre deja a alguien inconforme.
  estado     text not null default 'atribuido'
             check (estado in ('atribuido', 'por_revisar', 'rechazado')),

  -- El cliente puede apagar la visibilidad. Se le dice quién lo refirió y qué
  -- va a ver; que se pueda apagar es lo que hace honesto decírselo.
  visible_para_aliado boolean not null default true,

  decidido_por uuid references trol3.miembros(id),
  decidido_en  timestamptz,
  nota         text,
  creado_en    timestamptz not null default now(),

  unique (aliado_id, persona_id),
  constraint referidos_decision_coherente check (
    (estado = 'atribuido' and not ya_existia) or estado <> 'atribuido'
      or (decidido_por is not null)
  )
);

comment on table trol3.referidos is
  'Personas que un aliado refirió. Sólo `atribuido` genera comisión; quien ya era cliente entra como `por_revisar`. 122.';
comment on column trol3.referidos.visible_para_aliado is
  'El cliente puede apagarla. Poder apagarla es lo que hace honesto avisarle.';

create index if not exists referidos_aliado_idx on trol3.referidos (aliado_id, creado_en desc);
create index if not exists referidos_persona_idx on trol3.referidos (persona_id);
create index if not exists referidos_revisar_idx on trol3.referidos (estado) where estado = 'por_revisar';


-- ---------------------------------------------------------------------------
-- Lo devengado. Se congela.
-- ---------------------------------------------------------------------------

create table if not exists trol3.comisiones (
  id            uuid primary key default gen_random_uuid(),
  aliado_id     uuid not null references trol3.aliados(id) on delete restrict,
  referido_id   uuid not null references trol3.referidos(id) on delete restrict,
  persona_id    uuid not null references trol3.personas(id) on delete restrict,
  oportunidad_id uuid references trol3.oportunidades(id) on delete set null,

  -- Base y porcentaje se guardan como estaban el día que se devengó. Si mañana
  -- se renegocian los términos, lo ya ganado no se mueve — y una comisión que
  -- cambia sola es la manera más rápida de perder a un aliado.
  base   numeric not null,
  pct    numeric not null,
  monto  numeric not null,

  estado text not null default 'devengada'
         check (estado in ('devengada', 'pagada', 'cancelada')),

  pagada_en   timestamptz,
  pagada_por  uuid references trol3.miembros(id),
  referencia  text,
  nota        text,
  creado_en   timestamptz not null default now(),

  constraint comisiones_pago_coherente check (
    (estado = 'pagada') = (pagada_en is not null)
  )
);

comment on table trol3.comisiones is
  'Comisión devengada por una oportunidad ganada de un referido. Base y pct congelados al devengarse. 122.';

create index if not exists comisiones_aliado_idx on trol3.comisiones (aliado_id, estado, creado_en desc);
-- Una oportunidad no puede devengar dos veces.
create unique index if not exists comisiones_oportunidad_uq
  on trol3.comisiones (oportunidad_id) where oportunidad_id is not null;


-- ---------------------------------------------------------------------------
-- El link / QR del aliado.
-- ---------------------------------------------------------------------------

alter table trol3.codigos_invitacion
  add column if not exists aliado_id uuid references trol3.aliados(id) on delete cascade;

alter table trol3.codigos_invitacion drop constraint if exists codigos_invitacion_tipo_check;
alter table trol3.codigos_invitacion add constraint codigos_invitacion_tipo_check
  check (tipo in ('asesor', 'cliente', 'prensa', 'campania', 'sitio', 'aliado'));

comment on column trol3.codigos_invitacion.aliado_id is
  'Para tipo=aliado: de quién es el link/QR. 122.';


-- ---------------------------------------------------------------------------
-- RLS. Por ahora sólo miembros; el acceso del propio aliado entra con su
-- espacio, para no abrir una puerta antes de que exista el cuarto.
-- ---------------------------------------------------------------------------

alter table trol3.aliados     enable row level security;
alter table trol3.referidos   enable row level security;
alter table trol3.comisiones  enable row level security;

drop policy if exists aliados_miembros on trol3.aliados;
create policy aliados_miembros on trol3.aliados for all to authenticated
  using (trol3.es_miembro()) with check (trol3.es_miembro());

drop policy if exists referidos_miembros on trol3.referidos;
create policy referidos_miembros on trol3.referidos for all to authenticated
  using (trol3.es_miembro()) with check (trol3.es_miembro());

drop policy if exists comisiones_miembros on trol3.comisiones;
create policy comisiones_miembros on trol3.comisiones for all to authenticated
  using (trol3.es_miembro()) with check (trol3.es_miembro());

revoke all on trol3.aliados, trol3.referidos, trol3.comisiones from anon;
grant select, insert, update on trol3.aliados to authenticated;
grant select, insert, update on trol3.referidos to authenticated;
grant select, insert, update on trol3.comisiones to authenticated;