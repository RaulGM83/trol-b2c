-- 30-oct-2026 · Aplicada en producción. (Raúl) Por ahora las oportunidades de inmueble Infonavit
-- (compra_inmueble / inversion_inmueble) sólo las abre el motor con saldo VALIDADO por precalificación
-- (Precalix/broker). Con estimado o declarado se cierran (no_aplica) las posible/detectada de origen motor.
-- Las abiertas a mano (origen asesor) y las ya presentadas/interesadas/en proceso no se tocan.
-- En evaluar_persona:
--   if v_empleo = 'empleado' and e.saldo_infonavit_capa = 'validado' and coalesce(e.edad,0) < inm_edad ...
-- Reevaluación: 882 oportunidades cerradas; 109 validadas abiertas.

-- 278 · (Raúl, 30-oct) Con oportunidad de inmueble Infonavit y saldo VALIDADO no se enfría en automático
-- (carril_noche) aunque no conteste plantilla/llamada; sólo el asesor la manda a frío (carril_marcar).
create or replace function trol3._infonavit_validado_abierto(p uuid)
returns boolean language sql stable security definer set search_path to 'trol3','public' as $$
  select exists (
    select 1 from trol3.oportunidades o
     where o.persona_id = p and o.codigo in ('compra_inmueble','inversion_inmueble')
       and o.estado in ('posible','detectada','presentada','interesada','en_proceso'))
  and exists (select 1 from trol3.datos d where d.persona_id = p and d.campo = 'saldo_infonavit' and d.capa = 'validado')
$$;
-- carril_noche: después del "continue when ... en_proceso" se agregó:
--   continue when trol3._infonavit_validado_abierto(r.persona_id);
-- Marcas 'frio/no_contesto' puestas por la noche (por_miembro_id null) a esas personas: cerradas con motivo 'infonavit_validado'.

-- 279 · Nombre comercial del inmueble (lo ve el cliente en la cotización inicial; editable en Inmuebles).
alter table trol3.proyectos_inmobiliarios add column if not exists nombre_comercial text;
-- Propuesta inicial cargada el 30-oct (ver claude/113 §H).
alter table trol3.proyectos_inmobiliarios add column if not exists ubicacion_comercial text;  -- 279b: renglón aparte en la cotización
