-- 092 (31-ago-2026): tipo 'sitio' en el catálogo de códigos de invitación.
--
-- Contexto: los links del sitio nuevo (trol.mx) son hoy el 98% del tráfico
-- medible (sitio 75, asesorias 37, blog 21 clics en agosto) pero no estaban
-- dados de alta, así que el panel de atribución los pintaba como "campaña sin
-- registrar", sin etiqueta y revueltos con los códigos históricos de HubSpot.
--
-- El canal de una entrada por el sitio es 'organico' aunque el bot mande otro
-- p_canal: el código manda sobre el default.
--
-- Aplicada vía MCP el 31-ago-2026.

alter table trol3.codigos_invitacion drop constraint codigos_invitacion_tipo_check;
alter table trol3.codigos_invitacion add constraint codigos_invitacion_tipo_check
  check (tipo = any (array['asesor','cliente','prensa','campania','sitio']));

insert into trol3.codigos_invitacion (codigo, tipo, etiqueta) values
  ('sitio',     'sitio', 'Sitio trol.mx'),
  ('asesorias', 'sitio', 'Sitio — Asesorías'),
  ('blog',      'sitio', 'Sitio — Blog'),
  ('calcula',   'sitio', 'Sitio — Calculadora')
on conflict (codigo) do update
  set tipo = excluded.tipo, etiqueta = coalesce(trol3.codigos_invitacion.etiqueta, excluded.etiqueta);

-- alta_por_telefono: único cambio contra 076 es la rama 'sitio' del case.
-- (El cuerpo completo quedó aplicado en la base; ver migración en Supabase
-- 092_codigos_tipo_sitio para el texto íntegro de la función.)
