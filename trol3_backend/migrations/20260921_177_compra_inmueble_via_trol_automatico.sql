-- 177: la compra de inmueble que sale de la calculadora de Infonavit se marca sola "vía Trol".
--
-- Cuando una `compra_inmueble` pasa a `en_proceso` o `ganada` SIN proveedor, y el cliente
-- tiene un plan guardado y vigente en la asesoría Infonavit (como titular o como cotitular),
-- el proveedor queda en `trol`: ese plan lo ejecuta Trol (175). Sólo llena el hueco: si el
-- asesor eligió Astuto —o ya había un proveedor—, eso manda (Raul, 21-sep).

do $patch$
declare
  def text := pg_get_functiondef('trol3.cambiar_estado_oportunidad(uuid,trol3.estado_oportunidad,text,text,date,text)'::regprocedure);
  ancla text := $a$    proveedor = coalesce(p_proveedor, proveedor),$a$;
  nuevo text := $b$    proveedor = coalesce(p_proveedor, proveedor,
                  -- 177: plan de la calculadora de Infonavit → lo ejecuta Trol
                  case when codigo = 'compra_inmueble' and p_estado in ('en_proceso','ganada')
                        and exists (select 1 from trol3.infonavit_asesorias a
                                     where a.archivada_at is null
                                       and (a.persona_id = o.persona_id or a.cotitular_persona_id = o.persona_id))
                       then 'trol' end),$b$;
begin
  if (length(def) - length(replace(def, ancla, ''))) / length(ancla) <> 1 then raise exception '177: ancla de cambiar_estado_oportunidad'; end if;
  execute replace(def, ancla, nuevo);
end $patch$;
