-- 292 — Los referidos de un aliado van a un asesor fijo (Raúl, 2-nov-2026: los de Resag a Lorena).
-- `aliados.cabecera_id`: a quién se le asignan sus referidos. Al registrarse un referido atribuido
-- (liga, alta directa o precalificación Infonavit), si la persona no tiene cabecera se le pone ese
-- miembro y sus oportunidades abiertas pasan con él. Una persona que ya era de alguien no se mueve
-- (esas llegan como `por_revisar`). La tarea de una compra con créditos (291) ya va al cabecera.
-- Aplicada por MCP el 2-nov-2026. Probada con rollback: persona sin cabecera → Lorena + nota interna.
alter table trol3.aliados add column if not exists cabecera_id uuid references trol3.miembros(id);
comment on column trol3.aliados.cabecera_id is 'Asesor al que se asignan los referidos de este aliado al llegar (292). Null = sin asignación automática.';

create or replace function trol3.tg_referido_cabecera()
returns trigger
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_cab uuid; v_nombre text; v_aliado text;
begin
  if new.estado <> 'atribuido' then return new; end if;
  select a.cabecera_id, a.nombre into v_cab, v_aliado from trol3.aliados a where a.id = new.aliado_id and a.activo;
  if v_cab is null then return new; end if;
  if not exists (select 1 from trol3.miembros m where m.id = v_cab and coalesce(m.activo, true)) then return new; end if;

  update trol3.personas set cabecera_id = v_cab where id = new.persona_id and cabecera_id is null and merged_into is null;
  if not found then return new; end if;
  update trol3.oportunidades set dueno_id = v_cab
   where persona_id = new.persona_id and dueno_id is null and estado not in ('ganada','perdida','no_aplica');

  select nombre into v_nombre from trol3.miembros where id = v_cab;
  begin
    perform trol3.registrar_interaccion(new.persona_id, 'nota', 'sistema', null, 'interna',
      'Asignado a ' || coalesce(v_nombre, '?') || ' por ser referido de ' || coalesce(v_aliado, 'aliado'),
      false, jsonb_build_object('via', 'tg_referido_cabecera', 'aliado_id', new.aliado_id, 'a', v_cab));
    perform trol3.emitir_evento(new.persona_id, 'cabecera_cambiada', 'sistema', null,
      jsonb_build_object('de', null, 'a', v_cab, 'a_nombre', v_nombre, 'motivo', 'aliado', 'aliado_id', new.aliado_id));
  exception when others then
    raise warning 'tg_referido_cabecera: nota/evento no registrado: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists referido_cabecera on trol3.referidos;
create trigger referido_cabecera after insert on trol3.referidos
  for each row execute function trol3.tg_referido_cabecera();

-- Resag → Lorena (13d4c6ce-d915-4451-9d85-46668b6cb889)
update trol3.aliados set cabecera_id = '13d4c6ce-d915-4451-9d85-46668b6cb889'
 where id = '5d95a205-38f8-4804-8b41-95afc26126e9';
