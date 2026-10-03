-- 201 · Carriles: "No aplica" a la última oportunidad abierta descarta solo y libera el lugar (Raul, 28-sep; claude/84).
-- · Trigger en oportunidades: al pasar a no_aplica, si la persona ya no tiene ninguna abierta
--   (posible, detectada, presentada, interesada, en_proceso) se pone la marca descartado con motivo
--   'sin_oportunidades'. Sale de Calientes/Tibios y deja de contar en el tope de 25.
-- · Si después se le detecta o abre una oportunidad, esa marca se cierra sola.
-- · A diferencia de "Descartar" a mano, un gesto del cliente posterior (escribe, abre su cuenta) la vence.

create or replace function trol3.tg_descartar_sin_oportunidades()
returns trigger
language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare me uuid := trol3.current_miembro_id(); cab uuid; abiertos constant text[] := array['posible','detectada','presentada','interesada','en_proceso'];
begin
  -- Se abrió (o se detectó) una oportunidad: cierra el descarte automático.
  if new.estado::text = any(abiertos) and (tg_op = 'INSERT' or old.estado is distinct from new.estado) then
    update trol3.carril_marcas set activa = false, cerrada_en = now(), cerrada_motivo = 'oportunidad_abierta'
     where persona_id = new.persona_id and activa and marca = 'descartado' and motivo = 'sin_oportunidades';
    return null;
  end if;

  if tg_op = 'UPDATE' and new.estado = 'no_aplica' and old.estado is distinct from new.estado
     and not exists (select 1 from trol3.oportunidades o where o.persona_id = new.persona_id and o.id <> new.id and o.estado::text = any(abiertos))
     and not exists (select 1 from trol3.carril_marcas k where k.persona_id = new.persona_id and k.activa and k.marca = 'descartado') then
    select cabecera_id into cab from trol3.personas where id = new.persona_id;
    perform trol3._cerrar_marcas(new.persona_id, 'remarcada');
    insert into trol3.carril_marcas (persona_id, marca, motivo, nota, toques, miembro_id, por_miembro_id)
    values (new.persona_id, 'descartado', 'sin_oportunidades', 'Todas sus oportunidades quedaron como No aplica', 0, coalesce(cab, me), me);
    perform trol3.emitir_evento(new.persona_id, 'carril_marca', (case when me is not null then 'asesor' else 'sistema' end)::trol3.actor_tipo, me,
            jsonb_build_object('marca', 'descartado', 'motivo', 'sin_oportunidades', 'oportunidad', new.id));
  end if;
  return null;
end $$;

drop trigger if exists zz_descartar_sin_oportunidades on trol3.oportunidades;
create trigger zz_descartar_sin_oportunidades after insert or update of estado on trol3.oportunidades
  for each row execute function trol3.tg_descartar_sin_oportunidades();

-- carril_de: el descarte automático sí lo vence un gesto posterior del cliente.
do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.carril_de(uuid)'::regprocedure);
  src := replace(src,
    $a$  if hay_marca and m.marca <> 'descartado' and g is not null and g > m.created_at then hay_marca := false; end if;$a$,
    $b$  if hay_marca and (m.marca <> 'descartado' or m.motivo = 'sin_oportunidades') and g is not null and g > m.created_at then hay_marca := false; end if;$b$);
  if position($c$m.motivo = 'sin_oportunidades'$c$ in src) = 0 then raise exception 'parche 201 a carril_de no encajó'; end if;
  execute src;
end $$;
