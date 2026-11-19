-- 315: saber de verdad si la ventana de 24 h de WhatsApp está abierta.
-- Aplicada en producción el 19-nov-2026. El texto completo de las funciones está en la base
-- (migración 315_ventana_whatsapp_actividad_cliente); aquí queda el resumen ejecutable.
--
-- Problema: Tako acepta el system-event aunque la ventana esté cerrada (contesta 200) y el
-- mensaje del bot se pierde; /avisar creía que había salido y no mandaba la plantilla. Además
-- el bot, al recibir el evento, llamaba trolHandoff y salía el correo «pide hablar con experto»
-- sin que el cliente hubiera escrito.
--
-- Regla (Raúl, 19-nov): en duda, plantilla.

alter table trol3.personas add column if not exists tako_cliente_en timestamptz;
alter table trol3.personas add column if not exists tako_evento_en timestamptz;

-- registrar_conversacion_tako: además de la conversación, sella tako_cliente_en cuando el bot
-- usa una herramienta y NO acabamos de inyectarle un evento (90 s).
-- wa_ventana_abierta(persona): hay conversación y tako_cliente_en en las últimas 23 h.
-- marcar_evento_tako(persona): /avisar lo llama justo antes de inyectar el evento.
-- handoff(...): si el actor es el bot y hubo evento nuestro en los últimos 30 s, no crea el
--   evento ni marca oportunidades; deja una nota interna «Handoff automático ignorado».
--
-- Para reconstruirlas:  select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n
--   on n.oid = p.pronamespace where n.nspname = 'trol3'
--   and p.proname in ('registrar_conversacion_tako','wa_ventana_abierta','marcar_evento_tako','handoff');
