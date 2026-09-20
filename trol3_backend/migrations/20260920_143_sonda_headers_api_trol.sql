-- 143: sonda temporal para ver qué cabeceras manda Tako al llamar a api-trol.
--
-- Antes de pedirle a nadie que toque la configuración de las herramientas del bot, vale
-- la pena comprobar si el runtime de Insurance Boosters ya manda el id de conversación
-- por su cuenta en algún header. Si viene, no hay nada que cambiar del otro lado.
--
-- Se apaga sola: sólo escribe mientras `config.sonda_headers_hasta` esté en el futuro, y
-- deja de escribir al llegar al tope de filas. Una sonda que hay que acordarse de apagar
-- es una sonda que se queda encendida.
create table if not exists trol3.sonda_headers (
  id bigserial primary key,
  ruta text,
  metodo text,
  headers jsonb not null,
  created_at timestamptz not null default now()
);

alter table trol3.sonda_headers enable row level security;

drop policy if exists sonda_headers_lectura on trol3.sonda_headers;
create policy sonda_headers_lectura on trol3.sonda_headers
  for select to authenticated using (trol3.es_miembro());

insert into trol3.config (clave, valor)
values ('sonda_headers_hasta', (now() + interval '2 days')::text)
on conflict (clave) do update set valor = excluded.valor;

-- Guarda las cabeceras de una llamada, sin los secretos.
--
-- La lista negra es explícita y no se negocia: x-trol-key es la llave de esta API y
-- authorization/apikey la de Supabase. Una sonda de diagnóstico que archiva credenciales
-- convierte una tabla de depuración en un incidente.
create or replace function trol3.anotar_headers(p_ruta text, p_metodo text, p_headers jsonb)
returns void
language plpgsql security definer set search_path to 'trol3', 'public'
as $function$
declare v_hasta timestamptz; v_n bigint;
begin
  select valor::timestamptz into v_hasta from trol3.config where clave = 'sonda_headers_hasta';
  if v_hasta is null or now() > v_hasta then return; end if;

  select count(*) into v_n from trol3.sonda_headers;
  if v_n >= 500 then return; end if;

  insert into trol3.sonda_headers (ruta, metodo, headers)
  select p_ruta, p_metodo,
         coalesce(jsonb_object_agg(k, v) filter (
           where lower(k) not in ('x-trol-key','authorization','apikey','cookie','x-api-key','x-ib-api-key')
         ), '{}'::jsonb)
    from jsonb_each_text(coalesce(p_headers, '{}'::jsonb)) as t(k, v);
exception when others then return;  -- una sonda jamás tumba la ruta que observa
end $function$;

revoke all on function trol3.anotar_headers(text, text, jsonb) from public;
grant execute on function trol3.anotar_headers(text, text, jsonb) to service_role;

-- Qué cabeceras distintas han llegado y con qué pinta de valor: es lo que se mira al
-- revisar la sonda.
create or replace view trol3.v_sonda_headers as
select lower(t.k) as header,
       count(*) as veces,
       min(s.created_at) as primera,
       max(s.created_at) as ultima,
       (array_agg(left(t.v, 60) order by s.created_at desc))[1] as ejemplo
  from trol3.sonda_headers s, jsonb_each_text(s.headers) as t(k, v)
 group by 1;
