-- 231 · Sugerencia de inmueble (10-oct-2026, caso LOMJ): dos reglas encima del orden por ventaja.
--  · Tope de apalancamiento: crédito ≤ apalancamiento_max × saldo aplicado; arriba se marca
--    "para saldos mayores" y baja al final aunque tenga la mayor ventaja (los PH).
--  · Empate técnico: si la ventaja está a menos de max(empate_min, empate_pct × recibe al vender)
--    de la mejor, cuentan como empatados y gana el de menor pago mensual.
-- Aplicada vía MCP el 10-oct-2026.
alter table trol3.infonavit_supuestos
  add column if not exists apalancamiento_max numeric not null default 1.5,
  add column if not exists empate_min numeric not null default 50000,
  add column if not exists empate_pct numeric not null default 0.03;
comment on column trol3.infonavit_supuestos.apalancamiento_max is '231 · Tope crédito / saldo aplicado en la sugerencia de inmueble; arriba se marca "para saldos mayores" y baja al final';
comment on column trol3.infonavit_supuestos.empate_min is '231 · Empate técnico: ventajas a menos de max(empate_min, empate_pct × recibe al vender) de la mejor se ordenan por menor pago mensual';
comment on column trol3.infonavit_supuestos.empate_pct is '231 · Ver empate_min';
