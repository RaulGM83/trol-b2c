-- 110 — dos umbrales, porque son dos preguntas distintas.
--
-- `saldo_min_asesoria` respondía a "¿vale la pena abrirle la pestaña Infonavit
-- a esta persona por su cuenta?". Se estaba usando también, por omisión, como
-- si respondiera "¿puede entrar a una compra conyugal?" — y no es lo mismo:
-- en conyugal Infonavit suma el monto máximo de cada titular, así que un saldo
-- que solo no alcanza para nada sí aporta al lado del cónyuge.
--
-- Regla (Raúl, 5-sep-2026), a partir del caso de Eva Santos (193k, cotizando)
-- y su esposo Alberto Martínez (370k, cotizando):
--
--   Para entrar como cotitular:  activo + más de $100,000
--   Para abrir la pestaña solo:  activo + más de $200,000  (antes $350,000)
--
-- El titular baja de 350k a 200k: la pestaña pasa de 1,052 a ~1,600
-- expedientes. No se bajó hasta 100k porque ahí serían 2,842 y 1,788 de los
-- nuevos traen saldo ESTIMADO por nosotros, no reportado por el Infonavit —
-- abrirle una asesoría a alguien sobre un número que inventamos es peor que
-- no abrírsela.

alter table trol3.infonavit_supuestos
  add column if not exists saldo_min_cotitular numeric not null default 100000;

comment on column trol3.infonavit_supuestos.saldo_min_cotitular is
  'Saldo Infonavit minimo para entrar como cotitular en un credito conyugal. Mas bajo que saldo_min_asesoria a proposito: en conyugal los montos se suman. 110.';

comment on column trol3.infonavit_supuestos.saldo_min_asesoria is
  'Saldo Infonavit desde el que se abre la pestana de asesoria en el expediente de una persona por su cuenta. No aplica al cotitular: para eso esta saldo_min_cotitular. 110.';

update trol3.infonavit_supuestos
   set saldo_min_asesoria = 200000,
       saldo_min_cotitular = 100000,
       actualizado_at = now()
 where id = 'default';
