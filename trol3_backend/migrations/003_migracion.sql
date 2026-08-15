create or replace function trol3.to_num_safe(t text) returns numeric language plpgsql immutable as $f$
declare x text; begin
  if t is null then return null; end if;
  x := regexp_replace(replace(t,',',''),'[^0-9.\-]','','g');
  if x = '' or x !~ '^-?[0-9]*\.?[0-9]+$' then return null; end if;
  return x::numeric;
exception when others then return null; end $f$;
create or replace function trol3.to_date_safe(t text) returns date language plpgsql immutable as $f$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return left(t,10)::date;
exception when others then return null; end $f$;
-- Migración espejo public -> trol3 (idempotente por legacy ids)
create or replace function trol3.migrar_desde_public() returns jsonb language plpgsql security definer set search_path = trol3, public as $$
declare r jsonb := '{}'::jsonb; n int;
begin
  alter table trol3.datos disable trigger evento_dato;
  alter table trol3.personas disable trigger evento_persona;
  alter table trol3.consultas disable trigger evento_consulta;
  -- 1. Personas
  insert into trol3.personas (curp, nss, nombre, apellidos, fecha_nacimiento, sexo, estado_republica, canal_origen, campania_origen,
                              etapa, auth_user_id, legacy_cliente_id, hubspot_id, created_at)
  select distinct on (coalesce(nullif(case when length(trim(c.curp))=18 then upper(trim(c.curp)) end,''), c.id::text))
         case when length(trim(c.curp))=18 then upper(trim(c.curp)) end,
         nullif(trim(c.nss),''), nullif(trim(c.nombre),''), nullif(trim(c.apellidos),''), c.fecha_nacimiento,
         case when length(trim(c.curp))=18 then substr(upper(trim(c.curp)),11,1) end,
         nullif(trim(c.edo_republica),''), 'legacy', c."Fuente_registro",
         case when c.etapa_actual = 4 or c.sub_estado ilike 'cliente' then 'cliente'
              when c.calculo_pensional is not null then 'expediente_base'
              when c.sub_estado = 'B2B_DELEGADO' then 'expediente_base'
              else 'nuevo' end,
         case when c.auth_user_id is not null and not exists (select 1 from trol3.personas p2 where p2.auth_user_id = c.auth_user_id) then c.auth_user_id end,
         c.id, c.id_hubspot, coalesce(c.fecha_registro, c.created_at)
  from public.clientes c
  where not exists (select 1 from trol3.personas p where p.legacy_cliente_id = c.id)
  order by coalesce(nullif(case when length(trim(c.curp))=18 then upper(trim(c.curp)) end,''), c.id::text), c.created_at
  on conflict do nothing;
  get diagnostics n = row_count; r := r || jsonb_build_object('personas', n);

  -- 2. Contactos
  insert into trol3.contactos (persona_id, tipo, valor, normalizado, principal, verificado_at, canal_verificacion, no_contactar, no_contactar_motivo)
  select p.id, 'telefono', c.telefono, right(regexp_replace(c.telefono_normalizado,'\D','','g'),10), true,
         case when c.auth_user_id is not null then c.created_at end, case when c.auth_user_id is not null then 'sms' else 'legacy' end,
         exists (select 1 from public.no_contactar nc where nc.cliente_id = c.id or nc.telefono_10 = right(regexp_replace(c.telefono_normalizado,'\D','','g'),10)),
         (select nc.motivo from public.no_contactar nc where nc.cliente_id = c.id or nc.telefono_10 = right(regexp_replace(c.telefono_normalizado,'\D','','g'),10) limit 1)
  from public.clientes c join trol3.personas p on p.legacy_cliente_id = c.id
  where c.telefono_normalizado is not null and length(regexp_replace(c.telefono_normalizado,'\D','','g')) >= 10
  on conflict do nothing;
  get diagnostics n = row_count; r := r || jsonb_build_object('telefonos', n);

  insert into trol3.contactos (persona_id, tipo, valor, normalizado, principal, canal_verificacion)
  select p.id, 'email', c.email, lower(trim(c.email)), true, 'legacy'
  from public.clientes c join trol3.personas p on p.legacy_cliente_id = c.id
  where c.email is not null and c.email like '%@%'
  on conflict do nothing;
  get diagnostics n = row_count; r := r || jsonb_build_object('emails', n);

  -- 3. Datos desde semilla v2 (validado sisec para perfil, calculado para escenarios/saldos)
  with s as (
    select p.id persona_id, c.calculo_pensional cp, coalesce(c.calculo_pensional_at, c.created_at) at,
           coalesce(trol3.to_date_safe(c.calculo_pensional->'meta'->>'fecha_sisec'), c."última_fecha_sisec", c.calculo_pensional_at::date, c.created_at::date) fecha_sisec
    from public.clientes c join trol3.personas p on p.legacy_cliente_id = c.id
    where c.calculo_pensional is not null and (c.calculo_pensional->'meta'->>'version_semilla') like '2%'
      and not exists (select 1 from trol3.datos d where d.persona_id = p.id and d.campo = 'semilla')
  ), kv as (
    select persona_id, at, fecha_sisec, campo, valor, capa from s, lateral (values
      ('ley', to_jsonb(cp->'perfil'->>'ley'), 'validado'),
      ('semanas_cotizadas', cp->'perfil'->'semanas'->'cotizadas', 'validado'),
      ('semanas_descontadas', cp->'perfil'->'semanas'->'descontadas', 'validado'),
      ('semanas_recuperadas', cp->'perfil'->'semanas'->'recuperadas', 'validado'),
      ('semanas_netas', cp->'perfil'->'semanas'->'netas', 'validado'),
      ('status_empleo', to_jsonb(cp->'perfil'->>'status_empleo'), 'validado'),
      ('salario_diario', cp->'perfil'->'salario_diario_registrado', 'validado'),
      ('salario_promedio_250', cp->'perfil'->'salario_promedio_250', 'calculado'),
      ('primera_cotizacion', cp->'perfil'->'fechas'->'primera_cotizacion', 'validado'),
      ('ultima_cotizacion', cp->'perfil'->'fechas'->'ultima_cotizacion_valida', 'validado'),
      ('conserva_derechos', cp->'perfil'->'conserva_derechos', 'calculado'),
      ('fin_conservacion_derechos', cp->'perfil'->'fechas'->'fin_conservacion_derechos', 'calculado'),
      ('gap_meses', cp->'perfil'->'gap_meses', 'calculado'),
      ('aplica_mod40', cp->'perfil'->'aplica_mod40', 'calculado'),
      ('limite_inscripcion_mod40', cp->'perfil'->'fechas'->'limite_inscripcion_mod40', 'calculado'),
      ('saldo_rcv97', cp->'saldos'->'rcv97', 'calculado'),
      ('saldo_sar92', cp->'saldos'->'sar92', 'calculado'),
      ('saldo_infonavit', cp->'saldos'->'infonavit', 'calculado'),
      ('ahorro_voluntario', cp->'saldos'->'ahorro_voluntario', 'calculado'),
      ('credito_infonavit_vigente', cp->'saldos'->'credito_infonavit_vigente', 'calculado'),
      ('pension_base', to_jsonb(trol3.to_num_safe(cp->'diagnostico'->>'escenario_base')), 'calculado'),
      ('pension_maxima', to_jsonb(trol3.to_num_safe(cp->'diagnostico'->>'escenario_maximo')), 'calculado'),
      ('edad_base', to_jsonb(trol3.to_num_safe(cp->'diagnostico'->>'edad_escenario_base')), 'calculado'),
      ('edad_maxima', to_jsonb(trol3.to_num_safe(cp->'diagnostico'->>'edad_escenario_maximo')), 'calculado'),
      ('mod40_retro_hoy_aplica', to_jsonb((cp->'diagnostico'->>'mod40_retroactiva_hoy') ilike 'si%' or (cp->'diagnostico'->>'mod40_retroactiva_hoy') ilike 'sí%' or (cp->'diagnostico'->>'mod40_retroactiva_hoy') = 'true'), 'calculado'),
      ('pension_mod40_retro_hoy', to_jsonb(trol3.to_num_safe(cp->'diagnostico'->>'pension_mod40_retro_hoy')), 'calculado'),
      ('costo_retroactivo_hoy', to_jsonb(trol3.to_num_safe(cp->'diagnostico'->>'costo_retroactivo_hoy')), 'calculado'),
      ('pension_mod40_futuro', to_jsonb(trol3.to_num_safe(cp->'diagnostico'->>'pension_mod40_futuro')), 'calculado'),
      ('costo_retroactivo_futuro', to_jsonb(trol3.to_num_safe(cp->'diagnostico'->>'costo_retroactivo_futuro')), 'calculado'),
      ('infonavit_estimado', to_jsonb(trol3.to_num_safe(cp->'diagnostico'->>'infonavit_estimado')), 'calculado'),
      ('faltan_semanas', to_jsonb(trol3.to_num_safe(cp->'diagnostico'->>'faltan_semanas')), 'calculado'),
      ('consulta_imss_status', to_jsonb(cp->'diagnostico'->>'consulta_imss_status'), 'validado'),
      ('status_issste', to_jsonb(cp->'diagnostico'->>'status_issste'), 'validado'),
      ('semilla', cp, 'calculado')
    ) v(campo, valor, capa)
    where valor is not null and valor::text not in ('null','""')
  )
  insert into trol3.datos (persona_id, campo, valor, capa, origen_tipo, proveedor, obtenido_en, vigente_hasta, pagado_por, visibilidad)
  select kv.persona_id, kv.campo, kv.valor, kv.capa::trol3.capa_dato, 'sistema',
         case when kv.capa='validado' then 'sisec' else 'pension_core' end,
         case when kv.capa='validado' then kv.fecha_sisec::timestamptz else kv.at end,
         case when cc.vigencia_dias is not null then (case when kv.capa='validado' then kv.fecha_sisec::timestamptz else kv.at end) + (cc.vigencia_dias||' days')::interval end,
         'trol', case when cc.visible_cliente then '{trol,cliente}'::text[] else '{trol}'::text[] end
  from kv join trol3.catalogo_campos cc on cc.campo = kv.campo;
  get diagnostics n = row_count; r := r || jsonb_build_object('datos_semilla', n);

  -- 4. Datos desde columnas de clientes (para quienes no tienen semilla v2)
  with c as (
    select p.id persona_id, c.*, coalesce(c."última_fecha_sisec"::timestamptz, c.created_at) at
    from public.clientes c join trol3.personas p on p.legacy_cliente_id = c.id
    where not exists (select 1 from trol3.datos d where d.persona_id = p.id and d.campo = 'semilla')
      and not exists (select 1 from trol3.datos d where d.persona_id = p.id and d.campo = 'ley')
  ), kv as (
    select persona_id, at, campo, valor, capa from c, lateral (values
      ('ley', case when c."Ley_imss" ilike '%97%' then '"Ley97"'::jsonb when c."Ley_imss" ilike '%73%' then '"Ley73"'::jsonb end, 'validado'),
      ('semanas_cotizadas', to_jsonb(trol3.to_num_safe(c.semanas_cotizadas)), 'validado'),
      ('status_empleo', case when c.status_empleo is not null then to_jsonb(lower(c.status_empleo)) end, 'validado'),
      ('ultima_cotizacion', case when c.ultima_cotizacion ~ '^\d{4}-\d{2}-\d{2}' then to_jsonb(left(c.ultima_cotizacion,10)) end, 'validado'),
      ('pension_base', to_jsonb(trol3.to_num_safe(c.pension_base)), 'calculado'),
      ('pension_maxima', to_jsonb(trol3.to_num_safe(c.pension_maxima)), 'calculado'),
      ('edad_base', to_jsonb(trol3.to_num_safe(c.edad_base)), 'calculado'),
      ('edad_maxima', to_jsonb(trol3.to_num_safe(c.edad_maxima)), 'calculado'),
      ('infonavit_estimado', to_jsonb(trol3.to_num_safe(c.infonavit_estimado)), 'calculado'),
      ('saldo_rcv97', to_jsonb(trol3.to_num_safe(c.rcv97)), 'calculado'),
      ('mod40_retro_hoy_aplica', case when c.mod40_retro_hoy is not null then to_jsonb(c.mod40_retro_hoy ilike 's%' or c.mod40_retro_hoy='true') end, 'calculado'),
      ('pension_mod40_retro_hoy', to_jsonb(trol3.to_num_safe(c."pensionMod40_retro_hoy")), 'calculado'),
      ('pension_mod40_futuro', to_jsonb(trol3.to_num_safe(c.pension_mod40_futuro)), 'calculado'),
      ('faltan_semanas', to_jsonb(trol3.to_num_safe(c.faltan_semanas)), 'calculado'),
      ('puntaje', to_jsonb(c.puntaje_num), 'calculado')
    ) v(campo, valor, capa)
    where valor is not null and valor::text <> 'null'
  )
  insert into trol3.datos (persona_id, campo, valor, capa, origen_tipo, proveedor, obtenido_en, vigente_hasta, pagado_por, visibilidad)
  select kv.persona_id, kv.campo, kv.valor, kv.capa::trol3.capa_dato, 'sistema',
         case when kv.capa='validado' then 'sisec' else 'pension_core' end, kv.at,
         case when cc.vigencia_dias is not null then kv.at + (cc.vigencia_dias||' days')::interval end,
         'trol', case when cc.visible_cliente then '{trol,cliente}'::text[] else '{trol}'::text[] end
  from kv join trol3.catalogo_campos cc on cc.campo = kv.campo;
  get diagnostics n = row_count; r := r || jsonb_build_object('datos_columnas', n);

  -- 5. Saldos declarados por el cliente
  insert into trol3.datos (persona_id, campo, valor, capa, origen_tipo, origen_id, obtenido_en, pagado_por, visibilidad)
  select p.id, v.campo, v.valor, 'declarado', 'cliente', p.id, coalesce(sd.actualizado_at, sd.creado_at), 'cliente', '{trol,cliente}'
  from public.saldos_declarados sd join trol3.personas p on p.legacy_cliente_id = sd.cliente_id,
  lateral (values ('saldo_rcv97', to_jsonb(sd.saldo_afore)), ('saldo_infonavit', to_jsonb(sd.saldo_infonavit))) v(campo, valor)
  where v.valor is not null and v.valor::text <> 'null'
    and not exists (select 1 from trol3.datos d where d.persona_id = p.id and d.campo = v.campo and d.capa = 'declarado');
  get diagnostics n = row_count; r := r || jsonb_build_object('saldos_declarados', n);

  -- 6. CDA (última validación por persona)
  insert into trol3.datos (persona_id, campo, valor, capa, origen_tipo, proveedor, obtenido_en, vigente_hasta, pagado_por, visibilidad)
  select p.id, v.campo, v.valor, 'validado', 'sistema', 'cda', cda.consultado_at, cda.consultado_at + interval '180 days', 'trol', '{trol,cliente}'
  from (select distinct on (cliente_id) * from public.cda_validaciones where status = 200 order by cliente_id, consultado_at desc) cda
  join trol3.personas p on p.legacy_cliente_id = cda.cliente_id,
  lateral (values ('puede_recibir_ahorro', to_jsonb(cda.can_receive)), ('cuenta_registrada', to_jsonb(cda.can_receive))) v(campo, valor)
  where not exists (select 1 from trol3.datos d where d.persona_id = p.id and d.campo = v.campo and d.proveedor = 'cda');
  get diagnostics n = row_count; r := r || jsonb_build_object('cda', n);

  -- 7. Consultas desde procesos (sin copiar JSON pesado)
  insert into trol3.consultas (persona_id, tipo, proveedor, solicitante_tipo, pagador, estado, motivo, legacy_proceso_id, created_at, updated_at, completed_at, resultado)
  select p.id,
         case when pr.tipo_servicio ilike 'refresh belvo' then 'imss_historial'
              when pr.tipo_servicio ilike 'infonavit' then 'infonavit'
              when pr.tipo_servicio ilike 'cr_ditos%' then 'credito_pension'
              else 'calculo_base' end,
         case when pr.tipo_servicio ilike 'refresh belvo' or pr.estado ilike '%belvo%' then 'belvo'
              when pr.estado ilike '%jordan%' then 'jordan'
              else 'sisec' end,
         case when pr.tipo_servicio ilike '%booster%' then 'aliado'::trol3.actor_tipo when pr.tipo_servicio ilike 'refresh asesor' then 'asesor' else 'sistema' end,
         'trol',
         case when pr.estado in ('DATA_READY','DIAGNOSTICO_GENERADO','Diagnostico enviado','Diagnostico Enviado','SISEC') then 'completada'
              when pr.estado ilike 'datos incorrectos%' then 'sin_resultado'
              when pr.estado ilike 'error%' then 'error'
              when pr.estado ilike 'waiting%' then 'en_proceso'
              else 'en_proceso' end::trol3.estado_consulta,
         pr.tipo_servicio||' / '||coalesce(pr.estado,''), pr.id, pr.created_at, pr.updated_at,
         case when pr.estado in ('DATA_READY','DIAGNOSTICO_GENERADO','Diagnostico enviado','Diagnostico Enviado') then pr.updated_at end,
         case when pr.link_sisec is not null or pr.documento_final_url is not null then jsonb_strip_nulls(jsonb_build_object('link_sisec', pr.link_sisec, 'documento_final_url', pr.documento_final_url, 'semanas_cotizadas', pr.semanas_cotizadas, 'conserva_derechos', pr.conserva_derechos)) end
  from public.procesos pr join trol3.personas p on p.legacy_cliente_id = pr.cliente_id
  where not exists (select 1 from trol3.consultas x where x.legacy_proceso_id = pr.id);
  get diagnostics n = row_count; r := r || jsonb_build_object('consultas', n);

  -- 8. Documentos (URLs legacy)
  insert into trol3.documentos (persona_id, tipo, nombre, url_externa, origen_tipo, gating, precio_mxn, max_pct_puntos, visibilidad, created_at)
  select p.id, v.tipo, v.nombre, v.url, 'sistema', v.gating, v.precio, 50, '{trol,cliente}', c.created_at
  from public.clientes c join trol3.personas p on p.legacy_cliente_id = c.id,
  lateral (values ('sisec','Historial oficial (SISEC)', c.documento_sisec_url, 'pago', 150::numeric),
                  ('diagnostico_avanzado','Diagnóstico Avanzado', c.documento_diagnostico_avanzado_url, 'gratis', null),
                  ('checkup','Checkup pensional', c.documento_checkup_url, 'gratis', null),
                  ('carpeta_drive','Carpeta de documentos (Drive)', case when c.drive_folder_id is not null and c.drive_folder_id_invalid_at is null then 'https://drive.google.com/drive/folders/'||c.drive_folder_id end, 'gratis', null)) v(tipo, nombre, url, gating, precio)
  where v.url is not null and not exists (select 1 from trol3.documentos d where d.persona_id = p.id and d.tipo = v.tipo and d.url_externa = v.url);
  get diagnostics n = row_count; r := r || jsonb_build_object('documentos', n);

  -- 9. Puntos
  insert into trol3.puntos (persona_id, tipo, motivo, puntos, referencia_tipo, referencia_id, expira_at, legacy_id, created_at)
  select p.id, case pm.tipo when 'earn' then 'abono' when 'spend' then 'cargo' else 'expiracion' end, pm.motivo, abs(pm.puntos), pm.referencia_tipo, pm.referencia_id, pm.expira_at, pm.id, pm.creado_at
  from public.puntos_movimientos pm join trol3.personas p on p.legacy_cliente_id = pm.cliente_id
  where pm.estado is distinct from 'cancelado' and not exists (select 1 from trol3.puntos x where x.legacy_id = pm.id);
  get diagnostics n = row_count; r := r || jsonb_build_object('puntos', n);

  -- 10. Órdenes
  insert into trol3.ordenes (persona_id, producto, monto, puntos_aplicados, estado, payment_provider, payment_ref, paid_at, legacy_orden_id, created_at)
  select p.id, coalesce(pr.codigo,'calculadora'), coalesce(o.monto,0), coalesce(o.puntos_aplicados,0),
         case o.estado when 'cumplida' then 'cumplida' when 'pagada' then 'pagada' when 'cancelada' then 'cancelada' else 'pendiente' end,
         o.payment_provider, o.payment_ref, o.paid_at, o.id, o.creado_at
  from public.ordenes_b2c o join trol3.personas p on p.legacy_cliente_id = o.cliente_id
  left join trol3.productos pr on pr.legacy_code = o.product_code
  where not exists (select 1 from trol3.ordenes x where x.legacy_orden_id = o.id);
  get diagnostics n = row_count; r := r || jsonb_build_object('ordenes', n);

  -- 11. Referidos
  update trol3.personas p set referidor_persona_id = pr.id, canal_origen = 'referido'
  from public.referidos rf join trol3.personas pr on pr.legacy_cliente_id = rf.referrer_cliente_id
  where p.legacy_cliente_id = rf.referido_cliente_id and p.referidor_persona_id is null;

  -- 12. Persona-partner desde partner_transactions
  insert into trol3.persona_partner (persona_id, partner_id, relacion, habla_con_cliente, desde)
  select distinct on (p.id, pt.partner_id) p.id, pt.partner_id, 'consulta', true, min(pt.created_at) over (partition by p.id, pt.partner_id)
  from public.partner_transactions pt join trol3.personas p on p.legacy_cliente_id = pt.cliente_id
  where pt.partner_id is not null
  on conflict do nothing;
  get diagnostics n = row_count; r := r || jsonb_build_object('persona_partner', n);

  alter table trol3.datos enable trigger evento_dato;
  alter table trol3.personas enable trigger evento_persona;
  alter table trol3.consultas enable trigger evento_consulta;
  return r;
end $$;
