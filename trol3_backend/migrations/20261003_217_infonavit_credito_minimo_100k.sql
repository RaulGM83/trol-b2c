-- 217 · Calculadora Infonavit: crédito mínimo de $100,000 (claude/98). 3-oct-2026. Decisión de Raul.
--
-- Va junto con el cambio del motor (pension-core/infonavit-asesoria.ts): la constructora retiene
-- su `pct_excedente_constructora` (Laureles 25%) de TODO el sobreprecio de escrituración; el
-- cliente recibe el resto en la firma y Trol no absorbe nada. El crédito tiene que salir de
-- mínimo $100,000 con los notariales del crédito adentro (antes $50,000).
do $$ begin
  execute $q$update trol3.infonavit_supuestos set credito_minimo = 100000, actualizado_at = now() where id = 'default'$q$;
end $$;
comment on column trol3.infonavit_supuestos.credito_minimo is '217: crédito Infonavit mínimo para que la operación exista (escrituración + notariales del crédito − saldo). $100,000 desde el 3-oct-2026.';
