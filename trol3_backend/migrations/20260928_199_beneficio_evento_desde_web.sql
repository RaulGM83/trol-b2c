-- 199 · El alta web del FIP fallaba con 'no_autorizado' (Pamela de Millas, 28-sep 17:05).
-- otorgar_beneficio rechaza a quien tiene sesión y no es miembro del equipo; alta_web_evento corre
-- con la sesión del cliente y la llamaba para dar la sesión de cortesía → la RPC entera se caía
-- (400) y no quedaba ni la persona. El trigger tg_persona_evento tenía el mismo choque, pero se
-- lo tragaba (exception when others). Las pruebas de 190/193e fueron sin sesión de cliente.
--
-- Se separa el "otorgar" interno (sin la revisión de quién llama, sólo para funciones del
-- sistema) del RPC público, que conserva su candado.

do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.otorgar_beneficio(uuid,text,text,text,text,timestamp with time zone)'::regprocedure);
  src := replace(src, 'FUNCTION trol3.otorgar_beneficio(', 'FUNCTION trol3._otorgar_beneficio(');
  src := replace(src, $a$  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
$a$, '');
  if position('_otorgar_beneficio(' in src) = 0 or position('no_autorizado' in src) > 0 then
    raise exception 'parche 199 (_otorgar_beneficio) no encajó';
  end if;
  execute src;
end $$;
revoke all on function trol3._otorgar_beneficio(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;

-- alta_web_evento y el trigger del evento usan la interna
do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.alta_web_evento(text,text,text,boolean,text)'::regprocedure);
  src := replace(src, 'perform trol3.otorgar_beneficio(pid, benef,', 'perform trol3._otorgar_beneficio(pid, benef,');
  if position('trol3._otorgar_beneficio(pid' in src) = 0 then raise exception 'parche 199 (alta_web_evento) no encajó'; end if;
  execute src;

  src := pg_get_functiondef('trol3.tg_persona_evento()'::regprocedure);
  src := replace(src, 'perform trol3.otorgar_beneficio(new.id, benef,', 'perform trol3._otorgar_beneficio(new.id, benef,');
  if position('trol3._otorgar_beneficio(new.id' in src) = 0 then raise exception 'parche 199 (tg_persona_evento) no encajó'; end if;
  execute src;
end $$;
