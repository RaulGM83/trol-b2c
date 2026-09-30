-- 204 · Diagnóstico básico por chat (claude/91). Sustituye al Doc DIA_BAS de n8n: una
-- imagen 1080x1350 que arma la app con lo ya calculado (semilla + oportunidades) y que
-- el asesor manda por WhatsApp con la liga a /mi. Sin montos en oportunidades.

-- Línea corta por oportunidad para la imagen (el nombre para el cliente ya existe).
alter table trol3.catalogo_oportunidades add column if not exists frase_corta text;
comment on column trol3.catalogo_oportunidades.frase_corta is
  'Una línea (≤ 60 caracteres, sin montos) bajo nombre_cliente en el diagnóstico básico (204).';

update trol3.catalogo_oportunidades c set frase_corta = v.f
from (values
  ('inconsistencia_imss',      'Algo no cuadra en tu registro y se puede corregir.'),
  ('unificacion_nss',          'Tus semanas están repartidas en dos números.'),
  ('reconocimiento_semanas',   'Hay semanas que trabajaste y no se te cuentan.'),
  ('recuperar_ley73',          'Tu número de seguridad social es anterior a 1997.'),
  ('reactivacion_mod10',       'Se recuperan cotizando doce meses por tu cuenta.'),
  ('pension_hoy',              'Cumples edad, semanas y derechos.'),
  ('mod40_retro',              'En Ley 73 puede cambiar mucho tu pensión.'),
  ('mod40_prospectiva',        'Cotizar por tu cuenta sube tu promedio.'),
  ('credito_pension',          'Se descuenta directo de tu pensión.'),
  ('cambio_afore',             'No todas rinden igual y cambiarte no cuesta.'),
  ('cuenta_sin_registrar',     'Sin registro no puedes ahorrar ni hacer trámites.'),
  ('mejoravit_activo',         'Estás cotizando y no tienes crédito vigente.'),
  ('credito_infonavit_activo', 'Tu saldo de vivienda te da para un crédito.'),
  ('compra_inmueble',          'Tu saldo de vivienda puede ser tu enganche.'),
  ('ahorro_voluntario',        'La forma más directa de cerrar la brecha.'),
  ('seguros',                  'Que los tuyos queden protegidos.')
) v(codigo, f)
where c.codigo = v.codigo;

-- El asesor copió o descargó el diagnóstico básico para mandarlo. Queda en la historia
-- (una vez cada 30 min aunque apriete varios botones) y cuenta como link /mi compartido.
create or replace function trol3.registrar_diagnostico_basico(p_persona uuid, p_accion text)
returns void
language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare mid uuid;
begin
  mid := trol3.current_miembro_id();
  if mid is null then raise exception 'solo_miembros'; end if;
  if not exists (
    select 1 from trol3.interacciones
     where persona_id = p_persona and metadata->>'diagnostico_basico' = 'si'
       and created_at > now() - interval '30 minutes'
  ) then
    insert into trol3.interacciones (persona_id, canal, actor_tipo, actor_id, direccion, contenido, visible_cliente, metadata)
    values (p_persona, 'wa', 'asesor', mid, 'saliente',
            'Diagnóstico básico preparado para mandar por WhatsApp (imagen + liga a su cuenta)', false,
            jsonb_build_object('diagnostico_basico', 'si', 'accion', p_accion));
    perform trol3.emitir_evento(p_persona, 'diagnostico_basico_enviado', 'asesor', mid,
      jsonb_build_object('accion', p_accion));
  end if;
  if p_accion = 'mensaje' then
    perform trol3.emitir_evento(p_persona, 'mi_link_generado', 'asesor', mid,
      jsonb_build_object('campania', 'diagnostico_basico', 'accion', 'copiado'));
  end if;
end $$;
revoke all on function trol3.registrar_diagnostico_basico(uuid, text) from public, anon;
grant execute on function trol3.registrar_diagnostico_basico(uuid, text) to authenticated;
