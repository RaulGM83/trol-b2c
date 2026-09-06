-- 114b — las puertas de las tareas y la vista con la que se trabajan.

-- La vista trae resuelto lo que la pantalla tendría que recalcular en cada
-- renglón: nombres, si está vencida y para cuándo. `security_invoker` para que
-- herede el RLS de la tabla (la lección de 113b: una vista corre con los
-- permisos de su dueño si no se dice lo contrario).
create or replace view trol3.v_tareas as
select
  t.id, t.persona_id, t.titulo, t.detalle,
  t.responsable_id, r.nombre as responsable_nombre,
  t.creado_por, c.nombre as creado_por_nombre,
  t.vence_el, t.estado, t.origen, t.origen_id,
  t.hecha_en, t.nota_cierre, t.created_at, t.updated_at,
  trim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellidos,'')) as persona_nombre,
  (t.estado = 'pendiente' and t.vence_el is not null and t.vence_el < current_date) as vencida,
  case when t.estado = 'pendiente' and t.vence_el is not null
       then (t.vence_el - current_date) end as dias_para_vencer
from trol3.tareas t
join trol3.miembros r on r.id = t.responsable_id
left join trol3.miembros c on c.id = t.creado_por
left join trol3.personas p on p.id = t.persona_id;

alter view trol3.v_tareas set (security_invoker = true);

comment on view trol3.v_tareas is
  'Tareas con nombres resueltos y el vencimiento ya calculado. Hereda el RLS de trol3.tareas. 114b.';

grant select on trol3.v_tareas to authenticated;


-- Crear. El responsable por default es quien la crea: casi siempre el asesor
-- apunta lo que él mismo se comprometió a hacer.
create or replace function trol3.crear_tarea(
  p_titulo      text,
  p_persona     uuid default null,
  p_responsable uuid default null,
  p_vence_el    date default null,
  p_detalle     text default null,
  p_origen      text default 'manual',
  p_origen_id   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_id uuid; v_yo uuid;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null then raise exception 'no_autorizado'; end if;
  if length(btrim(coalesce(p_titulo,''))) < 3 then
    raise exception 'titulo_muy_corto'
      using hint = 'Una tarea tiene que decir qué hay que hacer.';
  end if;

  insert into trol3.tareas
    (persona_id, titulo, detalle, responsable_id, creado_por, vence_el, origen, origen_id)
  values
    (p_persona, btrim(p_titulo), nullif(btrim(coalesce(p_detalle,'')), ''),
     coalesce(p_responsable, v_yo), v_yo, p_vence_el,
     coalesce(nullif(btrim(p_origen), ''), 'manual'), p_origen_id)
  returning id into v_id;

  if p_persona is not null then
    perform trol3.registrar_interaccion(
      p_persona, 'nota', 'asesor', v_yo, 'interna',
      'Nueva tarea: ' || btrim(p_titulo), false,
      jsonb_build_object('tarea_id', v_id));
  end if;

  return v_id;
end $$;

comment on function trol3.crear_tarea is
  'Crea un compromiso. Sin responsable explícito se lo queda quien la crea. 114b.';


-- Cerrar (o reabrir). Se separa de un update genérico porque el cierre tiene
-- reglas: quién y cuándo se estampan solos, y reabrir tiene que limpiarlos.
create or replace function trol3.cerrar_tarea(
  p_tarea  uuid,
  p_estado text default 'hecha',
  p_nota   text default null
)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_yo uuid;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null then raise exception 'no_autorizado'; end if;
  if p_estado not in ('pendiente', 'hecha', 'cancelada') then
    raise exception 'estado_invalido';
  end if;

  update trol3.tareas
     set estado      = p_estado,
         hecha_en    = case when p_estado = 'pendiente' then null else now() end,
         hecha_por   = case when p_estado = 'pendiente' then null else v_yo end,
         nota_cierre = case when p_estado = 'pendiente' then null
                            else nullif(btrim(coalesce(p_nota,'')), '') end
   where id = p_tarea;

  if not found then raise exception 'tarea_no_encontrada'; end if;
end $$;

comment on function trol3.cerrar_tarea is
  'Marca una tarea hecha o cancelada, o la reabre. El quién y el cuándo los pone la función. 114b.';


-- Reasignar o mover la fecha, que es lo que de verdad se edita de una tarea viva.
create or replace function trol3.actualizar_tarea(
  p_tarea       uuid,
  p_responsable uuid default null,
  p_vence_el    date default null,
  p_limpiar_vence boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
begin
  if trol3.current_miembro_id() is null then raise exception 'no_autorizado'; end if;
  update trol3.tareas
     set responsable_id = coalesce(p_responsable, responsable_id),
         vence_el = case when p_limpiar_vence then null
                         else coalesce(p_vence_el, vence_el) end
   where id = p_tarea;
  if not found then raise exception 'tarea_no_encontrada'; end if;
end $$;

comment on function trol3.actualizar_tarea is
  'Reasigna una tarea o le mueve la fecha. 114b.';

grant execute on function trol3.crear_tarea(text, uuid, uuid, date, text, text, uuid) to authenticated;
grant execute on function trol3.cerrar_tarea(uuid, text, text) to authenticated;
grant execute on function trol3.actualizar_tarea(uuid, uuid, date, boolean) to authenticated;
