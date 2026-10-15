-- 237 · 14-oct-2026 · La pestaña Infonavit abre desde $50,000 de saldo (antes $100,000).
-- La app lee infonavit_supuestos.saldo_min_asesoria; el cotitular sigue en $100,000.
do $$ begin
  execute $q$ update trol3.infonavit_supuestos set saldo_min_asesoria = 50000, actualizado_at = now() where id = 'default' $q$;
end $$;
