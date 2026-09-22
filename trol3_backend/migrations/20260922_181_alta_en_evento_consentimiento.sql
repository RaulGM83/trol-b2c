-- 181: el alta en evento deja constancia del consentimiento.
--
-- En /alta (web) el cliente marca la casilla de Términos + Aviso de Privacidad + autorización
-- para consultar su historial del IMSS. En el registro en mano (179) nadie marcaba nada.
-- Ahora `alta_en_evento` recibe `p_consentimiento`: si es true, queda un evento
-- `consentimiento` con el texto exacto que se le leyó y quién lo registró; si es false,
-- no se da de alta (no se consulta a nadie sin su permiso).

create or replace function trol3.alta_en_evento(p_codigo text, p_telefono text, p_nombre text, p_curp text default null, p_consentimiento boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
declare mid uuid := trol3.current_miembro_id(); r jsonb; pid uuid; nueva boolean; c text; dueno uuid; cons jsonb; etiq text;
  texto constant text := 'Acepta los Términos y Condiciones y el Aviso de Privacidad de El Trol Financiero (trol.mx/privacidad) y autoriza consultar su historial del IMSS para su diagnóstico.';
begin
  if mid is null then raise exception 'no_miembro'; end if;
  if not coalesce(p_consentimiento, false) then raise exception 'sin_consentimiento'; end if;
  select etiqueta into etiq from trol3.codigos_invitacion where codigo = p_codigo and activo and tipo = 'evento';
  if etiq is null then raise exception 'codigo_de_evento_no_existe'; end if;
  c := nullif(upper(regexp_replace(coalesce(p_curp, ''), '\s', '', 'g')), '');
  if c is not null and c !~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$' then raise exception 'curp_invalida'; end if;

  if c is not null then
    select p.id into dueno from trol3.personas p where p.curp = c and p.merged_into is null limit 1;
    if dueno is not null and trol3.persona_por_telefono(trol3.tel10(p_telefono)) is distinct from dueno then
      return jsonb_build_object('persona_id', dueno, 'nueva', false, 'ya_existia', true, 'motivo', 'curp_de_otra_persona');
    end if;
  end if;

  r := trol3.alta_por_telefono(p_telefono, 'evento', 'asesor', nullif(btrim(p_nombre), ''), 'ref:' || p_codigo, 'evento');
  pid := (r->>'persona_id')::uuid; nueva := (r->>'nueva')::boolean;

  perform trol3.emitir_evento(pid, 'consentimiento', 'asesor', mid,
    jsonb_build_object('canal', 'evento', 'codigo', p_codigo, 'texto', texto, 'version', '2026-09-22', 'registrado_por', mid));

  update trol3.personas set cabecera_id = mid where id = pid and cabecera_id is null;
  if c is not null then
    perform trol3.declarar(pid, 'curp', to_jsonb(c), 'asesor', mid, 'declarado');
  end if;
  if not trol3.tiene_beneficio(pid, 'diagnostico_avanzado') then
    perform trol3.otorgar_beneficio(pid, 'diagnostico_avanzado', 'evento', etiq, p_codigo, null);
  end if;
  if c is not null then
    cons := trol3.pedir_consulta(pid, 'imss_historial', 'asesor', mid, 'trol', false, 'alta en evento: ' || p_codigo, false, 'jordan');
  end if;
  perform trol3.registrar_interaccion(pid, 'nota', 'asesor', mid, 'interna', 'Registrado en ' || etiq || ' · aceptó Términos y Aviso de Privacidad en persona', false, jsonb_build_object('codigo', p_codigo));

  return jsonb_build_object('persona_id', pid, 'nueva', nueva, 'ya_existia', not nueva, 'consulta', cons);
end $function$;

drop function if exists trol3.alta_en_evento(text, text, text, text);
revoke all on function trol3.alta_en_evento(text, text, text, text, boolean) from public, anon;
grant execute on function trol3.alta_en_evento(text, text, text, text, boolean) to authenticated, service_role;
