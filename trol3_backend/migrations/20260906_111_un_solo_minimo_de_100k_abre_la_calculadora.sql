-- 111 — los dos umbrales a $100,000, porque el umbral sólo abre la calculadora.
--
-- El 110 dejó dos valores distintos (200k para abrir la pestaña, 100k para
-- entrar como cotitular) por miedo a abrirle una asesoría a gente cuyo saldo
-- todavía es un estimado nuestro.
--
-- Raúl corrige el encuadre (6-sep-2026): el umbral **no decide a quién se le
-- ofrece el producto**, decide a quién se le puede abrir la calculadora. La
-- oferta se hace después, cuando en la asesoría se ve que hace sentido — y esa
-- decisión la toma una persona mirando el caso, no un `>` en una vista.
--
-- Con ese encuadre el número correcto es el mismo para los dos: activo y más
-- de $100,000. Un saldo estimado deja de ser un riesgo porque nadie promete
-- nada con él; sólo permite abrir la herramienta y ver si vale la pena.
--
-- La pestaña pasa de ~1,600 a 2,842 expedientes.

update trol3.infonavit_supuestos
   set saldo_min_asesoria = 100000,
       saldo_min_cotitular = 100000,
       actualizado_at = now()
 where id = 'default';

comment on column trol3.infonavit_supuestos.saldo_min_asesoria is
  'Saldo Infonavit desde el que se ABRE LA CALCULADORA en el expediente. No es un criterio de oferta: el producto se ofrece cuando la asesoria muestra que hace sentido. 111.';
