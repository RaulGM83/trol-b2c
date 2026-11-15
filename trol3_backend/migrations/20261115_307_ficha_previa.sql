-- 307 · Ficha previa (claude/122)
-- Todo lo relevante de un contacto, en una sola llamada, para la conversación previa:
-- lo que tiene (IMSS, Infonavit, AFORE y ahorros, identidad, ingresos SAT e ISSSTE), lo que falta,
-- de qué hablarle (todas las oportunidades abiertas + guion de preguntas pendientes) y sus consultas.
-- Solo lectura. No pide nada: las consultas las decide el asesor desde el panel.

-- Fecha de la información del IMSS: la del SISEC si la semilla la trae; si no, lo más reciente entre
-- el dato validado de ley y la última consulta de historial completada. Con solo datos declarados: null.
create or replace function trol3._imss_al(p uuid)
returns date
language sql stable security definer
set search_path to 'trol3', 'public'
as $fn$
  select coalesce(
    (select case when (d.valor->'meta'->>'fecha_sisec') ~ '^\d{4}-\d{2}-\d{2}'
                 then left(d.valor->'meta'->>'fecha_sisec', 10)::date end
       from trol3.v_mejor_dato d where d.persona_id = p and d.campo = 'semilla'),
    greatest(
      (select (d.obtenido_en at time zone 'America/Mexico_City')::date
         from trol3.v_mejor_dato d where d.persona_id = p and d.campo = 'ley' and d.capa = 'validado'),
      (select (max(c.completed_at) at time zone 'America/Mexico_City')::date
         from trol3.consultas c where c.persona_id = p and c.tipo = 'imss_historial' and c.estado = 'completada')));
$fn$;
revoke all on function trol3._imss_al(uuid) from public, anon, authenticated;

create or replace function trol3.ficha_previa(p_persona uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'trol3', 'public'
as $fn$
declare
  per record; e record; base jsonb; hl jsonb; md jsonb;
  hoy date := trol3._hoy_mx();
  v_imss date; v_inf date; v_bdi date; v_tel text;
  faltas jsonb := '[]'::jsonb; r record;
  empleado boolean; credito_vig boolean;
begin
  perform trol3._guard_miembro();  -- solo equipo: trae ingresos, que el cliente no ve
  select * into per from trol3.personas where id = p_persona;
  if per.id is null then return null; end if;
  select * into e from trol3.v_expediente where persona_id = p_persona;
  base := trol3.base_asesoria(p_persona);
  hl := coalesce(base->'highlights', '{}'::jsonb);

  select coalesce(jsonb_object_agg(d.campo, jsonb_build_object('v', d.valor, 'capa', d.capa, 'en', d.obtenido_en, 'prov', d.proveedor)), '{}'::jsonb)
    into md
    from trol3.v_mejor_dato d
   where d.persona_id = p_persona and d.campo <> 'semilla'
     and (d.campo in (select c.campo from trol3.catalogo_campos c where c.grupo in ('infonavit', 'ingresos', 'issste'))
          or d.campo in ('nss', 'afore_actual', 'saldo_rcv97', 'estatus_identidad', 'estatus_cda', 'expectativa_pension_mxn',
                         'edad_retiro_deseada', 'salario_diario', 'ultima_cotizacion', 'relacion_laboral_vigente'));

  v_imss := trol3._imss_al(p_persona);
  select (max(d.obtenido_en) at time zone 'America/Mexico_City')::date into v_inf
    from trol3.v_mejor_dato d
   where d.persona_id = p_persona and d.capa = 'validado'
     and d.campo in ('saldo_infonavit', 'infonavit_monto_credito', 'relacion_laboral_vigente', 'credito_infonavit_vigente');
  select (max(c.completed_at) at time zone 'America/Mexico_City')::date into v_bdi
    from trol3.consultas c where c.persona_id = p_persona and c.proveedor = 'bdi' and c.estado = 'completada';
  select ct.normalizado into v_tel from trol3.contactos ct
   where ct.persona_id = p_persona and ct.tipo = 'telefono' order by ct.principal desc limit 1;

  empleado := coalesce((md->'relacion_laboral_vigente'->>'v')::boolean, e.status_empleo = 'empleado', false);
  credito_vig := coalesce((md->'credito_infonavit_vigente'->>'v')::boolean, false);

  -- Lo que falta para la primera conversación (las preguntas del paso cero NO van aquí: son guion)
  if per.curp is null then
    faltas := faltas || jsonb_build_object('codigo', 'sin_curp', 'nivel', 'alto', 'texto', 'No tenemos su CURP.');
  end if;
  if (md->'estatus_identidad'->>'v') in ('por_confirmar', 'confirmada_con_problema') then
    faltas := faltas || jsonb_build_object('codigo', 'identidad', 'nivel', 'alto',
      'texto', case md->'estatus_identidad'->>'v' when 'por_confirmar' then 'Su identidad en el IMSS está por confirmar.'
                                                   else 'Hay un problema confirmado con su identidad en el IMSS.' end);
  end if;
  if v_imss is null then
    faltas := faltas || jsonb_build_object('codigo', 'sin_imss', 'nivel', 'alto', 'accion', 'imss_historial',
      'texto', case when e.semanas is not null then 'No tenemos su información del IMSS; lo que hay es lo que nos dijo.'
                    else 'No tenemos su información del IMSS.' end);
  elsif hoy - v_imss > 60 then
    faltas := faltas || jsonb_build_object('codigo', 'imss_viejo', 'nivel', 'medio', 'accion', 'imss_historial', 'dias', hoy - v_imss,
      'texto', format('Su información del IMSS tiene %s días. Úsala diciendo la fecha, o actualízala.', hoy - v_imss));
  end if;
  if v_inf is null and empleado and not credito_vig and coalesce(e.edad, 0) < 62 then
    faltas := faltas || jsonb_build_object('codigo', 'sin_infonavit', 'nivel', 'medio', 'accion', 'infonavit',
      'texto', case when (md ? 'nss') then 'No tenemos su precalificación Infonavit.'
                    else 'No tenemos su precalificación Infonavit (hace falta su NSS).' end);
  end if;
  if v_tel is null then
    faltas := faltas || jsonb_build_object('codigo', 'sin_telefono', 'nivel', 'medio', 'texto', 'No tenemos su teléfono.');
  end if;
  -- Consultas que fallaron y siguen sin reintento (la última de su tipo no terminó bien)
  for r in
    select distinct on (c.tipo) c.id, c.tipo, c.proveedor, c.estado::text as estado, c.error, c.created_at
      from trol3.consultas c
     where c.persona_id = p_persona and c.tipo in ('imss_historial', 'infonavit', 'ingresos')
       and c.estado::text not in ('cancelada')
     order by c.tipo, c.created_at desc
  loop
    if r.estado in ('error', 'sin_resultado') then
      faltas := faltas || jsonb_build_object('codigo', 'consulta_fallo', 'nivel', 'alto', 'accion', r.tipo, 'consulta_id', r.id,
        'tipo', r.tipo, 'en', r.created_at,
        'texto', format('La consulta de %s del %s no trajo resultado.',
                        case r.tipo when 'imss_historial' then 'IMSS' when 'infonavit' then 'Infonavit' else 'ingresos e ISSSTE' end,
                        to_char(r.created_at at time zone 'America/Mexico_City', 'DD-MM')));
    end if;
  end loop;

  return jsonb_build_object(
    'persona_id', per.id, 'hoy', hoy,
    'imss', jsonb_build_object(
      'al', v_imss, 'dias', hoy - v_imss, 'vigente', v_imss is not null and hoy - v_imss <= 60,
      'solo_declarado', v_imss is null and e.semanas is not null,
      'ley', e.ley, 'semanas', e.semanas, 'semanas_capa', e.semanas_capa, 'edad', e.edad,
      'status_empleo', e.status_empleo, 'cotiza_hoy', hl->'cotiza_hoy', 'salario_diario', hl->'salario_diario',
      'ultima_cotizacion', hl->'ultima_cotizacion', 'conserva_derechos', e.conserva_derechos, 'fin_conservacion', e.fin_conservacion,
      'pension_base', e.pension_base, 'pension_maxima', e.pension_maxima, 'edad_base', hl->'edad_base'),
    'infonavit', jsonb_build_object(
      'al', v_inf, 'dias', hoy - v_inf,
      'saldo', e.saldo_infonavit, 'saldo_capa', e.saldo_infonavit_capa, 'saldo_estimado', e.saldo_infonavit_estimado,
      'monto_credito', md->'infonavit_monto_credito'->'v', 'capacidad_compra', md->'infonavit_capacidad_compra'->'v',
      'pago_mensual', md->'infonavit_pago_mensual'->'v',
      'relacion_laboral', md->'relacion_laboral_vigente'->'v', 'credito_vigente', md->'credito_infonavit_vigente'->'v',
      'credito_uso', md->'credito_infonavit_uso'->'v', 'numero_credito', md->'numero_credito_infonavit'->'v',
      'oportunidad', (select jsonb_build_object('estado', o.estado, 'solo_cotitular', o.solo_cotitular, 'efectivo_minimo', o.efectivo_minimo,
                                                'etapa', o.etapa_infonavit)
                        from trol3.oportunidades o
                       where o.persona_id = p_persona and o.codigo = 'compra_inmueble'
                         and o.estado::text not in ('no_aplica', 'perdida') limit 1)),
    'afore', jsonb_build_object(
      'afore', e.afore_actual, 'saldo', e.saldo_rcv97, 'saldo_capa', e.saldo_rcv97_capa, 'rango', hl->'afore_rango',
      'expectativa', md->'expectativa_pension_mxn'->'v', 'edad_retiro', md->'edad_retiro_deseada'->'v',
      'listos', base->'listos', 'total', base->'total',
      'preguntas', (select coalesce(jsonb_agg(jsonb_build_object('n', q->'n', 'titulo', q->'titulo', 'estado', q->'estado') order by (q->>'n')::int), '[]'::jsonb)
                      from jsonb_array_elements(coalesce(base->'preguntas', '[]'::jsonb)) q)),
    'identidad', jsonb_build_object(
      'curp', per.curp, 'nss', coalesce(nullif(trim(per.nss), ''), md->'nss'->>'v'),
      'estatus', md->'estatus_identidad'->'v', 'estatus_cda', md->'estatus_cda'->'v',
      'telefono', v_tel, 'registrado_en', per.created_at, 'origen', trol3.origen_de(p_persona),
      'app_visto_en', per.app_visto_en,
      'parada', (select jsonb_build_object('parada', pa->'parada', 'toca', pa->'toca', 'titulo', pa->'titulo') from (select trol3.parada_de(p_persona) pa) x),
      'documentos', (select coalesce(jsonb_agg(jsonb_build_object('tipo', t.tipo, 'nombre', t.nombre, 'n', t.n) order by t.n desc), '[]'::jsonb)
                       from (select d.tipo, coalesce(cd.nombre, d.tipo) nombre, count(*) n
                               from trol3.documentos d left join trol3.catalogo_documentos cd on cd.tipo = d.tipo
                              where d.persona_id = p_persona group by 1, 2) t),
      'cita', (select jsonb_build_object('inicio', c.inicio, 'miembro', m.nombre)
                 from trol3.citas c left join trol3.miembros m on m.id = c.miembro_id
                where c.persona_id = p_persona and c.estado = 'programada' and c.inicio > now() order by c.inicio limit 1)),
    'ingresos', jsonb_build_object(
      'al', v_bdi, 'dias', hoy - v_bdi,
      'bruto', md->'ingreso_bruto_mensual'->'v', 'neto', md->'ingreso_neto_mensual'->'v', 'isr', md->'isr_mensual'->'v',
      'patron', md->'patron_nomina'->'v', 'ultima_nomina', md->'ultima_nomina_fecha'->'v', 'periodicidad', md->'periodicidad_nomina'->'v',
      'empleo_vigente', md->'empleo_vigente_sat'->'v', 'deducciones', md->'deducciones_otras'->'v'),
    'issste', jsonb_build_object(
      'al', (select (max(d.obtenido_en) at time zone 'America/Mexico_City')::date from trol3.v_mejor_dato d
              where d.persona_id = p_persona and d.capa = 'validado' and d.campo in ('fecha_alta_issste', 'antiguedad_issste_anios', 'ramo_issste')),
      'estatus', md->'status_issste'->'v', 'antiguedad', md->'antiguedad_issste_anios'->'v',
      'ingreso_gobierno', md->'fecha_ingreso_gobierno_issste'->'v', 'alta', md->'fecha_alta_issste'->'v', 'baja', md->'fecha_baja_issste'->'v',
      'ramo', md->'ramo_issste'->'v', 'sueldo_basico', md->'sueldo_basico_issste'->'v', 'regimen', md->'regimen_issste'->'v',
      'empalme', md->'empalme_issste_imss'->'v'),
    'faltas', faltas,
    'guion', (select coalesce(jsonb_agg(q->>'titulo' order by (q->>'n')::int), '[]'::jsonb)
                from jsonb_array_elements(coalesce(base->'preguntas', '[]'::jsonb)) q where q->>'estado' = 'falta'),
    'oportunidades', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', o.id, 'codigo', o.codigo, 'nombre', coalesce(c.nombre_cliente, c.nombre, o.codigo), 'estado', o.estado,
                          'frase', c.frase_corta, 'solo_cotitular', o.solo_cotitular, 'efectivo_minimo', o.efectivo_minimo)
                          order by c.orden nulls last, o.detectada_en), '[]'::jsonb)
                        from trol3.oportunidades o left join trol3.catalogo_oportunidades c on c.codigo = o.codigo
                       where o.persona_id = p_persona and o.estado::text not in ('no_aplica', 'perdida', 'ganada')
                         and coalesce(c.activo, true)),
    'consultas', (select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb)
                    from (select c.created_at, jsonb_build_object('id', c.id, 'tipo', c.tipo, 'proveedor', c.proveedor, 'estado', c.estado,
                                   'error', left(c.error, 160), 'creada', c.created_at, 'completada', c.completed_at, 'motivo', c.motivo) j
                            from trol3.consultas c
                           where c.persona_id = p_persona and c.tipo in ('imss_historial', 'infonavit', 'ingresos', 'issste', 'cda')
                           order by c.created_at desc limit 8) x),
    'proveedores', (select coalesce(jsonb_object_agg(pr.codigo, jsonb_build_object('nombre', pr.nombre, 'costo', pr.costo_unitario,
                             'habilitado', pr.habilitado, 'salud', trol3.salud_proveedor(pr.codigo)->>'estado')), '{}'::jsonb)
                      from trol3.proveedores pr where pr.codigo in ('jordan', 'precalix', 'bdi')));
end $fn$;

revoke all on function trol3.ficha_previa(uuid) from public, anon;
grant execute on function trol3.ficha_previa(uuid) to authenticated, service_role;

-- Señales por fila en Mi cartera: de cuándo es su IMSS y su Infonavit (base n/5 ya viene en carril_de).
do $outer$
declare def text; ancla text := $a$'edad', e.edad, 'ley', e.ley, 'semanas', e.semanas,$a$;
begin
  def := pg_get_functiondef('trol3._cartera_fila(uuid)'::regprocedure);
  if position('imss_al' in def) > 0 then return; end if;
  if position(ancla in def) = 0 then raise exception '307: no encontré el ancla en _cartera_fila'; end if;
  def := replace(def, ancla, ancla || $n$
    'imss_al', trol3._imss_al(per.id),
    'infonavit_al', case when e.saldo_infonavit_capa = 'validado' then (e.saldo_infonavit_en at time zone 'America/Mexico_City')::date end,$n$);
  execute def;
end $outer$;
