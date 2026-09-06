-- 118b — las puertas de los casos congelados.

create or replace function trol3.crear_caso_prueba(
  p_etiqueta  text,
  p_hechos    jsonb,
  p_escenario uuid default null,
  p_persona   uuid default null,
  p_nota      text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_yo uuid; v_id uuid;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null or not trol3.tiene_rol('admin') then raise exception 'no_autorizado'; end if;
  if coalesce(btrim(p_etiqueta), '') = '' then raise exception 'etiqueta_vacia'; end if;
  if p_hechos is null or jsonb_typeof(p_hechos) <> 'object' or p_hechos = '{}'::jsonb then
    raise exception 'hechos_vacios'
      using hint = 'Un caso sin hechos no prueba nada.';
  end if;

  insert into trol3.prueba_casos (etiqueta, nota, escenario_id, persona_id, hechos, orden, creado_por)
  values (
    btrim(p_etiqueta), nullif(btrim(coalesce(p_nota,'')),''), p_escenario, p_persona, p_hechos,
    coalesce((select max(orden) + 1 from trol3.prueba_casos), 0), v_yo)
  returning id into v_id;

  return v_id;
end $$;

comment on function trol3.crear_caso_prueba is
  'Congela un juego de hechos como caso de prueba. Sólo admin. 118b.';


create or replace function trol3.archivar_caso_prueba(p_caso uuid, p_activo boolean default false)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
begin
  if not trol3.tiene_rol('admin') then raise exception 'no_autorizado'; end if;
  -- Se archiva, no se borra: las corridas viejas lo citan.
  update trol3.prueba_casos set activo = p_activo where id = p_caso;
  if not found then raise exception 'caso_no_encontrado'; end if;
end $$;

comment on function trol3.archivar_caso_prueba is
  'Saca un caso de las corridas nuevas sin borrarlo: las viejas lo citan. Sólo admin. 118b.';


create or replace function trol3.abrir_corrida(
  p_texto   text default null,
  p_prompt_version text default null,
  p_instrucciones_version int default null,
  p_etiqueta text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_yo uuid; v_id uuid; v_n int;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null or not trol3.tiene_rol('admin') then raise exception 'no_autorizado'; end if;

  select count(*) into v_n from trol3.prueba_casos where activo;
  if v_n = 0 then
    raise exception 'sin_casos'
      using hint = 'Congela al menos un caso antes de correr la prueba.';
  end if;

  insert into trol3.prueba_corridas
    (etiqueta, prompt_version, instrucciones_texto, instrucciones_version, creado_por)
  values
    (nullif(btrim(coalesce(p_etiqueta,'')),''), p_prompt_version,
     nullif(btrim(coalesce(p_texto,'')),''), p_instrucciones_version, v_yo)
  returning id into v_id;

  return v_id;
end $$;

comment on function trol3.abrir_corrida is
  'Abre una pasada de los casos activos con un texto de ajustes dado. Sólo admin. 118b.';


create or replace function trol3.guardar_resultado(
  p_corrida   uuid,
  p_caso      uuid,
  p_narrativa jsonb default null,
  p_error     text  default null,
  p_modelo    text  default null
)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
begin
  if not trol3.tiene_rol('admin') then raise exception 'no_autorizado'; end if;

  insert into trol3.prueba_resultados (corrida_id, caso_id, narrativa, error, modelo)
  values (p_corrida, p_caso, p_narrativa, nullif(btrim(coalesce(p_error,'')),''), p_modelo)
  on conflict (corrida_id, caso_id) do update
    set narrativa = excluded.narrativa,
        error     = excluded.error,
        modelo    = excluded.modelo,
        creado_en = now();
end $$;

comment on function trol3.guardar_resultado is
  'Guarda lo que escribió el modelo para un caso. Reintentar un caso pisa su resultado, no duplica. 118b.';


-- Las corridas con lo que hace falta para elegir cuáles comparar.
create or replace view trol3.v_prueba_corridas as
select
  c.id, c.etiqueta, c.prompt_version, c.instrucciones_version,
  c.instrucciones_texto, c.creado_en,
  m.nombre as creado_por_nombre,
  (select count(*) from trol3.prueba_resultados r where r.corrida_id = c.id) as casos,
  (select count(*) from trol3.prueba_resultados r where r.corrida_id = c.id and r.error is not null) as fallidos
from trol3.prueba_corridas c
left join trol3.miembros m on m.id = c.creado_por;

alter view trol3.v_prueba_corridas set (security_invoker = true);

comment on view trol3.v_prueba_corridas is
  'Corridas con su conteo de casos y fallos. Hereda el RLS (sólo admin). 118b.';

grant select on trol3.v_prueba_corridas to authenticated;

grant execute on function trol3.crear_caso_prueba(text, jsonb, uuid, uuid, text) to authenticated;
grant execute on function trol3.archivar_caso_prueba(uuid, boolean) to authenticated;
grant execute on function trol3.abrir_corrida(text, text, int, text) to authenticated;
grant execute on function trol3.guardar_resultado(uuid, uuid, jsonb, text, text) to authenticated;