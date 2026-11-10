-- 302b — Calculadora del aliado y diagnóstico "Elaborado por" (claude/119 → 120). Raúl, 10-nov-2026.
--
-- · Gate: aliado_puede_calcular(persona) = referido atribuido y visible + orden pagada/cumplida de
--   diagnostico_avanzado o diagnostico_avanzado_sesion con el partner del aliado.
-- · expediente_aliado_completo(persona): TODO lo que ve el equipo del IMSS (expediente, datos, semilla, historial
--   laboral) — sólo con el gate. "Ve todo lo que vemos para que pueda hacer una buena asesoría" (Raúl).
-- · Escenarios: autorizar_escenario / cerrar_escenario aceptan al aliado (autor_tipo 'aliado'); RLS para que
--   vea los suyos. v_escenarios_cerrados sigue security_invoker.
-- · Diagnósticos: autor_tipo trol | aliado | aliado_revisado, elaborado_por (nombre libre), revisión a Trol.
--   abrir_diagnostico_aliado + entregar_diagnostico_aliado (la narrativa la escribe el redactor desde la app).
-- · pedir_revision_trol(diagnostico): producto revision_trol (10 cr = $200), orden, tarea a la cabecera. Cuando
--   el equipo lo vuelve a entregar, queda 'aliado_revisado' (estado_diagnostico).
-- · comprar_asesoria_por_aliado: con diagnostico_avanzado (20 cr) YA NO crea tarea al equipo — lo hace el aliado.
-- · v_resultado_aliado: calculadora_desbloqueada, diagnostico_id, diagnostico_autor, elaborado_por, revision.
-- Aplicada por MCP el 10-nov-2026.

-- ───────────────────────── Columnas ─────────────────────────
alter table trol3.escenarios add column if not exists autor_tipo text not null default 'asesor';
alter table trol3.escenarios add column if not exists autor_aliado_id uuid references trol3.aliados(id);
alter table trol3.escenarios drop constraint if exists escenarios_autor_tipo_chk;
alter table trol3.escenarios add constraint escenarios_autor_tipo_chk check (autor_tipo in ('asesor','aliado','cliente'));

alter table trol3.diagnosticos add column if not exists autor_tipo text not null default 'trol';
alter table trol3.diagnosticos add column if not exists autor_aliado_id uuid references trol3.aliados(id);
alter table trol3.diagnosticos add column if not exists elaborado_por text;
alter table trol3.diagnosticos add column if not exists revision_pedida_en timestamptz;
alter table trol3.diagnosticos add column if not exists revision_orden_id uuid;
alter table trol3.diagnosticos add column if not exists revisado_por uuid;
alter table trol3.diagnosticos add column if not exists revisado_en timestamptz;
alter table trol3.diagnosticos drop constraint if exists diagnosticos_autor_tipo_chk;
alter table trol3.diagnosticos add constraint diagnosticos_autor_tipo_chk check (autor_tipo in ('trol','aliado','aliado_revisado'));
comment on column trol3.diagnosticos.autor_tipo is 'trol = lo hizo el equipo; aliado = lo hizo el aliado con la calculadora (no revisado por Trol); aliado_revisado = el aliado lo hizo y Trol lo revisó y re-firmó (302b).';

insert into trol3.productos (codigo, nombre, tipo, precio_mxn, precio_creditos, max_pct_puntos, activo, beneficios)
values ('revision_trol', 'Revisión de Trol a un diagnóstico del aliado', 'asesoria', 200, 10, 0, true, '{}')
on conflict (codigo) do update set precio_creditos = 10, precio_mxn = 200, activo = true;

-- ───────────────────────── Gate ─────────────────────────
create or replace function trol3.aliado_puede_calcular(p_persona uuid, p_aliado uuid default null)
returns boolean language sql stable security definer set search_path to 'trol3', 'public' as $$
  select exists (
    select 1 from trol3.referidos r join trol3.aliados a on a.id = r.aliado_id
     where r.persona_id = p_persona and r.aliado_id = coalesce(p_aliado, trol3.current_aliado_id())
       and r.estado = 'atribuido' and r.visible_para_aliado and a.partner_id is not null
       and exists (select 1 from trol3.ordenes o where o.persona_id = p_persona and o.partner_id = a.partner_id
                     and o.producto in ('diagnostico_avanzado','diagnostico_avanzado_sesion') and o.estado in ('pagada','cumplida')));
$$;
grant execute on function trol3.aliado_puede_calcular(uuid, uuid) to authenticated;

-- ───────────────────────── Expediente completo para el aliado ─────────────────────────
create or replace function trol3.expediente_aliado_completo(p_persona uuid)
returns jsonb language plpgsql stable security definer set search_path to 'trol3', 'public' as $$
declare v_exp jsonb; v_datos jsonb; v_semilla jsonb; v_semilla_en timestamptz; v_hist jsonb; v_cl record; v_al record; v_consultas jsonb;
begin
  if not (trol3.es_miembro() or trol3.aliado_puede_calcular(p_persona)) then raise exception 'no_autorizado'; end if;
  select to_jsonb(e) - 'hubspot_id' into v_exp from trol3.v_expediente e where e.persona_id = p_persona;
  if v_exp is null then raise exception 'persona_no_encontrada'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('campo', v.campo, 'valor', v.valor, 'capa', v.capa, 'obtenido_en', v.obtenido_en, 'proveedor', v.proveedor, 'vigente', v.vigente) order by v.campo), '[]'::jsonb)
    into v_datos from trol3.v_mejor_dato v where v.persona_id = p_persona and v.campo <> 'semilla';
  select v.valor, v.obtenido_en into v_semilla, v_semilla_en from trol3.v_mejor_dato v where v.persona_id = p_persona and v.campo = 'semilla';
  select cl.calculo_pensional->'historial', cl.saldos_corregidos, cl.mod40_retro_hoy, cl.mod40_retro_futuro, cl.id
    into v_cl from public.clientes cl where cl.id = (v_exp->>'legacy_cliente_id')::uuid;
  v_hist := coalesce(v_cl.historial, v_semilla->'historial', '[]'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object('tipo', c.tipo, 'proveedor', c.proveedor, 'estado', c.estado, 'creada', c.created_at, 'terminada', c.completed_at, 'error', c.error) order by c.created_at desc), '[]'::jsonb)
    into v_consultas from (select * from trol3.consultas x where x.persona_id = p_persona order by x.created_at desc limit 10) c;
  select a.id, a.nombre, a.empresa into v_al from trol3.aliados a where a.id = trol3.current_aliado_id();
  return jsonb_build_object(
    'expediente', v_exp, 'datos', v_datos, 'semilla', v_semilla, 'semilla_en', v_semilla_en,
    'historial', v_hist, 'saldos_corregidos', v_cl.saldos_corregidos,
    'mod40_legacy', (v_cl.mod40_retro_hoy = 'true' or v_cl.mod40_retro_futuro = 'true'),
    'legacy_cliente_id', v_cl.id, 'consultas', v_consultas,
    'aliado', case when v_al.id is null then null else jsonb_build_object('id', v_al.id, 'nombre', v_al.nombre, 'empresa', v_al.empresa) end);
end $$;
grant execute on function trol3.expediente_aliado_completo(uuid) to authenticated;

-- ───────────────────────── Escenarios: el aliado también cierra ─────────────────────────
create or replace function trol3.autorizar_escenario(p_persona uuid, p_consulta_aliado uuid, p_inputs jsonb, p_resultado jsonb, p_ventana jsonb, p_tipo text default 'autorizacion')
returns uuid language plpgsql security definer set search_path to 'trol3', 'public' as $function$
declare v_id uuid; v_miembro uuid; v_aliado uuid;
begin
  v_miembro := trol3.current_miembro_id();
  if v_miembro is null then
    -- 302b · El aliado cierra escenarios de las personas con calculadora pagada; sólo calc_* y sólo con persona.
    v_aliado := trol3.current_aliado_id();
    if v_aliado is null then raise exception 'no_autorizado'; end if;
    if p_persona is null or coalesce(p_tipo,'') not like 'calc\_%' or not trol3.aliado_puede_calcular(p_persona, v_aliado) then raise exception 'no_autorizado'; end if;
  end if;

  if (p_persona is not null) = (p_consulta_aliado is not null) then
    raise exception 'sujeto_invalido' using hint = 'Manda exactamente uno: p_persona o p_consulta_aliado.';
  end if;
  if p_persona is not null and not exists (select 1 from trol3.personas where id = p_persona) then raise exception 'persona_no_encontrada'; end if;
  if p_consulta_aliado is not null and not exists (select 1 from trol3.consultas_aliados where id = p_consulta_aliado) then raise exception 'consulta_no_encontrada'; end if;
  if jsonb_typeof(p_inputs) is distinct from 'object' or not (p_inputs ? 'motor_version') then
    raise exception 'inputs_invalidos' using hint = 'inputs debe ser un objeto e incluir motor_version.';
  end if;
  if jsonb_typeof(p_resultado) is distinct from 'object' or jsonb_typeof(p_ventana) is distinct from 'object' then
    raise exception 'snapshot_invalido' using hint = 'resultado y ventana deben ser objetos.';
  end if;

  insert into trol3.escenarios (tipo, persona_id, consulta_aliado_id, inputs, resultado, ventana, creado_por, autor_tipo, autor_aliado_id)
  values (coalesce(p_tipo, 'autorizacion'), p_persona, p_consulta_aliado, p_inputs, p_resultado, p_ventana, v_miembro,
          case when v_miembro is null then 'aliado' else 'asesor' end, v_aliado)
  returning id into v_id;
  return v_id;
end $function$;

create or replace function trol3.cerrar_escenario(p_persona uuid, p_consulta_aliado uuid, p_tipo text, p_inputs jsonb, p_resultado jsonb, p_ventana jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path to 'trol3', 'public' as $function$
declare v_id uuid; v_m uuid; v_al uuid;
begin
  if p_tipo not in ('calc_ley73', 'calc_ley97', 'calc_mod40') then
    raise exception 'tipo_invalido' using hint = 'Los tipos de la calculadora son calc_ley73, calc_ley97 y calc_mod40. Para la Mesa Viraal usa autorizar_escenario.';
  end if;
  if not (p_inputs ? 'resumen') then
    raise exception 'falta_resumen' using hint = 'inputs.resumen debe traer al menos etiqueta y pension_mensual.';
  end if;
  v_id := trol3.autorizar_escenario(p_persona, p_consulta_aliado, p_inputs, p_resultado, coalesce(p_ventana, '{}'::jsonb), p_tipo);
  v_m := trol3.current_miembro_id();
  v_al := case when v_m is null then trol3.current_aliado_id() end;
  if p_persona is not null then
    perform trol3.registrar_interaccion(
      p_persona, 'nota', case when v_m is null then 'aliado'::trol3.actor_tipo else 'asesor'::trol3.actor_tipo end, coalesce(v_m, v_al), 'interna',
      case when v_m is null then 'El aliado cerró un escenario en su calculadora: ' else 'Cerró un escenario: ' end || coalesce(p_inputs->'resumen'->>'etiqueta', p_tipo),
      false, jsonb_build_object('escenario_id', v_id, 'tipo', p_tipo, 'aliado_id', v_al));
  end if;
  return v_id;
end $function$;

drop policy if exists escenarios_lectura_aliado on trol3.escenarios;
create policy escenarios_lectura_aliado on trol3.escenarios for select
  using (autor_aliado_id is not null and autor_aliado_id = trol3.current_aliado_id());
-- v_escenarios_cerrados hace left join a miembros (RLS de miembros): el aliado ve creado_por_nombre null, que es correcto.
grant select on trol3.v_escenarios_cerrados to authenticated;

-- ───────────────────────── Diagnóstico del aliado ─────────────────────────
create or replace function trol3.abrir_diagnostico_aliado(p_persona uuid, p_escenarios uuid[], p_hechos jsonb default '{}'::jsonb, p_motor_version text default null, p_elaborado_por text default null)
returns uuid language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare v_id uuid; v_al record; v_n int; v_nombre text;
begin
  select a.id, a.nombre, a.empresa into v_al from trol3.aliados a where a.id = trol3.current_aliado_id();
  if v_al.id is null then raise exception 'no_autorizado'; end if;
  if not trol3.aliado_puede_calcular(p_persona, v_al.id) then raise exception 'no_autorizado'; end if;
  if p_escenarios is null or array_length(p_escenarios, 1) is null then
    raise exception 'sin_escenarios' using hint = 'Cierra un escenario en la calculadora antes de generar el diagnóstico.';
  end if;
  select count(*) into v_n from trol3.escenarios e where e.id = any(p_escenarios) and e.persona_id = p_persona and e.autor_aliado_id = v_al.id;
  if v_n <> array_length(p_escenarios, 1) then raise exception 'escenario_ajeno' using hint = 'Sólo tus escenarios cerrados de esta persona.'; end if;
  v_nombre := coalesce(nullif(btrim(p_elaborado_por), ''), v_al.nombre);
  insert into trol3.diagnosticos (persona_id, escenario_ids, contenido, motor_version, creado_por, actualizado_por, autor_tipo, autor_aliado_id, elaborado_por)
  values (p_persona, p_escenarios, jsonb_build_object('hechos', coalesce(p_hechos, '{}'::jsonb), 'narrativa', '{}'::jsonb, 'acuerdos', ''), p_motor_version, null, null, 'aliado', v_al.id, v_nombre)
  returning id into v_id;
  perform trol3.registrar_interaccion(p_persona, 'nota', 'aliado', v_al.id, 'interna',
    'El aliado abrió un diagnóstico en su calculadora (elaborado por ' || v_nombre || ')', false, jsonb_build_object('diagnostico_id', v_id, 'aliado_id', v_al.id));
  return v_id;
end $$;
grant execute on function trol3.abrir_diagnostico_aliado(uuid, uuid[], jsonb, text, text) to authenticated;

-- La app corre el redactor con su llave y entrega con la sesión del aliado: sólo sobre SU diagnóstico.
create or replace function trol3.entregar_diagnostico_aliado(p_diagnostico uuid, p_narrativa jsonb default null, p_redactor text default null, p_prompt_version text default null, p_instrucciones_version int default null)
returns jsonb language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare v_al uuid; v_persona uuid;
begin
  v_al := trol3.current_aliado_id();
  if v_al is null then raise exception 'no_autorizado'; end if;
  update trol3.diagnosticos
     set contenido = contenido || case when p_narrativa is null then '{}'::jsonb else jsonb_build_object('narrativa', coalesce(contenido->'narrativa','{}'::jsonb) || p_narrativa) end,
         redactor = coalesce(p_redactor, redactor),
         prompt_version = coalesce(p_prompt_version, prompt_version),
         instrucciones_version = coalesce(p_instrucciones_version, instrucciones_version),
         estado = 'entregado', entregado_en = coalesce(entregado_en, now()), actualizado_en = now()
   where id = p_diagnostico and autor_aliado_id = v_al and autor_tipo = 'aliado'
  returning persona_id into v_persona;
  if v_persona is null then raise exception 'diagnostico_no_encontrado'; end if;
  perform trol3.registrar_interaccion(v_persona, 'nota', 'aliado', v_al, 'interna', 'El aliado generó su diagnóstico (no revisado por Trol)', false, jsonb_build_object('diagnostico_id', p_diagnostico));
  return jsonb_build_object('ok', true, 'persona_id', v_persona);
end $$;
grant execute on function trol3.entregar_diagnostico_aliado(uuid, jsonb, text, text, int) to authenticated;

-- Lo que el aliado puede leer de sus diagnósticos (narrativa para pintar/PDF).
drop policy if exists diagnosticos_lectura_aliado on trol3.diagnosticos;
create policy diagnosticos_lectura_aliado on trol3.diagnosticos for select
  using (autor_aliado_id is not null and autor_aliado_id = trol3.current_aliado_id());

-- ───────────────────────── Revisión de Trol (10 cr) ─────────────────────────
create or replace function trol3.pedir_revision_trol(p_diagnostico uuid, p_nota text default null)
returns jsonb language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare v_al record; d record; v_prod record; v_part record; v_nuevo int; v_orden uuid; v_resp uuid; v_persona text;
begin
  select a.id, a.nombre, a.partner_id into v_al from trol3.aliados a where a.id = trol3.current_aliado_id();
  if v_al.id is null then raise exception 'no_autorizado'; end if;
  if v_al.partner_id is null then raise exception 'sin_wallet'; end if;
  select * into d from trol3.diagnosticos where id = p_diagnostico and autor_aliado_id = v_al.id;
  if d.id is null then raise exception 'diagnostico_no_encontrado'; end if;
  if d.estado <> 'entregado' then raise exception 'diagnostico_sin_entregar'; end if;
  if d.revision_pedida_en is not null then return jsonb_build_object('ok', true, 'repetida', true, 'orden', d.revision_orden_id); end if;

  select codigo, nombre, precio_creditos into v_prod from trol3.productos where codigo = 'revision_trol' and activo;
  select id, balance_credits into v_part from public.partners where id = v_al.partner_id for update;
  if coalesce(v_part.balance_credits, 0) < v_prod.precio_creditos then raise exception 'saldo_insuficiente'; end if;
  v_nuevo := v_part.balance_credits - v_prod.precio_creditos;
  update public.partners set balance_credits = v_nuevo, updated_at = now() where id = v_part.id;
  select trim(coalesce(nombre,'')||' '||coalesce(apellidos,'')) into v_persona from trol3.personas where id = d.persona_id;

  insert into trol3.ordenes (persona_id, partner_id, producto, monto, creditos_aplicados, estado, payment_provider, paid_at, metadata)
  values (d.persona_id, v_al.partner_id, 'revision_trol', v_prod.precio_creditos * 20, v_prod.precio_creditos, 'pagada', 'creditos_aliado', now(),
          jsonb_build_object('aliado_id', v_al.id, 'aliado', v_al.nombre, 'diagnostico_id', d.id, 'nota', p_nota))
  returning id into v_orden;
  insert into public.wallet_transactions (partner_id, type, credits_delta, balance_credits_after, notes)
  values (v_part.id, 'charge', -v_prod.precio_creditos, v_nuevo, format('%s para %s · aliado %s · orden %s', v_prod.nombre, v_persona, v_al.nombre, v_orden));

  update trol3.diagnosticos set revision_pedida_en = now(), revision_orden_id = v_orden where id = d.id;

  select coalesce(e.cabecera_id, '0dfd18d7-2b1e-4627-905e-6f75d347cbcf'::uuid) into v_resp from trol3.v_expediente e where e.persona_id = d.persona_id;
  insert into trol3.tareas (persona_id, titulo, detalle, responsable_id, vence_el, estado, origen, origen_id)
  values (d.persona_id, 'Revisar diagnóstico elaborado por ' || coalesce(d.elaborado_por, v_al.nombre) || ' (' || v_al.nombre || ')',
          format('El aliado pagó %s créditos (quedan %s) para que Trol revise su diagnóstico. Abrir el diagnóstico en el expediente, corregir lo que haga falta y volver a entregarlo: queda firmado como revisado por Trol.%s',
                 v_prod.precio_creditos, v_nuevo, case when p_nota is not null then ' Nota del aliado: ' || p_nota else '' end),
          coalesce(v_resp, '0dfd18d7-2b1e-4627-905e-6f75d347cbcf'::uuid), current_date + 2, 'pendiente', 'aliado_revision', d.id);
  begin
    perform trol3.emitir_evento(d.persona_id, 'revision_trol_pedida', 'aliado', null, jsonb_build_object('diagnostico_id', d.id, 'orden', v_orden, 'aliado_id', v_al.id, 'creditos', v_prod.precio_creditos));
  exception when others then raise warning 'evento revision_trol_pedida no emitido: %', sqlerrm; end;
  return jsonb_build_object('ok', true, 'orden', v_orden, 'creditos_restantes', v_nuevo);
end $$;
grant execute on function trol3.pedir_revision_trol(uuid, text) to authenticated;

-- Cuando el equipo vuelve a entregar un diagnóstico del aliado con revisión pedida, queda re-firmado como revisado por Trol.
create or replace function trol3.estado_diagnostico(p_diagnostico uuid, p_estado text)
returns void language plpgsql security definer set search_path to 'trol3', 'public' as $function$
declare v_yo uuid; v_persona uuid; v_autor text; v_rev timestamptz;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null then raise exception 'no_autorizado'; end if;
  if p_estado not in ('borrador', 'revisado', 'entregado') then raise exception 'estado_invalido'; end if;

  update trol3.diagnosticos
     set estado = p_estado,
         entregado_en = case when p_estado = 'entregado' then coalesce(entregado_en, now()) end,
         actualizado_por = v_yo,
         autor_tipo = case when p_estado = 'entregado' and autor_tipo = 'aliado' and revision_pedida_en is not null then 'aliado_revisado' else autor_tipo end,
         revisado_por = case when p_estado = 'entregado' and autor_tipo = 'aliado' and revision_pedida_en is not null then v_yo else revisado_por end,
         revisado_en = case when p_estado = 'entregado' and autor_tipo = 'aliado' and revision_pedida_en is not null then now() else revisado_en end
   where id = p_diagnostico
  returning persona_id, autor_tipo, revision_pedida_en into v_persona, v_autor, v_rev;
  if v_persona is null then raise exception 'diagnostico_no_encontrado'; end if;

  if p_estado = 'entregado' then
    perform trol3.registrar_interaccion(v_persona, 'nota', 'asesor', v_yo, 'interna',
      case when v_autor = 'aliado_revisado' then 'Revisó y volvió a entregar el diagnóstico del aliado' else 'Entregó el diagnóstico avanzado' end,
      false, jsonb_build_object('diagnostico_id', p_diagnostico));
    if v_autor = 'aliado_revisado' then
      update trol3.tareas set estado = 'hecha', hecha_en = now(), hecha_por = v_yo, nota_cierre = 'Diagnóstico revisado y re-entregado'
       where origen = 'aliado_revision' and origen_id = p_diagnostico and estado = 'pendiente';
    end if;
  end if;
end $function$;

-- ───────────────────────── Compra de 20 cr: ya sin tarea al equipo ─────────────────────────
create or replace function trol3.comprar_asesoria_por_aliado(p_persona uuid, p_producto text)
returns jsonb language plpgsql security definer set search_path to 'trol3', 'public' as $function$
declare
  v_al record; v_prod record; v_part record; v_ref record;
  v_orden uuid; v_existe uuid; v_nuevo int; v_persona text; v_resp uuid;
begin
  select a.id, a.nombre, a.partner_id into v_al from trol3.aliados a where a.id = trol3.current_aliado_id();
  if v_al.id is null then raise exception 'no_autorizado'; end if;
  if v_al.partner_id is null then raise exception 'sin_wallet'; end if;
  if p_producto not in ('diagnostico_avanzado', 'diagnostico_avanzado_sesion') then raise exception 'producto_invalido'; end if;

  select r.id into v_ref from trol3.referidos r
   where r.persona_id = p_persona and r.aliado_id = v_al.id and r.estado = 'atribuido' and r.visible_para_aliado limit 1;
  if v_ref.id is null then raise exception 'referido_ajeno'; end if;

  select codigo, nombre, precio_creditos into v_prod from trol3.productos where codigo = p_producto and activo;
  if v_prod.precio_creditos is null then raise exception 'producto_sin_precio'; end if;

  select id into v_existe from trol3.ordenes
   where persona_id = p_persona and producto = p_producto and partner_id = v_al.partner_id and estado in ('pagada','cumplida') limit 1;
  if v_existe is not null then return jsonb_build_object('ok', true, 'orden', v_existe, 'repetida', true); end if;

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

  -- 302b · Los cálculos (20 cr) los hace el aliado en su calculadora: sin tarea al equipo. La completa (30) sí.
  if p_producto = 'diagnostico_avanzado_sesion' then
    select coalesce(e.cabecera_id, '0dfd18d7-2b1e-4627-905e-6f75d347cbcf'::uuid) into v_resp from trol3.v_expediente e where e.persona_id = p_persona;
    insert into trol3.tareas (persona_id, titulo, detalle, responsable_id, vence_el, estado, origen, origen_id)
    values (p_persona, 'Asesoría completa comprada por aliado: cálculos + agendar sesión',
            format('%s pagó "%s" con %s créditos (quedan %s). Cerrar el camino en la calculadora, entregar el diagnóstico y agendar la sesión con el cliente; el aliado lo ve en su portal al entregarlo.', v_al.nombre, v_prod.nombre, v_prod.precio_creditos, v_nuevo),
            coalesce(v_resp, '0dfd18d7-2b1e-4627-905e-6f75d347cbcf'::uuid), current_date + 2, 'pendiente', 'aliado_compra', v_orden);
  end if;

  begin
    perform trol3.emitir_evento(p_persona, 'asesoria_comprada_por_aliado', 'aliado', null,
      jsonb_build_object('orden', v_orden, 'producto', p_producto, 'aliado_id', v_al.id, 'creditos', v_prod.precio_creditos));
  exception when others then raise warning 'evento asesoria_comprada_por_aliado no emitido: %', sqlerrm; end;

  return jsonb_build_object('ok', true, 'orden', v_orden, 'creditos_restantes', v_nuevo);
end $function$;

-- ───────────────────────── Vista del portal ─────────────────────────
-- Se agregan columnas al final; la definición base es la de 302a.
create or replace view trol3.v_resultado_aliado as
with base as (
  select r.id as referido_id, r.persona_id, r.aliado_id, r.estado as estado_ref, r.creado_en as referido_en,
         p.nombre, p.apellidos, p.curp is not null as tiene_curp, p.etapa = 'precliente' as precliente,
         exists (select 1 from trol3.contactos c where c.persona_id = r.persona_id and c.tipo = 'telefono') as tiene_telefono,
         (select a.partner_id from trol3.aliados a where a.id = r.aliado_id) as partner_id,
         (select c.estado::text from trol3.consultas c where c.persona_id = r.persona_id and c.tipo = 'imss_historial' and c.estado <> 'cancelada' order by c.created_at desc limit 1) as consulta_estado,
         (select max(c.created_at) from trol3.consultas c where c.persona_id = r.persona_id and c.tipo = 'imss_historial' and c.estado <> 'cancelada') as consulta_en,
         (select c.creado_en from trol3.cobros_consulta_aliado c where c.persona_id = r.persona_id) as cobrado_en,
         (select jsonb_build_object('id', g.id, 'estado', g.estado, 'autor_tipo', g.autor_tipo, 'elaborado_por', g.elaborado_por, 'entregado_en', g.entregado_en,
                                    'revision_pedida_en', g.revision_pedida_en, 'revisado_en', g.revisado_en, 'es_mio', g.autor_aliado_id = r.aliado_id)
            from trol3.diagnosticos g where g.persona_id = r.persona_id order by g.estado = 'entregado' desc, g.creado_en desc limit 1) as diag
    from trol3.referidos r join trol3.personas p on p.id = r.persona_id
   where r.visible_para_aliado and (r.aliado_id = trol3.current_aliado_id() or trol3.es_miembro())
)
select b.referido_id, b.persona_id, b.estado_ref, b.referido_en, b.nombre, b.apellidos,
  case
    when b.estado_ref = 'por_revisar' then 'ya_cliente'
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
      where o.persona_id = b.persona_id and c.activo and o.estado in ('detectada','posible','presentada','interesada','en_proceso')) end as oportunidades,
  (select coalesce(jsonb_agg(jsonb_build_object('producto', o.producto, 'nombre', pr.nombre, 'en', o.paid_at) order by o.paid_at), '[]'::jsonb)
     from trol3.ordenes o join trol3.productos pr on pr.codigo = o.producto
    where o.persona_id = b.persona_id and o.estado in ('pagada','cumplida') and b.partner_id is not null and o.partner_id = b.partner_id) as compras,
  case when exists (select 1 from trol3.diagnosticos d where d.persona_id = b.persona_id and d.estado = 'entregado') then 'listo'
       when exists (select 1 from trol3.diagnosticos d where d.persona_id = b.persona_id and d.estado in ('borrador','revisado')) then 'en_elaboracion' end as diagnostico_estado,
  (select d.id from trol3.documentos d where d.persona_id = b.persona_id and d.tipo = 'diagnostico_avanzado' order by d.created_at desc limit 1) as diagnostico_doc_id,
  (select min(c.inicio) from trol3.citas c where c.persona_id = b.persona_id and c.inicio > now() and c.estado <> 'cancelada') as proxima_sesion,
  b.precliente, b.tiene_telefono, b.tiene_curp, b.consulta_en, b.cobrado_en,
  (b.estado_ref = 'atribuido' and e.semanas is null and (not b.tiene_curp or b.consulta_estado in ('error','sin_resultado')
     or (b.consulta_estado in ('solicitada','en_proceso') and b.consulta_en < now() - interval '1 day')
     or trol3.proveedor_en_rojo('jordan'))) as sugerir_sisec,
  -- 302b
  (b.estado_ref = 'atribuido' and trol3.aliado_puede_calcular(b.persona_id, b.aliado_id)) as calculadora_desbloqueada,
  (b.diag ->> 'id')::uuid as diagnostico_id,
  b.diag ->> 'autor_tipo' as diagnostico_autor,
  b.diag ->> 'elaborado_por' as elaborado_por,
  (b.diag ->> 'revision_pedida_en')::timestamptz as revision_pedida_en,
  (b.diag ->> 'revisado_en')::timestamptz as revisado_en
from base b
left join lateral trol3.expediente_aliado(b.persona_id) e(edad, ley, semanas, status_empleo, conserva_derechos, fin_conservacion, afore_actual,
  pension_base, pension_maxima, saldo_rcv97, saldo_infonavit, infonavit_monto_credito, credito_infonavit_vigente, inconsistencia_imss, consultas_fallidas, cabecera_id) on true;
