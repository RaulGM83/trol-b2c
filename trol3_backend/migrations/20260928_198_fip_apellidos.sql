-- 198 · /fip pide nombre(s) y apellidos por separado (Raul, 28-sep). alta_web_evento recibe
-- p_apellidos (opcional, al final: la app vieja sigue funcionando) y lo guarda en
-- personas.apellidos sólo si estaba vacío (no se pisa lo que ya teníamos).

do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.alta_web_evento(text,text,text,boolean)'::regprocedure);
  src := replace(src,
    'alta_web_evento(p_codigo text, p_nombre text, p_curp text, p_consentimiento boolean)',
    'alta_web_evento(p_codigo text, p_nombre text, p_curp text, p_consentimiento boolean, p_apellidos text DEFAULT NULL::text)');
  src := replace(src,
    $a$    perform trol3.declarar(pid, 'nombre', to_jsonb(btrim(p_nombre)), 'cliente', null, 'declarado');
  end if;$a$,
    $b$    perform trol3.declarar(pid, 'nombre', to_jsonb(btrim(p_nombre)), 'cliente', null, 'declarado');
  end if;
  -- 198: apellidos desde la web del evento; sólo si no los teníamos
  if nullif(btrim(p_apellidos), '') is not null then
    update trol3.personas set apellidos = btrim(regexp_replace(p_apellidos, '\s+', ' ', 'g'))
     where id = pid and nullif(btrim(apellidos), '') is null;
  end if;$b$);
  if position('p_apellidos text DEFAULT' in src) = 0 or position('198: apellidos' in src) = 0 then
    raise exception 'parche 198 a alta_web_evento no encajó';
  end if;
  drop function trol3.alta_web_evento(text, text, text, boolean);
  execute src;
end $$;

revoke all on function trol3.alta_web_evento(text, text, text, boolean, text) from public, anon;
grant execute on function trol3.alta_web_evento(text, text, text, boolean, text) to authenticated, service_role;
