-- Trol 3.0 — esquema trol3 (v0.1)
create schema if not exists trol3;
grant usage on schema trol3 to anon, authenticated, service_role;

-- ---------- Enums ----------
do $$ begin
  create type trol3.capa_dato as enum ('declarado','calculado','validado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type trol3.actor_tipo as enum ('cliente','bot','recepcionista','asesor','aliado','sistema');
exception when duplicate_object then null; end $$;
do $$ begin
  create type trol3.rol_miembro as enum ('recepcionista','cabecera','especialista','admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type trol3.estado_consulta as enum ('solicitada','en_proceso','completada','sin_resultado','error','cancelada');
exception when duplicate_object then null; end $$;
do $$ begin
  create type trol3.estado_oportunidad as enum ('posible','detectada','presentada','en_proceso','ganada','perdida','no_aplica');
exception when duplicate_object then null; end $$;
do $$ begin
  create type trol3.estado_checklist as enum ('ok','alerta','sin_dato','no_aplica');
exception when duplicate_object then null; end $$;

-- ---------- Miembros (equipo Trol) ----------
create table if not exists trol3.miembros (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text unique not null,
  nombre text,
  roles trol3.rol_miembro[] not null default '{recepcionista,cabecera}',
  activo boolean not null default true,
  legacy_asesor_id uuid,
  hubspot_owner_id text,
  created_at timestamptz not null default now()
);

-- ---------- Canales / campañas ----------
create table if not exists trol3.canales (
  codigo text primary key,
  nombre text not null,
  tipo text not null default 'campania', -- campania | referido | aliado | organico | linkedin
  politica_proveedor text not null default 'belvo_first', -- belvo_first | jordan_first
  alto_valor boolean not null default false,
  partner_id uuid,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Personas ----------
create table if not exists trol3.personas (
  id uuid primary key default gen_random_uuid(),
  curp text unique,
  nss text,
  rfc text,
  nombre text,
  apellidos text,
  fecha_nacimiento date,
  sexo text,
  estado_republica text,
  canal_origen text references trol3.canales(codigo),
  campania_origen text,
  referidor_persona_id uuid references trol3.personas(id),
  partner_origen_id uuid,
  cabecera_id uuid references trol3.miembros(id),
  etapa text not null default 'nuevo', -- nuevo | conversando | expediente_base | asesorado | cliente | inactivo
  auth_user_id uuid unique,
  legacy_cliente_id uuid unique,
  hubspot_id text,
  merged_into uuid references trol3.personas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personas_cabecera_idx on trol3.personas(cabecera_id);
create index if not exists personas_hubspot_idx on trol3.personas(hubspot_id);

create table if not exists trol3.contactos (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  tipo text not null check (tipo in ('telefono','email')),
  valor text not null,
  normalizado text not null,
  principal boolean not null default false,
  verificado_at timestamptz,
  canal_verificacion text, -- wa | sms | token | email | manual
  no_contactar boolean not null default false,
  no_contactar_motivo text,
  consentimientos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tipo, normalizado, persona_id)
);
create index if not exists contactos_normalizado_idx on trol3.contactos(normalizado);
create index if not exists contactos_persona_idx on trol3.contactos(persona_id);

-- ---------- Partners (espejo de public.partners mientras conviven) ----------
create table if not exists trol3.persona_partner (
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  partner_id uuid not null,
  relacion text not null default 'consulta', -- origen | consulta | delegado | marca_blanca
  habla_con_cliente boolean not null default true,
  permisos jsonb not null default '{}'::jsonb,
  desde timestamptz not null default now(),
  primary key (persona_id, partner_id)
);

-- ---------- Catálogo de campos y datos ----------
create table if not exists trol3.catalogo_campos (
  campo text primary key,
  nombre text not null,
  grupo text not null, -- identidad | imss | afore | infonavit | issste | contexto | calculo
  tipo text not null default 'number', -- number | text | bool | date | json
  unidad text,
  vigencia_dias int, -- null = no vence
  editable_cliente boolean not null default true,
  visible_cliente boolean not null default true,
  visible_aliado boolean not null default true,
  orden int not null default 100
);

create table if not exists trol3.proveedores (
  codigo text primary key,
  nombre text not null,
  costo_unitario numeric(10,2) not null default 0,
  compromiso_mensual numeric(12,2) not null default 0,
  activo boolean not null default true,
  config jsonb not null default '{}'::jsonb
);

create table if not exists trol3.consultas (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  tipo text not null, -- imss_historial | cda | issste | infonavit | calculo_base | pdf_semanas | curp
  proveedor text references trol3.proveedores(codigo),
  solicitante_tipo trol3.actor_tipo not null default 'sistema',
  solicitante_id uuid,
  pagador text not null default 'trol', -- trol | cliente | aliado:<uuid>
  costo numeric(10,2) not null default 0,
  estado trol3.estado_consulta not null default 'solicitada',
  notificar_cliente boolean not null default false,
  motivo text,
  payload_in jsonb not null default '{}'::jsonb,
  resultado jsonb,
  error text,
  legacy_proceso_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists consultas_persona_idx on trol3.consultas(persona_id);
create index if not exists consultas_estado_idx on trol3.consultas(estado) where estado in ('solicitada','en_proceso');

create table if not exists trol3.documentos (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  tipo text not null, -- sisec | constancia_semanas | edo_cuenta_afore | ine | diagnostico | checkup | diagnostico_avanzado | comprobante | otro
  nombre text,
  storage_path text,
  url_externa text,
  origen_tipo trol3.actor_tipo not null default 'sistema',
  origen_id uuid,
  consulta_id uuid references trol3.consultas(id),
  gating text not null default 'gratis', -- gratis | pago | puntos
  precio_mxn numeric(10,2),
  max_pct_puntos int not null default 50,
  visibilidad text[] not null default '{trol,cliente}', -- trol | cliente | aliado:<uuid>
  vigente_hasta timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists documentos_persona_idx on trol3.documentos(persona_id);

create table if not exists trol3.datos (
  id bigserial primary key,
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  campo text not null references trol3.catalogo_campos(campo),
  valor jsonb not null,
  capa trol3.capa_dato not null,
  origen_tipo trol3.actor_tipo not null,
  origen_id uuid,
  proveedor text,
  evidencia_documento_id uuid references trol3.documentos(id),
  consulta_id uuid references trol3.consultas(id),
  obtenido_en timestamptz not null default now(),
  vigente_hasta timestamptz,
  pagado_por text not null default 'trol',
  visibilidad text[] not null default '{trol,cliente}',
  created_at timestamptz not null default now()
);
create index if not exists datos_persona_campo_idx on trol3.datos(persona_id, campo, capa, obtenido_en desc);

-- mejor dato: mayor capa > más reciente. Un validado vencido sigue ganando a declarado (se muestra como "antiguo").
create or replace function trol3.mejor_dato(p_persona uuid, p_campo text)
returns table(valor jsonb, capa trol3.capa_dato, obtenido_en timestamptz, vigente_hasta timestamptz, vigente boolean, proveedor text, origen_tipo trol3.actor_tipo)
language sql stable as $$
  select d.valor, d.capa, d.obtenido_en, d.vigente_hasta,
         (d.vigente_hasta is null or d.vigente_hasta > now()) as vigente,
         d.proveedor, d.origen_tipo
  from trol3.datos d
  where d.persona_id = p_persona and d.campo = p_campo
  order by (case d.capa when 'validado' then 3 when 'calculado' then 2 else 1 end) desc, d.obtenido_en desc
  limit 1
$$;

create or replace view trol3.v_mejor_dato as
select distinct on (persona_id, campo)
  persona_id, campo, valor, capa, obtenido_en, vigente_hasta,
  (vigente_hasta is null or vigente_hasta > now()) as vigente, proveedor, origen_tipo, visibilidad
from trol3.datos
order by persona_id, campo,
  (case capa when 'validado' then 3 when 'calculado' then 2 else 1 end) desc, obtenido_en desc;

-- ---------- Escenarios ----------
create table if not exists trol3.escenarios (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  nombre text not null default 'Mi escenario',
  dueno_tipo trol3.actor_tipo not null,
  dueno_id uuid,
  overrides jsonb not null default '{}'::jsonb,
  resultado jsonb,
  compartido_con_cliente boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Checklist de orden ----------
create table if not exists trol3.checklist_items (
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  item text not null, -- cuenta_sin_inconsistencias | semanas_reconocidas | afore_top | situacion_entendida | derechos_vigentes | cuenta_registrada
  estado trol3.estado_checklist not null default 'sin_dato',
  severidad text not null default 'media', -- baja | media | alta
  detalle text,
  calculado_en timestamptz not null default now(),
  primary key (persona_id, item)
);

-- ---------- Oportunidades ----------
create table if not exists trol3.catalogo_oportunidades (
  codigo text primary key,
  nombre text not null,
  nivel smallint not null check (nivel in (1,2,3)),
  descripcion text,
  producto text,
  proveedor_externo text,
  umbrales jsonb not null default '{}'::jsonb,
  datos_requeridos text[] not null default '{}',
  activo boolean not null default true,
  orden int not null default 100
);

create table if not exists trol3.oportunidades (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  codigo text not null references trol3.catalogo_oportunidades(codigo),
  estado trol3.estado_oportunidad not null default 'detectada',
  valor_estimado numeric(14,2),
  valor_detalle jsonb not null default '{}'::jsonb,
  urgencia_fecha date,
  urgencia_score int not null default 0,
  motivo text,
  datos_faltantes text[] not null default '{}',
  dueno_id uuid references trol3.miembros(id),
  especialista_id uuid references trol3.miembros(id),
  partner_atribuido_id uuid,
  detectada_en timestamptz not null default now(),
  presentada_en timestamptz,
  cerrada_en timestamptz,
  resultado text,
  hubspot_deal_id text,
  updated_at timestamptz not null default now(),
  unique (persona_id, codigo)
);
create index if not exists oportunidades_estado_idx on trol3.oportunidades(estado, valor_estimado desc);

-- ---------- Productos / órdenes / puntos ----------
create table if not exists trol3.productos (
  codigo text primary key,
  nombre text not null,
  tipo text not null, -- asesoria | calculadora | extraccion | documento | gestion | credito
  precio_mxn numeric(10,2) not null default 0,
  precio_creditos int,
  max_pct_puntos int not null default 100,
  activo boolean not null default true,
  legacy_code text
);

create table if not exists trol3.ordenes (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid references trol3.personas(id) on delete set null,
  partner_id uuid,
  producto text not null references trol3.productos(codigo),
  monto numeric(10,2) not null default 0,
  puntos_aplicados int not null default 0,
  creditos_aplicados int not null default 0,
  estado text not null default 'pendiente', -- pendiente | pagada | cumplida | cancelada
  payment_provider text,
  payment_ref text,
  paid_at timestamptz,
  legacy_orden_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists trol3.puntos (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  tipo text not null check (tipo in ('abono','cargo','expiracion')),
  motivo text,
  puntos int not null,
  referencia_tipo text,
  referencia_id uuid,
  expira_at timestamptz,
  legacy_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists puntos_persona_idx on trol3.puntos(persona_id);

-- ---------- Interacciones / citas ----------
create table if not exists trol3.interacciones (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  canal text not null, -- wa | llamada | nota | email | web | bot | sms
  actor_tipo trol3.actor_tipo not null,
  actor_id uuid,
  direccion text not null default 'saliente', -- entrante | saliente | interna
  contenido text,
  visible_cliente boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists interacciones_persona_idx on trol3.interacciones(persona_id, created_at desc);

create table if not exists trol3.citas (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  miembro_id uuid references trol3.miembros(id),
  inicio timestamptz not null,
  fin timestamptz,
  estado text not null default 'programada', -- programada | realizada | no_show | cancelada
  origen trol3.actor_tipo not null default 'cliente',
  notas text,
  created_at timestamptz not null default now()
);

-- ---------- Tokens de acceso (magic link) ----------
create table if not exists trol3.tokens_acceso (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  proposito text not null default 'login', -- login | campania | verificacion
  campania text,
  expira_at timestamptz not null,
  usado_at timestamptz,
  usos int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Eventos y reglas ----------
create table if not exists trol3.eventos (
  id bigserial primary key,
  persona_id uuid references trol3.personas(id) on delete cascade,
  tipo text not null,
  actor_tipo trol3.actor_tipo not null default 'sistema',
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  procesado_at timestamptz,
  error text
);
create index if not exists eventos_pendientes_idx on trol3.eventos(id) where procesado_at is null;
create index if not exists eventos_persona_idx on trol3.eventos(persona_id, created_at desc);

create table if not exists trol3.reglas_notificacion (
  id serial primary key,
  evento_tipo text not null,
  destinatario text not null, -- cliente | cabecera | asesores | aliado
  canal text not null default 'wa', -- wa | email | interno
  condicion jsonb not null default '{}'::jsonb,
  plantilla text,
  activo boolean not null default true
);

-- ---------- updated_at ----------
create or replace function trol3.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['personas','consultas','oportunidades','escenarios'] loop
    execute format('drop trigger if exists set_updated_at on trol3.%I', t);
    execute format('create trigger set_updated_at before update on trol3.%I for each row execute function trol3.tg_set_updated_at()', t);
  end loop;
end $$;

-- ---------- Emisión de eventos ----------
create or replace function trol3.emitir_evento(p_persona uuid, p_tipo text, p_actor trol3.actor_tipo, p_actor_id uuid, p_payload jsonb default '{}'::jsonb)
returns bigint language sql as $$
  insert into trol3.eventos(persona_id, tipo, actor_tipo, actor_id, payload)
  values (p_persona, p_tipo, coalesce(p_actor,'sistema'), p_actor_id, coalesce(p_payload,'{}'::jsonb))
  returning id
$$;

create or replace function trol3.tg_evento_dato() returns trigger language plpgsql as $$
begin
  perform trol3.emitir_evento(new.persona_id, 'dato_nuevo', new.origen_tipo, new.origen_id,
    jsonb_build_object('campo', new.campo, 'capa', new.capa, 'proveedor', new.proveedor, 'consulta_id', new.consulta_id));
  return new;
end $$;
drop trigger if exists evento_dato on trol3.datos;
create trigger evento_dato after insert on trol3.datos for each row execute function trol3.tg_evento_dato();

create or replace function trol3.tg_evento_consulta() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform trol3.emitir_evento(new.persona_id, 'consulta_solicitada', new.solicitante_tipo, new.solicitante_id,
      jsonb_build_object('consulta_id', new.id, 'tipo', new.tipo, 'proveedor', new.proveedor, 'pagador', new.pagador));
  elsif new.estado is distinct from old.estado and new.estado in ('completada','sin_resultado','error') then
    perform trol3.emitir_evento(new.persona_id, 'consulta_'||new.estado::text, 'sistema', null,
      jsonb_build_object('consulta_id', new.id, 'tipo', new.tipo, 'proveedor', new.proveedor,
                         'solicitante_tipo', new.solicitante_tipo, 'notificar_cliente', new.notificar_cliente));
  end if;
  return new;
end $$;
drop trigger if exists evento_consulta on trol3.consultas;
create trigger evento_consulta after insert or update on trol3.consultas for each row execute function trol3.tg_evento_consulta();

create or replace function trol3.tg_evento_oportunidad() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform trol3.emitir_evento(new.persona_id, 'oportunidad_'||new.estado::text, 'sistema', null,
      jsonb_build_object('oportunidad_id', new.id, 'codigo', new.codigo, 'valor', new.valor_estimado));
  elsif new.estado is distinct from old.estado then
    perform trol3.emitir_evento(new.persona_id, 'oportunidad_'||new.estado::text, 'asesor', new.dueno_id,
      jsonb_build_object('oportunidad_id', new.id, 'codigo', new.codigo, 'valor', new.valor_estimado, 'antes', old.estado));
  end if;
  return new;
end $$;
drop trigger if exists evento_oportunidad on trol3.oportunidades;
create trigger evento_oportunidad after insert or update on trol3.oportunidades for each row execute function trol3.tg_evento_oportunidad();

create or replace function trol3.tg_evento_persona() returns trigger language plpgsql as $$
begin
  perform trol3.emitir_evento(new.id, 'persona_alta', 'sistema', null, jsonb_build_object('canal', new.canal_origen, 'legacy', new.legacy_cliente_id is not null));
  return new;
end $$;
drop trigger if exists evento_persona on trol3.personas;
create trigger evento_persona after insert on trol3.personas for each row execute function trol3.tg_evento_persona();

create or replace function trol3.tg_evento_orden() returns trigger language plpgsql as $$
begin
  if new.estado is distinct from old.estado and new.estado in ('pagada','cumplida') then
    perform trol3.emitir_evento(new.persona_id, 'orden_'||new.estado, 'cliente', new.persona_id,
      jsonb_build_object('orden_id', new.id, 'producto', new.producto, 'monto', new.monto, 'puntos', new.puntos_aplicados));
  end if;
  return new;
end $$;
drop trigger if exists evento_orden on trol3.ordenes;
create trigger evento_orden after update on trol3.ordenes for each row execute function trol3.tg_evento_orden();

-- ---------- Helpers de contexto (RLS) ----------
create or replace function trol3.current_miembro_id() returns uuid language sql stable security definer set search_path = trol3, public as $$
  select id from trol3.miembros where auth_user_id = auth.uid() and activo limit 1
$$;
create or replace function trol3.current_persona_id() returns uuid language sql stable security definer set search_path = trol3, public as $$
  select id from trol3.personas where auth_user_id = auth.uid() limit 1
$$;
create or replace function trol3.current_partner_id() returns uuid language sql stable security definer set search_path = trol3, public as $$
  select id from public.partners where auth_user_id = auth.uid() and is_active limit 1
$$;
create or replace function trol3.es_miembro() returns boolean language sql stable as $$
  select trol3.current_miembro_id() is not null
$$;
create or replace function trol3.tiene_rol(r trol3.rol_miembro) returns boolean language sql stable security definer set search_path = trol3, public as $$
  select exists (select 1 from trol3.miembros where auth_user_id = auth.uid() and activo and r = any(roles))
$$;
create or replace function trol3.partner_ve_persona(p uuid) returns boolean language sql stable security definer set search_path = trol3, public as $$
  select exists (select 1 from trol3.persona_partner pp where pp.persona_id = p and pp.partner_id = trol3.current_partner_id())
$$;

grant execute on all functions in schema trol3 to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema trol3 to authenticated, service_role;
grant usage, select on all sequences in schema trol3 to authenticated, service_role;
alter default privileges in schema trol3 grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema trol3 grant usage, select on sequences to authenticated, service_role;
