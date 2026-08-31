-- 096 (31-ago-2026): percepciones totales de la nómina IMSS.
--
-- Por qué: comparar la estimación del motor contra el concepto 013 es injusto.
-- En las pensiones al mínimo el 013 es menos de la mitad del ingreso (el resto
-- lo pone el concepto 030, "AJUSTE AL MINIMO") y muchas traen 007/015 de
-- asignaciones familiares. El "Líquido" tampoco sirve: en quien tiene
-- préstamos ya viene con los 301 descontados.
--
-- percepciones_nomina_total = 013 + 007 + 015 + 030.
--   NO incluye 070 (pagos únicos / retroactivos) ni los 301 (descuentos).
--
-- Aplicada vía MCP el 31-ago-2026 junto con:
--   · registrar_nomina_imss: acepta payload->>'percepciones'.
--   · v_expediente: expone percepciones_nomina.
--   · Backfill de 49 casos sin préstamos, donde el Líquido del encabezado
--     equivale exactamente a la suma de percepciones recurrentes.

insert into trol3.catalogo_campos
  (campo, nombre, grupo, tipo, unidad, vigencia_dias, editable_cliente, visible_cliente, visible_aliado, orden, opciones)
values
  ('percepciones_nomina_total','Percepciones totales de la nómina (sin pagos únicos)','nomina','number','mxn',90,false,true,false,71,null)
on conflict (campo) do nothing;

-- Nota de interpretación (hallazgo del barrido, ver claude/29):
-- comparar el motor solo tiene sentido contra pensionados de BAJA RECIENTE.
-- Quien se pensionó hace años lo hizo con otros parámetros (salarios, UMA,
-- semanas de ese momento); el motor calcula lo que le tocaría HOY. Los tres
-- casos con desviación extrema del barrido (+40%, +16%, -40%) son justo los
-- de baja hace 50, 51 y 91 meses.
