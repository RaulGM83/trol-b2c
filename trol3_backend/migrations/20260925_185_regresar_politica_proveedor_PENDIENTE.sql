-- 185 (APLICAR EL 25-SEP-2026, después de Finnosummit): regresa la política de proveedor
-- por canal a como estaba antes de la 182. El canal `evento` se queda en Jordan.

update trol3.canales c
   set politica_proveedor = coalesce((select (valor::jsonb)->>c.codigo from trol3.config where clave = 'politica_proveedor_antes_finnosummit'), c.politica_proveedor)
 where c.codigo <> 'evento';
