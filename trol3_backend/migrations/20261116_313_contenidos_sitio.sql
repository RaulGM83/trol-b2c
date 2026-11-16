-- 313: contenido del sitio (artículos del blog y guías de los pilares) sin despliegue.
-- «Campañas y redes» inserta borradores; solo un administrador con sesión en /trabajo publica.
-- Aplicada en producción el 16-nov-2026.

create table if not exists trol3.contenidos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'articulo' check (tipo in ('articulo','guia')),
  pilar text not null default 'pensiones' check (pilar in ('pensiones','infonavit','marca')),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titulo text not null,
  resumen text not null default '',
  cuerpo_md text not null default '',
  autor text not null default 'Equipo Trol',
  preguntas jsonb not null default '[]'::jsonb,          -- [{"pregunta": "...", "respuesta": "..."}]
  codigo_atribucion text,                                 -- código de /i/<codigo> para el botón de WhatsApp
  estado text not null default 'borrador' check (estado in ('borrador','publicado')),
  publicado_en timestamptz,
  actualizado_en timestamptz,                             -- fecha de actualización visible en la página
  requiere_revision_legal boolean not null default false,
  notas text,                                             -- notas internas para quien revisa; no se publican
  publicado_por uuid references trol3.miembros(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(preguntas) = 'array')
);
comment on table trol3.contenidos is 'Artículos y guías de trol.mx. Borradores por inserción directa; publicar exige administrador con sesión (tg_contenidos_candado).';
create index if not exists contenidos_publicados_idx on trol3.contenidos (tipo, pilar, publicado_en desc) where estado = 'publicado';

create or replace function trol3._es_admin_sesion() returns boolean
language sql stable security definer set search_path to 'trol3','public' as $$
  select exists (select 1 from trol3.miembros m where m.auth_user_id = auth.uid() and m.activo and 'admin' = any(m.roles))
$$;

create or replace function trol3.tg_contenidos_candado() returns trigger
language plpgsql security definer set search_path to 'trol3','public' as $$
declare es_admin boolean := trol3._es_admin_sesion();
begin
  if tg_op = 'DELETE' then
    if old.estado = 'publicado' and not es_admin then
      raise exception 'contenido_publicado: solo un administrador con sesión en /trabajo puede borrar contenido publicado';
    end if;
    return old;
  end if;

  new.codigo_atribucion := nullif(lower(btrim(coalesce(new.codigo_atribucion, ''))), '');

  if tg_op = 'INSERT' then
    if new.estado = 'publicado' and not es_admin then
      raise exception 'solo_borrador: el contenido se inserta como borrador; lo publica un administrador desde /trabajo/contenido';
    end if;
  else
    if (old.estado = 'publicado' or new.estado = 'publicado') and not es_admin then
      raise exception 'contenido_publicado: solo un administrador con sesión en /trabajo publica o cambia contenido publicado';
    end if;
    new.updated_at := now();
  end if;

  if new.estado = 'publicado' then
    if tg_op = 'INSERT' or old.estado <> 'publicado' then
      new.publicado_en := coalesce(new.publicado_en, now());
      new.publicado_por := (select m.id from trol3.miembros m where m.auth_user_id = auth.uid() limit 1);
    end if;
    new.actualizado_en := coalesce(new.actualizado_en, new.publicado_en);
  end if;
  return new;
end $$;

drop trigger if exists tg_contenidos_candado on trol3.contenidos;
create trigger tg_contenidos_candado before insert or update or delete on trol3.contenidos
  for each row execute function trol3.tg_contenidos_candado();

alter table trol3.contenidos enable row level security;
drop policy if exists contenidos_publico on trol3.contenidos;
create policy contenidos_publico on trol3.contenidos for select to anon, authenticated using (estado = 'publicado');
drop policy if exists contenidos_equipo on trol3.contenidos;
create policy contenidos_equipo on trol3.contenidos for all to authenticated using (trol3.es_miembro()) with check (trol3.es_miembro());

grant select on trol3.contenidos to anon;
grant select, insert, update, delete on trol3.contenidos to authenticated;
