-- 091: % del excedente sobre costo aliado que retiene la constructora (por inmueble).
-- Aplicada en Supabase el 29-ago-2026 (supabase_migrations: 091_pct_excedente_constructora).
-- Laureles sembrado en 0.25. En el mismo commit, la app calcula la comisión del desarrollador
-- sobre el COSTO ALIADO (antes: sobre escrituración). Ambos afectan SOLO el PnL interno
-- (Vista Interno de la asesoría); los materiales del cliente no cambian (guardarrail §7).
alter table trol3.proyectos_inmobiliarios
  add column if not exists pct_excedente_constructora numeric not null default 0
  check (pct_excedente_constructora >= 0 and pct_excedente_constructora <= 1);
update trol3.proyectos_inmobiliarios set pct_excedente_constructora = 0.25 where desarrollo ilike 'laureles%';
