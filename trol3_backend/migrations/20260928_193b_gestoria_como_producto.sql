-- 193b+c · (aplicadas como 193b_gestoria_como_producto y 193c_registrar_cobro_variables; aquí ya con la corrección de la c)

-- 193b · ordenes.producto tiene FK a productos: las gestorías entran como producto `gestoria`
-- (inactivo, no se vende en checkout) y su código real va en metadata.gestoria_codigo.
insert into trol3.productos (codigo, nombre, tipo, precio_mxn, activo)
values ('gestoria', 'Gestoría', 'gestoria', 0, false)
on conflict (codigo) do nothing;

create or replace function trol3.registrar_cobro(p_persona uuid, p_producto text, p_medio text default 'transferencia', p_referencia text default null, p_monto numeric default null)
returns jsonb
language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare
  mid uuid := trol3.current_miembro_id();
  pr record; g record; oid uuid; r jsonb; tipo_consulta text; hizo text; nom text; v_monto numeric; v_lista numeric; es_gestoria boolean := false; bens text[];
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  if not exists (select 1 from trol3.personas where id = p_persona) then raise exception 'persona_no_existe'; end if;

  select * into pr from trol3.productos where codigo = p_producto and activo;
  if found then
    nom := pr.nombre; bens := pr.beneficios;
    v_monto := coalesce(nullif(p_monto, 0), pr.precio_mxn); v_lista := pr.precio_mxn;
  else
    -- 193: las gestorías se cobran igual, con el monto que se acordó (con IVA).
    select * into g from trol3.catalogo_productos_gestoria where codigo = p_producto and activo;
    if not found then raise exception 'producto_no_existe'; end if;
    es_gestoria := true; nom := g.nombre;
    v_monto := coalesce(nullif(p_monto, 0), nullif(g.honorario_default, 0)); v_lista := g.honorario_default;
  end if;
  if coalesce(v_monto, 0) <= 0 then raise exception 'producto_sin_precio'; end if;

  -- Dos clics al mismo botón no son dos cobros.
  if exists (select 1 from trol3.ordenes o where o.persona_id = p_persona and o.estado = 'cumplida' and o.created_at > now() - interval '10 minutes'
               and (o.producto = p_producto or o.metadata->>'gestoria_codigo' = p_producto)) then
    raise exception 'cobro_duplicado';
  end if;

  insert into trol3.ordenes (persona_id, producto, monto, puntos_aplicados, estado, payment_provider, payment_ref, paid_at, metadata)
  values (p_persona, case when es_gestoria then 'gestoria' else p_producto end, v_monto, 0, 'cumplida',
          coalesce(nullif(p_medio, ''), 'transferencia'), nullif(p_referencia, ''), now(),
          jsonb_strip_nulls(jsonb_build_object('registrado_por', mid, 'via', 'registrar_cobro', 'nombre', nom,
                             'gestoria_codigo', case when es_gestoria then p_producto end,
                             'precio_lista', v_lista)))
  returning id into oid;

  tipo_consulta := case p_producto
    when 'actualizacion_datos' then 'imss_historial'
    when 'extraccion_sisec'    then 'imss_historial'
    when 'consulta_issste'     then 'issste'
  end;

  if tipo_consulta is not null then
    r := trol3.pedir_consulta(p_persona, tipo_consulta, 'asesor', mid, 'cliente', true,
                              'cobrado por el experto: ' || nom, true,
                              case when tipo_consulta = 'imss_historial' then 'jordan' end);
    if not coalesce((r->>'ok')::boolean, false) then
      raise exception 'no_se_pudo_pedir_la_consulta: %', coalesce(r->>'motivo', r::text);
    end if;
    hizo := 'consulta';
  elsif coalesce(array_length(bens, 1), 0) > 0 then
    hizo := 'beneficio';
  else
    hizo := 'solo_registro';
  end if;

  perform trol3.registrar_interaccion(p_persona, 'nota', 'asesor', mid, 'saliente',
    'Recibimos tu pago de ' || nom || '.' ||
      case hizo when 'consulta' then ' Ya estamos consultando tu información; te avisamos por WhatsApp en cuanto llegue.'
                when 'beneficio' then ' Ya quedó activo en tu cuenta.'
                else '' end,
    true, jsonb_build_object('cobro', p_producto, 'orden_id', oid));

  return jsonb_build_object('ok', true, 'orden_id', oid, 'producto', p_producto, 'nombre', nom,
                            'monto', v_monto, 'hizo', hizo, 'consulta_id', r->>'consulta_id',
                            'cashback', (select c.monto from trol3.cashback c where c.orden_id = oid));
end $$;

create or replace function trol3.cashback_pct(p_producto text) returns numeric
language sql stable security definer set search_path to 'trol3', 'public' as $$
  select case
    when p_producto = 'gestoria' or exists (select 1 from trol3.catalogo_productos_gestoria g where g.codigo = p_producto)
      then coalesce(((select valor::jsonb from trol3.config where clave = 'cashback_pct') ->> 'gestoria')::numeric, 5)
    when exists (select 1 from trol3.productos pr where pr.codigo = p_producto and pr.tipo = 'asesoria')
      then coalesce(((select valor::jsonb from trol3.config where clave = 'cashback_pct') ->> 'asesoria')::numeric, 10)
    else 0 end
$$;

create or replace function trol3.tg_cashback_orden() returns trigger
language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare pct numeric; nom text;
begin
  if new.estado <> 'cumplida' or (tg_op = 'UPDATE' and old.estado = 'cumplida') then return null; end if;
  if coalesce(new.monto, 0) <= 0 or not trol3.aliado_millas(new.persona_id) then return null; end if;
  pct := trol3.cashback_pct(new.producto);
  if pct <= 0 then return null; end if;
  nom := coalesce(new.metadata->>'nombre', (select nombre from trol3.productos where codigo = new.producto), new.producto);
  insert into trol3.cashback (persona_id, orden_id, concepto, base, pct, monto)
  values (new.persona_id, new.id, nom, new.monto, pct, round(new.monto * pct / 100, 2))
  on conflict (orden_id) do nothing;
  perform trol3.emitir_evento(new.persona_id, 'cashback_generado', 'sistema', null,
    jsonb_build_object('orden_id', new.id, 'producto', coalesce(new.metadata->>'gestoria_codigo', new.producto), 'pct', pct, 'monto', round(new.monto * pct / 100, 2)));
  return null;
exception when others then return null;  -- el cashback nunca tumba un cobro
end $$;
