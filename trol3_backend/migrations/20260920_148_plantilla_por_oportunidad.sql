-- 148: cada oportunidad puede traer su propia plantilla de reapertura.
--
-- Cuando el asesor le avisa al cliente de una oportunidad y su chat lleva más
-- de 24 h cerrado, Meta sólo deja reabrir con plantilla aprobada. Hasta ahora
-- el aviso simplemente no salía. Con esto, /avisar tiene a dónde caer y el
-- texto lo decide el catálogo, no el código: una Modalidad 40 y un registro de
-- cuenta AFORE no se anuncian igual.
--
-- Se queda en null a propósito: una plantilla que no existe en Meta falla y
-- queda registrada como "NO pudo enviar". Se llena cuando cada una esté
-- aprobada, no antes:
--   update trol3.catalogo_oportunidades set plantilla = 'trol_oportunidad'
--   where plantilla is null;
alter table trol3.catalogo_oportunidades add column if not exists plantilla text;
comment on column trol3.catalogo_oportunidades.plantilla is
  'Plantilla de WhatsApp aprobada para reabrir el chat y anunciar esta oportunidad. Null = no se reabre en frío: el aviso sólo entra si su conversación sigue viva.';
