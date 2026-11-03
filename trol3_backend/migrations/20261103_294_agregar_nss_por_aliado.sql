-- 294 · El aliado agrega el NSS después del alta (claude/116, opción D, 3-nov-2026): red de seguridad cuando la
-- consulta por CURP falla (Jordan caído o CURP que no cuadra) o cuando Infonavit sigue "buscando su NSS".
-- Reglas: referido propio y atribuido · NSS de 11 dígitos · candado de NSS (no puede ser de otra persona) ·
-- si la persona ya trae un NSS distinto, NO se pisa: queda nota interna para el equipo y se devuelve 'nss_distinto' ·
-- marca pide_infonavit_en si el aliado tiene el programa (así entra a v_infonavit_aliado y el barrido pide Precalix).
-- La app (agregarNssPorAliado) pide la consulta infonavit con la llave de servicio en el mismo paso. Aplicada por MCP.
-- 294b · registrar_interaccion exige miembro (auth.uid() del aliado → no_autorizado) aunque la llame una función
-- security definer: las notas internas que nacen de acciones del aliado van por nota_interna_sistema (insert directo).
-- Afecta también a tg_referido_cabecera (292): la nota "Asignado a X" se perdía con warning; aquí se redefine.
create or replace function trol3.nota_interna_sistema(p_persona uuid, p_texto text, p_meta jsonb default '{}'::jsonb)
returns uuid
language sql
security definer
set search_path to 'trol3', 'public'
as $$
  insert into trol3.interacciones (persona_id, canal, actor_tipo, actor_id, direccion, contenido, visible_cliente, metadata)
  values (p_persona, 'nota', 'sistema', null, 'interna', p_texto, false, coalesce(p_meta, '{}'::jsonb))
  returning id
$$;
revoke all on function trol3.nota_interna_sistema(uuid, text, jsonb) from public;

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
    perform trol3.nota_interna_sistema(new.persona_id,
      'Asignado a ' || coalesce(v_nombre, '?') || ' por ser referido de ' || coalesce(v_aliado, 'aliado'),
      jsonb_build_object('via', 'tg_referido_cabecera', 'aliado_id', new.aliado_id, 'a', v_cab));
    perform trol3.emitir_evento(new.persona_id, 'cabecera_cambiada', 'sistema', null,
      jsonb_build_object('de', null, 'a', v_cab, 'a_nombre', v_nombre, 'motivo', 'aliado', 'aliado_id', new.aliado_id));
  exception when others then
    raise warning 'tg_referido_cabecera: nota/evento no registrado: %', sqlerrm;
  end;
  return new;
end $$;


create or replace function trol3.agregar_nss_por_aliado(p_persona uuid, p_nss text)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_aliado uuid; v_nss text; v_otra uuid; v_suyo text; v_ref uuid; v_programa boolean;
begin
  v_aliado := trol3.current_aliado_id();
  if v_aliado is null then raise exception 'no_autorizado'; end if;
  select r.id into v_ref from trol3.referidos r
   where r.persona_id = p_persona and r.aliado_id = v_aliado and r.estado = 'atribuido' and r.visible_para_aliado limit 1;
  if v_ref is null then raise exception 'referido_ajeno'; end if;

  v_nss := nullif(regexp_replace(coalesce(p_nss,''), '\D', '', 'g'), '');
  if v_nss is null or v_nss !~ '^\d{11}$' then raise exception 'nss_invalido'; end if;

  select id into v_otra from trol3.personas where nss = v_nss and merged_into is null and id <> p_persona limit 1;
  if v_otra is not null then raise exception 'nss_de_otra_persona'; end if;

  select nss into v_suyo from trol3.personas where id = p_persona;
  select programa_infonavit into v_programa from trol3.aliados where id = v_aliado;

  if v_suyo is not null and v_suyo <> v_nss then
    perform trol3.nota_interna_sistema(p_persona,
      'El aliado dio un NSS distinto al del expediente (' || v_nss || ' vs ' || v_suyo || '). Revisar cuál es el bueno.',
      jsonb_build_object('via', 'agregar_nss_por_aliado', 'aliado_id', v_aliado));
    return jsonb_build_object('ok', true, 'estado', 'nss_distinto');
  end if;

  update trol3.personas set nss = v_nss where id = p_persona and nss is null;
  if v_programa then
    update trol3.referidos set pide_infonavit_en = coalesce(pide_infonavit_en, now()) where id = v_ref;
  end if;
  begin
    perform trol3.emitir_evento(p_persona, 'aliado_agrega_nss', 'aliado', null, jsonb_build_object('aliado_id', v_aliado, 'infonavit', coalesce(v_programa, false)));
  exception when others then
    raise warning 'agregar_nss_por_aliado: evento no emitido: %', sqlerrm;
  end;
  return jsonb_build_object('ok', true, 'estado', case when v_suyo is null then 'guardado' else 'ya_lo_teniamos' end, 'infonavit', coalesce(v_programa, false));
end $$;
revoke all on function trol3.agregar_nss_por_aliado(uuid, text) from public;
grant execute on function trol3.agregar_nss_por_aliado(uuid, text) to authenticated, service_role;
