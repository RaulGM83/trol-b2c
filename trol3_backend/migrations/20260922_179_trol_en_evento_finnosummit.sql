-- 179: Trol en un evento (Finnosummit, 23–24 sep 2026).
--
-- Un código de invitación de tipo `evento` (`app.trol.mx/i/finnosummit` → WhatsApp de
-- Lukas con `ref:finnosummit`), un canal `evento` para que el alta en mano quede
-- atribuida igual que la que entra por el QR, y `alta_en_evento(...)`: alta + CURP +
-- consulta al IMSS + diagnóstico avanzado de cortesía + experto = quien registra, todo
-- en una llamada, para hacerlo desde el teléfono en un pasillo.

alter table trol3.codigos_invitacion drop constraint if exists codigos_invitacion_tipo_check;
alter table trol3.codigos_invitacion add constraint codigos_invitacion_tipo_check
  check (tipo = any (array['asesor','cliente','prensa','campania','sitio','aliado','evento']));

insert into trol3.canales (codigo, nombre, tipo, activo)
values ('evento', 'Evento presencial', 'evento', true)
on conflict (codigo) do nothing;

insert into trol3.codigos_invitacion (codigo, tipo, etiqueta, activo, miembro_id)
values ('finnosummit', 'evento', 'Finnosummit 2026 (23–24 sep)', true, '0dfd18d7-2b1e-4627-905e-6f75d347cbcf')
on conflict (codigo) do update set tipo = excluded.tipo, etiqueta = excluded.etiqueta, activo = true, miembro_id = excluded.miembro_id;

-- Un código de evento manda el canal `evento` (como asesor → asesor, prensa → prensa).
do $patch$
declare
  def text := pg_get_functiondef('trol3.alta_por_telefono(text,text,trol3.actor_tipo,text,text,text)'::regprocedure);
  ancla text := $a$when 'aliado'   then 'aliado'$a$;
  nuevo text := $b$when 'aliado'   then 'aliado'
               when 'evento'   then 'evento'$b$;
begin
  if (length(def) - length(replace(def, ancla, ''))) / length(ancla) <> 1 then raise exception '179: ancla de alta_por_telefono'; end if;
  execute replace(def, ancla, nuevo);
end $patch$;

create or replace function trol3.alta_en_evento(p_codigo text, p_telefono text, p_nombre text, p_curp text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
declare mid uuid := trol3.current_miembro_id(); r jsonb; pid uuid; nueva boolean; c text; dueno uuid; cons jsonb; etiq text;
begin
  if mid is null then raise exception 'no_miembro'; end if;
  select etiqueta into etiq from trol3.codigos_invitacion where codigo = p_codigo and activo and tipo = 'evento';
  if etiq is null then raise exception 'codigo_de_evento_no_existe'; end if;
  c := nullif(upper(regexp_replace(coalesce(p_curp, ''), '\s', '', 'g')), '');
  if c is not null and c !~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$' then raise exception 'curp_invalida'; end if;

  -- Misma CURP en otra persona con otro teléfono: no se duplica; se devuelve la existente.
  if c is not null then
    select p.id into dueno from trol3.personas p where p.curp = c and p.merged_into is null limit 1;
    if dueno is not null and trol3.persona_por_telefono(trol3.tel10(p_telefono)) is distinct from dueno then
      return jsonb_build_object('persona_id', dueno, 'nueva', false, 'ya_existia', true, 'motivo', 'curp_de_otra_persona');
    end if;
  end if;

  r := trol3.alta_por_telefono(p_telefono, 'evento', 'asesor', nullif(btrim(p_nombre), ''), 'ref:' || p_codigo, 'evento');
  pid := (r->>'persona_id')::uuid; nueva := (r->>'nueva')::boolean;

  update trol3.personas set cabecera_id = mid where id = pid and cabecera_id is null;
  if c is not null then
    perform trol3.declarar(pid, 'curp', to_jsonb(c), 'asesor', mid, 'declarado');
  end if;
  -- Cortesía del evento: el diagnóstico avanzado (así "Entregado" no se atora después).
  if not trol3.tiene_beneficio(pid, 'diagnostico_avanzado') then
    perform trol3.otorgar_beneficio(pid, 'diagnostico_avanzado', 'evento', etiq, p_codigo, null);
  end if;
  -- La consulta al IMSS: en vivo (Jordan), como toda alta desde la plataforma. Sin CURP queda
  -- pendiente y se dispara sola cuando se capture.
  if c is not null then
    cons := trol3.pedir_consulta(pid, 'imss_historial', 'asesor', mid, 'trol', false, 'alta en evento: ' || p_codigo, false, 'jordan');
  end if;
  perform trol3.registrar_interaccion(pid, 'nota', 'asesor', mid, 'interna', 'Registrado en ' || etiq, false, jsonb_build_object('codigo', p_codigo));

  return jsonb_build_object('persona_id', pid, 'nueva', nueva, 'ya_existia', not nueva, 'consulta', cons);
end $function$;

revoke all on function trol3.alta_en_evento(text, text, text, text) from public, anon;
grant execute on function trol3.alta_en_evento(text, text, text, text) to authenticated, service_role;

-- Los registrados en el evento, con dónde va su consulta y su parada, para la pantalla del pasillo.
create or replace function trol3.evento_registrados(p_codigo text, p_limit int default 100)
returns jsonb
language sql
stable security definer
set search_path to 'trol3', 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'persona_id', p.id, 'nombre', p.nombre, 'apellidos', p.apellidos, 'curp', p.curp, 'creado_en', p.created_at,
           'telefono', (select ct.normalizado from trol3.contactos ct where ct.persona_id = p.id and ct.tipo = 'telefono' and ct.principal limit 1),
           'consulta', (select jsonb_build_object('estado', x.estado, 'proveedor', x.proveedor, 'error', x.error, 'creada_en', x.created_at, 'completada_en', x.completed_at)
                          from trol3.consultas x where x.persona_id = p.id and x.tipo = 'imss_historial' order by x.created_at desc limit 1),
           'ley', e.ley, 'semanas', e.semanas, 'pension_base', e.pension_base,
           'parada', trol3.parada_de(p.id)->'parada',
           'escribio', exists (select 1 from trol3.interacciones i where i.persona_id = p.id and i.direccion = 'entrante'))
         order by p.created_at desc), '[]'::jsonb)
    from (select * from trol3.personas p where p.codigo_origen = p_codigo and p.merged_into is null order by p.created_at desc limit p_limit) p
    left join trol3.v_expediente e on e.persona_id = p.id
   where trol3.es_miembro();
$function$;
revoke all on function trol3.evento_registrados(text, int) from public, anon;
grant execute on function trol3.evento_registrados(text, int) to authenticated, service_role;
