-- 175: la compra de inmueble también la ejecuta Trol.
--
-- Hasta hoy `compra_inmueble` sólo podía ganarse "vía Astuto". El plan que se le propone
-- al cliente en la calculadora de Infonavit (asesoría Infonavit, 110–112) lo lleva Trol:
-- se agrega Trol como proveedor de esa línea, aparte de Astuto (Raul, 21-sep).
-- La ficha O8 lo dice en "Sólo para ti".

update trol3.catalogo_proveedores
   set lineas = array_append(lineas, 'compra_inmueble')
 where codigo = 'trol' and not ('compra_inmueble' = any(lineas));

update trol3.fichas
   set solo_asesor = replace(solo_asesor, 'Ejecuta Astuto.', 'Ejecuta Astuto; en compra de inmueble también Trol, cuando es el plan propuesto en la calculadora de Infonavit.')
 where codigo = 'O8' and solo_asesor like '%Ejecuta Astuto.%';
