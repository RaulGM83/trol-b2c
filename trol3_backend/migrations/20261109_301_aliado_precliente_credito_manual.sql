-- 301 — Experiencia de aliado modelo Resag (Raúl, 9-nov-2026: "de acuerdo, arranca"). Detalle en claude/118.
--
-- 1) Alta por aliado v2 (alta_por_aliado_v2): nombre obligatorio, CURP y/o NSS, teléfono OPCIONAL. Sin teléfono la
--    persona entra como PRECLIENTE (personas.etapa = 'precliente'): sin contacto, sin cabecera, fuera de la cartera;
--    la cabecera del aliado recibe una tarea "Precliente de {aliado}" para dar seguimiento con el aliado primero.
--    Al agregar el teléfono (agregar_telefono_por_aliado) pasa a 'nuevo', se le asigna cabecera (misma regla que
--    tg_referido_cabecera, ahora en asignar_cabecera_por_referido) y entra al flujo normal.
-- 2) Un crédito por persona: las dos consultas (Jordan + Precalix) salen en automático y se descuenta UN crédito del
--    wallet del aliado cuando llega el primer resultado útil (semanas_cotizadas o saldo_infonavit capa validado,
--    incluye SISEC subido por el aliado) — trigger cobro_consulta_aliado sobre trol3.datos, tabla
--    cobros_consulta_aliado. Nunca dos veces, nunca si nada respondió. Los referidos anteriores no se cobran
--    (referidos.cobra_consulta = false). El alta se niega sin crédito disponible
--    (creditos_disponibles_aliado = saldo del wallet − altas pendientes de cobrar).
-- 3) Camino mínimo (capturar_infonavit_por_aliado): a los 2 minutos de pedir Infonavit sin resultado de Precalix, el
--    aliado captura saldo de vivienda + salario mensual + "está cotizando". Van a `datos` capa declarado con actor
--    aliado (_declarar_aliado, porque trol3.declarar rechaza al aliado autenticado); la cotización sale preliminar
--    "con datos capturados por {aliado}" y Precalix la pisa al llegar (validado manda).
-- 4) v_infonavit_aliado: resultado 'capturado', saldo_capa, salario_mensual_declarado, manual_desde, puede_capturar,
--    precliente, tiene_telefono, cobrado_en. v_resultado_aliado: precliente, tiene_telefono, sugerir_sisec.
-- Aplicada por MCP el 9-nov-2026 (el SQL aplicado es idéntico salvo este encabezado).

alter table trol3.referidos add column if not exists cobra_consulta boolean not null default false;
alter table trol3.referidos add column if not exists manual_capturado_en timestamptz;
comment on column trol3.referidos.cobra_consulta is 'Alta v2 (301): se descuenta 1 crédito al aliado cuando llegue el primer resultado (semanas o saldo Infonavit).';
comment on column trol3.referidos.manual_capturado_en is 'Cuándo el aliado capturó saldo/salario a mano porque Precalix no respondió (301).';

create table if not exists trol3.cobros_consulta_aliado (
  persona_id uuid primary key references trol3.personas(id) on delete cascade,
  referido_id uuid references trol3.referidos(id) on delete set null,
  aliado_id uuid references trol3.aliados(id),
  partner_id uuid,
  campo_disparador text,
  creditos int not null default 1,
  saldo_despues int,
  creado_en timestamptz not null default now()
);
comment on table trol3.cobros_consulta_aliado is 'Un crédito por persona cobrado al aliado al llegar el primer resultado de consulta (301).';
alter table trol3.cobros_consulta_aliado enable row level security;
drop policy if exists cobros_consulta_aliado_lectura on trol3.cobros_consulta_aliado;
create policy cobros_consulta_aliado_lectura on trol3.cobros_consulta_aliado for select
  using (trol3.es_miembro() or aliado_id = trol3.current_aliado_id());
grant select on trol3.cobros_consulta_aliado to authenticated;

create or replace function trol3.creditos_disponibles_aliado(p_aliado uuid)
returns int language sql stable security definer set search_path to 'trol3', 'public' as $$
  select coalesce((select p.balance_credits from trol3.aliados a join public.partners p on p.id = a.partner_id where a.id = p_aliado), 0)
       - (select count(*)::int from trol3.referidos r
           where r.aliado_id = p_aliado and r.cobra_consulta and r.estado = 'atribuido'
             and not exists (select 1 from trol3.cobros_consulta_aliado c where c.persona_id = r.persona_id));
$$;
grant execute on function trol3.creditos_disponibles_aliado(uuid) to authenticated;

create or replace function trol3.asignar_cabecera_por_referido(p_referido uuid)
returns boolean language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare r record; v_cab uuid; v_nombre text; v_aliado text;
begin
  select * into r from trol3.referidos where id = p_referido;
  if r.id is null or r.estado <> 'atribuido' then return false; end if;
  select a.cabecera_id, a.nombre into v_cab, v_aliado from trol3.aliados a where a.id = r.aliado_id and a.activo;
  if v_cab is null then return false; end if;
  if not exists (select 1 from trol3.miembros m where m.id = v_cab and coalesce(m.activo, true)) then return false; end if;

  update trol3.personas set cabecera_id = v_cab where id = r.persona_id and cabecera_id is null and merged_into is null;
  if not found then return false; end if;
  update trol3.oportunidades set dueno_id = v_cab
   where persona_id = r.persona_id and dueno_id is null and estado not in ('ganada','perdida','no_aplica');

  select nombre into v_nombre from trol3.miembros where id = v_cab;
  begin
    perform trol3.nota_interna_sistema(r.persona_id,
      'Asignado a ' || coalesce(v_nombre, '?') || ' por ser referido de ' || coalesce(v_aliado, 'aliado'),
      jsonb_build_object('via', 'asignar_cabecera_por_referido', 'aliado_id', r.aliado_id, 'a', v_cab));
    perform trol3.emitir_evento(r.persona_id, 'cabecera_cambiada', 'sistema', null,
      jsonb_build_object('de', null, 'a', v_cab, 'a_nombre', v_nombre, 'motivo', 'aliado', 'aliado_id', r.aliado_id));
  exception when others then
    raise warning 'asignar_cabecera_por_referido: nota/evento no registrado: %', sqlerrm;
  end;
  return true;
end $$;

create or replace function trol3.tg_referido_cabecera()
returns trigger language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare v_etapa text; v_cab uuid; v_aliado text; v_nombre text;
begin
  if new.estado <> 'atribuido' then return new; end if;
  select etapa, trim(coalesce(nombre,'')||' '||coalesce(apellidos,'')) into v_etapa, v_nombre from trol3.personas where id = new.persona_id;
  if v_etapa = 'precliente' then
    -- Sin teléfono no entra a cartera: la cabecera del aliado recibe la tarea de darle seguimiento CON el aliado.
    select a.cabecera_id, a.nombre into v_cab, v_aliado from trol3.aliados a where a.id = new.aliado_id;
    v_cab := coalesce(v_cab, '0dfd18d7-2b1e-4627-905e-6f75d347cbcf'::uuid);
    insert into trol3.tareas (persona_id, titulo, detalle, responsable_id, vence_el, estado, origen, origen_id)
    values (new.persona_id,
            'Precliente de ' || coalesce(v_aliado, 'aliado') || ': ' || coalesce(nullif(v_nombre,''), 'sin nombre'),
            'Alta sin teléfono. Las consultas salen solas; dar seguimiento con el aliado para conseguir el teléfono o cerrar. Al agregar teléfono pasa a cartera.',
            v_cab, current_date + 3, 'pendiente', 'aliado_precliente', new.id);
    return new;
  end if;
  perform trol3.asignar_cabecera_por_referido(new.id);
  return new;
end $$;

create or replace function trol3.alta_por_aliado_v2(p_nombre text, p_curp text default null, p_nss text default null,
                                                     p_tel text default null, p_consentimiento text default null)
returns jsonb language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare v_aliado uuid; v_nombre text; v_curp text; v_nss text; t10 text; pid uuid; nueva boolean := false;
        v_otra uuid; v_suya text; cod text; v_ref uuid; v_disp int; v_prog boolean; v_precliente boolean;
begin
  v_aliado := trol3.current_aliado_id();
  if v_aliado is null then raise exception 'no_autorizado'; end if;
  if coalesce(btrim(coalesce(p_consentimiento, '')), '') = '' then raise exception 'falta_consentimiento'; end if;

  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');
  if v_nombre is null or length(v_nombre) < 3 then raise exception 'falta_nombre'; end if;

  v_curp := nullif(upper(btrim(coalesce(p_curp, ''))), '');
  if v_curp is not null and v_curp !~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2}$' then raise exception 'curp_invalida'; end if;
  v_nss := nullif(regexp_replace(coalesce(p_nss, ''), '\D', '', 'g'), '');
  if v_nss is not null and v_nss !~ '^\d{11}$' then raise exception 'nss_invalido'; end if;
  if v_curp is null and v_nss is null then raise exception 'falta_curp_o_nss'; end if;

  t10 := nullif(trol3.tel10(coalesce(p_tel, '')), '');
  if t10 is not null and length(t10) < 10 then raise exception 'telefono_invalido'; end if;
  v_precliente := t10 is null;

  select programa_infonavit into v_prog from trol3.aliados where id = v_aliado and activo;
  if v_prog is null then raise exception 'no_autorizado'; end if;

  -- Un crédito por persona: sin crédito disponible no hay alta.
  v_disp := trol3.creditos_disponibles_aliado(v_aliado);
  if v_disp < 1 then raise exception 'sin_creditos'; end if;

  perform pg_advisory_xact_lock(hashtext('trol3:alta:' || coalesce(t10, v_curp, v_nss)));

  -- ¿Ya existe? Por teléfono, CURP o NSS (en ese orden); nunca se mezclan dos personas.
  pid := case when t10 is not null then trol3.persona_por_telefono(t10) end;
  if v_curp is not null then
    select id into v_otra from trol3.personas where curp = v_curp and merged_into is null limit 1;
    if v_otra is not null and pid is not null and v_otra <> pid then raise exception 'curp_de_otra_persona'; end if;
    pid := coalesce(pid, v_otra);
  end if;
  if v_nss is not null then
    select id into v_otra from trol3.personas where nss = v_nss and merged_into is null limit 1;
    if v_otra is not null and pid is not null and v_otra <> pid then raise exception 'nss_de_otra_persona'; end if;
    pid := coalesce(pid, v_otra);
  end if;
  if pid is not null then
    select curp into v_suya from trol3.personas where id = pid;
    if v_curp is not null and v_suya is not null and v_suya <> v_curp then raise exception 'telefono_de_otra_persona'; end if;
    select nss into v_suya from trol3.personas where id = pid;
    if v_nss is not null and v_suya is not null and v_suya <> v_nss then raise exception 'nss_de_otra_persona'; end if;
  end if;

  if pid is null then
    select ci.codigo into cod from trol3.codigos_invitacion ci where ci.aliado_id = v_aliado order by ci.activo desc, ci.created_at limit 1;
    insert into trol3.personas (nombre, curp, nss, canal_origen, campania_origen, codigo_origen, etapa)
    values (v_nombre, v_curp, v_nss, 'aliado', cod, cod, case when v_precliente then 'precliente' else 'nuevo' end)
    returning id into pid;
    if t10 is not null then
      insert into trol3.contactos (persona_id, tipo, valor, normalizado, principal) values (pid, 'telefono', t10, t10, true);
    end if;
    nueva := true;
  else
    -- Sólo rellena huecos.
    update trol3.personas set nombre = coalesce(nombre, v_nombre), curp = coalesce(curp, v_curp), nss = coalesce(nss, v_nss) where id = pid;
    if t10 is not null and not exists (select 1 from trol3.contactos c where c.persona_id = pid and c.tipo = 'telefono' and c.normalizado = t10) then
      insert into trol3.contactos (persona_id, tipo, valor, normalizado, principal)
      values (pid, 'telefono', t10, t10, not exists (select 1 from trol3.contactos c where c.persona_id = pid and c.tipo = 'telefono'));
    end if;
    v_precliente := (select etapa = 'precliente' from trol3.personas where id = pid);
  end if;

  v_ref := trol3.registrar_referido(v_aliado, pid, 'alta_manual');
  update trol3.referidos
     set consentimiento_texto = btrim(p_consentimiento),
         consentimiento_en = coalesce(consentimiento_en, now()),
         pide_infonavit_en = coalesce(pide_infonavit_en, now()),
         cobra_consulta = case when nueva then true else cobra_consulta end
   where id = v_ref;

  -- Era precliente y ahora llegó con teléfono: pasa a cartera.
  if not nueva and v_precliente and t10 is not null then
    update trol3.personas set etapa = 'nuevo' where id = pid;
    perform trol3.asignar_cabecera_por_referido(v_ref);
    update trol3.tareas set estado = 'hecha', hecha_en = now(), nota_cierre = 'Llegó el teléfono en una nueva alta del aliado.'
     where origen = 'aliado_precliente' and persona_id = pid and estado = 'pendiente';
    v_precliente := false;
  end if;

  perform trol3.emitir_evento(pid, 'alta_por_aliado', 'aliado', null,
    jsonb_build_object('aliado_id', v_aliado, 'nueva', nueva, 'con_curp', v_curp is not null, 'con_nss', v_nss is not null,
                       'precliente', v_precliente, 'v2', true));

  return jsonb_build_object('persona_id', pid, 'nueva', nueva, 'referido_id', v_ref, 'curp', v_curp, 'nss', v_nss,
    'precliente', v_precliente, 'estado', (select estado from trol3.referidos where id = v_ref),
    'creditos_disponibles', trol3.creditos_disponibles_aliado(v_aliado));
end $$;
grant execute on function trol3.alta_por_aliado_v2(text,text,text,text,text) to authenticated;

create or replace function trol3.agregar_telefono_por_aliado(p_persona uuid, p_tel text)
returns jsonb language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare v_aliado uuid; t10 text; v_otra uuid; v_ref uuid; v_etapa text; v_asignada boolean := false;
begin
  v_aliado := trol3.current_aliado_id();
  if v_aliado is null then raise exception 'no_autorizado'; end if;
  select id into v_ref from trol3.referidos where persona_id = p_persona and aliado_id = v_aliado and estado = 'atribuido' and visible_para_aliado limit 1;
  if v_ref is null then raise exception 'referido_ajeno'; end if;
  t10 := trol3.tel10(coalesce(p_tel, ''));
  if length(t10) < 10 then raise exception 'telefono_invalido'; end if;
  v_otra := trol3.persona_por_telefono(t10);
  if v_otra is not null and v_otra <> p_persona then raise exception 'telefono_de_otra_persona'; end if;

  if v_otra is null then
    insert into trol3.contactos (persona_id, tipo, valor, normalizado, principal)
    values (p_persona, 'telefono', t10, t10, not exists (select 1 from trol3.contactos c where c.persona_id = p_persona and c.tipo = 'telefono'));
  end if;
  select etapa into v_etapa from trol3.personas where id = p_persona;
  if v_etapa = 'precliente' then
    update trol3.personas set etapa = 'nuevo' where id = p_persona;
    v_asignada := trol3.asignar_cabecera_por_referido(v_ref);
    update trol3.tareas set estado = 'hecha', hecha_en = now(), nota_cierre = 'El aliado agregó el teléfono; pasa a cartera.'
     where origen = 'aliado_precliente' and origen_id = v_ref and estado = 'pendiente';
    perform trol3.emitir_evento(p_persona, 'precliente_con_telefono', 'aliado', null, jsonb_build_object('aliado_id', v_aliado, 'cabecera_asignada', v_asignada));
  end if;
  return jsonb_build_object('ok', true, 'telefono', t10, 'cabecera_asignada', v_asignada);
end $$;
grant execute on function trol3.agregar_telefono_por_aliado(uuid, text) to authenticated;

-- Escribe en datos capa declarado con actor aliado, igual que trol3.declarar lo haría (visibilidad, vigencia, pagado_por).
-- declarar() rechaza al aliado autenticado (auth.uid() no miembro), por eso existe esta variante interna.
create or replace function trol3._declarar_aliado(p_persona uuid, p_aliado uuid, p_campo text, p_valor jsonb)
returns bigint language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare cc record; did bigint; vis text[];
begin
  select * into cc from trol3.catalogo_campos where campo = p_campo;
  if not found then raise exception 'campo_desconocido: %', p_campo; end if;
  vis := (case when cc.visible_cliente then '{trol,cliente}'::text[] else '{trol}'::text[] end) || ('aliado:' || p_aliado::text);
  insert into trol3.datos (persona_id, campo, valor, capa, origen_tipo, origen_id, obtenido_en, vigente_hasta, pagado_por, visibilidad)
  values (p_persona, p_campo, p_valor, 'declarado', 'aliado', p_aliado, now(),
          case when cc.vigencia_dias is not null and cc.prioridad_capa is not null then now() + (cc.vigencia_dias || ' days')::interval end,
          'aliado:' || p_aliado::text, vis)
  returning id into did;
  return did;
end $$;

create or replace function trol3.capturar_infonavit_por_aliado(p_persona uuid, p_saldo numeric, p_salario_mensual numeric, p_cotiza boolean)
returns jsonb language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare v_aliado uuid; v_ref record; v_desde timestamptz;
begin
  v_aliado := trol3.current_aliado_id();
  if v_aliado is null then raise exception 'no_autorizado'; end if;
  select * into v_ref from trol3.referidos where persona_id = p_persona and aliado_id = v_aliado and estado = 'atribuido' and visible_para_aliado limit 1;
  if v_ref.id is null then raise exception 'referido_ajeno'; end if;
  if v_ref.pide_infonavit_en is null then raise exception 'sin_solicitud_infonavit'; end if;
  v_desde := v_ref.pide_infonavit_en + interval '2 minutes';
  if now() < v_desde then raise exception 'todavia_no'; end if;
  if exists (select 1 from trol3.datos d where d.persona_id = p_persona and d.campo = 'saldo_infonavit' and d.capa = 'validado'
              and (d.vigente_hasta is null or d.vigente_hasta > now())) then
    raise exception 'ya_hay_resultado';
  end if;
  if p_saldo is null or p_saldo < 0 or p_saldo > 5000000 then raise exception 'saldo_invalido'; end if;
  if p_salario_mensual is null or p_salario_mensual < 0 or p_salario_mensual > 500000 then raise exception 'salario_invalido'; end if;

  perform trol3._declarar_aliado(p_persona, v_aliado, 'saldo_infonavit', to_jsonb(round(p_saldo, 2)));
  perform trol3._declarar_aliado(p_persona, v_aliado, 'relacion_laboral_vigente', to_jsonb(coalesce(p_cotiza, false)));
  if p_salario_mensual > 0 then
    perform trol3._declarar_aliado(p_persona, v_aliado, 'salario_diario', to_jsonb(round(p_salario_mensual / 30.4, 2)));
  end if;
  update trol3.referidos set manual_capturado_en = now() where id = v_ref.id;
  begin
    perform trol3.nota_interna_sistema(p_persona,
      format('Aliado capturó datos Infonavit a mano (Precalix sin respuesta): saldo $%s, salario mensual $%s, %s.',
             to_char(p_saldo, 'FM999,999,999'), to_char(p_salario_mensual, 'FM999,999,999'), case when p_cotiza then 'cotizando' else 'sin cotizar' end),
      jsonb_build_object('via', 'capturar_infonavit_por_aliado', 'aliado_id', v_aliado));
    perform trol3.emitir_evento(p_persona, 'aliado_capturo_infonavit', 'aliado', null,
      jsonb_build_object('aliado_id', v_aliado, 'saldo', p_saldo, 'salario_mensual', p_salario_mensual, 'cotiza', p_cotiza));
  exception when others then raise warning 'capturar_infonavit_por_aliado: nota/evento: %', sqlerrm; end;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function trol3.capturar_infonavit_por_aliado(uuid, numeric, numeric, boolean) to authenticated;

create or replace function trol3.tg_cobro_consulta_aliado()
returns trigger language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare v_ref record; v_part record; v_nuevo int; v_persona text;
begin
  if new.capa <> 'validado' or new.campo not in ('semanas_cotizadas', 'saldo_infonavit') then return new; end if;
  if exists (select 1 from trol3.cobros_consulta_aliado c where c.persona_id = new.persona_id) then return new; end if;
  select r.id, r.aliado_id, a.nombre aliado, a.partner_id into v_ref
    from trol3.referidos r join trol3.aliados a on a.id = r.aliado_id
   where r.persona_id = new.persona_id and r.cobra_consulta and r.estado = 'atribuido'
   order by r.creado_en limit 1;
  if v_ref.id is null or v_ref.partner_id is null then return new; end if;

  begin
    select id, balance_credits into v_part from public.partners where id = v_ref.partner_id for update;
    v_nuevo := coalesce(v_part.balance_credits, 0) - 1;
    update public.partners set balance_credits = v_nuevo, updated_at = now() where id = v_part.id;
    select trim(coalesce(nombre,'')||' '||coalesce(apellidos,'')) into v_persona from trol3.personas where id = new.persona_id;
    insert into trol3.cobros_consulta_aliado (persona_id, referido_id, aliado_id, partner_id, campo_disparador, creditos, saldo_despues)
    values (new.persona_id, v_ref.id, v_ref.aliado_id, v_ref.partner_id, new.campo, 1, v_nuevo);
    insert into public.wallet_transactions (partner_id, type, credits_delta, balance_credits_after, notes)
    values (v_part.id, 'charge', -1, v_nuevo,
            format('Consulta de %s · aliado %s · primer resultado: %s', coalesce(nullif(v_persona,''), new.persona_id::text), v_ref.aliado,
                   case new.campo when 'semanas_cotizadas' then 'semanas IMSS' else 'saldo Infonavit' end));
    perform trol3.emitir_evento(new.persona_id, 'consulta_cobrada_a_aliado', 'sistema', null,
      jsonb_build_object('aliado_id', v_ref.aliado_id, 'campo', new.campo, 'creditos', 1, 'saldo_despues', v_nuevo));
  exception when others then
    raise warning 'tg_cobro_consulta_aliado: no se cobró (%): %', new.persona_id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists cobro_consulta_aliado on trol3.datos;
create trigger cobro_consulta_aliado after insert on trol3.datos for each row
  when (new.capa = 'validado' and new.campo in ('semanas_cotizadas', 'saldo_infonavit'))
  execute function trol3.tg_cobro_consulta_aliado();

-- ───────────────────────── Vistas del portal (mismas columnas + las de 301 al final) ─────────────────────────
create or replace view trol3.v_infonavit_aliado as
with base as (
  select r.id as referido_id, r.persona_id, r.estado as estado_ref, r.pide_infonavit_en, r.manual_capturado_en,
         p.nombre, p.apellidos, p.nss is not null as tiene_nss, p.curp is not null as tiene_curp,
         p.etapa = 'precliente' as precliente,
         exists (select 1 from trol3.contactos c where c.persona_id = r.persona_id and c.tipo = 'telefono') as tiene_telefono,
         (select c.estado::text from trol3.consultas c where c.persona_id = r.persona_id and c.tipo = 'infonavit' and c.estado <> 'cancelada' order by c.created_at desc limit 1) as consulta_estado,
         (select (d.valor #>> '{}')::numeric from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'saldo_infonavit' and d.capa = 'validado' order by d.obtenido_en desc limit 1) as saldo_val,
         (select (d.valor #>> '{}')::numeric from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'saldo_infonavit' and d.capa = 'declarado' and d.origen_tipo = 'aliado' order by d.obtenido_en desc limit 1) as saldo_dec,
         (select round((d.valor #>> '{}')::numeric * 30.4) from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'salario_diario' and d.capa = 'declarado' and d.origen_tipo = 'aliado' order by d.obtenido_en desc limit 1) as salario_dec,
         (select (d.valor #>> '{}')::boolean from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'relacion_laboral_vigente' and d.capa = 'declarado' and d.origen_tipo = 'aliado' order by d.obtenido_en desc limit 1) as relacion_dec,
         (select (d.valor #>> '{}')::numeric from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'infonavit_monto_credito' and d.capa = 'validado' order by d.obtenido_en desc limit 1) as monto_credito,
         (select max(d.obtenido_en) from trol3.datos d where d.persona_id = r.persona_id and d.campo in ('saldo_infonavit','credito_infonavit_vigente','relacion_laboral_vigente') and d.capa = 'validado') as precalificado_en,
         exists (select 1 from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'credito_infonavit_vigente' and d.capa = 'validado' and d.valor = 'true'::jsonb) as cred_vig,
         (select (d.valor #>> '{}')::boolean from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'relacion_laboral_vigente' and d.capa = 'validado' order by d.obtenido_en desc limit 1) as relacion,
         (select jsonb_build_object('etapa', o.etapa_infonavit, 'en', o.etapa_infonavit_en, 'fechas', coalesce(o.tramite_infonavit -> 'fechas', '{}'::jsonb),
                 'casa', o.tramite_infonavit ->> 'casa', 'desarrollo', coalesce(pr.nombre_comercial, o.tramite_infonavit ->> 'desarrollo', pr.desarrollo),
                 'ubicacion', pr.ubicacion_comercial, 'conyugal', coalesce((o.tramite_infonavit ->> 'conyugal')::boolean, false), 'co_titular', o.tramite_infonavit ->> 'co_titular',
                 'comision', (select cm.estado from trol3.comisiones cm where cm.oportunidad_id = o.id and cm.estado <> 'cancelada' order by cm.creado_en desc limit 1))
            from trol3.oportunidades o left join trol3.proyectos_inmobiliarios pr on pr.id = o.proyecto_id
           where o.persona_id = r.persona_id and o.codigo in ('compra_inmueble','inversion_inmueble') and o.etapa_infonavit is not null
           order by o.etapa_infonavit_en desc nulls last limit 1) as tramite,
         (select coalesce(jsonb_agg(distinct d.tipo), '[]'::jsonb) from trol3.documentos d where d.persona_id = r.persona_id
           and d.tipo in ('identificacion','curp_doc','acta_nacimiento','acta_matrimonio','constancia_fiscal','comprobante_domicilio','recibo_nomina')) as docs,
         (select c.creado_en from trol3.cobros_consulta_aliado c where c.persona_id = r.persona_id) as cobrado_en
    from trol3.referidos r join trol3.personas p on p.id = r.persona_id
   where r.pide_infonavit_en is not null and r.visible_para_aliado and (r.aliado_id = trol3.current_aliado_id() or trol3.es_miembro())
)
select referido_id, persona_id, estado_ref, pide_infonavit_en, nombre, apellidos,
  case
    when estado_ref = 'por_revisar' then 'ya_cliente'
    when (tramite ->> 'etapa') is not null then 'en_tramite'
    when saldo_val is null and saldo_dec is not null and relacion_dec is false then 'sin_relacion'
    when saldo_val is null and saldo_dec is not null and saldo_dec < 100000 then 'saldo_bajo'
    when saldo_val is null and saldo_dec is not null then 'capturado'
    when consulta_estado in ('solicitada','en_proceso') then 'procesando'
    when cred_vig then 'credito_vigente'
    when relacion is false then 'sin_relacion'
    when saldo_val is not null and saldo_val < 100000 then 'saldo_bajo'
    when monto_credito is not null and saldo_val is not null then 'con_monto'
    when consulta_estado = 'sin_resultado' then 'no_califica'
    when not tiene_nss and tiene_curp then 'buscando_nss'
    when not tiene_nss then 'falta_nss'
    else 'procesando' end as resultado,
  case when estado_ref = 'por_revisar' then null else coalesce(saldo_val, saldo_dec) end as saldo,
  case when estado_ref = 'por_revisar' then null else monto_credito end as monto_credito,
  precalificado_en,
  case when estado_ref = 'por_revisar' then null else coalesce(tramite ->> 'etapa', case when monto_credito is not null and saldo_val >= 100000 then 'precalificado' end) end as etapa,
  case when estado_ref = 'por_revisar' then null else (tramite ->> 'en')::timestamptz end as etapa_en,
  case when estado_ref = 'por_revisar' then '[]'::jsonb else docs end as docs,
  case when estado_ref = 'por_revisar' then '{}'::jsonb else coalesce(tramite -> 'fechas', '{}'::jsonb) end as fechas,
  case when estado_ref = 'por_revisar' then null else tramite ->> 'desarrollo' end as inmueble,
  case when estado_ref = 'por_revisar' then null else tramite ->> 'ubicacion' end as inmueble_ubicacion,
  case when estado_ref = 'por_revisar' then null else tramite ->> 'casa' end as casa,
  case when estado_ref = 'por_revisar' then false else coalesce((tramite ->> 'conyugal')::boolean, false) end as conyugal,
  case when estado_ref = 'por_revisar' then null else tramite ->> 'co_titular' end as co_titular,
  case when estado_ref = 'por_revisar' then null else tramite ->> 'comision' end as comision_estado,
  -- 301
  case when estado_ref = 'por_revisar' then null when saldo_val is not null then 'validado' when saldo_dec is not null then 'declarado' end as saldo_capa,
  case when estado_ref = 'por_revisar' then null else salario_dec end as salario_mensual_declarado,
  case when estado_ref = 'por_revisar' then null else relacion_dec end as relacion_declarada,
  manual_capturado_en,
  pide_infonavit_en + interval '2 minutes' as manual_desde,
  (saldo_val is null and now() >= pide_infonavit_en + interval '2 minutes' and coalesce(consulta_estado, '') not in ('sin_resultado') and (tramite ->> 'etapa') is null) as puede_capturar,
  precliente, tiene_telefono, tiene_nss, tiene_curp, cobrado_en
from base;

create or replace view trol3.v_resultado_aliado as
with base as (
  select r.id as referido_id, r.persona_id, r.aliado_id, r.estado as estado_ref, r.creado_en as referido_en,
         p.nombre, p.apellidos, p.curp is not null as tiene_curp, p.etapa = 'precliente' as precliente,
         exists (select 1 from trol3.contactos c where c.persona_id = r.persona_id and c.tipo = 'telefono') as tiene_telefono,
         (select a.partner_id from trol3.aliados a where a.id = r.aliado_id) as partner_id,
         (select c.estado::text from trol3.consultas c where c.persona_id = r.persona_id and c.tipo = 'imss_historial' and c.estado <> 'cancelada' order by c.created_at desc limit 1) as consulta_estado,
         (select max(c.created_at) from trol3.consultas c where c.persona_id = r.persona_id and c.tipo = 'imss_historial' and c.estado <> 'cancelada') as consulta_en,
         (select c.creado_en from trol3.cobros_consulta_aliado c where c.persona_id = r.persona_id) as cobrado_en
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
  -- 301
  b.precliente, b.tiene_telefono, b.tiene_curp, b.consulta_en, b.cobrado_en,
  -- SISEC del aliado conviene cuando no hay CURP, la consulta falló o lleva más de un día sin responder.
  (b.estado_ref = 'atribuido' and e.semanas is null and (not b.tiene_curp or b.consulta_estado in ('error','sin_resultado')
     or (b.consulta_estado in ('solicitada','en_proceso') and b.consulta_en < now() - interval '1 day'))) as sugerir_sisec
from base b
left join lateral trol3.expediente_aliado(b.persona_id) e(edad, ley, semanas, status_empleo, conserva_derechos, fin_conservacion, afore_actual,
  pension_base, pension_maxima, saldo_rcv97, saldo_infonavit, infonavit_monto_credito, credito_infonavit_vigente, inconsistencia_imss, consultas_fallidas, cabecera_id) on true;
