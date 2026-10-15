-- 239 · 15-oct-2026 · Alta por chat (claude/103 §C).
-- Caso «Shanti» (614 148 8592): tocó «Prefiero por WhatsApp» en /fip, el bot leyó su expediente
-- (no existía) y nunca llamó trolAlta: no quedó persona ni código. Ahora:
--  · api-trol GET /expediente crea a la persona (sin código) cuando viene de una conversación;
--  · si después el bot sí llama trolAlta con su `ref:`, alta_por_telefono le pone el código a una
--    persona SIN origen nacida hace < 24 h (antes «no se reescribe el origen» la dejaba sin código);
--  · el reparto de asesor y la cortesía del evento corren también cuando el código llega tarde.

do $$
declare d text := pg_get_functiondef('trol3.alta_por_telefono(text,text,trol3.actor_tipo,text,text,text)'::regprocedure); n text;
begin
  n := replace(d,
    $a$    -- No se reescribe el origen de alguien que ya existía: el primer link es el que cuenta.$a$,
    $b$    -- No se reescribe el origen de alguien que ya existía: el primer link es el que cuenta.
    -- 239: salvo que haya nacido hace < 24 h SIN origen (la red de seguridad de /expediente o un
    -- alta sin ref): entonces este es su primer link de verdad.
    if cod is not null and exists (select 1 from trol3.personas x where x.id = pid and x.codigo_origen is null and x.created_at > now() - interval '24 hours') then
      update trol3.personas x set canal_origen = canal, campania_origen = p_campania, codigo_origen = cod,
             referidor_persona_id = coalesce(x.referidor_persona_id, ref_pid), miembro_origen_id = coalesce(x.miembro_origen_id, miem),
             cabecera_id = coalesce(x.cabecera_id, miem)
       where x.id = pid;
      perform trol3.emitir_evento(pid, 'alta_atribuida', p_actor, null,
        jsonb_build_object('codigo', cod, 'tipo', res->>'tipo', 'canal', canal, 'tardia', true));
    end if;$b$);
  if n = d then raise exception '239: ancla no encontrada'; end if;
  execute n;
end $$;

create or replace function trol3.tg_persona_evento()
returns trigger language plpgsql security definer set search_path to 'trol3','public' as $$
declare asesores jsonb; elegido uuid; benef text; etiq text;
begin
  if new.codigo_origen is null then return null; end if;
  if tg_op = 'UPDATE' and old.codigo_origen is not null then return null; end if;  -- 239: sólo el primer código
  select (cf.valor::jsonb) -> new.codigo_origen into asesores from trol3.config cf where cf.clave = 'evento_asesores';
  if asesores is not null and jsonb_typeof(asesores) = 'array' and jsonb_array_length(asesores) > 0 then
    select (a.v #>> '{}')::uuid into elegido
      from jsonb_array_elements(asesores) a(v)
      join trol3.miembros m on m.id = (a.v #>> '{}')::uuid and m.activo
      left join trol3.personas p on p.cabecera_id = m.id and p.codigo_origen = new.codigo_origen and p.merged_into is null and p.id <> new.id
     group by a.v order by count(p.id), random() limit 1;
    if elegido is not null then
      update trol3.personas set cabecera_id = elegido where id = new.id;
    end if;
  end if;
  select (cf.valor::jsonb) ->> new.codigo_origen into benef from trol3.config cf where cf.clave = 'evento_beneficio';
  if benef is not null and not trol3.tiene_beneficio(new.id, benef) then
    select etiqueta into etiq from trol3.codigos_invitacion where codigo = new.codigo_origen;
    perform trol3._otorgar_beneficio(new.id, benef, 'evento', coalesce(etiq, new.codigo_origen), new.codigo_origen, null);
  end if;
  return null;
exception when others then return null;  -- el alta nunca se cae por el reparto
end $$;

create or replace trigger tg_persona_evento after insert or update of codigo_origen on trol3.personas
  for each row execute function trol3.tg_persona_evento();
