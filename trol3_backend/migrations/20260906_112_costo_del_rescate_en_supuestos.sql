-- 112 — el precio del rescate se edita, no se recompila.
--
-- El costo del Rescate Infonavit nació como dos constantes dentro de
-- `pension-core/src/ley97.ts`. Está mal el lugar: son **términos comerciales**,
-- no supuestos actuariales. El 20% y el piso de $169,000 dependen de cómo se
-- arma el plan con la constructora y de qué vía queda para los saldos chicos —
-- cosas que cambian por negociación, no por un hallazgo del motor.
--
-- Se mudan a `trol3.infonavit_supuestos`, junto a los demás parámetros del
-- producto (`credito_minimo`, `monto_max_credito`, los umbrales de saldo), que
-- ya tienen editor en /trabajo/proyectos.
--
-- El motor conserva los mismos valores como default: si nadie pasa nada, se
-- comporta igual que antes. La tabla sólo lo sobrescribe.
--
-- Recordatorio de por qué el 20% se aplica al monto CAPITALIZADO y no al saldo
-- de hoy: pagar 20% hoy es dejar de invertir esa parte, así que a valor de
-- retiro pesa lo mismo que descontarlo al final. El número no depende de cuándo
-- se cobre.

alter table trol3.infonavit_supuestos
  add column if not exists rescate_sin_costo_desde numeric not null default 169000,
  add column if not exists rescate_costo_pct numeric not null default 0.20;

comment on column trol3.infonavit_supuestos.rescate_sin_costo_desde is
  'Saldo Infonavit de HOY desde el que el rescate sale sin costo para el cliente: arriba de este piso alcanza para armar el plan que paga la constructora. Debajo se cobra rescate_costo_pct. 112.';

comment on column trol3.infonavit_supuestos.rescate_costo_pct is
  'Costo del rescate cuando el saldo de hoy no llega a rescate_sin_costo_desde. Se descuenta del monto que sale. 112.';
