create or replace function trol3.jnum(j jsonb) returns numeric language plpgsql immutable as $$
begin
  if j is null or jsonb_typeof(j)='null' then return null; end if;
  if jsonb_typeof(j)='number' then return (j#>>'{}')::numeric; end if;
  if jsonb_typeof(j)='boolean' then return case when (j#>>'{}')::boolean then 1 else 0 end; end if;
  return trol3.to_num_safe(j#>>'{}');
end $$;
create or replace function trol3.jbool(j jsonb) returns boolean language plpgsql immutable as $$
begin
  if j is null or jsonb_typeof(j)='null' then return null; end if;
  if jsonb_typeof(j)='boolean' then return (j#>>'{}')::boolean; end if;
  if jsonb_typeof(j)='number' then return (j#>>'{}')::numeric <> 0; end if;
  return lower(j#>>'{}') in ('true','si','sí','s','1','yes','empleado');
exception when others then return null; end $$;
-- Vista pivote del expediente (mejor dato por campo clave)
create or replace view trol3.v_expediente as
with md as (
  select persona_id, jsonb_object_agg(campo, jsonb_build_object('v', valor, 'capa', capa, 'en', obtenido_en, 'vig', vigente)) kv
  from trol3.v_mejor_dato where campo <> 'semilla' group by persona_id
)
select p.id persona_id, p.curp, p.nombre, p.apellidos, p.fecha_nacimiento, p.etapa, p.cabecera_id, p.canal_origen, p.hubspot_id, p.legacy_cliente_id,
       extract(year from age(p.fecha_nacimiento))::int edad,
       (md.kv->'ley'->>'v') ley,
       trol3.jnum(md.kv->'semanas_cotizadas'->'v') semanas,
       (md.kv->'status_empleo'->>'v') status_empleo,
       trol3.jbool(md.kv->'conserva_derechos'->'v') conserva_derechos,
       trol3.to_date_safe(md.kv->'fin_conservacion_derechos'->>'v') fin_conservacion,
       coalesce(trol3.jbool(md.kv->'mod40_retro_hoy_aplica'->'v'), trol3.jbool(md.kv->'aplica_mod40'->'v')) mod40_retro_aplica,
       trol3.to_date_safe(md.kv->'limite_inscripcion_mod40'->>'v') limite_mod40,
       trol3.jnum(md.kv->'pension_base'->'v') pension_base,
       trol3.jnum(md.kv->'pension_maxima'->'v') pension_maxima,
       trol3.jnum(md.kv->'pension_mod40_retro_hoy'->'v') pension_mod40_retro,
       trol3.jnum(md.kv->'costo_retroactivo_hoy'->'v') costo_retro,
       trol3.jnum(md.kv->'pension_mod40_futuro'->'v') pension_mod40_futuro,
       coalesce(trol3.jnum(md.kv->'saldo_infonavit'->'v'), trol3.jnum(md.kv->'infonavit_estimado'->'v')) saldo_infonavit,
       trol3.jbool(md.kv->'credito_infonavit_vigente'->'v') credito_infonavit,
       trol3.jnum(md.kv->'saldo_rcv97'->'v') saldo_rcv97,
       (md.kv->'afore_actual'->>'v') afore_actual,
       trol3.jbool(md.kv->'cuenta_registrada'->'v') cuenta_registrada,
       trol3.jnum(md.kv->'expectativa_pension_mxn'->'v') expectativa_pension,
       trol3.jnum(md.kv->'dependientes'->'v') dependientes,
       trol3.jbool(md.kv->'tiene_seguro_vida'->'v') tiene_seguro,
       (md.kv->'dolor_principal'->>'v') dolor_principal,
       (md.kv->'inconsistencia_imss'->>'v') inconsistencia_imss,
       (md.kv->'ley'->>'capa') ley_capa, (md.kv->'ley'->>'en')::timestamptz ley_en, (md.kv->'ley'->>'vig')::boolean ley_vigente,
       (md.kv->'semanas_cotizadas'->>'capa') semanas_capa,
       (select trol3.jnum(valor) from trol3.datos d where d.persona_id=p.id and d.campo='semanas_cotizadas' and d.capa='declarado' order by obtenido_en desc limit 1) semanas_declaradas,
       (select trol3.jnum(valor) from trol3.datos d where d.persona_id=p.id and d.campo='semanas_cotizadas' and d.capa='validado' order by obtenido_en desc limit 1) semanas_validadas,
       (select count(*) from trol3.consultas c where c.persona_id=p.id and c.tipo in ('imss_historial','calculo_base') and c.estado in ('sin_resultado','error') and c.created_at > now()-interval '180 days') consultas_fallidas,
       md.kv
from trol3.personas p left join md on md.persona_id = p.id
where p.merged_into is null;

create or replace function trol3._up_op(p_id uuid, p_cabecera uuid, cod text, val numeric, det jsonb, mot text, urg date, faltan text[] default '{}', est trol3.estado_oportunidad default 'detectada') returns text language plpgsql as $$
begin
  insert into trol3.oportunidades (persona_id, codigo, estado, valor_estimado, valor_detalle, motivo, urgencia_fecha, urgencia_score, datos_faltantes, dueno_id)
  values (p_id, cod, est, val, coalesce(det,'{}'::jsonb), mot, urg,
          case when urg is null then 0 when urg < current_date then 100 else greatest(0, 100 - (urg - current_date)) end,
          coalesce(faltan,'{}'), p_cabecera)
  on conflict (persona_id, codigo) do update set
    valor_estimado = excluded.valor_estimado, valor_detalle = excluded.valor_detalle, motivo = excluded.motivo,
    urgencia_fecha = excluded.urgencia_fecha, urgencia_score = excluded.urgencia_score, datos_faltantes = excluded.datos_faltantes,
    estado = case when trol3.oportunidades.estado in ('posible','detectada','no_aplica') then excluded.estado else trol3.oportunidades.estado end,
    cerrada_en = case when trol3.oportunidades.estado = 'no_aplica' then null else trol3.oportunidades.cerrada_en end,
    dueno_id = coalesce(trol3.oportunidades.dueno_id, excluded.dueno_id);
  return cod;
end $$;
create or replace function trol3._ck(p_id uuid, item text, est trol3.estado_checklist, sev text, det text) returns void language sql as $$
  insert into trol3.checklist_items (persona_id, item, estado, severidad, detalle, calculado_en) values (p_id, item, est, sev, det, now())
  on conflict (persona_id, item) do update set estado = excluded.estado, severidad = excluded.severidad, detalle = excluded.detalle, calculado_en = now();
$$;

-- Motor v0: checklist + oportunidades por persona
create or replace function trol3.evaluar_persona(p_id uuid) returns jsonb language plpgsql security definer set search_path = trol3, public as $$
declare e record; n_op int := 0; codigos text[] := '{}';
begin
  select * into e from trol3.v_expediente where persona_id = p_id;
  if not found then return '{}'::jsonb; end if;

  -- ===== Checklist de orden =====
  if e.inconsistencia_imss is not null then perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','alerta','alta', e.inconsistencia_imss);
  elsif e.ley is null and e.consultas_fallidas > 0 then perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','alerta','alta','No fue posible obtener información del IMSS ('||e.consultas_fallidas||' intentos fallidos)');
  elsif e.ley is not null then perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','ok','baja',null);
  else perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','sin_dato','media','Sin consulta IMSS'); end if;

  if e.semanas_validadas is not null and e.semanas_declaradas is not null and e.semanas_declaradas - e.semanas_validadas >= 26 then
    perform trol3._ck(p_id, 'semanas_reconocidas','alerta','media','Declara '||e.semanas_declaradas||' semanas vs '||e.semanas_validadas||' reconocidas');
  elsif e.semanas_validadas is not null then perform trol3._ck(p_id, 'semanas_reconocidas','ok','baja',null);
  else perform trol3._ck(p_id, 'semanas_reconocidas','sin_dato','media','Sin semanas validadas'); end if;

  if e.afore_actual is null then perform trol3._ck(p_id, 'afore_top','sin_dato','baja','No sabemos tu AFORE');
  else perform trol3._ck(p_id, 'afore_top','ok','baja',e.afore_actual); end if;

  if e.cuenta_registrada is false then perform trol3._ck(p_id, 'cuenta_registrada','alerta','media','Cuenta AFORE sin registrar (CDA)');
  elsif e.cuenta_registrada is true then perform trol3._ck(p_id, 'cuenta_registrada','ok','baja',null);
  else perform trol3._ck(p_id, 'cuenta_registrada','sin_dato','baja',null); end if;

  if e.ley = 'Ley97' then perform trol3._ck(p_id, 'derechos_vigentes','no_aplica','baja',null);
  elsif e.ley = 'Ley73' and e.conserva_derechos is false then perform trol3._ck(p_id, 'derechos_vigentes','alerta','alta','Derechos Ley 73 no vigentes');
  elsif e.ley = 'Ley73' and e.fin_conservacion is not null and e.fin_conservacion < current_date + 180 then perform trol3._ck(p_id, 'derechos_vigentes','alerta','alta','Derechos vencen '||e.fin_conservacion);
  elsif e.ley = 'Ley73' then perform trol3._ck(p_id, 'derechos_vigentes','ok','baja',null);
  else perform trol3._ck(p_id, 'derechos_vigentes','sin_dato','media',null); end if;

  if e.etapa in ('asesorado','cliente') then perform trol3._ck(p_id, 'situacion_entendida','ok','baja',null);
  else perform trol3._ck(p_id, 'situacion_entendida','alerta','baja','Pendiente sesión con asesor'); end if;

  if e.ley_en is null then perform trol3._ck(p_id, 'datos_vigentes','sin_dato','media',null);
  elsif e.ley_vigente is false then perform trol3._ck(p_id, 'datos_vigentes','alerta','media','Datos IMSS de '||to_char(e.ley_en,'DD-Mon-YYYY')||'; conviene actualizar');
  else perform trol3._ck(p_id, 'datos_vigentes','ok','baja',null); end if;

  -- ===== Oportunidades =====
  -- Nivel 1
  if e.inconsistencia_imss is not null or (e.ley is null and e.consultas_fallidas > 0) then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'inconsistencia_imss', null, '{}'::jsonb, coalesce(e.inconsistencia_imss,'Sin información IMSS tras consultas fallidas'), null);
  end if;
  if e.semanas_validadas is not null and e.semanas_declaradas is not null and e.semanas_declaradas - e.semanas_validadas >= 26 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'reconocimiento_semanas', null, jsonb_build_object('delta_semanas', e.semanas_declaradas - e.semanas_validadas), 'Posibles semanas no reconocidas', null);
  end if;
  if e.cuenta_registrada is false then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'cuenta_sin_registrar', null, '{}'::jsonb, 'Cuenta AFORE no registrada', null);
  end if;
  if e.ley = 'Ley73' and (e.conserva_derechos is false or (e.fin_conservacion is not null and e.fin_conservacion < current_date + 180)) then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'reactivar_derechos', coalesce(e.pension_base,0)*12, jsonb_build_object('pension_base', e.pension_base, 'fin_conservacion', e.fin_conservacion),
            case when e.conserva_derechos is false then 'Derechos no vigentes: reactivar para pensión Ley 73' else 'Derechos por vencer' end, e.fin_conservacion);
  end if;
  if e.afore_actual is null and e.saldo_rcv97 is not null and e.saldo_rcv97 > 50000 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'cambio_afore', null, jsonb_build_object('saldo_rcv97', e.saldo_rcv97), 'Falta conocer la AFORE para comparar rendimiento', null, '{afore_actual}', 'posible');
  end if;

  -- Nivel 2
  if e.ley = 'Ley73' and e.edad >= 60 and coalesce(e.semanas,0) >= 500 and coalesce(e.conserva_derechos,true) and coalesce(e.pension_base,0) > 0 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'pension_hoy', e.pension_base*12, jsonb_build_object('pension_mensual', e.pension_base, 'edad', e.edad, 'semanas', e.semanas), 'Cumple edad, semanas y derechos para pensionarse', null);
  end if;
  if e.ley = 'Ley73' and coalesce(e.mod40_retro_aplica,false) and coalesce(e.pension_mod40_retro,0) > coalesce(e.pension_base,0) then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'mod40_retro', (e.pension_mod40_retro - coalesce(e.pension_base,0))*12,
            jsonb_build_object('pension_base', e.pension_base, 'pension_mod40', e.pension_mod40_retro, 'costo_retro', e.costo_retro),
            'Mod 40 retroactiva aplica hoy: +'||round(e.pension_mod40_retro - coalesce(e.pension_base,0))||' MXN/mes', e.limite_mod40);
  end if;
  if e.ley = 'Ley73' and e.edad < 60 and coalesce(e.pension_mod40_futuro,0) > coalesce(e.pension_base,0) * 1.15 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'mod40_prospectiva', (e.pension_mod40_futuro - coalesce(e.pension_base,0))*12,
            jsonb_build_object('pension_base', e.pension_base, 'pension_mod40_futuro', e.pension_mod40_futuro), 'Cotizar en Mod 40 mejora la pensión', null);
  end if;
  if e.status_empleo = 'empleado' and coalesce(e.saldo_infonavit,0) >= 500000 and coalesce(e.credito_infonavit,false) = false then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'credito_infonavit_activo', e.saldo_infonavit, jsonb_build_object('saldo_infonavit', e.saldo_infonavit), 'Saldo Infonavit alto sin crédito vigente', null);
  end if;
  if e.ley = 'Ley73' and e.edad >= 60 and coalesce(e.saldo_infonavit,0) > 20000 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'retiro_infonavit_pension', e.saldo_infonavit, jsonb_build_object('saldo_infonavit', e.saldo_infonavit), 'Saldo Infonavit recuperable al pensionarse', null);
  end if;

  -- Nivel 3
  if e.status_empleo = 'empleado' and e.edad < 60 and coalesce(e.saldo_infonavit,0) between 150000 and 499999 and coalesce(e.credito_infonavit,false) = false then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'compra_inmueble', e.saldo_infonavit, jsonb_build_object('saldo_infonavit', e.saldo_infonavit), 'Capacidad de crédito Infonavit para vivienda', null);
  end if;
  if e.expectativa_pension is not null and coalesce(e.pension_base,0) > 0 and e.expectativa_pension > e.pension_base * 1.2 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'ahorro_voluntario', (e.expectativa_pension - e.pension_base)*12, jsonb_build_object('brecha_mensual', e.expectativa_pension - e.pension_base), 'Brecha entre pensión estimada y expectativa', null);
  end if;
  if coalesce(e.dependientes,0) > 0 and coalesce(e.tiene_seguro,false) = false then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'seguros', null, jsonb_build_object('dependientes', e.dependientes), 'Dependientes sin cobertura declarada', null);
  end if;

  -- Cierra las que ya no aplican (solo si no las tocó un humano)
  update trol3.oportunidades o set estado = 'no_aplica', cerrada_en = now()
  where o.persona_id = p_id and o.estado in ('posible','detectada') and not (o.codigo = any(codigos));

  return jsonb_build_object('oportunidades', array_length(codigos,1));
end $$;

create or replace function trol3.evaluar_todos(p_limit int default null) returns jsonb language plpgsql security definer set search_path = trol3, public as $$
declare r record; n int := 0; begin
  alter table trol3.oportunidades disable trigger evento_oportunidad;
  for r in select id from trol3.personas where merged_into is null order by created_at limit coalesce(p_limit, 1000000) loop
    perform trol3.evaluar_persona(r.id); n := n + 1;
  end loop;
  alter table trol3.oportunidades enable trigger evento_oportunidad;
  return jsonb_build_object('personas', n);
end $$;

-- Re-evaluar al insertar datos (asíncrono ligero: marca; el despachador re-evalúa). Para MVP: directo.
create or replace function trol3.tg_reevaluar_por_dato() returns trigger language plpgsql as $$
begin
  if new.campo <> 'semilla' then perform trol3.evaluar_persona(new.persona_id); end if;
  return new;
end $$;
drop trigger if exists reevaluar_por_dato on trol3.datos;
create trigger reevaluar_por_dato after insert on trol3.datos for each row execute function trol3.tg_reevaluar_por_dato();
