-- 308 · IP de aceptación del Aviso de Privacidad, para el consentimiento del Buró de Ingresos (claude/122)
-- Desde el 15-nov-2026 el Buró registra el consentimiento dentro de POST /verifications, con la IP
-- del cliente tomada cuando aceptó el aviso. Aquí se guarda esa IP cuando el cliente entra a su cuenta
-- (acaba de aceptar el aviso en el login). Para quien no tenga, se manda la genérica acordada con Palenca.
-- Este archivo ya incluye la corrección 308b (alias cfg_ip y acep: «c» y «a» chocaban con variables del trigger).

create table if not exists trol3.aceptaciones_aviso (
  id bigint generated always as identity primary key,
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  ip text not null,
  user_agent text,
  version_aviso text,
  origen text not null default 'mi',
  created_at timestamptz not null default now()
);
create index if not exists aceptaciones_aviso_persona_idx on trol3.aceptaciones_aviso (persona_id, created_at desc);
alter table trol3.aceptaciones_aviso enable row level security;  -- sin políticas: solo por función o servicio
revoke all on trol3.aceptaciones_aviso from anon, authenticated;

-- La llama la app con la sesión del cliente. Una fila por IP distinta cada 30 días, no una por visita.
create or replace function trol3.registrar_aceptacion_aviso(p_ip text, p_user_agent text default null, p_origen text default 'mi')
returns boolean
language plpgsql security definer
set search_path to 'trol3', 'public'
as $fn$
declare pid uuid := trol3.current_persona_id();
begin
  if pid is null then return false; end if;
  p_ip := trim(coalesce(p_ip, ''));
  if p_ip !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' and p_ip !~ '^[0-9a-fA-F:]{3,45}$' then return false; end if;
  if exists (select 1 from trol3.aceptaciones_aviso a
              where a.persona_id = pid and a.ip = p_ip and a.created_at > now() - interval '30 days') then
    return false;
  end if;
  insert into trol3.aceptaciones_aviso (persona_id, ip, user_agent, version_aviso, origen)
  values (pid, p_ip, left(p_user_agent, 300), trol3.legal_vigente('aviso_privacidad')->>'version', coalesce(nullif(p_origen, ''), 'mi'));
  return true;
end $fn$;
revoke all on function trol3.registrar_aceptacion_aviso(text, text, text) from public, anon;
grant execute on function trol3.registrar_aceptacion_aviso(text, text, text) to authenticated, service_role;

insert into trol3.config (clave, valor) values ('bdi_ip_generica', '192.168.0.243')
on conflict (clave) do nothing;

-- El despachador manda al Buró: la IP que venga en la consulta, si no la última aceptación del cliente,
-- si no la genérica. En el cuerpo que recibe n8n va también ip_origen (consulta | aceptacion | generica).
do $outer$
declare def text; ancla text := $a$'ip_address', new.payload_in->>'ip_address',$a$;
begin
  def := pg_get_functiondef('trol3.tg_consulta_despachar()'::regprocedure);
  if position('bdi_ip_generica' in def) > 0 then return; end if;
  if position(ancla in def) = 0 then raise exception '308: no encontré el ancla en tg_consulta_despachar'; end if;
  def := replace(def, ancla, $n$'ip_address', coalesce(nullif(new.payload_in->>'ip_address', ''),
                                    (select acep.ip from trol3.aceptaciones_aviso acep where acep.persona_id = p.id order by acep.created_at desc limit 1),
                                    (select cfg_ip.valor from trol3.config cfg_ip where cfg_ip.clave = 'bdi_ip_generica')),
                                  'ip_origen', case when nullif(new.payload_in->>'ip_address', '') is not null then 'consulta'
                                                    when exists (select 1 from trol3.aceptaciones_aviso acep where acep.persona_id = p.id) then 'aceptacion'
                                                    else 'generica' end,$n$);
  execute def;
end $outer$;
