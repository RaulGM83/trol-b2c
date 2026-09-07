-- 122e — el link del aliado ya funcionaba; faltaba que dejara rastro.
--
-- `/i/<codigo>` registra el clic y manda a WhatsApp con ref:<codigo>, y el bot
-- entra por `alta_por_telefono`, que ya resuelve el código y estampa el canal.
-- O sea: el QR de Humberto ya servía para atribuir el ALTA, pero no creaba el
-- referido, así que ni él lo veía ni devengaba comisión.
--
-- Se engancha en la puerta que ya existe en vez de abrir otra. Las dos
-- funciones se reemplazan con la MISMA firma: nada de parámetros nuevos, que
-- es como se crean sobrecargas (109b, 110b).

create or replace function trol3.resolver_codigo(p_raw text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'trol3', 'public'
as $$
declare cod text; r record; cid uuid; pid uuid;
begin
  cod := trol3.normalizar_codigo(p_raw);
  if cod is null then return null; end if;

  select * into r from trol3.codigos_invitacion where codigo = cod and activo;
  if found then
    return jsonb_build_object('codigo', cod, 'tipo', r.tipo,
      'miembro_id', r.miembro_id, 'persona_id', r.persona_id,
      -- Nuevo (122e): de quién es el link cuando es de un aliado referidor.
      'aliado_id', r.aliado_id,
      'etiqueta', r.etiqueta);
  end if;

  cid := trol3.cliente_por_codigo_referido(cod);
  if cid is not null then
    select id into pid from trol3.personas where legacy_cliente_id = cid and merged_into is null limit 1;
    return jsonb_build_object('codigo', cod, 'tipo', 'cliente', 'miembro_id', null,
      'persona_id', pid, 'cliente_id', cid, 'etiqueta', null);
  end if;

  -- Código desconocido: se conserva como campaña para no perder la traza.
  return jsonb_build_object('codigo', cod, 'tipo', 'campania', 'miembro_id', null, 'persona_id', null);
end $$;


create or replace function trol3.alta_por_telefono(
  p_tel text,
  p_canal text default 'organico',
  p_actor trol3.actor_tipo default 'bot',
  p_nombre text default null,
  p_campania text default null,
  p_verificacion text default 'wa'
)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare pid uuid; nueva boolean := false; t10 text := trol3.tel10(p_tel);
        res jsonb; cod text; canal text; ref_pid uuid; miem uuid;
        v_aliado uuid; v_ref uuid;
begin
  if length(t10) < 10 then raise exception 'telefono_invalido'; end if;
  if auth.uid() is not null and not trol3.es_miembro() and trol3.tel10((select phone from auth.users where id = auth.uid())) is distinct from t10 then
    raise exception 'no_autorizado';
  end if;

  perform pg_advisory_xact_lock(hashtext('trol3:alta:'||t10));

  res  := trol3.resolver_codigo(p_campania);
  cod  := res->>'codigo';
  canal := coalesce((select codigo from trol3.canales where codigo = p_canal), 'organico');
  if res is not null then
    canal := case res->>'tipo'
               when 'asesor'   then 'asesor'
               when 'cliente'  then 'referido'
               when 'prensa'   then 'prensa'
               when 'sitio'    then 'organico'
               when 'aliado'   then 'aliado'
               else canal end;
    ref_pid := nullif(res->>'persona_id','')::uuid;
    miem    := nullif(res->>'miembro_id','')::uuid;
    v_aliado := nullif(res->>'aliado_id','')::uuid;
  end if;

  pid := trol3.persona_por_telefono(t10);
  if pid is null then
    insert into trol3.personas (nombre, canal_origen, campania_origen, codigo_origen,
                                referidor_persona_id, miembro_origen_id, cabecera_id, etapa)
    values (p_nombre, canal, p_campania, cod, ref_pid, miem, miem, 'nuevo') returning id into pid;
    insert into trol3.contactos (persona_id, tipo, valor, normalizado, principal, verificado_at, canal_verificacion)
    values (pid, 'telefono', t10, t10, true, now(), p_verificacion);
    nueva := true;
    if cod is not null then
      perform trol3.emitir_evento(pid, 'alta_atribuida', p_actor, null,
        jsonb_build_object('codigo', cod, 'tipo', res->>'tipo', 'canal', canal));
    end if;
  else
    update trol3.contactos set verificado_at = coalesce(verificado_at, now()), canal_verificacion = coalesce(canal_verificacion, p_verificacion)
    where persona_id = pid and tipo='telefono' and normalizado = t10;
    if p_nombre is not null then update trol3.personas set nombre = coalesce(nombre, p_nombre) where id = pid; end if;
    -- No se reescribe el origen de alguien que ya existía: el primer link es el que cuenta.
    perform trol3.emitir_evento(pid, 'persona_reingreso', p_actor, null,
      jsonb_build_object('canal', canal, 'campania', p_campania, 'codigo', cod));
  end if;

  -- El referido se registra SIEMPRE que el código sea de un aliado, exista ya la
  -- persona o no. `registrar_referido` decide solo si se atribuye o queda por
  -- revisar, y eso encaja con la regla de arriba: al que ya existía no se le
  -- reescribe el origen, pero la referencia queda anotada para que un humano la
  -- juzgue en vez de perderse.
  if v_aliado is not null then
    v_ref := trol3.registrar_referido(v_aliado, pid, 'link');
  end if;

  return jsonb_build_object('persona_id', pid, 'nueva', nueva, 'canal', canal,
                            'codigo', cod, 'aliado_id', v_aliado, 'referido_id', v_ref);
end $$;

comment on function trol3.alta_por_telefono is
  'Alta o reingreso por teléfono con atribución del código. Desde 122e, un código de aliado registra también el referido.';
