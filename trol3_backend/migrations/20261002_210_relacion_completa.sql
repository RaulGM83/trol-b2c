-- 210 · Relación completa (claude/95). 2-oct-2026.
--
--   1. Sesión programada por fuera: una cita futura (más allá de los 2 días en que ya es
--      "caliente · cita") pone a la persona en Favoritos con origen `sesion`, y
--      `mi_favoritos` la lista. `carril_de` expone `cita_proxima`.
--   2. Oportunidades agregadas a mano (`abrir_oportunidad`): nacen `detectada` con
--      `origen = 'asesor'`; `evaluar_persona` ya no las cierra como `no_aplica`. Abrir
--      `credito_pension` cierra las demás abiertas (la persona ya está pensionada).
--   3. Quién lo trajo (`fijar_origen` / `origen_de`): cliente que refirió, aliado (queda
--      `por_revisar` en `referidos`: la atribución la decide el equipo, sólo trazabilidad),
--      alguien del equipo, u otro medio (canal + campaña libre). Se puede corregir después.
--
-- Sin DML en el nivel superior: lo poco que hay va dentro de `do $$ … execute $q$ … $q$`.

-- ---------------------------------------------------------------------------------------
-- 1. carril_de: sesión programada → Favoritos
-- ---------------------------------------------------------------------------------------
create or replace function trol3.carril_de(p uuid) returns jsonb
language plpgsql stable security definer set search_path to 'trol3', 'public' as $function$
declare
  per record; m record; hay_marca boolean := false;
  g timestamptz; t timestamptz; hoy date := trol3._hoy_mx();
  gd int := trol3._cfg_int('carril_gesto_dias', 7);
  pot jsonb; en_proc boolean; pide boolean; cita timestamptz; cita_prox timestamptz; nc boolean; tel boolean;
  carril text; origen text; vuelve date; toques int; manda boolean := false;
begin
  select * into per from trol3.personas where id = p;
  if per.id is null then return null; end if;
  select * into m from trol3.carril_marcas where persona_id = p and activa order by created_at desc limit 1;
  hay_marca := m.id is not null;
  g := trol3._ultimo_gesto(p);
  t := trol3._ultimo_toque(p);
  nc := exists (select 1 from trol3.contactos c where c.persona_id = p and c.no_contactar);
  tel := exists (select 1 from trol3.contactos c where c.persona_id = p and c.tipo = 'telefono');
  en_proc := exists (select 1 from trol3.oportunidades o where o.persona_id = p and o.estado = 'en_proceso');
  pide := exists (select 1 from trol3.oportunidades o
                    join trol3.oportunidad_checklist oc on oc.oportunidad_id = o.id and oc.estado = 'pendiente'
                    join trol3.checklist_catalogo cc on cc.id = oc.item_id and cc.quien = 'equipo'
                   where o.persona_id = p and o.estado = 'en_proceso');
  select min(c.inicio) into cita from trol3.citas c
   where c.persona_id = p and c.estado = 'programada' and c.inicio > now() - interval '2 hours'
     and c.inicio < (hoy + 2) at time zone 'America/Mexico_City';
  -- 210: la sesión que ya está en la agenda pero todavía no es "hoy o mañana".
  select min(c.inicio) into cita_prox from trol3.citas c
   where c.persona_id = p and c.estado = 'programada' and c.inicio >= (hoy + 2) at time zone 'America/Mexico_City';
  pot := trol3._potencial(p);
  toques := trol3._toques_30d(p);

  -- Un gesto del cliente posterior a la marca la vence (escribe → Calientes), salvo descartado.
  if hay_marca and (m.marca <> 'descartado' or m.motivo = 'sin_oportunidades') and g is not null and g > m.created_at then hay_marca := false; end if;
  -- 200: frío/favorito puesto después del último gesto y del último toque manda sobre Calientes.
  manda := hay_marca and m.marca in ('frio', 'favorito') and (t is null or m.created_at >= t);

  if nc or (hay_marca and m.marca = 'descartado') then
    carril := 'descartado'; origen := case when nc then 'no_contactar' else coalesce(m.motivo, 'descartado') end;
  elsif not manda and g is not null and g >= now() - make_interval(days => gd) then
    carril := 'calientes'; origen := 'reacciono';
  elsif not manda and (per.created_at at time zone 'America/Mexico_City')::date = hoy then
    carril := 'calientes'; origen := 'llego_hoy';
  elsif not manda and cita is not null then
    carril := 'calientes'; origen := 'cita';
  elsif hay_marca and m.marca = 'despertado' and m.directo then
    carril := 'calientes'; origen := 'asignado';
  elsif hay_marca and m.marca = 'favorito' and m.hasta is not null and m.hasta <= hoy then
    carril := 'calientes'; origen := 'favorito';
  elsif en_proc and pide then
    carril := 'calientes'; origen := 'tramite';
  elsif not manda and t is not null and (t at time zone 'America/Mexico_City')::date = hoy then
    carril := 'calientes'; origen := 'tocado';
  elsif en_proc then
    carril := 'favoritos'; origen := 'en_proceso';
  elsif hay_marca and m.marca = 'favorito' then
    carril := 'favoritos'; origen := 'favorito';
  elsif cita_prox is not null then
    -- 210: con sesión en la agenda no se enfría; dos días antes pasa a Calientes (cita).
    carril := 'favoritos'; origen := 'sesion';
  elsif hay_marca and m.marca = 'frio' then
    vuelve := case m.motivo
                when 'no_contesto' then case when m.toques <= 1 then m.created_at::date + 3
                                             when m.toques = 2 then m.created_at::date + 7
                                             when m.toques = 3 then m.created_at::date + 14 end
                when 'lo_va_a_pensar' then m.created_at::date + 30
              end;
    if vuelve is not null and vuelve <= hoy and (pot->>'potencial')::numeric > 0 and tel then
      carril := 'tibios'; origen := 'cadencia';
    else
      carril := 'frios'; origen := m.motivo;
    end if;
  elsif hay_marca and m.marca = 'despertado' then
    carril := 'tibios'; origen := 'despertado';
  elsif coalesce((pot->>'potencial')::numeric, 0) > 0 and tel then
    carril := 'tibios'; origen := 'potencial';
  else
    carril := 'frios'; origen := case when not tel then 'sin_telefono' else 'sin_potencial' end;
  end if;

  return jsonb_build_object(
    'carril', carril, 'origen', origen,
    'marca', case when hay_marca then jsonb_build_object('id', m.id, 'marca', m.marca, 'motivo', m.motivo, 'nota', m.nota, 'hasta', m.hasta,
                                                         'toques', m.toques, 'directo', m.directo, 'por_miembro_id', m.por_miembro_id, 'en', m.created_at) end,
    'ultimo_gesto', g, 'ultimo_toque', t, 'toques_30d', toques,
    'tocado_reciente', t is not null and t > now() - make_interval(days => trol3._cfg_int('carril_tocado_reciente_dias', 30)),
    'vuelve_el', vuelve, 'potencial', pot, 'en_proceso', en_proc, 'pide_equipo', pide, 'cita', cita,
    'cita_proxima', coalesce(cita, cita_prox),
    'base_listos', trol3._base_listos(p),
    'toque', jsonb_build_object('n', least(toques + 1, 4),
                                'tipo', case least(toques + 1, 4) when 1 then 'plantilla' when 2 then 'lukas' when 3 then 'llamada' else 'plantilla' end)
  );
end $function$;

create or replace function trol3.mi_favoritos(p_vista text default 'mios') returns jsonb
language plpgsql security definer set search_path to 'trol3', 'public' as $function$
declare me uuid := trol3.current_miembro_id(); en_proceso jsonb; favoritos jsonb;
begin
  if me is null then raise exception 'no_autorizado'; end if;
  with cand as (
    select m id from trol3._carril_mios(me, p_vista) m
    union select o.persona_id from trol3.oportunidades o join trol3.personas p on p.id = o.persona_id
           where p_vista = 'equipo' and o.estado = 'en_proceso' and p.cabecera_id is null and p.merged_into is null
    union select k.persona_id from trol3.carril_marcas k where k.activa and k.marca = 'favorito' and (k.miembro_id = me or p_vista = 'equipo')
    -- 210: sesiones en la agenda (la mía, o cualquiera en vista equipo).
    union select c.persona_id from trol3.citas c where c.estado = 'programada' and c.inicio >= now() and (c.miembro_id = me or p_vista = 'equipo')
  ), k as (
    select c.id, trol3.carril_de(c.id) k from cand c
  ), f as (
    select trol3._cartera_fila(k.id) || k.k fila from k
     where k.k->>'carril' in ('favoritos','calientes')
       and ((k.k->>'en_proceso')::boolean or k.k->'marca'->>'marca' = 'favorito' or k.k->>'origen' = 'sesion')
  )
  select coalesce(jsonb_agg(fila order by (fila->>'ultimo_gesto')::timestamptz desc nulls last) filter (where (fila->>'en_proceso')::boolean), '[]'::jsonb),
         coalesce(jsonb_agg(fila order by coalesce((fila->'marca'->>'hasta')::date, (fila->>'cita_proxima')::timestamptz::date) asc nulls last) filter (where not (fila->>'en_proceso')::boolean), '[]'::jsonb)
    into en_proceso, favoritos
    from f;
  return jsonb_build_object('en_proceso', en_proceso, 'favoritos', favoritos);
end $function$;

-- ---------------------------------------------------------------------------------------
-- 2. Oportunidades a mano
-- ---------------------------------------------------------------------------------------
-- evaluar_persona: el cierre automático respeta las que abrió un asesor.
do $$
declare src text; old text; nuevo text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'trol3' and p.proname = 'evaluar_persona';
  old := $o$where o.persona_id = p_id and o.estado in ('posible','detectada') and not (o.codigo = any(codigos));$o$;
  nuevo := $n$where o.persona_id = p_id and o.estado in ('posible','detectada') and not (o.codigo = any(codigos))
     and coalesce(o.origen, 'motor') <> 'asesor';  -- 210: las abiertas a mano no las cierra el motor$n$;
  if position(old in src) = 0 then
    if position('210: las abiertas a mano' in src) > 0 then return; end if;
    raise exception 'evaluar_persona: no encontré el cierre a parchar';
  end if;
  execute replace(src, old, nuevo);
end $$;

create or replace function trol3.abrir_oportunidad(p_persona uuid, p_codigo text, p_nota text default null)
returns jsonb language plpgsql security definer set search_path to 'trol3', 'public' as $function$
declare me uuid := trol3.current_miembro_id(); v_op record; v_cat record; v_cerradas int := 0; v_cab uuid;
begin
  if me is null or not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  select * into v_cat from trol3.catalogo_oportunidades where codigo = p_codigo and coalesce(activo, true);
  if v_cat.codigo is null then raise exception 'codigo_desconocido: %', p_codigo; end if;
  select cabecera_id into v_cab from trol3.personas where id = p_persona;

  select * into v_op from trol3.oportunidades where persona_id = p_persona and codigo = p_codigo;
  if v_op.id is not null and v_op.estado not in ('posible', 'detectada', 'no_aplica') then
    -- Ya está presentada / interesada / en proceso / cerrada: no se toca.
    return jsonb_build_object('id', v_op.id, 'estado', v_op.estado, 'ya_estaba', true);
  end if;

  insert into trol3.oportunidades (persona_id, codigo, estado, motivo, origen, dueno_id, detectada_en, nota_estado)
  values (p_persona, p_codigo, 'detectada', coalesce(nullif(p_nota, ''), 'Identificada por el asesor'), 'asesor', coalesce(v_cab, me), now(), p_nota)
  on conflict (persona_id, codigo) do update set
    estado = 'detectada', origen = 'asesor', cerrada_en = null, detectada_en = now(),
    motivo = coalesce(nullif(excluded.motivo, ''), trol3.oportunidades.motivo),
    nota_estado = coalesce(excluded.nota_estado, trol3.oportunidades.nota_estado),
    dueno_id = coalesce(trol3.oportunidades.dueno_id, excluded.dueno_id)
  returning * into v_op;

  -- Crédito a pensionados: la persona ya está pensionada, lo demás deja de aplicar.
  if p_codigo = 'credito_pension' then
    update trol3.oportunidades o set estado = 'no_aplica', cerrada_en = now(),
           nota_estado = 'Cerrada al abrir crédito a pensionados (210)'
     where o.persona_id = p_persona and o.codigo <> 'credito_pension' and o.estado in ('posible', 'detectada');
    get diagnostics v_cerradas = row_count;
  end if;

  perform trol3.registrar_interaccion(p_persona, 'nota', 'asesor', me, 'interna',
    'Oportunidad agregada a mano: ' || coalesce(v_cat.nombre, p_codigo) || coalesce(' — ' || nullif(p_nota, ''), '')
    || case when v_cerradas > 0 then ' (cerró ' || v_cerradas || ' que ya no aplican)' else '' end,
    false, jsonb_build_object('via', 'abrir_oportunidad', 'codigo', p_codigo));

  return jsonb_build_object('id', v_op.id, 'estado', v_op.estado, 'ya_estaba', false, 'cerradas', v_cerradas);
end $function$;

grant execute on function trol3.abrir_oportunidad(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- 3. Quién lo trajo
-- ---------------------------------------------------------------------------------------
create or replace function trol3.fijar_origen(p_persona uuid, p_tipo text, p_ref uuid default null, p_canal text default null, p_texto text default null)
returns jsonb language plpgsql security definer set search_path to 'trol3', 'public' as $function$
declare me uuid := trol3.current_miembro_id(); v_nombre text; v_txt text;
begin
  if me is null or not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  if p_tipo = 'cliente' then
    if p_ref is null or p_ref = p_persona then raise exception 'referidor_invalido'; end if;
    select nullif(trim(coalesce(nombre,'') || ' ' || coalesce(apellidos,'')), '') into v_nombre from trol3.personas where id = p_ref;
    if v_nombre is null then raise exception 'referidor_invalido'; end if;
    update trol3.personas set referidor_persona_id = p_ref, partner_origen_id = null, miembro_origen_id = null,
           canal_origen = 'referido', campania_origen = nullif(p_texto, '') where id = p_persona;
    v_txt := 'Lo refirió ' || v_nombre;
  elsif p_tipo = 'aliado' then
    select nombre into v_nombre from trol3.aliados where id = p_ref and activo;
    if v_nombre is null then raise exception 'aliado_invalido'; end if;
    -- Sólo trazabilidad: queda por revisar; la atribución (y la comisión) la decide el equipo.
    if not exists (select 1 from trol3.referidos r where r.persona_id = p_persona and r.aliado_id = p_ref) then
      insert into trol3.referidos (aliado_id, persona_id, origen, ya_existia, estado, visible_para_aliado, nota)
      values (p_ref, p_persona, 'alta_manual', true, 'por_revisar', false, coalesce(nullif(p_texto, ''), 'Registrado por el asesor (210)'));
    end if;
    update trol3.personas set referidor_persona_id = null, miembro_origen_id = null,
           canal_origen = 'aliado', campania_origen = nullif(p_texto, '') where id = p_persona;
    v_txt := 'Lo trajo el aliado ' || v_nombre;
  elsif p_tipo = 'equipo' then
    select nombre into v_nombre from trol3.miembros where id = coalesce(p_ref, me);
    update trol3.personas set miembro_origen_id = coalesce(p_ref, me), referidor_persona_id = null,
           canal_origen = 'asesor', campania_origen = nullif(p_texto, '') where id = p_persona;
    v_txt := 'Lo trajo ' || coalesce(v_nombre, 'alguien del equipo');
  elsif p_tipo = 'otro' then
    if coalesce(p_canal, '') = '' then raise exception 'canal_requerido'; end if;
    update trol3.personas set referidor_persona_id = null, miembro_origen_id = null,
           canal_origen = p_canal, campania_origen = nullif(p_texto, '') where id = p_persona;
    v_txt := 'Llegó por ' || p_canal || coalesce(' · ' || nullif(p_texto, ''), '');
  else
    raise exception 'tipo_invalido';
  end if;
  perform trol3.registrar_interaccion(p_persona, 'nota', 'asesor', me, 'interna', 'Origen: ' || v_txt, false,
    jsonb_build_object('via', 'fijar_origen', 'tipo', p_tipo, 'ref', p_ref, 'canal', p_canal));
  return trol3.origen_de(p_persona);
end $function$;

create or replace function trol3.origen_de(p_persona uuid) returns jsonb
language sql stable security definer set search_path to 'trol3', 'public' as $function$
  select jsonb_build_object(
    'registrado_en', p.created_at,
    'canal', p.canal_origen, 'campania', p.campania_origen, 'codigo', p.codigo_origen,
    'tipo', case when p.referidor_persona_id is not null then 'cliente'
                 when r.id is not null then 'aliado'
                 when p.miembro_origen_id is not null then 'equipo'
                 when p.canal_origen is not null then 'otro' end,
    'ref', coalesce(p.referidor_persona_id, r.aliado_id, p.miembro_origen_id),
    'nombre', coalesce(
      (select nullif(trim(coalesce(x.nombre,'') || ' ' || coalesce(x.apellidos,'')), '') from trol3.personas x where x.id = p.referidor_persona_id),
      (select a.nombre from trol3.aliados a where a.id = r.aliado_id),
      (select m.nombre from trol3.miembros m where m.id = p.miembro_origen_id)),
    'referido_estado', r.estado)
  from trol3.personas p
  left join lateral (select r.id, r.aliado_id, r.estado from trol3.referidos r where r.persona_id = p.id order by r.creado_en limit 1) r on true
  where p.id = p_persona
$function$;

grant execute on function trol3.fijar_origen(uuid, text, uuid, text, text) to authenticated;
grant execute on function trol3.origen_de(uuid) to authenticated;

comment on function trol3.abrir_oportunidad is '210: oportunidad identificada por el asesor; nace detectada, origen asesor; el motor no la cierra. credito_pension cierra las demás abiertas.';
comment on function trol3.fijar_origen is '210: quién trajo a la persona (cliente / aliado por_revisar / equipo / otro canal). Sólo trazabilidad; corregible.';
