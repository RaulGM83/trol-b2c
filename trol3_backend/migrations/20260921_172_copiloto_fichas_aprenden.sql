-- 172: el copiloto (fase 4b).
--
-- Dos piezas. (1) Las fichas APRENDEN: el lector de reuniones de Granola (135) y
-- los asesores proponen objeciones reales —la pregunta del cliente y cómo se
-- contestó—; llegan a una bandeja y sólo un admin las aprueba, las edita o las
-- descarta. Aprobar = se agrega a "Qué te van a preguntar" de la ficha (con
-- historial, 170). Lo que no cae en ninguna ficha entra "sin ficha": es la lista
-- de fichas que faltan. (2) El copiloto del asesor guarda lo que ya contestó en
-- la propia sesión, para no pagar dos veces la misma pregunta.

create table trol3.fichas_propuestas (
  id            uuid primary key default gen_random_uuid(),
  ficha_codigo  text references trol3.fichas(codigo) on update cascade,
  pregunta      text not null,
  respuesta     text,
  evidencia     text,
  origen        text not null check (origen in ('reunion','asesor')),
  reunion_id    uuid references trol3.reuniones(id) on delete set null,
  persona_id    uuid references trol3.personas(id) on delete set null,
  propuesta_por uuid references trol3.miembros(id),
  estado        text not null default 'pendiente' check (estado in ('pendiente','aprobada','descartada')),
  decidida_por  uuid references trol3.miembros(id),
  decidida_en   timestamptz,
  created_at    timestamptz not null default now(),
  pregunta_hash text generated always as (md5(lower(btrim(pregunta)))) stored
);
comment on table trol3.fichas_propuestas is 'Bandeja de objeciones propuestas para las fichas (172). ficha_codigo null = "sin ficha": falta escribirla.';
-- Releer una reunión no duplica lo ya propuesto (ni revive lo descartado).
create unique index fichas_propuestas_reunion_uq on trol3.fichas_propuestas (reunion_id, pregunta_hash) where reunion_id is not null;
create index fichas_propuestas_estado_idx on trol3.fichas_propuestas (estado, created_at desc);

alter table trol3.fichas_propuestas enable row level security;
create policy fichas_prop_lee on trol3.fichas_propuestas for select using (trol3.es_miembro());
grant select on trol3.fichas_propuestas to authenticated;
grant all on trol3.fichas_propuestas to service_role;

-- Un asesor propone a mano (lo que pasó por WhatsApp o en una llamada sin grabar).
create or replace function trol3.fichas_proponer(p_ficha text, p_pregunta text, p_respuesta text default null, p_persona uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
declare nid uuid;
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  if length(btrim(coalesce(p_pregunta, ''))) < 8 then raise exception 'pregunta_muy_corta'; end if;
  insert into trol3.fichas_propuestas (ficha_codigo, pregunta, respuesta, origen, persona_id, propuesta_por)
  values (nullif(btrim(p_ficha), ''), btrim(p_pregunta), nullif(btrim(coalesce(p_respuesta, '')), ''), 'asesor', p_persona, trol3.current_miembro_id())
  returning id into nid;
  return nid;
end $function$;

-- Sólo admin decide. Al aprobar puede corregir la ficha destino, la pregunta y la respuesta.
create or replace function trol3.fichas_propuesta_decidir(p_id uuid, p_decision text, p_ficha text default null, p_pregunta text default null, p_respuesta text default null)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
declare p trol3.fichas_propuestas; cod text; preg text; resp text;
begin
  if not trol3.tiene_rol('admin'::trol3.rol_miembro) then raise exception 'solo_admin'; end if;
  select * into p from trol3.fichas_propuestas where id = p_id for update;
  if not found then raise exception 'propuesta_no_existe'; end if;
  if p.estado <> 'pendiente' then raise exception 'propuesta_ya_decidida'; end if;

  if p_decision = 'descartar' then
    update trol3.fichas_propuestas set estado = 'descartada', decidida_por = trol3.current_miembro_id(), decidida_en = now() where id = p_id;
    return;
  elsif p_decision <> 'aprobar' then
    raise exception 'decision_invalida';
  end if;

  cod  := coalesce(nullif(btrim(p_ficha), ''), p.ficha_codigo);
  preg := btrim(coalesce(nullif(btrim(p_pregunta), ''), p.pregunta));
  resp := btrim(coalesce(nullif(btrim(p_respuesta), ''), p.respuesta, ''));
  if cod is null then raise exception 'falta_ficha'; end if;
  if resp = '' then raise exception 'falta_respuesta'; end if;
  -- una línea, con el mismo formato que el resto de la sección
  preg := regexp_replace(btrim(preg, ' "“”'), '\s+', ' ', 'g');
  resp := regexp_replace(resp, '\s+', ' ', 'g');

  update trol3.fichas f
     set preguntas = case when coalesce(btrim(f.preguntas), '') = '' then '' else f.preguntas || E'\n' end
                     || '- *"' || preg || '"* — ' || resp
   where f.codigo = cod;
  if not found then raise exception 'ficha_no_existe'; end if;

  update trol3.fichas_propuestas
     set estado = 'aprobada', ficha_codigo = cod, pregunta = preg, respuesta = resp,
         decidida_por = trol3.current_miembro_id(), decidida_en = now()
   where id = p_id;
end $function$;

revoke all on function trol3.fichas_proponer(text, text, text, uuid) from public, anon;
revoke all on function trol3.fichas_propuesta_decidir(uuid, text, text, text, text) from public, anon;
grant execute on function trol3.fichas_proponer(text, text, text, uuid) to authenticated, service_role;
grant execute on function trol3.fichas_propuesta_decidir(uuid, text, text, text, text) to authenticated, service_role;

-- El copiloto guarda en la sesión lo que ya preparó y lo que ya contestó.
alter table trol3.asesorias add column if not exists preparacion jsonb;
alter table trol3.asesorias add column if not exists copiloto jsonb not null default '{}'::jsonb;
comment on column trol3.asesorias.preparacion is 'Copiloto (172): "prepárame la asesoría" — {resumen, orden[], objeciones[], cuidado[], generado_en, modelo}.';
comment on column trol3.asesorias.copiloto is 'Copiloto (172): respuestas a las preguntas preparadas, por clave — {clave: {texto, en}}.';
