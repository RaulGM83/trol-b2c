-- 269 · Documentos legales versionados (aviso de privacidad, términos) servidos en trol.mx/privacidad.
-- Publicar versión nueva: insert con publicado = true y vigente_desde; la página la toma sola (ISR 5 min).
-- Contenido de la versión 2026-10-29: web/aviso-de-privacidad-2026-10-29-PUBLICAR.md
create table if not exists trol3.documentos_legales (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('aviso_privacidad','terminos')),
  version text not null,
  titulo text not null,
  contenido_md text not null,
  vigente_desde date not null,
  publicado boolean not null default false,
  notas_internas text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (tipo, version)
);
alter table trol3.documentos_legales enable row level security;
drop policy if exists documentos_legales_miembros on trol3.documentos_legales;
create policy documentos_legales_miembros on trol3.documentos_legales for all to authenticated
  using (trol3.es_miembro()) with check (trol3.es_miembro());

create or replace function trol3.legal_vigente(p_tipo text default 'aviso_privacidad', p_version text default null)
returns jsonb language sql stable security definer set search_path to 'trol3','public' as $f$
  select coalesce((
    select jsonb_build_object('tipo', d.tipo, 'version', d.version, 'titulo', d.titulo, 'contenido_md', d.contenido_md, 'vigente_desde', d.vigente_desde,
             'versiones', (select jsonb_agg(jsonb_build_object('version', x.version, 'vigente_desde', x.vigente_desde) order by x.vigente_desde desc)
                             from trol3.documentos_legales x where x.tipo = d.tipo and x.publicado))
      from trol3.documentos_legales d
     where d.tipo = p_tipo and d.publicado and (p_version is null or d.version = p_version) and d.vigente_desde <= current_date
     order by d.vigente_desde desc, d.created_at desc limit 1), 'null'::jsonb);
$f$;
grant execute on function trol3.legal_vigente(text, text) to anon, authenticated, service_role;
grant select, insert, update on trol3.documentos_legales to authenticated, service_role;
-- Datos: _claude_tmp/251b_aviso_2026-10-29.sql (insert de la versión 2026-10-29, ya aplicado en producción).
