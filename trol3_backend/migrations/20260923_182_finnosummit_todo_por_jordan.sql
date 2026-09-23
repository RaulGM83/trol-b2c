-- 182: durante Finnosummit (23–24 sep 2026) todo cliente nuevo se busca con Jordan.
--
-- La política de proveedor vive por canal (`canales.politica_proveedor`) y la lee
-- `pedir_consulta`. El canal `evento` queda en `jordan_first` para siempre (en un pasillo
-- no hay tiempo para un "sin resultado" de Belvo). Los demás canales pasan a Jordan sólo
-- estos dos días y se regresan el 25-sep con la 183; el valor anterior queda guardado en
-- `trol3.config` para no depender de la memoria de nadie.

insert into trol3.config (clave, valor)
select 'politica_proveedor_antes_finnosummit', jsonb_object_agg(codigo, politica_proveedor)::text
  from trol3.canales
on conflict (clave) do update set valor = excluded.valor;

update trol3.canales set politica_proveedor = 'jordan_first';
