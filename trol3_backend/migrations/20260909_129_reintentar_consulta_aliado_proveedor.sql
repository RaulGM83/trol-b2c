-- Reintento manual de consultas B2B con proveedor elegido (Belvo / Jordan).
alter table public.partner_transactions add column if not exists proveedor text;

-- El dispatch de alta ahora lleva el proveedor solicitado (null = default del workflow: Jordan)
CREATE OR REPLACE FUNCTION public.dispatch_portal_consulta_to_n8n()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_product RECORD;
  v_request_id bigint;
  v_should_calc boolean;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT code, delivery_mode, name
    INTO v_product
  FROM public.products
  WHERE id = NEW.product_id;

  IF NOT FOUND THEN
    RAISE WARNING 'Product not found for partner_transaction %, skipping n8n dispatch', NEW.id;
    RETURN NEW;
  END IF;

  v_should_calc := (v_product.delivery_mode = 'auto')
                   OR (v_product.code IN ('DIAGNOSTICO_AVANZADO','DIAGNOSTICO_AVANZADO_SESION'));

  IF NOT v_should_calc THEN
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := 'https://eltrolfinanciero.app.n8n.cloud/webhook/portal-consulta',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Supabase-Source', 'portal'
    ),
    body := jsonb_build_object(
      'consulta_id', NEW.id,
      'product_code', v_product.code,
      'product_name', v_product.name,
      'partner_id', NEW.partner_id,
      'curp', NEW.curp,
      'nombre', NEW.nombre,
      'apellidos', NEW.apellidos,
      'vobo', NEW.vobo,
      'fecha_vobo', NEW.fecha_vobo,
      'promotor', NEW.promotor,
      'estado_republica', NEW.estado_republica,
      'datos_entrada', NEW.datos_entrada,
      'created_at', NEW.created_at,
      'due_at', NEW.due_at,
      'proveedor', NEW.proveedor,
      'reintento', coalesce((NEW.datos_entrada->>'reintento_de') is not null, false)
    )
  ) INTO v_request_id;

  RAISE NOTICE 'Dispatched consulta % (%) to n8n calc, request_id=%', NEW.id, v_product.code, v_request_id;
  RETURN NEW;
END;
$function$;

-- Re-envío puntual de una consulta existente (mismo payload que el alta + proveedor + reintento=true)
create or replace function public.postear_portal_consulta(p_id uuid, p_proveedor text)
returns bigint
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $$
declare
  pt public.partner_transactions;
  v_code text; v_name text; v_req bigint;
begin
  select * into pt from public.partner_transactions where id = p_id;
  if not found then raise exception 'consulta_no_encontrada'; end if;
  select code, name into v_code, v_name from public.products where id = pt.product_id;
  select net.http_post(
    url := 'https://eltrolfinanciero.app.n8n.cloud/webhook/portal-consulta',
    headers := jsonb_build_object('Content-Type','application/json','X-Supabase-Source','portal'),
    body := jsonb_build_object(
      'consulta_id', pt.id,
      'product_code', coalesce(v_code, 'CHECKUP'),
      'product_name', v_name,
      'partner_id', pt.partner_id,
      'curp', pt.curp,
      'nombre', pt.nombre,
      'apellidos', pt.apellidos,
      'vobo', pt.vobo,
      'fecha_vobo', pt.fecha_vobo,
      'promotor', pt.promotor,
      'estado_republica', pt.estado_republica,
      'datos_entrada', pt.datos_entrada,
      'created_at', pt.created_at,
      'due_at', pt.due_at,
      'proveedor', p_proveedor,
      'reintento', true
    )
  ) into v_req;
  return v_req;
end $$;

-- RPC para miembros: reintenta en sitio si la consulta no fue exitosa;
-- si ya fue exitosa, crea una consulta nueva (con su costo) apuntando a la anterior.
create or replace function trol3.reintentar_consulta_aliado(p_id uuid, p_proveedor text)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3','public'
as $$
declare
  v_mi uuid := trol3.current_miembro_id();
  pt public.partner_transactions;
  v_exitosa boolean;
  v_new uuid;
  v_intento jsonb;
begin
  if not trol3.es_miembro() or v_mi is null then raise exception 'no_autorizado'; end if;
  if p_proveedor not in ('belvo','jordan') then raise exception 'proveedor_invalido'; end if;

  select * into pt from public.partner_transactions where id = p_id;
  if not found then raise exception 'consulta_no_encontrada'; end if;

  v_exitosa := pt.status in ('completed','Doc prev listo','Doc previo listo','Envío exitoso')
               or pt.calculo_pensional is not null;

  v_intento := jsonb_build_object('proveedor', p_proveedor, 'en', now(), 'por', v_mi,
                                  'status_previo', pt.status);

  if v_exitosa then
    v_new := gen_random_uuid();
    insert into public.partner_transactions (
      id, partner_id, partner, curp, nombre, apellidos, vobo, fecha_vobo, estado_republica, promotor,
      datos_entrada, product_id, price_credits, sla_minutes, source, status, proveedor, created_at, updated_at
    ) values (
      v_new, pt.partner_id, pt.partner, pt.curp, pt.nombre, pt.apellidos, pt.vobo, pt.fecha_vobo, pt.estado_republica, pt.promotor,
      coalesce(pt.datos_entrada,'{}'::jsonb) || jsonb_build_object('reintento_de', pt.id, 'reintentos', jsonb_build_array(v_intento)),
      pt.product_id, pt.price_credits, pt.sla_minutes, pt.source, 'received', p_proveedor, now(), now()
    );
    -- sin product_id el trigger de alta no dispara: se manda a mano
    if pt.product_id is null then perform public.postear_portal_consulta(v_new, p_proveedor); end if;
    -- hereda asignación en la vista de trabajo
    update trol3.consultas_aliados set asignado_a = (select asignado_a from trol3.consultas_aliados where id = pt.id),
                                       gestion_actualizada_en = now()
     where id = v_new;
    return jsonb_build_object('modo','nueva','id',v_new,'proveedor',p_proveedor);
  end if;

  update public.partner_transactions set
    status = 'processing',
    error_detail = null,
    proveedor = p_proveedor,
    datos_entrada = coalesce(datos_entrada,'{}'::jsonb)
      || jsonb_build_object('reintentos', coalesce(datos_entrada->'reintentos','[]'::jsonb) || v_intento),
    updated_at = now()
  where id = pt.id;
  perform public.postear_portal_consulta(pt.id, p_proveedor);
  update trol3.consultas_aliados set gestion_estatus = case when gestion_estatus = 'error' then 'nuevo' else gestion_estatus end,
                                     gestion_actualizada_en = now()
   where id = pt.id;
  return jsonb_build_object('modo','reintento','id',pt.id,'proveedor',p_proveedor);
end $$;

grant execute on function trol3.reintentar_consulta_aliado(uuid, text) to authenticated, service_role;
revoke all on function public.postear_portal_consulta(uuid, text) from public, anon, authenticated;
