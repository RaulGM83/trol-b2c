-- 170: fichas de conocimiento (fase 4a).
--
-- "La versión oficial de Trol" de cada tema y de cada oportunidad, revisada por
-- Raul el 21-sep (claude/73). Decisiones: edita sólo admin, leen todos los
-- miembros; la ficha manda sobre catalogo_oportunidades.frase_cliente (que queda
-- de respaldo para los códigos sin ficha, p. ej. `seguros`); aparece como panel
-- contextual en la asesoría; y `como_explicarlo` alimenta al redactor del
-- diagnóstico. `solo_asesor` NUNCA sale a Presentar, al PDF ni al redactor.
-- Los campos son markdown ligero (listas, **negritas**, *cursivas*).

create table trol3.fichas (
  codigo          text primary key,
  tipo            text not null check (tipo in ('tema','oportunidad')),
  titulo          text not null,
  oportunidades   text[] not null default '{}',
  orden           int not null default 100,
  frase           text not null,
  cuando_aplica   text,
  como_explicarlo text,
  preguntas       text,
  documentos      text,
  solo_asesor     text,
  en_diagnostico  text,
  activa          boolean not null default true,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references trol3.miembros(id)
);
comment on table trol3.fichas is 'Fichas de conocimiento (170). oportunidades = códigos de catalogo_oportunidades que cubre. solo_asesor nunca se le enseña al cliente.';
create index fichas_oportunidades_idx on trol3.fichas using gin (oportunidades);

create table trol3.fichas_historial (
  id          bigint generated always as identity primary key,
  codigo      text not null,
  antes       jsonb not null,
  cambiado_en timestamptz not null default now(),
  cambiado_por uuid
);

alter table trol3.fichas enable row level security;
alter table trol3.fichas_historial enable row level security;
create policy fichas_lee on trol3.fichas for select using (trol3.es_miembro());
create policy fichas_admin on trol3.fichas for all using (trol3.tiene_rol('admin'::trol3.rol_miembro)) with check (trol3.tiene_rol('admin'::trol3.rol_miembro));
create policy fichas_hist_lee on trol3.fichas_historial for select using (trol3.es_miembro());
grant select, insert, update, delete on trol3.fichas to authenticated, service_role;
grant select on trol3.fichas_historial to authenticated, service_role;

create or replace function trol3.tg_fichas_historial()
returns trigger
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
begin
  if to_jsonb(old) - 'updated_at' - 'updated_by' is distinct from to_jsonb(new) - 'updated_at' - 'updated_by' then
    insert into trol3.fichas_historial (codigo, antes, cambiado_por) values (old.codigo, to_jsonb(old), trol3.current_miembro_id());
    new.updated_at := now(); new.updated_by := trol3.current_miembro_id();
  end if;
  return new;
end $function$;

create trigger fichas_historial before update on trol3.fichas
  for each row execute function trol3.tg_fichas_historial();

comment on column trol3.catalogo_oportunidades.frase_cliente is 'DEPRECADA (170): manda trol3.fichas.frase. Sólo respaldo para códigos sin ficha.';

-- La asesoría lee la ficha: la frase sale de ahí, cada oportunidad dice cuál es su ficha,
-- y la vista trae todas las fichas activas para el panel contextual.
do $patch$
declare def text; r record;
begin
  def := pg_get_functiondef('trol3.asesoria_vista(uuid)'::regprocedure);
  for r in select * from (values
    ($a$'frase', c.frase_cliente,$a$,
     $b$'frase', coalesce((select f.frase from trol3.fichas f where f.activa and o.codigo = any(f.oportunidades) order by f.orden limit 1), c.frase_cliente),
           'ficha', (select f.codigo from trol3.fichas f where f.activa and o.codigo = any(f.oportunidades) order by f.orden limit 1),$b$),
    ($a$'sesion', ses,$a$,
     $b$'sesion', ses,
    'fichas', (select coalesce(jsonb_agg(to_jsonb(f) - 'updated_by' - 'activa' order by f.orden), '[]'::jsonb) from trol3.fichas f where f.activa),$b$)
  ) as t(ancla, nuevo) loop
    if (length(def) - length(replace(def, r.ancla, ''))) / length(r.ancla) <> 1 then raise exception '170: ancla de asesoria_vista: %', r.ancla; end if;
    def := replace(def, r.ancla, r.nuevo);
  end loop;
  execute def;
end $patch$;

-- Lo que el redactor del diagnóstico puede leer de las fichas de ESTE cliente:
-- sólo las de sus oportunidades abiertas (los temas ya viven en el prompt base, que además
-- sabe cuáles NO mencionar según la ley). Sin `solo_asesor`, a propósito.
create or replace function trol3.fichas_para_redactor(p_persona uuid)
returns text
language sql
stable security definer
set search_path to 'trol3', 'public'
as $function$
  select string_agg('## ' || f.titulo || E'\n' || f.frase || coalesce(E'\n' || f.como_explicarlo, ''), E'\n\n' order by f.orden)
    from trol3.fichas f
   where f.activa and f.como_explicarlo is not null
     and (auth.uid() is null or trol3.es_miembro())
     and (exists (
           select 1 from trol3.oportunidades o
            where o.persona_id = p_persona and o.codigo = any(f.oportunidades)
              and o.estado::text in ('detectada','presentada','interesada','en_proceso','ganada')));
$function$;
revoke all on function trol3.fichas_para_redactor(uuid) from public, anon;
grant execute on function trol3.fichas_para_redactor(uuid) to authenticated, service_role;
