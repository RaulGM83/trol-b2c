-- 241 · 15-oct-2026 · FIP: reparto sólo entre Raúl y Andrea; los de Lore/Vero pasan a Andrea
-- (Raúl se queda con Ricardo y Stephanie); las 4 citas que Vero agendó por chat se registran a mano
-- (45 min, como se agendaron). Vero agenda con el link de 20 min del experto y n8n las registra solas.
do $$
declare raul uuid := '0dfd18d7-2b1e-4627-905e-6f75d347cbcf'; andrea uuid := '06905404-7fa5-4cf1-800a-484fa0368a84'; vero uuid := '8ca554da-15d1-4909-b622-a98ddd3053ce';
begin
  execute format($q$ update trol3.config set valor = jsonb_set(valor::jsonb, '{fip2026}', %L::jsonb)::text where clave = 'evento_asesores' $q$,
                 jsonb_build_array(raul, andrea)::text);
  execute format($q$ update trol3.personas p set cabecera_id = %L
     where p.merged_into is null and p.cabecera_id in (%L, %L)
       and (p.codigo_origen = 'fip2026' or exists (select 1 from trol3.eventos ev where ev.persona_id = p.id and ev.tipo = 'consentimiento' and ev.payload ->> 'codigo' = 'fip2026')) $q$,
     andrea, '13d4c6ce-d915-4451-9d85-46668b6cb889', vero);
  execute format($q$ insert into trol3.citas (persona_id, miembro_id, inicio, fin, estado, origen, notas, fuente, titulo) values
    ('fcf5dde8-1848-44ee-8318-a3898a7f5601', %1$L, '2026-10-16 10:00-06', '2026-10-16 10:45-06', 'programada', 'asesor', 'Agendada por Vero en Tako (FIP)', 'manual', 'Asesoría FIP'),
    ('7661e696-9a1d-40e7-9aae-1ec8047220d5', %1$L, '2026-10-16 11:00-06', '2026-10-16 11:45-06', 'programada', 'asesor', 'Agendada por Vero en Tako (FIP)', 'manual', 'Asesoría FIP'),
    ('43007439-2291-4103-a509-27a138dbda8c', %2$L, '2026-10-16 12:00-06', '2026-10-16 12:45-06', 'programada', 'asesor', 'Agendada por Vero en Tako (FIP)', 'manual', 'Asesoría FIP'),
    ('d9a835ea-822e-48b4-aebe-9306ec49516c', %1$L, '2026-10-19 10:00-06', '2026-10-19 10:45-06', 'programada', 'asesor', 'Agendada por Vero en Tako (FIP) · lunes propuesto, confirmar', 'manual', 'Asesoría FIP') $q$,
    andrea, raul);
end $$;
