-- 178: el plan de la calculadora de Infonavit también cae en "Crédito Infonavit (saldo alto)".
--
-- Un cliente con saldo de 500 mil o más no recibe `compra_inmueble` sino
-- `credito_infonavit_activo`, y en esa línea Trol no era proveedor: a Cristian Duarte
-- no se le podía marcar "vía Trol" (Raul, 21-sep). Se agrega Trol a esa línea, la regla
-- automática de la 177 cubre los dos códigos, y se marcan de una vez las oportunidades
-- abiertas sin proveedor de clientes que ya tienen un plan vigente en la calculadora.

update trol3.catalogo_proveedores
   set lineas = array_append(lineas, 'credito_infonavit_activo')
 where codigo = 'trol' and not ('credito_infonavit_activo' = any(lineas));

do $patch$
declare
  def text := pg_get_functiondef('trol3.cambiar_estado_oportunidad(uuid,trol3.estado_oportunidad,text,text,date,text)'::regprocedure);
  ancla text := $a$case when codigo = 'compra_inmueble' and p_estado in ('en_proceso','ganada')$a$;
  nuevo text := $b$case when codigo in ('compra_inmueble','credito_infonavit_activo') and p_estado in ('en_proceso','ganada')$b$;
begin
  if (length(def) - length(replace(def, ancla, ''))) / length(ancla) <> 1 then raise exception '178: ancla de cambiar_estado_oportunidad'; end if;
  execute replace(def, ancla, nuevo);
end $patch$;

update trol3.oportunidades o
   set proveedor = 'trol'
 where o.codigo in ('compra_inmueble','credito_infonavit_activo')
   and o.proveedor is null
   and o.estado in ('presentada','interesada','en_proceso','ganada')
   and exists (select 1 from trol3.infonavit_asesorias a
                where a.archivada_at is null
                  and (a.persona_id = o.persona_id or a.cotitular_persona_id = o.persona_id));
