-- 169: la asesoría termina en algo (fase 3c).
--
-- Los pasos 4 y 5 dejan de ser un letrero. La sesión se liga a SU diagnóstico;
-- la vista trae la propuesta de cada oportunidad, el diagnóstico (estrategia,
-- acuerdos, estado y si el cliente ya lo pagó) y los pendientes abiertos, para
-- que el asesor y "Presentar" lean lo mismo. Y cerrar la asesoría mueve al
-- cliente a `asesorado` — antes había que acordarse de hacerlo a mano.

create or replace function trol3.asesoria_ligar_diagnostico(p_id uuid, p_diagnostico uuid)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  update trol3.asesorias a set diagnostico_id = p_diagnostico, updated_at = now()
   where a.id = p_id
     and exists (select 1 from trol3.diagnosticos d where d.id = p_diagnostico and d.persona_id = a.persona_id);
  if not found then raise exception 'asesoria_o_diagnostico_no_coinciden'; end if;
end $function$;

revoke all on function trol3.asesoria_ligar_diagnostico(uuid, uuid) from public, anon;
grant execute on function trol3.asesoria_ligar_diagnostico(uuid, uuid) to authenticated, service_role;

do $patch$
declare
  def text; r record;
begin
  -- (a) cerrar la asesoría = cliente asesorado
  def := pg_get_functiondef('trol3.asesoria_marcar(uuid,integer,text,boolean,uuid,boolean)'::regprocedure);
  for r in select * from (values
    ($a$perform trol3.registrar_interaccion(a.persona_id, 'nota', 'asesor', mid, 'interna', 'Cerró la asesoría'$a$,
     $b$update trol3.personas p set etapa = 'asesorado'
     where p.id = a.persona_id and p.etapa::text in ('nuevo','conversando','expediente_base');
    if found then perform trol3.evaluar_persona_seguro(a.persona_id); end if;
    perform trol3.registrar_interaccion(a.persona_id, 'nota', 'asesor', mid, 'interna', 'Cerró la asesoría'$b$)
  ) as t(ancla, nuevo) loop
    if (length(def) - length(replace(def, r.ancla, ''))) / length(r.ancla) <> 1 then raise exception '169: ancla de asesoria_marcar'; end if;
    def := replace(def, r.ancla, r.nuevo);
  end loop;
  execute def;

  -- (b) la vista trae propuesta, diagnóstico y pendientes
  def := pg_get_functiondef('trol3.asesoria_vista(uuid)'::regprocedure);
  for r in select * from (values
    ($a$'motivo', o.motivo, 'urgencia', o.urgencia_fecha,$a$,
     $b$'motivo', o.motivo, 'urgencia', o.urgencia_fecha, 'propuesta', o.propuesta,$b$),
    ($a$'sesion', ses);$a$,
     $b$'sesion', ses,
    -- 169: el diagnóstico de ESTA sesión; si aún no se liga, el último del cliente
    'diagnostico', (select jsonb_build_object('id', d.id, 'estado', d.estado, 'entregado_en', d.entregado_en,
                           'estrategia', d.contenido->'narrativa'->>'estrategia_oportunidades',
                           'acuerdos', d.contenido->>'acuerdos',
                           'ligado', d.id::text = ses->>'diagnostico_id',
                           'pagado', trol3.tiene_beneficio(p_persona, 'diagnostico_avanzado'))
                      from trol3.diagnosticos d where d.persona_id = p_persona
                     order by (d.id::text = ses->>'diagnostico_id') desc, d.creado_en desc limit 1),
    'pendientes', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo, 'vence_el', t.vence_el,
                           'responsable', split_part(coalesce(m.nombre, ''), ' ', 1)) order by t.vence_el nulls last), '[]'::jsonb)
                     from trol3.tareas t left join trol3.miembros m on m.id = t.responsable_id
                    where t.persona_id = p_persona and t.estado = 'pendiente' and t.origen = 'diagnostico'));$b$)
  ) as t(ancla, nuevo) loop
    if (length(def) - length(replace(def, r.ancla, ''))) / length(r.ancla) <> 1 then raise exception '169: ancla de asesoria_vista: %', r.ancla; end if;
    def := replace(def, r.ancla, r.nuevo);
  end loop;
  execute def;
end $patch$;