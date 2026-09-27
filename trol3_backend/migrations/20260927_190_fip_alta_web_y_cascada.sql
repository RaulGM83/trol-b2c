-- 190 · Foro Internacional de Pensiones (claude/88 · 27-sep-2026)
--
-- El código de evento `fip2026`, el alta desde la web (sesión por OTP, sin miembro), el
-- reparto de experto entre los asesores del evento, la sesión de 20 min de cortesía, y la
-- cascada de consultas del código: Belvo primero (aunque el canal `evento` sea Jordan),
-- Jordan automático si Belvo no da nada, y de ahí a revisión manual.

-- 1 · El código
insert into trol3.codigos_invitacion (codigo, tipo, miembro_id, etiqueta, activo)
values ('fip2026', 'evento', '0dfd18d7-2b1e-4627-905e-6f75d347cbcf', 'Foro Internacional de Pensiones XV (21 oct 2026)', true)
on conflict (codigo) do update set etiqueta = excluded.etiqueta, activo = true;

-- 2 · Configuración por código
insert into trol3.config (clave, valor) values
  ('politica_proveedor_codigo', '{"fip2026": "belvo_first"}'),
  ('evento_fallback_jordan',   '["fip2026"]'),
  ('evento_asesores',          '{"fip2026": ["0dfd18d7-2b1e-4627-905e-6f75d347cbcf", "13d4c6ce-d915-4451-9d85-46668b6cb889", "06905404-7fa5-4cf1-800a-484fa0368a84", "8ca554da-15d1-4909-b622-a98ddd3053ce"]}'),
  ('evento_beneficio',         '{"fip2026": "sesion_experto"}'),
  ('evento_marca',             '{"fip2026": {"patrocinio": "Foro Internacional de Pensiones y Millas para el Retiro", "aliado": "millas"}}')
on conflict (clave) do update set valor = excluded.valor;

-- 3 · pedir_consulta: la política puede venir del código de origen, no sólo del canal
do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.pedir_consulta(uuid,text,trol3.actor_tipo,uuid,text,boolean,text,boolean,text)'::regprocedure);
  if position('politica_proveedor_codigo' in src) = 0 then
    src := replace(src,
      '  if found then pol := canal.politica_proveedor; end if;',
      '  if found then pol := canal.politica_proveedor; end if;' || chr(10) ||
      '  -- 190: política por código de origen (el FIP va Belvo primero aunque el canal evento sea Jordan)' || chr(10) ||
      '  select coalesce((select (cf.valor::jsonb) ->> p.codigo_origen from trol3.config cf where cf.clave = ''politica_proveedor_codigo''), pol) into pol' || chr(10) ||
      '    from trol3.personas p where p.id = p_persona;');
    execute src;
  end if;
end $$;

-- 4 · Cascada: Belvo sin resultado → Jordan solo, una vez, sólo para los códigos que lo piden
create or replace function trol3.tg_consulta_fallback_evento() returns trigger
language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare cod text; ya boolean;
begin
  if new.tipo <> 'imss_historial' or coalesce(new.proveedor, '') <> 'belvo' then return null; end if;
  if new.estado not in ('sin_resultado', 'error') or old.estado is not distinct from new.estado then return null; end if;
  select p.codigo_origen into cod from trol3.personas p where p.id = new.persona_id;
  if cod is null or not exists (select 1 from trol3.config cf where cf.clave = 'evento_fallback_jordan' and (cf.valor::jsonb) ? cod) then return null; end if;
  select exists (select 1 from trol3.consultas c where c.persona_id = new.persona_id and c.tipo = 'imss_historial'
                   and c.proveedor = 'jordan' and c.created_at > now() - interval '1 day') into ya;
  if ya then return null; end if;
  perform trol3.pedir_consulta(new.persona_id, 'imss_historial', 'sistema', null, 'trol', true,
                               'evento ' || cod || ': Belvo sin resultado, va Jordan', true, 'jordan');
  perform trol3.emitir_evento(new.persona_id, 'consulta_reintentada', 'sistema', null,
                              jsonb_build_object('de', 'belvo', 'a', 'jordan', 'consulta_id', new.id, 'codigo', cod));
  return null;
exception when others then return null;  -- la cascada nunca tumba el cierre de la consulta
end $$;
drop trigger if exists tg_consulta_fallback_evento on trol3.consultas;
create trigger tg_consulta_fallback_evento after update of estado on trol3.consultas
  for each row execute function trol3.tg_consulta_fallback_evento();

-- 5 · Alta desde la web del evento: sesión por OTP (auth.uid()), sin miembro
create or replace function trol3.alta_web_evento(p_codigo text, p_nombre text, p_curp text, p_consentimiento boolean)
returns jsonb language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare uid uuid := auth.uid(); pid uuid; etiq text; c text; dueno uuid; asesores jsonb; elegido uuid; benef text; nueva boolean := false; cons jsonb;
  texto constant text := 'Acepta los Términos y Condiciones y el Aviso de Privacidad de El Trol Financiero (trol.mx/privacidad) y autoriza consultar su historial del IMSS para su asesoría básica.';
begin
  if uid is null then raise exception 'sin_sesion'; end if;
  if not coalesce(p_consentimiento, false) then raise exception 'sin_consentimiento'; end if;
  select etiqueta into etiq from trol3.codigos_invitacion where codigo = p_codigo and activo and tipo = 'evento';
  if etiq is null then raise exception 'codigo_de_evento_no_existe'; end if;
  c := upper(regexp_replace(coalesce(p_curp, ''), '\s', '', 'g'));
  if c !~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$' then raise exception 'curp_invalida'; end if;

  -- La persona de esta sesión (la crea si no existe; canal evento, campaña ref:<codigo>).
  -- Si ya existía, su origen no se reescribe (regla de atribución).
  nueva := not exists (select 1 from trol3.personas where auth_user_id = uid);
  pid := trol3.vincular_sesion('evento', 'ref:' || p_codigo);

  -- ¿La CURP es de otra persona? No se pisa: se avisa.
  select p.id into dueno from trol3.personas p where p.curp = c and p.merged_into is null and p.id <> pid limit 1;
  if dueno is not null then
    return jsonb_build_object('ok', false, 'motivo', 'curp_de_otra_persona', 'persona_id', pid);
  end if;

  perform trol3.emitir_evento(pid, 'consentimiento', 'cliente', null,
    jsonb_build_object('canal', 'evento', 'codigo', p_codigo, 'texto', texto, 'version', '2026-09-27', 'via', 'web'));

  if nullif(btrim(p_nombre), '') is not null then
    perform trol3.declarar(pid, 'nombre', to_jsonb(btrim(p_nombre)), 'cliente', null, 'declarado');
  end if;

  -- Experto por reparto: el asesor del evento con menos personas de este código.
  select (cf.valor::jsonb) -> p_codigo into asesores from trol3.config cf where cf.clave = 'evento_asesores';
  if asesores is not null and jsonb_typeof(asesores) = 'array' and jsonb_array_length(asesores) > 0 then
    select (a.v #>> '{}')::uuid into elegido
      from jsonb_array_elements(asesores) a(v)
      join trol3.miembros m on m.id = (a.v #>> '{}')::uuid and m.activo
      left join trol3.personas p on p.cabecera_id = m.id and p.codigo_origen = p_codigo and p.merged_into is null
     group by a.v order by count(p.id), random() limit 1;
    if elegido is not null then
      update trol3.personas set cabecera_id = elegido where id = pid and cabecera_id is null;
    end if;
  end if;

  -- Lo que regala el evento
  select (cf.valor::jsonb) ->> p_codigo into benef from trol3.config cf where cf.clave = 'evento_beneficio';
  if benef is not null and not trol3.tiene_beneficio(pid, benef) then
    perform trol3.otorgar_beneficio(pid, benef, 'evento', etiq, p_codigo, null);
  end if;

  -- La CURP dispara la consulta (política del código: Belvo primero) y el CDA
  perform trol3.declarar(pid, 'curp', to_jsonb(c), 'cliente', null, 'declarado');
  select jsonb_build_object('estado', x.estado, 'proveedor', x.proveedor, 'id', x.id) into cons
    from trol3.consultas x where x.persona_id = pid and x.tipo = 'imss_historial' order by x.created_at desc limit 1;

  perform trol3.registrar_interaccion(pid, 'nota', 'cliente', null, 'interna',
    'Se registró desde la web de ' || etiq || ' · aceptó Términos y Aviso de Privacidad', false, jsonb_build_object('codigo', p_codigo, 'via', 'web'));

  return jsonb_build_object('ok', true, 'persona_id', pid, 'nueva', nueva, 'experto', elegido, 'beneficio', benef, 'consulta', cons);
end $$;
revoke all on function trol3.alta_web_evento(text, text, text, boolean) from public;
grant execute on function trol3.alta_web_evento(text, text, text, boolean) to authenticated, service_role;

-- 6 · La marca del evento, para /mi y para la landing (lo puede leer el cliente)
create or replace function trol3.marca_evento(p_codigo text) returns jsonb
language sql stable security definer set search_path to 'trol3', 'public' as $$
  select coalesce((select (cf.valor::jsonb) -> p_codigo from trol3.config cf where cf.clave = 'evento_marca'), '{}'::jsonb)
         || jsonb_build_object('codigo', p_codigo, 'etiqueta', (select etiqueta from trol3.codigos_invitacion where codigo = p_codigo and activo))
$$;
grant execute on function trol3.marca_evento(text) to anon, authenticated, service_role;
