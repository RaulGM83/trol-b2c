-- 147: mientras el cliente está adentro de su cuenta Trol, no se le manda nada.
--
-- Una plantilla que llega mientras está leyendo sus números interrumpe justo a
-- quien ya estaba prestando atención, y encima gasta plantilla. Es la peor
-- relación coste/beneficio de todo el sistema: le pagamos a Meta por sacarlo de
-- donde queríamos llevarlo.
--
-- La señal es app_visto_en, que /mi sella en cada carga. El nudge y la cola de
-- envíos la respetan; /avisar NO, a propósito: eso es una respuesta a algo que
-- pasó (su información llegó, su experto encontró algo) y ahí la interrupción
-- es el servicio, no el ruido.
alter table trol3.personas add column if not exists app_visto_en timestamptz;
comment on column trol3.personas.app_visto_en is
  'Última vez que el cliente abrió su cuenta Trol (/mi). Se usa para no interrumpirlo con plantillas mientras está adentro.';

create index if not exists personas_app_visto_idx on trol3.personas (app_visto_en desc nulls last);

-- La llama /mi en cada carga. Sella sólo a quien está viendo su propia cuenta.
create or replace function trol3.marcar_visto_en_app()
returns void
language sql
security definer
set search_path to 'trol3','public'
as $$
  update trol3.personas set app_visto_en = now() where id = trol3.current_persona_id()
$$;
grant execute on function trol3.marcar_visto_en_app() to authenticated;

-- 147: se cae el nudge si abrió su cuenta en la última media hora.
create or replace function trol3.pendientes_nudge(p_min_horas numeric default 3, p_max_horas numeric default 22)
returns table(persona_id uuid, telefono text, nombre text, etapa text, horas numeric, tiene_curp boolean, ley text, ultimo_evento text, nudges_previos integer)
language sql
stable security definer
set search_path to 'trol3','public'
as $$
  with base as (
    select p.id, p.nombre, p.etapa, p.curp, p.app_visto_en,
           (select max(created_at) from trol3.eventos ev where ev.persona_id = p.id and (ev.actor_tipo in ('cliente','bot') or ev.tipo in ('persona_alta','persona_reingreso'))) ult_cliente,
           (select count(*) from trol3.interacciones i where i.persona_id = p.id and i.metadata->>'nudge' = '1' and i.created_at > now() - interval '24 hours') nudges,
           (select max(created_at) from trol3.eventos ev where ev.persona_id = p.id and ev.tipo = 'handoff') ult_handoff
    from trol3.personas p where p.merged_into is null and p.created_at > now() - interval '30 days'
      and p.etapa in ('nuevo','conversando','expediente_base')
      and exists (select 1 from trol3.eventos ev where ev.persona_id = p.id and ev.tipo in ('persona_alta','persona_reingreso') and ev.created_at > now() - interval '24 hours')
  )
  select b.id, (select c.normalizado from trol3.contactos c where c.persona_id = b.id and c.tipo='telefono' and not c.no_contactar order by c.principal desc limit 1),
         b.nombre, b.etapa, round(extract(epoch from (now() - b.ult_cliente))/3600, 1), b.curp is not null,
         (select v.valor#>>'{}' from trol3.v_mejor_dato v where v.persona_id = b.id and v.campo='ley'),
         (select tipo from trol3.eventos ev where ev.persona_id = b.id order by created_at desc limit 1), b.nudges::int
  from base b
  where b.ult_cliente < now() - (p_min_horas||' hours')::interval and b.ult_cliente > now() - (p_max_horas||' hours')::interval
    and b.nudges = 0 and (b.ult_handoff is null or b.ult_handoff < b.ult_cliente)
    and (b.app_visto_en is null or b.app_visto_en < now() - interval '30 minutes')
    and trol3.es_miembro() is not false
$$;

-- 147: lo mismo para la cola de campañas. Un envío programado puede esperar
-- media hora; sacar al cliente de su cuenta no se deshace.
create or replace function trol3.cola_envios_pendientes(p_limit integer default 200)
returns setof trol3.cola_envios
language sql
stable security definer
set search_path to 'trol3','public'
as $$
  select c.* from trol3.cola_envios c
  where c.enviado_at is null and c.telefono is not null
    and not exists (
      select 1 from trol3.personas p
      where p.id = c.persona_id and p.app_visto_en > now() - interval '30 minutes'
    )
  order by c.creado_at
  limit p_limit
$$;
