-- 210b · Una cita que registra el equipo no es un gesto del cliente (claude/95).
-- Sin esto, "Registrar sesión" lo volvía caliente·reacciono 7 días y la regla de
-- "Favoritos hasta dos días antes" no se veía nunca.
create or replace function trol3._ultimo_gesto(p uuid) returns timestamp with time zone
language sql stable security definer set search_path to 'trol3', 'public' as $function$
  select max(t) from (
    select tako_visto_en t from trol3.personas where id = p
    union all select app_visto_en from trol3.personas where id = p
    union all select max(created_at) from trol3.interacciones
              where persona_id = p
                and (direccion = 'entrante' or actor_tipo::text = 'cliente'
                     or metadata->>'resultado' in ('contesto','atendido_chat'))
    union all select max(created_at) from trol3.eventos
              where persona_id = p and tipo in ('handoff','persona_alta','persona_reingreso','link_abierto','documento_subido',
                                                'curp_capturada','cita_creada','oportunidad_interesada','pago_recibido','alta_atribuida')
                and not (tipo = 'cita_creada' and actor_tipo::text in ('asesor','recepcionista','sistema'))
    union all select max(created_at) from trol3.eventos_archivo
              where persona_id = p and tipo in ('handoff','persona_alta','persona_reingreso','link_abierto','documento_subido',
                                                'curp_capturada','cita_creada','oportunidad_interesada','pago_recibido','alta_atribuida')
                and not (tipo = 'cita_creada' and actor_tipo::text in ('asesor','recepcionista','sistema'))
  ) g
$function$;
