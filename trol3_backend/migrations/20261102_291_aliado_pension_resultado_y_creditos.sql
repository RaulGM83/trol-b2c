-- 291 — Aliado que refiere pensión e Infonavit: resultado de la consulta y compra con créditos
-- (claude/116, 2-nov-2026).
--
-- 1. v_aliado_yo gana `creditos` y `tiene_wallet` (saldo del partner ligado por aliados.partner_id).
-- 2. v_resultado_aliado: lo que el aliado ve de cada referido de pensión. Nueva excepción explícita al
--    guardarraíl de 126 ("nunca saldos ni semanas"), igual que 281 lo abrió para Infonavit: datos del
--    IMSS, pensión estimada y oportunidades (por nombre de cliente, sin montos). Nunca CURP, NSS,
--    expediente ni archivos. Filtra por current_aliado_id() (o miembro).
-- 3. comprar_asesoria_por_aliado(persona, producto): descuenta créditos del wallet, crea la orden
--    pagada (tg_orden_beneficios otorga los beneficios), deja tarea al equipo y emite evento.
--    Idempotente por persona+producto. La comisión NO se toca: sigue sólo sobre oportunidades
--    ganadas con honorario (decisión de Raúl: no comisiona la asesoría que él mismo compró).
-- 4. v_documentos_aliado: el PDF del diagnóstico entregado, sólo de sus referidos.
-- 5. (291d) expediente_aliado(persona): v_expediente lee v_mejor_dato (security_invoker=true), así que
--    como aliado las políticas de `datos` lo tapan todo. Esta función security definer entrega sólo las
--    columnas que el aliado puede ver y sólo de sus referidos. Las vistas la usan por LATERAL (que además
--    evita que el planner aplane v_expediente contra las 14k personas: 9 s → 2 ms). v_referidos_aliado
--    se corrige igual.
-- 6. Para el aliado, 1 cr = $20: cálculos 20 cr ($400) · completa 30 cr ($600). El `precio_mxn` del
--    catálogo ($500/$800) es el precio B2C de /mi y NO se toca (Raúl, 2-nov): el aliado sólo usa precio_creditos.
-- Aplicada por MCP el 2-nov-2026 en cuatro pasos (291, 291b, 291c, 291d); este archivo es el estado final.

-- ---------------------------------------------------------------------------
-- 1. v_aliado_yo + créditos
-- ---------------------------------------------------------------------------
create or replace view trol3.v_aliado_yo as
select a.id, a.nombre, a.empresa, a.email, a.telefono, a.tipo, a.comision_pct, a.activo,
       (select ci.codigo from trol3.codigos_invitacion ci where ci.aliado_id = a.id
         order by ci.activo desc, ci.created_at limit 1) as codigo,
       a.programa_infonavit, a.comision_infonavit,
       (select p.balance_credits from public.partners p where p.id = a.partner_id) as creditos,
       a.partner_id is not null as tiene_wallet
  from trol3.aliados a
 where a.id = trol3.current_aliado_id();

-- ---------------------------------------------------------------------------
-- 5. expediente_aliado — lo que el aliado puede ver del expediente, sólo de sus referidos
-- ---------------------------------------------------------------------------
create or replace function trol3.expediente_aliado(p_persona uuid)
returns table (
  edad int, ley text, semanas numeric, status_empleo text, conserva_derechos boolean, fin_conservacion date,
  afore_actual text, pension_base numeric, pension_maxima numeric, saldo_rcv97 numeric,
  saldo_infonavit numeric, infonavit_monto_credito numeric, credito_infonavit_vigente boolean,
  inconsistencia_imss text, consultas_fallidas int, cabecera_id uuid
)
language sql
stable
security definer
set search_path to 'trol3', 'public'
as $$
  select e.edad, e.ley, e.semanas, e.status_empleo, e.conserva_derechos, e.fin_conservacion,
         e.afore_actual, e.pension_base, e.pension_maxima, e.saldo_rcv97,
         e.saldo_infonavit,
         (select (d.valor #>> '{}')::numeric from trol3.datos d
           where d.persona_id = p_persona and d.campo = 'infonavit_monto_credito' and d.capa = 'validado'
           order by d.obtenido_en desc limit 1),
         e.credito_infonavit, e.inconsistencia_imss, e.consultas_fallidas::int, e.cabecera_id
    from trol3.v_expediente e
   where e.persona_id = p_persona
     and (trol3.es_miembro() or exists (
           select 1 from trol3.referidos r
            where r.persona_id = p_persona and r.aliado_id = trol3.current_aliado_id()
              and r.estado = 'atribuido' and r.visible_para_aliado))
   limit 1
$$;
revoke all on function trol3.expediente_aliado(uuid) from public;
grant execute on function trol3.expediente_aliado(uuid) to authenticated, service_role;

-- v_referidos_aliado (122/126): misma corrección
create or replace view trol3.v_referidos_aliado as
 SELECT r.id AS referido_id, r.aliado_id, r.persona_id, r.estado, r.origen, r.creado_en AS referido_en,
    p.nombre, p.apellidos, p.etapa, e.edad, e.ley,
    ( SELECT max(c.inicio) FROM trol3.citas c WHERE c.persona_id = r.persona_id) AS ultima_cita,
    ( SELECT max(d.entregado_en) FROM trol3.diagnosticos d WHERE d.persona_id = r.persona_id AND d.estado = 'entregado') AS diagnostico_entregado_en,
    ( SELECT ((x.inputs -> 'resumen') ->> 'pension_mensual')::numeric FROM trol3.escenarios x
       WHERE x.persona_id = r.persona_id AND x.tipo LIKE 'calc\_%' ORDER BY x.creado_en DESC LIMIT 1) AS pension_estimada,
    ( SELECT string_agg(DISTINCT pr.nombre, ', ') FROM trol3.ordenes o JOIN trol3.productos pr ON pr.codigo = o.producto
       WHERE o.persona_id = r.persona_id AND o.estado = 'pagada') AS productos_contratados,
    ( SELECT COALESCE(sum(cm.monto), 0) FROM trol3.comisiones cm WHERE cm.referido_id = r.id AND cm.estado <> 'cancelada') AS comision_devengada
   FROM trol3.referidos r
     JOIN trol3.personas p ON p.id = r.persona_id
     LEFT JOIN LATERAL trol3.expediente_aliado(r.persona_id) e ON true
  WHERE r.visible_para_aliado AND (r.aliado_id = trol3.current_aliado_id() AND r.estado = 'atribuido' OR trol3.es_miembro());

-- ---------------------------------------------------------------------------
-- 2. v_resultado_aliado
-- ---------------------------------------------------------------------------
create or replace view trol3.v_resultado_aliado as
with base as (
  select r.id as referido_id, r.persona_id, r.aliado_id, r.estado as estado_ref, r.creado_en as referido_en,
         p.nombre, p.apellidos, p.curp is not null as tiene_curp,
         (select a.partner_id from trol3.aliados a where a.id = r.aliado_id) as partner_id,
         (select c.estado::text from trol3.consultas c
           where c.persona_id = r.persona_id and c.tipo = 'imss_historial' and c.estado <> 'cancelada'
           order by c.created_at desc limit 1) as consulta_estado
    from trol3.referidos r
    join trol3.personas p on p.id = r.persona_id
   where r.visible_para_aliado
     and (r.aliado_id = trol3.current_aliado_id() or trol3.es_miembro())
)
select b.referido_id, b.persona_id, b.estado_ref, b.referido_en, b.nombre, b.apellidos,
       case when b.estado_ref = 'por_revisar' then 'ya_cliente'
            when e.semanas is not null and e.ley is not null then 'listo'
            when b.consulta_estado in ('solicitada','en_proceso') then 'consultando'
            when b.consulta_estado in ('error','sin_resultado') or coalesce(e.consultas_fallidas, 0) > 0 then 'fallida'
            when not b.tiene_curp then 'falta_curp'
            else 'consultando' end as estado,
       case when b.estado_ref = 'por_revisar' then null else e.edad end as edad,
       case when b.estado_ref = 'por_revisar' then null else e.ley end as ley,
       case when b.estado_ref = 'por_revisar' then null else e.semanas end as semanas,
       case when b.estado_ref = 'por_revisar' then null else e.status_empleo end as status_empleo,
       case when b.estado_ref = 'por_revisar' then null else e.conserva_derechos end as conserva_derechos,
       case when b.estado_ref = 'por_revisar' then null else e.fin_conservacion end as fin_conservacion,
       case when b.estado_ref = 'por_revisar' then null else e.afore_actual end as afore_actual,
       case when b.estado_ref = 'por_revisar' then null else e.pension_base end as pension_base,
       case when b.estado_ref = 'por_revisar' then null else e.pension_maxima end as pension_maxima,
       case when b.estado_ref = 'por_revisar' then null else e.saldo_rcv97 end as saldo_rcv97,
       case when b.estado_ref = 'por_revisar' then null else e.saldo_infonavit end as saldo_infonavit,
       case when b.estado_ref = 'por_revisar' then null else e.infonavit_monto_credito end as infonavit_monto_credito,
       case when b.estado_ref = 'por_revisar' then null else e.credito_infonavit_vigente end as credito_infonavit_vigente,
       case when b.estado_ref = 'por_revisar' then null else e.inconsistencia_imss end as inconsistencia_imss,
       case when b.estado_ref = 'por_revisar' then '[]'::jsonb else
         (select coalesce(jsonb_agg(jsonb_build_object('codigo', o.codigo, 'nombre', c.nombre_cliente, 'frase', c.frase_corta, 'estado', o.estado) order by c.orden), '[]'::jsonb)
            from trol3.oportunidades o join trol3.catalogo_oportunidades c on c.codigo = o.codigo
           where o.persona_id = b.persona_id and c.activo
             and o.estado in ('detectada','posible','presentada','interesada','en_proceso')) end as oportunidades,
       (select coalesce(jsonb_agg(jsonb_build_object('producto', o.producto, 'nombre', pr.nombre, 'en', o.paid_at) order by o.paid_at), '[]'::jsonb)
          from trol3.ordenes o join trol3.productos pr on pr.codigo = o.producto
         where o.persona_id = b.persona_id and o.estado in ('pagada','cumplida')
           and b.partner_id is not null and o.partner_id = b.partner_id) as compras,
       case when exists (select 1 from trol3.diagnosticos d where d.persona_id = b.persona_id and d.estado = 'entregado') then 'listo'
            when exists (select 1 from trol3.diagnosticos d where d.persona_id = b.persona_id and d.estado in ('borrador','revisado')) then 'en_elaboracion'
            else null end as diagnostico_estado,
       (select d.id from trol3.documentos d where d.persona_id = b.persona_id and d.tipo = 'diagnostico_avanzado'
         order by d.created_at desc limit 1) as diagnostico_doc_id,
       (select min(c.inicio) from trol3.citas c where c.persona_id = b.persona_id and c.inicio > now() and c.estado::text <> 'cancelada') as proxima_sesion
  from base b
  left join lateral trol3.expediente_aliado(b.persona_id) e on true;

grant select on trol3.v_resultado_aliado to authenticated;
comment on view trol3.v_resultado_aliado is 'Lo que el aliado referidor ve de cada referido de pensión (claude/116). Filtra por current_aliado_id(). Nunca CURP/NSS ni archivos. 291.';

-- ---------------------------------------------------------------------------
-- 4. v_documentos_aliado — el PDF del diagnóstico entregado, sólo de sus referidos
-- ---------------------------------------------------------------------------
create or replace view trol3.v_documentos_aliado as
select d.id, d.persona_id, d.tipo, d.nombre, d.storage_path, d.created_at
  from trol3.documentos d
  join trol3.referidos r on r.persona_id = d.persona_id
 where d.tipo = 'diagnostico_avanzado'
   and r.visible_para_aliado and r.estado = 'atribuido'
   and r.aliado_id = trol3.current_aliado_id()
   and exists (select 1 from trol3.diagnosticos g where g.persona_id = d.persona_id and g.estado = 'entregado');
grant select on trol3.v_documentos_aliado to authenticated;

-- ---------------------------------------------------------------------------
-- 3. comprar_asesoria_por_aliado
-- ---------------------------------------------------------------------------
create or replace function trol3.comprar_asesoria_por_aliado(p_persona uuid, p_producto text)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare
  v_al record; v_prod record; v_part record; v_ref record;
  v_orden uuid; v_existe uuid; v_nuevo int; v_persona text; v_resp uuid;
begin
  select a.id, a.nombre, a.partner_id into v_al from trol3.aliados a where a.id = trol3.current_aliado_id();
  if v_al.id is null then raise exception 'no_autorizado'; end if;
  if v_al.partner_id is null then raise exception 'sin_wallet'; end if;
  if p_producto not in ('diagnostico_avanzado', 'diagnostico_avanzado_sesion') then raise exception 'producto_invalido'; end if;

  select r.id into v_ref from trol3.referidos r
   where r.persona_id = p_persona and r.aliado_id = v_al.id and r.estado = 'atribuido' and r.visible_para_aliado
   limit 1;
  if v_ref.id is null then raise exception 'referido_ajeno'; end if;

  select codigo, nombre, precio_creditos into v_prod from trol3.productos where codigo = p_producto and activo;
  if v_prod.precio_creditos is null then raise exception 'producto_sin_precio'; end if;

  -- Idempotente: una compra por persona y producto. Repetir no cobra dos veces.
  select id into v_existe from trol3.ordenes
   where persona_id = p_persona and producto = p_producto and partner_id = v_al.partner_id and estado in ('pagada','cumplida')
   limit 1;
  if v_existe is not null then
    return jsonb_build_object('ok', true, 'orden', v_existe, 'repetida', true);
  end if;

  select id, balance_credits into v_part from public.partners where id = v_al.partner_id for update;
  if coalesce(v_part.balance_credits, 0) < v_prod.precio_creditos then raise exception 'saldo_insuficiente'; end if;
  v_nuevo := v_part.balance_credits - v_prod.precio_creditos;
  update public.partners set balance_credits = v_nuevo, updated_at = now() where id = v_part.id;

  select trim(coalesce(nombre, '') || ' ' || coalesce(apellidos, '')) into v_persona from trol3.personas where id = p_persona;

  insert into trol3.ordenes (persona_id, partner_id, producto, monto, creditos_aplicados, estado, payment_provider, paid_at, metadata)
  values (p_persona, v_al.partner_id, p_producto, v_prod.precio_creditos * 20, v_prod.precio_creditos, 'pagada', 'creditos_aliado', now(),
          jsonb_build_object('aliado_id', v_al.id, 'aliado', v_al.nombre, 'referido_id', v_ref.id))
  returning id into v_orden;

  insert into public.wallet_transactions (partner_id, type, credits_delta, balance_credits_after, notes)
  values (v_part.id, 'charge', -v_prod.precio_creditos, v_nuevo,
          format('%s para %s · aliado %s · orden %s', v_prod.nombre, v_persona, v_al.nombre, v_orden));

  -- Tarea para el equipo: al cabecera de la persona; si no tiene, a Raúl.
  select coalesce(e.cabecera_id, '0dfd18d7-2b1e-4627-905e-6f75d347cbcf'::uuid) into v_resp
    from trol3.v_expediente e where e.persona_id = p_persona;
  insert into trol3.tareas (persona_id, titulo, detalle, responsable_id, vence_el, estado, origen, origen_id)
  values (p_persona,
          case when p_producto = 'diagnostico_avanzado_sesion'
               then 'Asesoría completa comprada por aliado: cálculos + agendar sesión'
               else 'Cálculos comprados por aliado: cerrar camino y entregar diagnóstico' end,
          format('%s pagó "%s" con %s créditos (quedan %s). Cerrar el camino en la calculadora y entregar el diagnóstico; el aliado lo ve en su portal al entregarlo.%s',
                 v_al.nombre, v_prod.nombre, v_prod.precio_creditos, v_nuevo,
                 case when p_producto = 'diagnostico_avanzado_sesion' then ' Agendar la sesión con el cliente.' else '' end),
          coalesce(v_resp, '0dfd18d7-2b1e-4627-905e-6f75d347cbcf'::uuid), current_date + 2, 'pendiente', 'aliado_compra', v_orden);

  begin
    perform trol3.emitir_evento(p_persona, 'asesoria_comprada_por_aliado', 'aliado', null,
      jsonb_build_object('orden', v_orden, 'producto', p_producto, 'aliado_id', v_al.id, 'creditos', v_prod.precio_creditos));
  exception when others then
    raise warning 'evento asesoria_comprada_por_aliado no emitido: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'orden', v_orden, 'creditos_restantes', v_nuevo);
end $$;
revoke all on function trol3.comprar_asesoria_por_aliado(uuid, text) from public;
grant execute on function trol3.comprar_asesoria_por_aliado(uuid, text) to authenticated, service_role;
comment on function trol3.comprar_asesoria_por_aliado is 'El aliado referidor compra una asesoría (diagnostico_avanzado / _sesion) para un referido suyo con los créditos de su wallet. Orden pagada + tarea al equipo. Idempotente. 291 (claude/116).';

