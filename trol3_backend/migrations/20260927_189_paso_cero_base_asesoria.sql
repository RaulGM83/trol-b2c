-- 189 · Paso cero: lo mínimo para asesorar (claude/85, claude/86 · 27-sep-2026)
--
-- Cinco preguntas antes de recomendar: AFORE · saldo RCV · uso de Infonavit · con cuánto y
-- a qué edad quiere retirarse · otros ahorros. "No sabe" no detiene nada (se sigue con el
-- estimado), pero queda registrado para no volver a preguntar. La definición vive aquí para
-- que el asesor, /mi y Lukas pidan exactamente lo mismo.

-- 1 · Qué campos son "base de asesoría" y a qué pregunta pertenecen
alter table trol3.catalogo_campos add column if not exists base_asesoria smallint;
comment on column trol3.catalogo_campos.base_asesoria is
  '189 · Pregunta del paso cero a la que pertenece el campo (1 AFORE · 2 saldo RCV · 3 Infonavit · 4 expectativa · 5 otros ahorros). Null = no es base.';

-- Campo nuevo: si ha usado el crédito Infonavit (vigente / hace mucho / nunca). Deriva el booleano viejo.
insert into trol3.catalogo_campos (campo, nombre, grupo, tipo, opciones, editable_cliente, visible_cliente, visible_aliado, orden, vigencia_dias)
select 'credito_infonavit_uso', '¿Has usado tu crédito Infonavit?', 'infonavit', 'text',
       array['vigente','hace_mucho','nunca'], true, true,
       coalesce((select visible_aliado from trol3.catalogo_campos where campo = 'credito_infonavit_vigente'), true),
       coalesce((select orden from trol3.catalogo_campos where campo = 'credito_infonavit_vigente'), 100), 180
where not exists (select 1 from trol3.catalogo_campos where campo = 'credito_infonavit_uso');

update trol3.catalogo_campos set base_asesoria = null where base_asesoria is not null;
update trol3.catalogo_campos set base_asesoria = 1 where campo = 'afore_actual';
update trol3.catalogo_campos set base_asesoria = 2 where campo = 'saldo_rcv97';
update trol3.catalogo_campos set base_asesoria = 3 where campo in ('credito_infonavit_uso', 'saldo_infonavit');
update trol3.catalogo_campos set base_asesoria = 4 where campo in ('expectativa_pension_mxn', 'edad_retiro_deseada');
update trol3.catalogo_campos set base_asesoria = 5 where campo in ('ahorro_voluntario', 'plan_corporativo', 'otros_planes');

-- 2 · "No sabe": una respuesta válida que no ensucia los datos
create table if not exists trol3.no_sabe (
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  campo      text not null references trol3.catalogo_campos(campo),
  en         timestamptz not null default now(),
  actor_tipo trol3.actor_tipo not null default 'asesor',
  actor_id   uuid,
  primary key (persona_id, campo)
);
comment on table trol3.no_sabe is '189 · El cliente dijo "no sé" a un dato del paso cero. Se borra sola cuando llega un dato declarado o validado.';
alter table trol3.no_sabe enable row level security;
drop policy if exists no_sabe_miembros on trol3.no_sabe;
create policy no_sabe_miembros on trol3.no_sabe for all using (trol3.es_miembro()) with check (trol3.es_miembro());
grant select, insert, update, delete on trol3.no_sabe to authenticated, service_role;

create or replace function trol3.base_no_sabe(p_persona uuid, p_campo text, p_deshacer boolean default false)
returns void language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare mid uuid := trol3.current_miembro_id(); es_cli boolean := false;
begin
  if auth.uid() is not null and not trol3.es_miembro() then
    if p_persona = trol3.current_persona_id() then es_cli := true; else raise exception 'no_autorizado'; end if;
  end if;
  if not exists (select 1 from trol3.catalogo_campos where campo = p_campo and base_asesoria is not null) then
    raise exception 'campo_no_es_base: %', p_campo;
  end if;
  if p_deshacer then
    delete from trol3.no_sabe where persona_id = p_persona and campo = p_campo;
    return;
  end if;
  insert into trol3.no_sabe (persona_id, campo, actor_tipo, actor_id)
  values (p_persona, p_campo, case when es_cli then 'cliente' else 'asesor' end, case when es_cli then null else mid end)
  on conflict (persona_id, campo) do update set en = now(), actor_tipo = excluded.actor_tipo, actor_id = excluded.actor_id;
end $$;
revoke all on function trol3.base_no_sabe(uuid, text, boolean) from public;
grant execute on function trol3.base_no_sabe(uuid, text, boolean) to authenticated, service_role;

-- Un dato real borra el "no sé"; el uso de Infonavit deriva el booleano que ya usa todo lo demás.
create or replace function trol3.tg_datos_base_asesoria() returns trigger
language plpgsql security definer set search_path to 'trol3', 'public' as $$
begin
  if new.capa in ('declarado', 'validado') then
    delete from trol3.no_sabe where persona_id = new.persona_id and campo = new.campo;
  end if;
  if new.campo = 'credito_infonavit_uso' and jsonb_typeof(new.valor) = 'string' then
    insert into trol3.datos (persona_id, campo, valor, capa, origen_tipo, origen_id, proveedor, obtenido_en, vigente_hasta, pagado_por, visibilidad)
    values (new.persona_id, 'credito_infonavit_vigente', to_jsonb((new.valor #>> '{}') = 'vigente'), new.capa, new.origen_tipo, new.origen_id,
            new.proveedor, new.obtenido_en, new.vigente_hasta, new.pagado_por, new.visibilidad);
  end if;
  return null;
end $$;
drop trigger if exists tg_datos_base_asesoria on trol3.datos;
create trigger tg_datos_base_asesoria after insert on trol3.datos
  for each row execute function trol3.tg_datos_base_asesoria();

-- 3 · El estado de cada pregunta: tenemos · no_sabe · falta. Una sola regla para todos.
create or replace function trol3._base_estado(p uuid, n int) returns text
language plpgsql stable security definer set search_path to 'trol3', 'public' as $$
declare principales text[]; todos boolean := false; k text; con int := 0;
begin
  principales := case n
    when 1 then array['afore_actual']
    when 2 then array['saldo_rcv97']
    when 3 then array['credito_infonavit_uso']
    when 4 then array['expectativa_pension_mxn', 'edad_retiro_deseada']
    when 5 then array['ahorro_voluntario', 'plan_corporativo', 'otros_planes']
  end;
  todos := n = 4;  -- la 4 pide las dos; la 5 con una basta
  foreach k in array principales loop
    if exists (select 1 from trol3.datos d where d.persona_id = p and d.campo = k and d.capa in ('declarado', 'validado')) then con := con + 1; end if;
  end loop;
  if (todos and con = array_length(principales, 1)) or (not todos and con > 0) then return 'tenemos'; end if;
  if exists (select 1 from trol3.no_sabe s where s.persona_id = p and s.campo = principales[1]) then return 'no_sabe'; end if;
  return 'falta';
end $$;

create or replace function trol3._base_listos(p uuid) returns int
language sql stable security definer set search_path to 'trol3', 'public' as $$
  select count(*)::int from generate_series(1, 5) n where trol3._base_estado(p, n) <> 'falta'
$$;

-- 4 · Lo que ve el paso cero: highlights + las cinco preguntas con su estado y sus campos
create or replace function trol3.base_asesoria(p_persona uuid) returns jsonb
language plpgsql stable security definer set search_path to 'trol3', 'public' as $$
declare e record; pregs jsonb := '[]'::jsonb; n int; est text; campos jsonb; listos int := 0;
        titulos text[] := array['¿En qué AFORE estás?', '¿Cuánto tienes en tu AFORE, más o menos?', '¿Has usado tu Infonavit?',
                                '¿Con cuánto te gustaría retirarte y a qué edad?', '¿Tienes otros ahorros para tu retiro?'];
        sem_desc numeric; edad_base numeric;
begin
  if auth.uid() is not null and not trol3.es_miembro() and p_persona <> trol3.current_persona_id() then raise exception 'no_autorizado'; end if;
  select * into e from trol3.v_expediente where persona_id = p_persona;
  if e.persona_id is null then return null; end if;
  select (valor #>> '{}')::numeric into sem_desc from trol3.v_mejor_dato where persona_id = p_persona and campo = 'semanas_descontadas';
  select (valor #>> '{}')::numeric into edad_base from trol3.v_mejor_dato where persona_id = p_persona and campo = 'edad_base';

  for n in 1..5 loop
    est := trol3._base_estado(p_persona, n);
    if est <> 'falta' then listos := listos + 1; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'campo', c.campo, 'nombre', c.nombre, 'tipo', c.tipo, 'unidad', c.unidad, 'opciones', c.opciones,
             -- el dato real (declarado o validado), si lo hay
             'valor', r.valor, 'capa', r.capa, 'en', r.obtenido_en,
             -- el estimado nuestro, para enseñarlo mientras no haya dato real
             'estimado', case when r.valor is null and md.capa = 'calculado' then md.valor end,
             'no_sabe', s.en is not null
           ) order by c.orden), '[]'::jsonb)
      into campos
      from trol3.catalogo_campos c
      left join lateral (select d.valor, d.capa, d.obtenido_en from trol3.datos d
                          where d.persona_id = p_persona and d.campo = c.campo and d.capa in ('declarado', 'validado')
                          order by (d.capa = 'validado') desc, d.obtenido_en desc nulls last, d.id desc limit 1) r on true
      left join trol3.v_mejor_dato md on md.persona_id = p_persona and md.campo = c.campo
      left join trol3.no_sabe s on s.persona_id = p_persona and s.campo = c.campo
     where c.base_asesoria = n;
    pregs := pregs || jsonb_build_object('n', n, 'titulo', titulos[n], 'estado', est, 'campos', campos);
  end loop;

  return jsonb_build_object(
    'highlights', jsonb_build_object(
      'ley', e.ley, 'semanas', e.semanas, 'semanas_capa', e.semanas_capa, 'semanas_descontadas', sem_desc,
      'edad', e.edad, 'status_empleo', e.status_empleo,
      'conserva_derechos', e.conserva_derechos, 'fin_conservacion', e.fin_conservacion,
      'pension_base', e.pension_base, 'edad_base', edad_base, 'datos_al', e.ley_en, 'datos_vigentes', e.ley_vigente),
    'preguntas', pregs, 'listos', listos, 'total', 5);
end $$;
revoke all on function trol3.base_asesoria(uuid) from public;
grant execute on function trol3.base_asesoria(uuid) to authenticated, service_role;

-- 5 · La sesión puede empezar en el paso 0; nace ahí si falta algo
alter table trol3.asesorias drop constraint if exists asesorias_paso_check;
alter table trol3.asesorias add constraint asesorias_paso_check check (paso >= 0 and paso <= 5);

create or replace function trol3.asesoria_abrir(p_persona uuid)
returns trol3.asesorias language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare a trol3.asesorias; mid uuid := trol3.current_miembro_id();
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  select * into a from trol3.asesorias where persona_id = p_persona and estado = 'abierta';
  if found then return a; end if;
  insert into trol3.asesorias (persona_id, asesor_id, paso)
  values (p_persona, mid, case when trol3._base_listos(p_persona) < 5 then 0 else 1 end)
  returning * into a;
  perform trol3.registrar_interaccion(p_persona, 'nota', 'asesor', mid, 'interna', 'Inició una asesoría', false, jsonb_build_object('asesoria_id', a.id));
  return a;
end $$;

-- 6 · El contador viaja con la vista de la asesoría y con el carril (cartera)
do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.asesoria_vista(uuid)'::regprocedure);
  if position('''base'', trol3.base_asesoria(p_persona)' in src) = 0 then
    src := replace(src, '    ''pendientes'', (select', '    ''base'', trol3.base_asesoria(p_persona),' || chr(10) || '    ''pendientes'', (select');
    execute src;
  end if;
  src := pg_get_functiondef('trol3.carril_de(uuid)'::regprocedure);
  if position('''base_listos''' in src) = 0 then
    src := replace(src, '    ''toque'', jsonb_build_object(''n'', least(toques + 1, 4),', '    ''base_listos'', trol3._base_listos(p),' || chr(10) || '    ''toque'', jsonb_build_object(''n'', least(toques + 1, 4),');
    execute src;
  end if;
end $$;
