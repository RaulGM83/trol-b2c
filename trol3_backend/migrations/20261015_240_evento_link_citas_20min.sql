-- 240 · 15-oct-2026 · La sesión de cortesía del FIP es de 20 min (las páginas generales son de 45).
-- config evento_link_citas = { codigo: { miembro_id: link, "default"?: link } }; link_citas_para
-- usa primero el del evento vigente (el de su experto o el default) y si no, lo de siempre.
insert into trol3.config (clave, valor)
values ('evento_link_citas', '{"fip2026": {"0dfd18d7-2b1e-4627-905e-6f75d347cbcf": "https://calendar.app.google/wLFXgHdPALddvjLD8", "06905404-7fa5-4cf1-800a-484fa0368a84": "https://calendar.app.google/LMS2kaS9fyZGtb4L9"}}')
on conflict (clave) do nothing;

create or replace function trol3.link_citas_para(p_persona uuid)
returns jsonb language plpgsql stable security definer set search_path to 'trol3','public' as $$
declare cod text; mapa jsonb; cab uuid; nom text; lk text;
begin
  cod := trol3._evento_vigente(p_persona);
  if cod is not null then
    select (cf.valor::jsonb) -> cod into mapa from trol3.config cf where cf.clave = 'evento_link_citas';
    select p.cabecera_id, m.nombre into cab, nom from trol3.personas p left join trol3.miembros m on m.id = p.cabecera_id where p.id = p_persona;
    lk := coalesce(mapa ->> cab::text, mapa ->> 'default');
    if coalesce(lk, '') <> '' then
      return jsonb_build_object('link', lk, 'miembro_id', case when mapa ? cab::text then cab end,
                                'miembro', case when mapa ? cab::text then nom end, 'general', not (mapa ? cab::text), 'evento', cod);
    end if;
  end if;
  return coalesce(
    (select jsonb_build_object('link', m.link_citas, 'miembro_id', m.id, 'miembro', m.nombre, 'general', false)
       from trol3.personas p join trol3.miembros m on m.id = p.cabecera_id
      where p.id = p_persona and m.activo and coalesce(m.link_citas,'') <> ''),
    (select jsonb_build_object('link', c.valor, 'miembro_id', null, 'miembro', null, 'general', true)
       from trol3.config c where c.clave = 'citas_link_general' and coalesce(c.valor,'') <> ''),
    '{}'::jsonb);
end $$;
