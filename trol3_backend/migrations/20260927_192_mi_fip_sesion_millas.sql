-- 192 · /mi versión FIP y Millas (claude/88 · 27-sep-2026)
--
-- 1. Parada 2 para quien tiene la sesión de cortesía (`sesion_experto`): nos toca a nosotros y
--    el botón es agendar (o la fecha de su sesión si ya la agendó).
-- 2. Parada 1 en los eventos con cascada: mientras el equipo sigue buscando no se le dice
--    "el IMSS no la devolvió"; y una ventanilla en curso también cuenta como "esperando".
-- 3. La marca del patrocinio en /mi (`mi_marca`) y la tarjeta de Millas (`mi_millas`):
--    CLABE + CURP como referencia, y el cashback (10 % asesorías · 5 % gestorías) como
--    movimiento contable en `trol3.cashback`, que nace solo cuando una orden queda cumplida.

-- 3a · Cashback: un movimiento por orden cumplida
create table if not exists trol3.cashback (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  orden_id uuid unique references trol3.ordenes(id) on delete set null,
  concepto text not null,
  base numeric(12,2) not null,
  pct numeric(5,2) not null,
  monto numeric(12,2) not null,
  estado text not null default 'por_depositar' check (estado in ('por_depositar', 'depositado', 'cancelado')),
  referencia text,
  depositado_en timestamptz,
  depositado_por uuid references trol3.miembros(id),
  created_at timestamptz not null default now()
);
create index if not exists cashback_persona_idx on trol3.cashback (persona_id, created_at desc);
create index if not exists cashback_estado_idx on trol3.cashback (estado) where estado = 'por_depositar';
alter table trol3.cashback enable row level security;
drop policy if exists cashback_miembro on trol3.cashback;
create policy cashback_miembro on trol3.cashback for all using (trol3.es_miembro());
drop policy if exists cashback_self on trol3.cashback;
create policy cashback_self on trol3.cashback for select using (persona_id = trol3.current_persona_id());
grant select on trol3.cashback to authenticated;
grant all on trol3.cashback to service_role;

insert into trol3.config (clave, valor) values
  ('cashback_pct', '{"asesoria": 10, "gestoria": 5}'),
  ('millas_clabe', ''),
  ('millas_link', '')
on conflict (clave) do nothing;

-- ¿Esta persona tiene a Millas como aliado? Hoy: llegó por un código cuyo patrocinio es Millas.
create or replace function trol3.aliado_millas(p_persona uuid) returns boolean
language sql stable security definer set search_path to 'trol3', 'public' as $$
  select coalesce((select trol3.marca_evento(p.codigo_origen) ->> 'aliado' from trol3.personas p where p.id = p_persona), '') = 'millas'
$$;

-- El porcentaje que le toca a un producto: asesorías 10, gestorías 5, lo demás 0.
create or replace function trol3.cashback_pct(p_producto text) returns numeric
language sql stable security definer set search_path to 'trol3', 'public' as $$
  select case
    when exists (select 1 from trol3.catalogo_productos_gestoria g where g.codigo = p_producto)
      then coalesce(((select valor::jsonb from trol3.config where clave = 'cashback_pct') ->> 'gestoria')::numeric, 5)
    when exists (select 1 from trol3.productos pr where pr.codigo = p_producto and pr.tipo = 'asesoria')
      then coalesce(((select valor::jsonb from trol3.config where clave = 'cashback_pct') ->> 'asesoria')::numeric, 10)
    else 0 end
$$;

create or replace function trol3.tg_cashback_orden() returns trigger
language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare pct numeric; nom text;
begin
  if new.estado <> 'cumplida' or (tg_op = 'UPDATE' and old.estado = 'cumplida') then return null; end if;
  if coalesce(new.monto, 0) <= 0 or not trol3.aliado_millas(new.persona_id) then return null; end if;
  pct := trol3.cashback_pct(new.producto);
  if pct <= 0 then return null; end if;
  select coalesce((select nombre from trol3.productos where codigo = new.producto),
                  (select nombre from trol3.catalogo_productos_gestoria where codigo = new.producto), new.producto) into nom;
  insert into trol3.cashback (persona_id, orden_id, concepto, base, pct, monto)
  values (new.persona_id, new.id, nom, new.monto, pct, round(new.monto * pct / 100, 2))
  on conflict (orden_id) do nothing;
  perform trol3.emitir_evento(new.persona_id, 'cashback_generado', 'sistema', null,
    jsonb_build_object('orden_id', new.id, 'producto', new.producto, 'pct', pct, 'monto', round(new.monto * pct / 100, 2)));
  return null;
exception when others then return null;  -- el cashback nunca tumba un cobro
end $$;
drop trigger if exists tg_cashback_orden on trol3.ordenes;
create trigger tg_cashback_orden after insert or update of estado on trol3.ordenes
  for each row execute function trol3.tg_cashback_orden();

-- 3b · Lo que /mi necesita del patrocinio y de Millas
create or replace function trol3.mi_marca() returns jsonb
language sql stable security definer set search_path to 'trol3', 'public' as $$
  select m from (select trol3.marca_evento(p.codigo_origen) m from trol3.personas p where p.id = trol3.current_persona_id()) x
   where m ->> 'patrocinio' is not null
$$;
grant execute on function trol3.mi_marca() to authenticated;

create or replace function trol3.mi_millas() returns jsonb
language plpgsql stable security definer set search_path to 'trol3', 'public' as $$
declare pid uuid := trol3.current_persona_id(); movs jsonb; pct jsonb;
begin
  if pid is null or not trol3.aliado_millas(pid) then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'concepto', c.concepto, 'base', c.base, 'pct', c.pct, 'monto', c.monto,
                                              'estado', c.estado, 'fecha', c.created_at, 'depositado_en', c.depositado_en) order by c.created_at desc), '[]'::jsonb)
    into movs from trol3.cashback c where c.persona_id = pid and c.estado <> 'cancelado';
  select valor::jsonb into pct from trol3.config where clave = 'cashback_pct';
  return jsonb_build_object(
    'clabe', nullif((select valor from trol3.config where clave = 'millas_clabe'), ''),
    'link', nullif((select valor from trol3.config where clave = 'millas_link'), ''),
    'referencia', (select curp from trol3.personas where id = pid),
    'pct', coalesce(pct, '{"asesoria": 10, "gestoria": 5}'::jsonb),
    'movimientos', movs,
    'por_depositar', coalesce((select sum(monto) from trol3.cashback where persona_id = pid and estado = 'por_depositar'), 0),
    'depositado', coalesce((select sum(monto) from trol3.cashback where persona_id = pid and estado = 'depositado'), 0));
end $$;
grant execute on function trol3.mi_millas() to authenticated;

-- 1 y 2 · parada_de
do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.parada_de(uuid)'::regprocedure);
  if position('sesion_experto' in src) > 0 then return; end if;

  src := replace(src, '  experto text; op jsonb := null;', '  experto text; op jsonb := null; cita_inicio timestamptz; cod_evento text;');

  -- una ventanilla en curso también es "esperando"
  src := replace(src,
    '  esperando := ult.estado in (''solicitada'',''en_proceso'') and ult.created_at > now() - interval ''24 hours'';',
    '  esperando := (ult.estado in (''solicitada'',''en_proceso'') and ult.created_at > now() - interval ''24 hours'')' || chr(10) ||
    '            or exists (select 1 from trol3.consultas v where v.persona_id = p_persona and v.tipo = ''imss_ventanilla'' and v.estado in (''solicitada'',''en_proceso'') and v.created_at > now() - interval ''3 days'');');

  -- parada 2 con sesión de cortesía
  src := replace(src,
    '    frase := ''Ya tenemos tu información. Falta que alguien te la explique.'';',
    '    frase := ''Ya tenemos tu información. Falta que alguien te la explique.'';' || chr(10) ||
    '    -- 192: sesión de cortesía (FIP/Millas): nos toca a nosotros, y el botón es agendar.' || chr(10) ||
    '    if trol3.tiene_beneficio(p_persona, ''sesion_experto'') then' || chr(10) ||
    '      select c.inicio into cita_inicio from trol3.citas c where c.persona_id = p_persona and c.estado <> ''cancelada'' and c.inicio > now() order by c.inicio limit 1;' || chr(10) ||
    '      toca := ''trol'';' || chr(10) ||
    '      if cita_inicio is not null then' || chr(10) ||
    '        sub := ''sesion_agendada'';' || chr(10) ||
    '        titulo := ''Tu sesión con '' || coalesce(experto, ''tu experto'') || '' es el '' || extract(day from cita_inicio at time zone ''America/Mexico_City'')::int || '' de '' || meses[extract(month from cita_inicio at time zone ''America/Mexico_City'')::int] || '' a las '' || to_char(cita_inicio at time zone ''America/Mexico_City'', ''HH24:MI'');' || chr(10) ||
    '        texto := ''Son 20 minutos para explicarte tus números y ver qué te conviene. Si necesitas cambiarla, escríbenos.'';' || chr(10) ||
    '        cta := ''chat''; boton := ''Cambiar mi sesión''; frase := ''Ya tenemos tu información. Tu sesión ya está agendada.'';' || chr(10) ||
    '        mensaje_wa := ''Hola, vengo de mi cuenta Trol (app.trol.mx). Quiero cambiar la hora de mi sesión.'';' || chr(10) ||
    '      else' || chr(10) ||
    '        sub := ''agendar_sesion'';' || chr(10) ||
    '        titulo := coalesce(experto, ''Tu experto'') || '' te va a contactar para tu sesión de 20 minutos'';' || chr(10) ||
    '        texto := ''Ya tenemos tus números. En la sesión te los explica en claro y ves qué te conviene hacer. Si prefieres, escoge tú la hora.'';' || chr(10) ||
    '        cta := ''agendar''; boton := ''Agendar mi sesión''; frase := ''Ya tenemos tu información. Sigue tu sesión de 20 minutos.'';' || chr(10) ||
    '        mensaje_wa := ''Hola, vengo de mi cuenta Trol (app.trol.mx). Quiero agendar mi sesión de 20 minutos.'';' || chr(10) ||
    '      end if;' || chr(10) ||
    '      pie := (select ''Cortesía de '' || (trol3.marca_evento(p.codigo_origen) ->> ''patrocinio'') || ''.'' from trol3.personas p where p.id = p_persona and trol3.marca_evento(p.codigo_origen) ->> ''patrocinio'' is not null);' || chr(10) ||
    '    end if;');

  -- parada 1: en eventos con cascada, "seguimos buscando"
  src := replace(src,
    '      mensaje_wa := ''Hola, vengo de mi cuenta Trol (app.trol.mx). Mi CURP está bien escrita pero el IMSS no entrega mi información. ¿Me ayudan a revisar qué pasa con mi registro?'';',
    '      mensaje_wa := ''Hola, vengo de mi cuenta Trol (app.trol.mx). Mi CURP está bien escrita pero el IMSS no entrega mi información. ¿Me ayudan a revisar qué pasa con mi registro?'';' || chr(10) ||
    '      -- 192: en los eventos con cascada el equipo sigue buscando; no se le dice "no la devolvió".' || chr(10) ||
    '      select p.codigo_origen into cod_evento from trol3.personas p where p.id = p_persona;' || chr(10) ||
    '      if cod_evento is not null and exists (select 1 from trol3.config cf where cf.clave = ''evento_fallback_jordan'' and (cf.valor::jsonb) ? cod_evento) then' || chr(10) ||
    '        sub := ''buscando_equipo''; toca := ''trol'';' || chr(10) ||
    '        titulo := ''Seguimos buscando tu información'';' || chr(10) ||
    '        texto := ''El IMSS no la entregó por la vía automática y tu experto la está pidiendo por otra. Te avisamos por WhatsApp en cuanto la tengamos. Si quieres adelantar, revisa que tu CURP esté bien escrita.'';' || chr(10) ||
    '        frase := ''Seguimos buscando tu información en el IMSS. No tienes que hacer nada.'';' || chr(10) ||
    '      end if;');

  if position('sesion_experto' in src) = 0 or position('buscando_equipo' in src) = 0 or position('imss_ventanilla' in src) = 0 then
    raise exception 'parche 192 a parada_de no encajó';
  end if;
  execute src;
end $$;

-- 192b · el mensaje de WhatsApp de la parada 2 se asignaba después del bloque de sesión y lo pisaba.
do $$
declare src text; viejo text; nuevo text;
begin
  src := pg_get_functiondef('trol3.parada_de(uuid)'::regprocedure);
  viejo := '    mensaje_wa := ''Hola, vengo de mi cuenta Trol (app.trol.mx). Ya vi mis números y quiero que me expliquen lo que encontraron en mi caso''' || chr(10) ||
           '                  || case when o.id is not null then '' ('' || o.nombre || '')'' else '''' end || ''.'';';
  nuevo := '    if coalesce(sub, '''') not in (''agendar_sesion'', ''sesion_agendada'') then' || chr(10) ||
           '      mensaje_wa := ''Hola, vengo de mi cuenta Trol (app.trol.mx). Ya vi mis números y quiero que me expliquen lo que encontraron en mi caso''' || chr(10) ||
           '                  || case when o.id is not null then '' ('' || o.nombre || '')'' else '''' end || ''.'';' || chr(10) ||
           '    end if;';
  if position(viejo in src) = 0 then
    if position('not in (''agendar_sesion''' in src) > 0 then return; end if;
    raise exception 'parche 192b no encajó';
  end if;
  execute replace(src, viejo, nuevo);
end $$;
