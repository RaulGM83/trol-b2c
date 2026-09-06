-- 113 — cerrar un escenario desde la calculadora.
--
-- `trol3.escenarios` nació el 24-ago para la Mesa Viraal: un snapshot inmutable
-- de lo que se autorizó, porque un proyecto autorizado el martes ya no se puede
-- reconstruir el jueves (el motor cambia, la semilla se refresca, la ventana del
-- art. 220 se mueve sola con el calendario).
--
-- El mismo problema, más grande, existe en la asesoría. La calculadora ya
-- contiene la estrategia —las cinco fuentes, el destino de la vivienda, la edad
-- elegida— pero todo eso es estado de sesión: al cerrar la pestaña se pierde.
-- Nadie puede volver en tres meses y saber con qué supuestos se le dijo eso al
-- cliente, y el diagnóstico avanzado se sigue generando desde la semilla, sin
-- enterarse de nada de lo que se habló.
--
-- Falta el momento en que el asesor dice "éste es el que le voy a presentar".
-- Eso es cerrar un escenario. La tabla ya sirve tal cual; sólo hay que dejar
-- entrar los tipos nuevos y darle una puerta con nombre propio.
--
-- Un escenario cerrado congela los datos de ESE día. Si mañana llega un SISEC
-- nuevo, no se actualiza — ése es el punto. La pantalla es la que tiene que
-- decirlo.

-- 1. Los tipos nuevos ------------------------------------------------------
--    `autorizacion` es de la Mesa Viraal. El prefijo `calc_` dice que salió de
--    la calculadora del asesor, que es otra cosa: presentar no es autorizar.

alter table trol3.escenarios drop constraint if exists escenarios_tipo_check;
alter table trol3.escenarios add constraint escenarios_tipo_check
  check (tipo in ('autorizacion', 'calc_ley73', 'calc_ley97', 'calc_mod40'));

comment on column trol3.escenarios.tipo is
  'autorizacion = Mesa Viraal. calc_* = escenario cerrado por el asesor en la calculadora, uno por pestaña. 113.';

comment on column trol3.escenarios.ventana is
  'Salida de ventanaMod40 (art. 219/220 LSS) cuando aplica. Objeto vacío en las calculadoras que no tienen ventana (Ley 73/97). 113.';

-- 2. La puerta -------------------------------------------------------------
--    Delega en autorizar_escenario para no duplicar las validaciones: hay una
--    sola ruta de inserción y una sola definición de qué es un snapshot válido.

create or replace function trol3.cerrar_escenario(
  p_persona         uuid,
  p_consulta_aliado uuid,
  p_tipo            text,
  p_inputs          jsonb,
  p_resultado       jsonb,
  p_ventana         jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_id uuid;
begin
  if p_tipo not in ('calc_ley73', 'calc_ley97', 'calc_mod40') then
    raise exception 'tipo_invalido'
      using hint = 'Los tipos de la calculadora son calc_ley73, calc_ley97 y calc_mod40. Para la Mesa Viraal usa autorizar_escenario.';
  end if;

  -- El resumen es lo que la lista puede enseñar sin abrir el snapshot entero.
  -- Sin él, ver los escenarios cerrados de una persona obligaría a bajarse
  -- varias semillas completas.
  if not (p_inputs ? 'resumen') then
    raise exception 'falta_resumen'
      using hint = 'inputs.resumen debe traer al menos etiqueta y pension_mensual.';
  end if;

  v_id := trol3.autorizar_escenario(
    p_persona, p_consulta_aliado, p_inputs, p_resultado,
    coalesce(p_ventana, '{}'::jsonb), p_tipo);

  if p_persona is not null then
    perform trol3.registrar_interaccion(
      p_persona, 'nota', 'asesor', trol3.current_miembro_id(), 'interna',
      'Cerró un escenario: ' || coalesce(p_inputs->'resumen'->>'etiqueta', p_tipo),
      false, jsonb_build_object('escenario_id', v_id, 'tipo', p_tipo));
  end if;

  return v_id;
end $$;

comment on function trol3.cerrar_escenario is
  'Congela el escenario que el asesor va a presentar. Snapshot inmutable en trol3.escenarios; se apila, cerrar otro no pisa el anterior. 113.';

grant execute on function trol3.cerrar_escenario(uuid, uuid, text, jsonb, jsonb, jsonb) to authenticated;

-- 3. La lista --------------------------------------------------------------
--    Sin los jsonb pesados: para pintar la lista no hace falta la semilla.

create or replace view trol3.v_escenarios_cerrados as
select
  e.id,
  e.tipo,
  e.persona_id,
  e.consulta_aliado_id,
  e.creado_en,
  e.creado_por,
  m.nombre as creado_por_nombre,
  e.inputs->>'motor_version' as motor_version,
  (e.inputs->>'motor_version') = (
    select valor from trol3.config where clave = 'motor_version_actual'
  ) as motor_actual,
  e.inputs->'resumen' as resumen
from trol3.escenarios e
left join trol3.miembros m on m.id = e.creado_por
where e.tipo like 'calc\_%';

comment on view trol3.v_escenarios_cerrados is
  'Escenarios cerrados por el asesor, sin los jsonb pesados. motor_actual dice si los números los produjo el motor de hoy. 113.';

grant select on trol3.v_escenarios_cerrados to authenticated;

-- La app estampa la versión al cerrar; aquí se guarda la vigente para poder
-- marcar en la lista los escenarios que ya quedaron viejos.
insert into trol3.config (clave, valor)
values ('motor_version_actual', 'pension-core@2026.09.06.1')
on conflict (clave) do update set valor = excluded.valor;
