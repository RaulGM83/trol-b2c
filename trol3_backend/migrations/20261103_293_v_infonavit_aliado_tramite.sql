-- 293 · v_infonavit_aliado gana el seguimiento real del trámite (claude/116, 3-nov-2026), tomado de
-- los casos ya capturados en oportunidades.tramite_infonavit (285): fechas por etapa, inmueble
-- (nombre comercial + casa), conyugal y cotitular (sólo nombre), y la comisión del broker
-- (devengada / pagada). La nota interna del equipo NO se expone. Aplicada por MCP el 3-nov-2026.
-- Columnas nuevas: fechas jsonb, inmueble, inmueble_ubicacion, casa, conyugal, co_titular, comision_estado.
-- Referencia (NO se enseña al aliado; Raúl 3-nov: los tiempos van a bajar con los códigos de Infonavit):
-- 6 trámites cerrados en Laureles ago–nov 2026, documentos → escrituras mediana 35 d (18–54), entrega ~21 d después.
drop view if exists trol3.v_infonavit_aliado;
create view trol3.v_infonavit_aliado as
with base as (
  select r.id as referido_id, r.persona_id, r.estado as estado_ref, r.pide_infonavit_en,
         p.nombre, p.apellidos, p.nss is not null as tiene_nss, p.curp is not null as tiene_curp,
         (select c.estado::text from trol3.consultas c
           where c.persona_id = r.persona_id and c.tipo = 'infonavit' and c.estado <> 'cancelada'
           order by c.created_at desc limit 1) as consulta_estado,
         (select (d.valor #>> '{}')::numeric from trol3.datos d
           where d.persona_id = r.persona_id and d.campo = 'saldo_infonavit' and d.capa = 'validado'
           order by d.obtenido_en desc limit 1) as saldo,
         (select (d.valor #>> '{}')::numeric from trol3.datos d
           where d.persona_id = r.persona_id and d.campo = 'infonavit_monto_credito' and d.capa = 'validado'
           order by d.obtenido_en desc limit 1) as monto_credito,
         (select max(d.obtenido_en) from trol3.datos d
           where d.persona_id = r.persona_id and d.campo in ('saldo_infonavit','credito_infonavit_vigente','relacion_laboral_vigente') and d.capa = 'validado') as precalificado_en,
         exists (select 1 from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'credito_infonavit_vigente' and d.capa = 'validado' and d.valor = 'true'::jsonb) as cred_vig,
         (select (d.valor #>> '{}')::boolean from trol3.datos d
           where d.persona_id = r.persona_id and d.campo = 'relacion_laboral_vigente' and d.capa = 'validado'
           order by d.obtenido_en desc limit 1) as relacion,
         (select jsonb_build_object(
                   'etapa', o.etapa_infonavit, 'en', o.etapa_infonavit_en,
                   'fechas', coalesce(o.tramite_infonavit -> 'fechas', '{}'::jsonb),
                   'casa', o.tramite_infonavit ->> 'casa',
                   'desarrollo', coalesce(pr.nombre_comercial, o.tramite_infonavit ->> 'desarrollo', pr.desarrollo),
                   'ubicacion', pr.ubicacion_comercial,
                   'conyugal', coalesce((o.tramite_infonavit ->> 'conyugal')::boolean, false),
                   'co_titular', o.tramite_infonavit ->> 'co_titular',
                   'comision', (select cm.estado from trol3.comisiones cm where cm.oportunidad_id = o.id and cm.estado <> 'cancelada' order by cm.creado_en desc limit 1))
            from trol3.oportunidades o
            left join trol3.proyectos_inmobiliarios pr on pr.id = o.proyecto_id
           where o.persona_id = r.persona_id and o.codigo in ('compra_inmueble','inversion_inmueble') and o.etapa_infonavit is not null
           order by o.etapa_infonavit_en desc nulls last limit 1) as tramite,
         (select coalesce(jsonb_agg(distinct d.tipo), '[]'::jsonb) from trol3.documentos d
           where d.persona_id = r.persona_id
             and d.tipo in ('identificacion','curp_doc','acta_nacimiento','acta_matrimonio','constancia_fiscal','comprobante_domicilio','recibo_nomina')) as docs
    from trol3.referidos r
    join trol3.personas p on p.id = r.persona_id
   where r.pide_infonavit_en is not null and r.visible_para_aliado
     and (r.aliado_id = trol3.current_aliado_id() or trol3.es_miembro())
)
select referido_id, persona_id, estado_ref, pide_infonavit_en, nombre, apellidos,
       case when estado_ref = 'por_revisar' then 'ya_cliente'
            -- 293c · con trámite abierto (etapa capturada por el equipo) manda el trámite, haya o no Precalix
            when tramite ->> 'etapa' is not null then 'en_tramite'
            when consulta_estado in ('solicitada','en_proceso') then 'procesando'
            when cred_vig then 'credito_vigente'
            when relacion is false then 'sin_relacion'
            -- 293b · saldo validado menor al mínimo de cotización ($100,000 = SALDO_MIN_COTIZACION): no precalifica aunque Precalix dé monto
            when saldo is not null and saldo < 100000 then 'saldo_bajo'
            when monto_credito is not null and saldo is not null then 'con_monto'
            when consulta_estado = 'sin_resultado' then 'no_califica'
            when not tiene_nss and tiene_curp then 'buscando_nss'
            when not tiene_nss then 'falta_nss'
            else 'procesando' end as resultado,
       case when estado_ref = 'por_revisar' then null else saldo end as saldo,
       case when estado_ref = 'por_revisar' then null else monto_credito end as monto_credito,
       precalificado_en,
       case when estado_ref = 'por_revisar' then null
            else coalesce(tramite ->> 'etapa', case when monto_credito is not null and saldo >= 100000 then 'precalificado' end) end as etapa,
       case when estado_ref = 'por_revisar' then null else (tramite ->> 'en')::timestamptz end as etapa_en,
       case when estado_ref = 'por_revisar' then '[]'::jsonb else docs end as docs,
       case when estado_ref = 'por_revisar' then '{}'::jsonb else coalesce(tramite -> 'fechas', '{}'::jsonb) end as fechas,
       case when estado_ref = 'por_revisar' then null else tramite ->> 'desarrollo' end as inmueble,
       case when estado_ref = 'por_revisar' then null else tramite ->> 'ubicacion' end as inmueble_ubicacion,
       case when estado_ref = 'por_revisar' then null else tramite ->> 'casa' end as casa,
       case when estado_ref = 'por_revisar' then false else coalesce((tramite ->> 'conyugal')::boolean, false) end as conyugal,
       case when estado_ref = 'por_revisar' then null else tramite ->> 'co_titular' end as co_titular,
       case when estado_ref = 'por_revisar' then null else tramite ->> 'comision' end as comision_estado
  from base;
grant select on trol3.v_infonavit_aliado to authenticated;
comment on view trol3.v_infonavit_aliado is 'Precalificaciones Infonavit del aliado (281) + seguimiento del trámite: fechas, inmueble, conyugal, comisión (293). Filtra por current_aliado_id(). Sin nota interna ni archivos.';
