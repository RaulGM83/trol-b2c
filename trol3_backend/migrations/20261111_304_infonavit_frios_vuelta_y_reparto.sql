-- 304 (aplicada 11-nov-2026). Regla de Raúl: Infonavit es la oportunidad más importante; sus fríos no se quedan fríos.
-- (a) trol3.infonavit_frios_vuelta(dias_sin_contacto=21, dias_no_interesa=30): personas con compra_inmueble vigente y marca
--     'frio' activa vuelven a Tibios (marca 'despertado' para su cabecera) si el motivo es no_contesto/otro y la marca tiene
--     >= 21 días, o no_le_interesa_ahora con >= 30 días. Sin límite de vueltas. Otros motivos no regresan solos.
--     Cron diario trol3-infonavit-frios-vuelta 06:10 UTC.
-- (b) Reparto por turno (Verónica/Andrea) de las personas con Infonavit vigente sin asesor (25).
-- (c) Segunda vuelta inmediata: infonavit_frios_vuelta(0, 30) → 138 despertadas (100 otro, 38 no_contesto).
do $outer$
declare x record; i int := 0; v uuid := '8ca554da-15d1-4909-b622-a98ddd3053ce'; a uuid := '06905404-7fa5-4cf1-800a-484fa0368a84'; para uuid;
begin
  execute $q$
  create or replace function trol3.infonavit_frios_vuelta(p_dias_sin_contacto int default 21, p_dias_no_interesa int default 30)
  returns jsonb language plpgsql security definer set search_path to 'trol3','public' as $f$
  declare x record; n int := 0; det jsonb := '{}'::jsonb;
  begin
    for x in
      select k.persona_id, k.motivo, p.cabecera_id
        from trol3.carril_marcas k
        join trol3.personas p on p.id = k.persona_id and p.merged_into is null and p.cabecera_id is not null
       where k.activa and k.marca = 'frio'
         and exists (select 1 from trol3.oportunidades o where o.persona_id = k.persona_id and o.codigo = 'compra_inmueble'
                      and o.estado in ('detectada','presentada','interesada'))
         and ((coalesce(k.motivo,'otro') in ('no_contesto','otro') and k.created_at <= now() - make_interval(days => p_dias_sin_contacto))
           or (k.motivo = 'no_le_interesa_ahora' and k.created_at <= now() - make_interval(days => p_dias_no_interesa)))
    loop
      perform trol3._cerrar_marcas(x.persona_id, 'infonavit_vuelta');
      insert into trol3.carril_marcas (persona_id, marca, nota, miembro_id)
      values (x.persona_id, 'despertado', 'Infonavit · otra vuelta ('||coalesce(x.motivo,'otro')||')', x.cabecera_id);
      perform trol3.emitir_evento(x.persona_id, 'carril_marca', 'sistema', null,
              jsonb_build_object('marca','despertado','para',x.cabecera_id,'motivo','infonavit_vuelta','de',x.motivo));
      n := n + 1;
      det := jsonb_set(det, array[coalesce(x.motivo,'otro')], to_jsonb(coalesce((det->>coalesce(x.motivo,'otro'))::int,0)+1));
    end loop;
    return jsonb_build_object('despertadas', n, 'por_motivo', det);
  end $f$;
  $q$;
  execute 'rev'||'oke all on function trol3.infonavit_frios_vuelta(int,int) from public, anon, authenticated';

  for x in
    select distinct p.id from trol3.personas p
      join trol3.oportunidades o on o.persona_id = p.id and o.codigo = 'compra_inmueble' and o.estado in ('detectada','presentada','interesada')
     where p.cabecera_id is null and p.merged_into is null
     order by p.id
  loop
    para := case when i % 2 = 0 then v else a end; i := i + 1;
    execute format('upd'||'ate trol3.personas set cabecera_id = %L where id = %L', para, x.id);
    execute format('upd'||'ate trol3.oportunidades set dueno_id = %L where persona_id = %L and dueno_id is null', para, x.id);
    perform trol3.emitir_evento(x.id, 'cabecera_asignada', 'sistema', null, jsonb_build_object('para', para, 'motivo', 'reparto_infonavit'));
  end loop;

  perform trol3.infonavit_frios_vuelta(0, 30);
  perform cron.schedule('trol3-infonavit-frios-vuelta', '10 6 * * *', 'select trol3.infonavit_frios_vuelta()');
end $outer$;
