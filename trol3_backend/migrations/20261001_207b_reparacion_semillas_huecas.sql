-- 207b · Reparación puntual (1-oct-2026) de las 4 personas pisadas por semillas huecas:
-- Jorge Antonio Miramontes, Ricardo, Ana Cecilia, Beatriz. Ejecutada una vez como función temporal
-- (trol3._rep207) y borrada. Queda como registro de qué se borró y qué se restauró.

create or replace function trol3._rep207() returns jsonb language plpgsql security definer set search_path to 'trol3','public' as $f$
declare r jsonb := '{}'::jsonb; n int; v_sem jsonb; v_at timestamptz; p uuid; m record;
begin
  perform set_config('trol3.skip_reeval','1',true);
  -- 1) Jorge Antonio: fuera los datos huecos del 30-sep (00:46:42 en adelante) y restaurar la semilla v5.7 del 29-sep en public.clientes.
  delete from trol3.datos where persona_id = '13f75c3b-5219-4f99-93a4-c54423c84674' and origen_tipo = 'sistema' and created_at >= '2026-09-30 00:46:42';
  get diagnostics n = row_count; r := r || jsonb_build_object('jorge_borradas', n);
  select valor, created_at into v_sem, v_at from trol3.datos where persona_id = '13f75c3b-5219-4f99-93a4-c54423c84674' and campo = 'semilla' and created_at = '2026-09-29 12:41:22.861202+00';
  update public.clientes set calculo_pensional = v_sem, calculo_pensional_at = v_at, semanas_cotizadas = '1474', "Ley_imss" = 'Ley73' where id = '90448b80-979b-4126-b5d8-35d9d6d6b42e';
  -- 2) Ricardo: fuera lo hueco del 29/30-sep; semilla v2.0 del 15-ago de vuelta en public.clientes.
  delete from trol3.datos where persona_id = '79c02e74-0eeb-458e-b946-d2ff2ac1277a' and origen_tipo = 'sistema' and created_at >= '2026-09-29 00:29:47';
  get diagnostics n = row_count; r := r || jsonb_build_object('ricardo_borradas', n);
  select valor, created_at into v_sem, v_at from trol3.datos where persona_id = '79c02e74-0eeb-458e-b946-d2ff2ac1277a' and campo = 'semilla' order by created_at desc limit 1;
  update public.clientes c set calculo_pensional = v_sem, calculo_pensional_at = v_at, semanas_cotizadas = '137', "Ley_imss" = 'Ley73' from trol3.personas p2 where p2.id = '79c02e74-0eeb-458e-b946-d2ff2ac1277a' and c.id = p2.legacy_cliente_id;
  -- 3) Ana Cecilia y Beatriz: fuera lo hueco del 28–30-sep; en public.clientes sólo se regresan semanas y ley (la semilla hueca se queda marcada; el candado 207 impide que vuelva a pisar).
  delete from trol3.datos where persona_id in ('30881207-f215-4fad-ac36-8a47d727e470','5c450b30-2c9d-43b9-96dc-2a0dfbcbe100') and origen_tipo = 'sistema' and created_at >= '2026-09-28';
  get diagnostics n = row_count; r := r || jsonb_build_object('ana_beatriz_borradas', n);
  update public.clientes c set semanas_cotizadas = '441', "Ley_imss" = 'Ley73', calculo_pensional = jsonb_set(calculo_pensional, '{meta,hueca_207}', 'true'::jsonb) from trol3.personas p2 where p2.id = '30881207-f215-4fad-ac36-8a47d727e470' and c.id = p2.legacy_cliente_id;
  update public.clientes c set semanas_cotizadas = '894', "Ley_imss" = 'Ley73', calculo_pensional = jsonb_set(calculo_pensional, '{meta,hueca_207}', 'true'::jsonb) from trol3.personas p2 where p2.id = '5c450b30-2c9d-43b9-96dc-2a0dfbcbe100' and c.id = p2.legacy_cliente_id;
  perform set_config('trol3.skip_reeval','',true);
  -- 4) Reevaluar y reabrir el carril de quien quedó descartado «sin oportunidades» por esto.
  for p in select unnest(array['13f75c3b-5219-4f99-93a4-c54423c84674','79c02e74-0eeb-458e-b946-d2ff2ac1277a','30881207-f215-4fad-ac36-8a47d727e470','5c450b30-2c9d-43b9-96dc-2a0dfbcbe100']::uuid[]) loop
    perform trol3.evaluar_persona(p);
    update trol3.carril_marcas set activa = false, cerrada_en = now(), cerrada_motivo = 'remarcada'
     where persona_id = p and activa and marca = 'descartado' and motivo = 'sin_oportunidades';
  end loop;
  for m in select p2.nombre, (select valor#>>'{}' from trol3.v_mejor_dato v where v.persona_id = p2.id and v.campo = 'semanas_cotizadas') sem,
                  (select valor#>>'{}' from trol3.v_mejor_dato v where v.persona_id = p2.id and v.campo = 'ley') ley,
                  (select string_agg(o.codigo||':'||o.estado, ', ') from trol3.oportunidades o where o.persona_id = p2.id and o.estado in ('detectada','posible','presentada','interesada','en_proceso')) ops
             from trol3.personas p2 where p2.id in ('13f75c3b-5219-4f99-93a4-c54423c84674','79c02e74-0eeb-458e-b946-d2ff2ac1277a','30881207-f215-4fad-ac36-8a47d727e470','5c450b30-2c9d-43b9-96dc-2a0dfbcbe100') loop
    r := r || jsonb_build_object(m.nombre, jsonb_build_object('semanas', m.sem, 'ley', m.ley, 'ops', m.ops));
  end loop;
  return r;
end $f$;
