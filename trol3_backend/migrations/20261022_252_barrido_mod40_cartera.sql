-- 252 — Barrido de cartera tras apagar mod40_retro (claude/106 §5/§8).
--
-- · `detectada`/`posible` → `no_aplica` con motivo (el motor ya no las produce).
-- · `presentada`/`interesada`/`en_proceso` NO se pisan (regla 206): llevan nota
--   y salen en `v_mod40_por_revisar` para que el equipo las cierre a mano
--   (Viraal confirma primero si alguien alcanzó a inscribirse).
-- · La reevaluación masiva (evaluar_persona para toda Ley 73) se corre DESPUÉS
--   del recálculo n8n v5.8, no aquí: sin `mod40_caminos` pension_hoy saldría
--   sin los tres caminos.

insert into trol3.catalogo_motivos_perdida (codigo, nombre, orden, activo)
values ('cambio_regulatorio', 'Cambio regulatorio (acuerdo DOF 21-oct-2026)', (select coalesce(max(orden),0)+1 from trol3.catalogo_motivos_perdida), true)
on conflict (codigo) do nothing;

update trol3.oportunidades o set
  estado = 'no_aplica',
  cerrada_en = now(),
  motivo_perdida = coalesce(motivo_perdida, 'cambio_regulatorio'),
  nota_estado = coalesce(nota_estado || ' | ', '') || '[252] Cerrada por el acuerdo DOF 21-oct-2026: la Mod 40 ya no se paga hacia atrás.'
where o.codigo = 'mod40_retro' and o.estado in ('detectada','posible');

update trol3.oportunidades o set
  nota_estado = coalesce(nota_estado || ' | ', '') || '[252] Acuerdo DOF 21-oct-2026: ya no hay retro. Viraal confirma si alcanzó a inscribirse; si no, cerrar como perdida (cambio_regulatorio) y trabajar pension_hoy con los tres caminos.'
where o.codigo = 'mod40_retro' and o.estado in ('presentada','interesada','en_proceso')
  and coalesce(nota_estado,'') not like '%[252]%';

-- Lista de trabajo para Mi cartera / Viraal. Analítica de equipo: definer con
-- es_miembro() adentro (con invoker se iba a timeout, ver claude/96).
create or replace view trol3.v_mod40_por_revisar
with (security_invoker = false) as
select o.id as oportunidad_id, o.persona_id,
       p.nombre || ' ' || p.apellidos as nombre, p.curp, p.nss,
       extract(year from age(p.fecha_nacimiento))::int as edad,
       o.estado, o.proveedor, o.estado_desde::date as estado_desde, o.valor_estimado, o.nota_estado,
       (select valor#>>'{}' from trol3.v_mejor_dato d where d.persona_id = p.id and d.campo = 'status_empleo') as status_empleo,
       (select valor#>>'{}' from trol3.v_mejor_dato d where d.persona_id = p.id and d.campo = 'ultima_modalidad') as ultima_modalidad,
       (select trol3.jnum(valor) from trol3.v_mejor_dato d where d.persona_id = p.id and d.campo = 'pension_base') as pension_base,
       exists (select 1 from trol3.oportunidades q where q.persona_id = p.id and q.codigo = 'pension_hoy' and q.estado in ('detectada','presentada','interesada','en_proceso')) as tiene_pension_hoy,
       p.cabecera_id
from trol3.oportunidades o
join trol3.personas p on p.id = o.persona_id
where o.codigo = 'mod40_retro' and o.estado in ('presentada','interesada','en_proceso')
  and p.merged_into is null
  and trol3.es_miembro();
comment on view trol3.v_mod40_por_revisar is '252: Mod 40 en vuelo al 22-oct-2026 (presentada/interesada/en_proceso). Viraal confirma inscripción; si no, cerrar y trabajar pension_hoy.';
revoke all on trol3.v_mod40_por_revisar from public, anon;
grant select on trol3.v_mod40_por_revisar to authenticated, service_role;
