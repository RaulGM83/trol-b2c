-- 238 · 15-oct-2026 · FIP, primeras 18 h con correos (claude/103).
--  a) Los registrados de un evento no se enfrían ni se descartan solos hasta 7 días después
--     de la fecha del evento (config evento_meta.<codigo>.fecha).
--  b) Un toque automático (plantilla que manda Trol, actor 'sistema') ya no cuenta para
--     mandar a alguien a Fríos: sólo los toques de una persona del equipo.
--  c) Panel del evento: último aviso «tu información llegó» por persona + cuántos tienen
--     historial y nunca recibieron el aviso.
--  d) Asesoría en modo «preparando»: abrirla para revisar el caso no deja interacción ni
--     cuenta como sesión; al pasar a «con el cliente» sí.

-- a) ¿Esta persona es de un evento todavía vigente? Devuelve el código o null.
create or replace function trol3._evento_vigente(p_persona uuid)
returns text language plpgsql stable security definer set search_path to 'trol3','public' as $$
declare meta jsonb; cod text; f date;
begin
  select cf.valor::jsonb into meta from trol3.config cf where cf.clave = 'evento_meta';
  if meta is null then return null; end if;
  for cod in
    select p.codigo_origen from trol3.personas p where p.id = p_persona and p.codigo_origen is not null
    union
    select ev.payload ->> 'codigo' from trol3.eventos ev
     where ev.persona_id = p_persona and ev.tipo = 'consentimiento' and ev.payload ? 'codigo'
  loop
    f := nullif(meta -> cod ->> 'fecha', '')::date;
    if f is not null and trol3._hoy_mx() <= f + 7 then return cod; end if;
  end loop;
  return null;
end $$;
revoke all on function trol3._evento_vigente(uuid) from public, anon, authenticated;

-- a + b) carril_noche
create or replace function trol3.carril_noche()
returns jsonb language plpgsql security definer set search_path to 'trol3','public' as $$
declare hoy date := trol3._hoy_mx(); bajados int := 0; cerradas int := 0; evento int := 0; r record;
begin
  -- 1. marcas vencidas: el cliente escribió después de la marca (salvo descartado)
  with v as (
    select k.id from trol3.carril_marcas k
     where k.activa and k.marca <> 'descartado' and coalesce(trol3._ultimo_gesto(k.persona_id), '-infinity') > k.created_at
  )
  update trol3.carril_marcas k set activa = false, cerrada_en = now(), cerrada_motivo = 'reacciono'
    from v where k.id = v.id;
  get diagnostics cerradas = row_count;

  -- 2. tocados hoy POR UNA PERSONA DEL EQUIPO sin reacción (238: lo automático no cuenta)
  for r in
    select i.persona_id, max(i.created_at) t, p.cabecera_id
      from trol3.interacciones i join trol3.personas p on p.id = i.persona_id and p.merged_into is null
     where i.direccion = 'saliente' and i.actor_tipo::text = 'asesor' and i.canal in ('wa','llamada')
       and (i.created_at at time zone 'America/Mexico_City')::date = hoy
     group by 1, 3
  loop
    continue when coalesce(trol3._ultimo_gesto(r.persona_id), '-infinity') >= r.t;
    continue when exists (select 1 from trol3.oportunidades o where o.persona_id = r.persona_id and o.estado = 'en_proceso');
    continue when exists (select 1 from trol3.carril_marcas k where k.persona_id = r.persona_id and k.activa and k.marca in ('frio','descartado','favorito'));
    if trol3._evento_vigente(r.persona_id) is not null then evento := evento + 1; continue; end if;  -- 238
    perform trol3._cerrar_marcas(r.persona_id, 'no_contesto');
    insert into trol3.carril_marcas (persona_id, marca, motivo, toques, miembro_id, por_miembro_id)
    values (r.persona_id, 'frio', 'no_contesto', trol3._toques_30d(r.persona_id), r.cabecera_id, null);
    bajados := bajados + 1;
  end loop;
  return jsonb_build_object('dia', hoy, 'bajados', bajados, 'marcas_cerradas', cerradas, 'evento_respetados', evento);
end $$;

-- a) descarte automático por «sin oportunidades»: no a los de un evento vigente
create or replace function trol3.tg_descartar_sin_oportunidades()
returns trigger language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id(); cab uuid; abiertos constant text[] := array['posible','detectada','presentada','interesada','en_proceso'];
begin
  if new.estado::text = any(abiertos) and (tg_op = 'INSERT' or old.estado is distinct from new.estado) then
    update trol3.carril_marcas set activa = false, cerrada_en = now(), cerrada_motivo = 'oportunidad_abierta'
     where persona_id = new.persona_id and activa and marca = 'descartado' and motivo = 'sin_oportunidades';
    return null;
  end if;

  if tg_op = 'UPDATE' and new.estado = 'no_aplica' and old.estado is distinct from new.estado
     and not exists (select 1 from trol3.oportunidades o where o.persona_id = new.persona_id and o.id <> new.id and o.estado::text = any(abiertos))
     and not exists (select 1 from trol3.carril_marcas k where k.persona_id = new.persona_id and k.activa and k.marca = 'descartado')
     and trol3._evento_vigente(new.persona_id) is null then  -- 238: el evento le da su sesión aunque no haya oportunidad
    select cabecera_id into cab from trol3.personas where id = new.persona_id;
    perform trol3._cerrar_marcas(new.persona_id, 'remarcada');
    insert into trol3.carril_marcas (persona_id, marca, motivo, nota, toques, miembro_id, por_miembro_id)
    values (new.persona_id, 'descartado', 'sin_oportunidades', 'Todas sus oportunidades quedaron como No aplica', 0, coalesce(cab, me), me);
    perform trol3.emitir_evento(new.persona_id, 'carril_marca', (case when me is not null then 'asesor' else 'sistema' end)::trol3.actor_tipo, me,
            jsonb_build_object('marca', 'descartado', 'motivo', 'sin_oportunidades', 'oportunidad', new.id));
  end if;
  return null;
end $$;

-- c) evento_panel: aviso «tu información llegó» por persona y cuántos faltan
do $$
declare d text := pg_get_functiondef('trol3.evento_panel(text,integer)'::regprocedure); n text;
begin
  n := replace(d,
    $a$      exists (select 1 from trol3.interacciones i where i.persona_id = per.id and i.direccion = 'entrante') as escribio$a$,
    $b$      exists (select 1 from trol3.interacciones i where i.persona_id = per.id and i.direccion = 'entrante') as escribio,
      (select max(i.created_at) from trol3.interacciones i where i.persona_id = per.id and i.metadata ->> 'evento' = 'consulta_lista') as aviso_lista$b$);
  if n = d then raise exception '238: ancla escribio no encontrada'; end if;
  d := n;
  n := replace(d,
    $a$           'pagaron', count(*) filter (where f.pagado > 0),$a$,
    $b$           'pagaron', count(*) filter (where f.pagado > 0),
           'sin_aviso', count(*) filter (where (f.tiene_historial or f.tiene_constancia) and f.aviso_lista is null),$b$);
  if n = d then raise exception '238: ancla pagaron no encontrada'; end if;
  execute n;
end $$;

-- d) asesoría preparando / con el cliente
alter table trol3.asesorias add column if not exists modo text not null default 'con_cliente'
  check (modo in ('preparando', 'con_cliente'));
alter table trol3.asesorias add column if not exists con_cliente_en timestamptz;

-- Sin DROP (el conector lo retiene): función nueva con modo y la vieja queda como envoltura «con el cliente».
create or replace function trol3.asesoria_con_cliente(p_id uuid)
returns trol3.asesorias language plpgsql security definer set search_path to 'trol3','public' as $$
declare a trol3.asesorias; mid uuid := trol3.current_miembro_id();
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  update trol3.asesorias x set modo = 'con_cliente', con_cliente_en = coalesce(x.con_cliente_en, now()), updated_at = now()
   where x.id = p_id and x.modo = 'preparando'
  returning * into a;
  if not found then select * into a from trol3.asesorias where id = p_id; return a; end if;
  perform trol3.registrar_interaccion(a.persona_id, 'nota', 'asesor', mid, 'interna', 'Asesoría con el cliente', false, jsonb_build_object('asesoria_id', a.id));
  return a;
end $$;

create or replace function trol3.asesoria_abrir_modo(p_persona uuid, p_modo text)
returns trol3.asesorias language plpgsql security definer set search_path to 'trol3','public' as $$
declare a trol3.asesorias; mid uuid := trol3.current_miembro_id();
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  if p_modo not in ('preparando', 'con_cliente') then raise exception 'modo_invalido'; end if;
  select * into a from trol3.asesorias where persona_id = p_persona and estado = 'abierta';
  if found then
    -- Retomar una preparación ya con el cliente enfrente la convierte en sesión.
    if p_modo = 'con_cliente' and a.modo = 'preparando' then a := trol3.asesoria_con_cliente(a.id); end if;
    return a;
  end if;
  insert into trol3.asesorias (persona_id, asesor_id, paso, modo, con_cliente_en)
  values (p_persona, mid, case when trol3._base_listos(p_persona) < 5 then 0 else 1 end, p_modo,
          case when p_modo = 'con_cliente' then now() end)
  returning * into a;
  -- Preparar el caso no es una interacción con el cliente; sólo la sesión deja rastro.
  if p_modo = 'con_cliente' then
    perform trol3.registrar_interaccion(p_persona, 'nota', 'asesor', mid, 'interna', 'Asesoría con el cliente', false, jsonb_build_object('asesoria_id', a.id));
  end if;
  return a;
end $$;

create or replace function trol3.asesoria_abrir(p_persona uuid)
returns trol3.asesorias language sql security definer set search_path to 'trol3','public' as $$
  select trol3.asesoria_abrir_modo(p_persona, 'con_cliente');
$$;

-- cerrar una preparación: se guarda lo avanzado, sin «asesorado» ni interacción
create or replace function trol3.asesoria_marcar(p_id uuid, p_paso integer default null, p_nota text default null, p_mostrar_costos boolean default null, p_escenario uuid default null, p_cerrar boolean default false)
returns trol3.asesorias language plpgsql security definer set search_path to 'trol3','public' as $$
declare a trol3.asesorias; mid uuid := trol3.current_miembro_id();
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  update trol3.asesorias x set
    paso = coalesce(p_paso, x.paso),
    pasos_vistos = case when p_paso is null or p_paso = any(x.pasos_vistos) then x.pasos_vistos else array_append(x.pasos_vistos, p_paso::smallint) end,
    notas = case when p_nota is null then x.notas else x.notas || jsonb_build_object(coalesce(p_paso, x.paso)::text, p_nota) end,
    mostrar_costos = coalesce(p_mostrar_costos, x.mostrar_costos),
    escenario_recomendado = coalesce(p_escenario, x.escenario_recomendado),
    estado = case when p_cerrar then 'cerrada' else x.estado end,
    cerrada_en = case when p_cerrar then now() else x.cerrada_en end,
    updated_at = now()
  where x.id = p_id
  returning * into a;
  if not found then raise exception 'asesoria_no_existe'; end if;
  if p_cerrar and a.modo = 'con_cliente' then
    update trol3.personas p set etapa = 'asesorado'
     where p.id = a.persona_id and p.etapa::text in ('nuevo','conversando','expediente_base');
    if found then perform trol3.evaluar_persona_seguro(a.persona_id); end if;
    perform trol3.registrar_interaccion(a.persona_id, 'nota', 'asesor', mid, 'interna', 'Cerró la asesoría', false, jsonb_build_object('asesoria_id', a.id));
  end if;
  return a;
end $$;

grant execute on function trol3.asesoria_abrir_modo(uuid, text) to authenticated;
grant execute on function trol3.asesoria_con_cliente(uuid) to authenticated;
revoke execute on function trol3.asesoria_abrir_modo(uuid, text) from anon, public;
revoke execute on function trol3.asesoria_con_cliente(uuid) from anon, public;

-- 238b (aplicada aparte) · Regresar a los del FIP que el job de la noche mandó a Fríos / el motor descartó (14-oct).
do $$ begin
  execute $q$
    update trol3.carril_marcas k set activa = false, cerrada_en = now(), cerrada_motivo = 'evento_vigente'
     where k.activa and k.marca in ('frio', 'descartado') and k.motivo in ('no_contesto', 'sin_oportunidades')
       and k.por_miembro_id is null and trol3._evento_vigente(k.persona_id) is not null
  $q$;
end $$;
