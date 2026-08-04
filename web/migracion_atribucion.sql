-- ============================================================================
-- Migración: atribución de clientes independiente de cookie
-- Reglas: peer = first-touch permanente · aliado = last-touch rolling 3 meses
-- Seguro: no altera datos existentes. Revisar antes de correr en producción.
-- ============================================================================

begin;

-- 1) Unicidad del referido (un solo referidor-peer por cliente) -----------------
--    Si ya existieran duplicados, este ALTER fallará: limpiar primero.
alter table public.referidos
  add constraint uq_referido_cliente unique (referido_cliente_id);

-- 2) Tabla de captura universal (append-only) -----------------------------------
create table public.atribuciones (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid references public.clientes(id) on delete cascade,
  curp                text,
  telefono            text,
  canal               text not null check (canal in ('cliente','aliado')),
  referrer_cliente_id uuid references public.clientes(id),
  partner_id          uuid references public.partners(id),
  codigo              text,
  fuente              text,
  touch_at            timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  constraint chk_ref check (
    (canal='cliente' and referrer_cliente_id is not null and partner_id is null) or
    (canal='aliado'  and partner_id is not null and referrer_cliente_id is null)
  )
);
create index idx_atribuciones_cliente  on public.atribuciones (cliente_id);
create index idx_atribuciones_curp      on public.atribuciones (curp);
create index idx_atribuciones_telefono  on public.atribuciones (telefono);
alter table public.atribuciones enable row level security;  -- solo service_role

-- 3) Trigger: resolver binding + crear vínculo peer (first-touch) ---------------
create or replace function public.resolver_atribucion_cliente()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.atribuciones a
     set cliente_id = new.id
   where a.cliente_id is null
     and ( (new.curp is not null and a.curp = new.curp)
        or (a.telefono is not null and right(regexp_replace(new.telefono,'\D','','g'),10)
                                     = right(regexp_replace(a.telefono,'\D','','g'),10)) );

  insert into public.referidos (referrer_cliente_id, referido_cliente_id, codigo, estado)
  select a.referrer_cliente_id, new.id, a.codigo, 'registrado'
    from public.atribuciones a
   where a.cliente_id = new.id
     and a.canal = 'cliente'
     and a.referrer_cliente_id <> new.id
   order by a.touch_at asc
   limit 1
  on conflict (referido_cliente_id) do nothing;

  return new;
end $$;

create trigger trg_resolver_atribucion
  after insert or update of curp, telefono on public.clientes
  for each row execute function public.resolver_atribucion_cliente();

-- 4) Vista resuelta: una sola fuente de "quién trajo al cliente" ----------------
create or replace view public.vista_atribucion_cliente as
select
  c.id                                   as cliente_id,
  r.referrer_cliente_id                  as peer_referrer_id,
  r.creado_at                            as peer_desde,
  pt.partner_id                          as aliado_id,
  pt.created_at                          as aliado_desde,
  pt.created_at + interval '3 months'    as aliado_vigente_hasta,
  (pt.created_at + interval '3 months' > now()) as aliado_vigente
from public.clientes c
left join public.referidos r on r.referido_cliente_id = c.id
left join lateral (
  select partner_id, created_at
    from public.partner_transactions
   where cliente_id = c.id and partner_id is not null
   order by created_at desc
   limit 1
) pt on true;

-- 5) (Opcional) Backfill peer desde referidos actuales --------------------------
-- insert into public.atribuciones (cliente_id, canal, referrer_cliente_id, codigo, fuente, touch_at)
-- select referido_cliente_id, 'cliente', referrer_cliente_id, codigo, 'backfill', creado_at
--   from public.referidos;

commit;
