-- 109 — "Datos a utilizar": el dinero del cliente deja de caber en dos cajones.
--
-- Hasta hoy el asesor sólo podía corregir dos números (disponible AFORE y
-- saldo Infonavit) y todo lo demás vivía estimado. El plan de retiro de la
-- empresa se contaba dentro de la AFORE aunque no rinde igual ni se retira
-- igual (caso Eva Santos, Pepsico), y un PPR de aseguradora simplemente no
-- existía en el modelo.
--
-- Ahora son cinco vehículos, cada uno con saldo actual y — donde aplica —
-- aportación mensual. El motor (pension-core) les da su propio rendimiento
-- real hacia adelante: AFORE 3%, corporativo 2%, otros planes 1%, Infonavit 0%.
--
-- Para no multiplicar parámetros posicionales, las dos RPC de guardado
-- aceptan ahora un `p_datos jsonb` con todo el paquete. Los dos parámetros
-- viejos siguen ahí y siguen ganando cuando vienen con valor, así que
-- cualquier llamador que no se haya actualizado sigue funcionando igual.

-- 1. Campos nuevos del catálogo -------------------------------------------

insert into trol3.catalogo_campos
  (campo, nombre, grupo, tipo, unidad, vigencia_dias,
   editable_cliente, visible_cliente, visible_aliado, orden, prioridad_capa)
values
  ('ahorro_voluntario_mensual', 'Aportación mensual al ahorro voluntario',
   'afore', 'number', 'mxn', 180, true, true, true, 34,
   array['validado','declarado','calculado']),
  ('plan_corporativo', 'Saldo en el plan de retiro de la empresa',
   'ahorro_privado', 'number', 'mxn', 180, true, true, true, 50,
   array['validado','declarado','calculado']),
  ('plan_corporativo_mensual', 'Aportación mensual al plan de la empresa',
   'ahorro_privado', 'number', 'mxn', 180, true, true, true, 51,
   array['validado','declarado','calculado']),
  ('otros_planes', 'Saldo en otros planes de ahorro (PPR, fondos, caja)',
   'ahorro_privado', 'number', 'mxn', 180, true, true, true, 52,
   array['validado','declarado','calculado']),
  ('otros_planes_mensual', 'Aportación mensual a otros planes de ahorro',
   'ahorro_privado', 'number', 'mxn', 180, true, true, true, 53,
   array['validado','declarado','calculado'])
on conflict (campo) do update
  set nombre = excluded.nombre,
      grupo = excluded.grupo,
      tipo = excluded.tipo,
      unidad = excluded.unidad,
      vigencia_dias = excluded.vigencia_dias,
      orden = excluded.orden,
      prioridad_capa = excluded.prioridad_capa;

-- 2. Las claves que viajan en el jsonb ------------------------------------
--    Una sola lista, para que las tres funciones de abajo no se separen.

create or replace function trol3.campos_datos_a_utilizar()
returns text[] language sql immutable as $$
  select array[
    'rcv97', 'disponible_afore', 'infonavit',
    'ahorro_voluntario', 'ahorro_voluntario_mensual',
    'plan_corporativo', 'plan_corporativo_mensual',
    'otros_planes', 'otros_planes_mensual'
  ]
$$;

comment on function trol3.campos_datos_a_utilizar is
  'Claves aceptadas en el p_datos de guardar_saldos_corregidos y guardar_saldos_consulta_aliado. 109.';

-- Se queda sólo con las claves conocidas, tira nulos y rechaza negativos.
create or replace function trol3.limpiar_datos_a_utilizar(p_datos jsonb)
returns jsonb language plpgsql immutable as $$
declare k text; v numeric; out jsonb := '{}'::jsonb;
begin
  if p_datos is null then return '{}'::jsonb; end if;
  foreach k in array trol3.campos_datos_a_utilizar() loop
    if p_datos ? k and jsonb_typeof(p_datos->k) <> 'null' then
      begin
        v := (p_datos->>k)::numeric;
      exception when others then
        raise exception 'El campo % no es un número: %', k, p_datos->>k
          using errcode = 'P0001', hint = 'not_a_number';
      end;
      if v < 0 then
        raise exception 'El campo % no puede ser negativo', k
          using errcode = 'P0001', hint = 'negative_amount';
      end if;
      out := out || jsonb_build_object(k, v);
    end if;
  end loop;
  return out;
end $$;

comment on function trol3.limpiar_datos_a_utilizar is
  'Filtra el jsonb de datos a utilizar a las claves conocidas y valida que sean números no negativos. 109.';
