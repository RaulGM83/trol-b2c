-- 146: archivar el rezago de eventos que nadie va a procesar.
--
-- Quedaron 104k eventos con procesado_at null porque el push a n8n emitía de
-- todo antes de la lista blanca (140) y el workflow que los consumía lleva
-- meses apagado. No son trabajo pendiente: son historia. Se mueven enteros a
-- eventos_archivo en vez de marcarse como "procesados", que sería mentir sobre
-- lo que pasó con ellos, y en vez de borrarse, que perdería la bitácora.
--
-- El corte es el momento de la migración: lo que entre después es rezago nuevo
-- y hay que mirarlo, no archivarlo.
create table if not exists trol3.eventos_archivo (
  like trol3.eventos including defaults,
  archivado_at timestamptz not null default now(),
  archivado_por text not null default 'migracion_146'
);
comment on table trol3.eventos_archivo is
  'Eventos que nunca se procesaron y ya no se van a procesar. Solo lectura: si algo hay que reprocesar, se copia de vuelta a mano.';

alter table trol3.eventos_archivo enable row level security;

create index if not exists eventos_archivo_persona_idx on trol3.eventos_archivo (persona_id);
create index if not exists eventos_archivo_tipo_fecha_idx on trol3.eventos_archivo (tipo, created_at);

with viejos as (
  delete from trol3.eventos
  where procesado_at is null and created_at < now()
  returning *
)
insert into trol3.eventos_archivo (id, persona_id, tipo, actor_tipo, actor_id, payload, created_at, procesado_at, error)
select id, persona_id, tipo, actor_tipo, actor_id, payload, created_at, procesado_at, error from viejos;
