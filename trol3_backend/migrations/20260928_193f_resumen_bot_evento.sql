-- 193f · Lo que Lukas necesita para el FIP (v20.7): de qué código viene, si es de un evento con
-- patrocinio, y el link de citas de SU experto (para agendar la sesión de cortesía).
do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.resumen_bot(uuid)'::regprocedure);
  if position('link_citas' in src) > 0 then return; end if;
  src := replace(src,
    $a$    'cabecera', (select nombre from trol3.miembros m where m.id = e.cabecera_id),$a$,
    $b$    'cabecera', (select nombre from trol3.miembros m where m.id = e.cabecera_id),
    'codigo_origen', (select p.codigo_origen from trol3.personas p where p.id = e.persona_id),
    'evento', (select nullif(trol3.marca_evento(p.codigo_origen), '{}'::jsonb) from trol3.personas p
                where p.id = e.persona_id and trol3.marca_evento(p.codigo_origen) ->> 'patrocinio' is not null),
    'link_citas', (trol3.link_citas_para(e.persona_id) ->> 'link'),$b$);
  if position('link_citas' in src) = 0 then raise exception 'parche 193f a resumen_bot no encajó'; end if;
  execute src;
end $$;
