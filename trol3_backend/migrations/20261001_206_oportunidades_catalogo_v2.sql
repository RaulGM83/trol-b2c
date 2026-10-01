-- 206 · Catálogo de oportunidades v2 (claude/92). Decisiones de Raul, 1-oct-2026.
--
-- Principio: una oportunidad es un servicio que ejecuta Trol o un aliado. Lo que es
-- asesoría va a Orden de situación (checklist).
--
-- Qué cambia
--   · Fuera del catálogo (se borran filas y renglón): referidos, asesoria_avanzada,
--     entender_situacion (→ alerta de checklist `ventana_mod40`), reactivar_derechos,
--     retiro_infonavit_pension.
--   · mod40_prospectiva se funde en mod40_retro: una sola Modalidad 40 que aplica hoy o
--     aplica dentro de 6 meses a la fecha del derecho (no cotizar hasta entonces y pagar
--     con financiamiento). Las trabajadas se recodifican; las abiertas se borran y se
--     vuelven a detectar con la regla nueva.
--   · mejoravit_activo y credito_infonavit_activo se apagan (sólo historia). Infonavit es
--     compra de inmueble en dos segmentos: compra_inmueble (250–800k) e inversion_inmueble
--     (800k+), cotizando, sin crédito vigente, menor de 62 años.
--   · cambio_afore: `posible` sólo con saldo RCV97 > 400,000 (aunque no sepamos la AFORE).
--   · credito_pension: capacidad conocida > 350 → detectada; sin dato → posible con
--     datos_faltantes; sin capacidad → no existe.
--   · Textos nuevos (nombre, nombre_cliente, frase_corta, descripcion) + columna
--     `siguiente_paso` (qué hace el asesor hoy). `frase_cliente` (deprecada en 170) se borra.
--   · ahorro_voluntario y seguros al final del orden; hueco 42 para el comparador de PPR.

-- ---------------------------------------------------------------------------
-- 1. Columnas del catálogo
-- ---------------------------------------------------------------------------
alter table trol3.catalogo_oportunidades add column if not exists siguiente_paso text;
comment on column trol3.catalogo_oportunidades.siguiente_paso is
  'Qué hace el asesor hoy con esta oportunidad: primer paso y pregunta que califica (206). Sólo asesor.';
comment on column trol3.catalogo_oportunidades.frase_corta is
  'Una línea para el cliente (sin montos) bajo nombre_cliente: diagnóstico básico y /mi (204, 206).';
comment on column trol3.catalogo_oportunidades.descripcion is
  'Cuándo se detecta (espejo de evaluar_persona). Sólo asesor (206).';

-- asesoria_vista leía frase_cliente como respaldo de la ficha → ahora frase_corta.
do $$
declare def text;
begin
  def := pg_get_functiondef('trol3.asesoria_vista(uuid)'::regprocedure);
  if position(', c.frase_cliente)' in def) = 0 then raise exception '206: ancla frase_cliente no encontrada en asesoria_vista'; end if;
  execute replace(def, ', c.frase_cliente)', ', c.frase_corta)');
end $$;
alter table trol3.catalogo_oportunidades drop column if exists frase_cliente;

-- ---------------------------------------------------------------------------
-- 2. Filas: fusiones y limpieza (antes de tocar el catálogo por el FK)
-- ---------------------------------------------------------------------------
-- 2a. Modalidad 40: las trabajadas de prospectiva pasan a mod40_retro.
delete from trol3.oportunidades r
 using trol3.oportunidades w
 where w.codigo = 'mod40_prospectiva' and w.estado in ('presentada','interesada','en_proceso','ganada','perdida')
   and r.persona_id = w.persona_id and r.codigo = 'mod40_retro' and r.estado in ('posible','detectada','no_aplica');
update trol3.oportunidades w
   set codigo = 'mod40_retro',
       valor_detalle = coalesce(valor_detalle,'{}'::jsonb) || jsonb_build_object('origen_codigo','mod40_prospectiva','aplica_hoy',false)
 where w.id in (select w2.id from trol3.oportunidades w2
                 where w2.codigo = 'mod40_prospectiva' and w2.estado in ('presentada','interesada','en_proceso','ganada','perdida')
                   and not exists (select 1 from trol3.oportunidades r where r.persona_id = w2.persona_id and r.codigo = 'mod40_retro'));
delete from trol3.oportunidades where codigo = 'mod40_prospectiva';

-- 2b. Infonavit: abiertas fuera; trabajadas quedan bajo código apagado.
delete from trol3.oportunidades where codigo in ('mejoravit_activo','credito_infonavit_activo') and estado in ('posible','detectada','no_aplica');

-- 2c. cambio_afore: sólo saldo > 400k.
delete from trol3.oportunidades
 where codigo = 'cambio_afore' and estado in ('posible','no_aplica')
   and coalesce((valor_detalle->>'saldo_rcv97')::numeric, 0) <= 400000;

-- 2d. Códigos que desaparecen del todo.
delete from trol3.oportunidades where codigo in ('referidos','asesoria_avanzada','entender_situacion','reactivar_derechos','retiro_infonavit_pension');
delete from trol3.catalogo_oportunidades where codigo in ('referidos','asesoria_avanzada','entender_situacion','reactivar_derechos','retiro_infonavit_pension');

-- ---------------------------------------------------------------------------
-- 3. Catálogo: textos, orden, umbrales
-- ---------------------------------------------------------------------------
insert into trol3.catalogo_oportunidades (codigo, nombre, nivel, descripcion, producto, proveedor_externo, umbrales, datos_requeridos, activo, orden, en_lista_trabajo, prioridad, plantilla, nombre_cliente, frase_corta)
values ('inversion_inmueble', 'Inversión inmobiliaria con Infonavit (800k+)', 3, '', null, null, '{}'::jsonb, '{saldo_infonavit,status_empleo}', true, 31, true, 0, 'trol_op_infonavit', '', '')
on conflict (codigo) do nothing;

update trol3.catalogo_oportunidades c set
  nombre = v.nombre, nombre_cliente = v.cliente, frase_corta = v.frase, descripcion = v.descr, siguiente_paso = v.paso,
  nivel = v.nivel, orden = v.orden, activo = true, en_lista_trabajo = true, umbrales = v.umbrales::jsonb, proveedor_externo = v.prov
from (values
  ('recuperar_ley73', 1, 8, null,
   'Recuperar Ley 73 (NSS anterior a 1997)',
   'Buscar tus semanas de antes de 1997',
   'Tu número del IMSS es anterior a 1997: si aparecen esas semanas, cambias a Ley 73.',
   'Ley 97 con NSS de 1996 o anterior y primera cotización registrada en un año posterior al del NSS. Producto: búsqueda de semanas.',
   'Preguntar patrones y años anteriores a su primera cotización registrada; abrir búsqueda de semanas (50 % de anticipo). Decir «buscamos lo que te regresa a Ley 73», nunca «te regresamos».',
   '{"anio_nss_max":1996}'),
  ('unificacion_nss', 1, 9, null,
   'Unificación de cuentas (dos NSS)',
   'Juntar tus dos números del IMSS',
   'Tus semanas están repartidas en dos números; juntarlas las cuenta todas.',
   'Dos NSS válidos (11 dígitos) y distintos; el segundo lo captura el asesor en nss_alterno.',
   'Validar que los dos NSS tengan 11 dígitos; cotizar unificación ($10,000).',
   '{}'),
  ('inconsistencia_imss', 1, 10, null,
   'Actualización de datos ante el IMSS',
   'Corregir tu registro en el IMSS',
   'El IMSS no entrega tu información porque algo no cuadra en tu registro.',
   'Inconsistencia reportada por el proveedor, o sin ley con consultas fallidas, con CURP ya confirmada por el cliente.',
   'Que revise su CURP en su cuenta primero; si está bien, ventanilla Jordan (NSS de 11 dígitos) o actualización de datos ($8,000).',
   '{}'),
  ('reconocimiento_semanas', 1, 11, null,
   'Búsqueda de semanas no reconocidas',
   'Buscar semanas que no te cuentan',
   'Hay semanas que trabajaste y hoy no se te cuentan; se buscan y se demuestran con papeles.',
   'Declaró 26 semanas o más por encima de las reconocidas, o el año de su NSS es anterior al de su primera cotización registrada.',
   'Preguntar qué patrones o años faltan; separar de las semanas descontadas (otro trámite). Promete revisión, no semanas.',
   '{"min_delta_semanas":26}'),
  ('cuenta_sin_registrar', 1, 12, null,
   'Registro de cuenta AFORE',
   'Registrar tu cuenta AFORE',
   'Tu cuenta aparece sin registrar; registrarla es gratis y abre todo lo demás.',
   'Cuenta AFORE sin registrar (CDA).',
   'Mandar con agente certificado de AFORE (Astuto). Es requisito para el ahorro voluntario.',
   '{}'),
  ('cambio_afore', 1, 13, 'astuto',
   'Traspaso de AFORE',
   'Estar en una buena AFORE',
   'No todas rinden igual; cambiarte es gratis y lo hace un agente certificado.',
   'Posible: saldo RCV97 mayor a 400,000 aunque no sepamos la AFORE. Se confirma al conocerla (paso 0) y estar fuera de las mejores por rendimiento neto.',
   'Preguntar la AFORE en el paso 0; si está fuera de las mejores, comparativo con su historia (es simulación: «rondaría»). Nunca prometer rendimiento.',
   '{"saldo_min":400000,"top_n":3}'),
  ('reactivacion_mod10', 2, 14, 'viraal',
   'Reactivar vigencia con Modalidad 10 (Viraal)',
   'Volver a tener vigentes tus derechos',
   'Tus derechos vencieron o están por vencer; se recuperan cotizando doce meses por tu cuenta.',
   'Ley 73, no pensionado, derechos vencidos o que vencen en menos de 180 días, más de 450 semanas brutas y 58.8 años o más: Viraal financia el reingreso por Modalidad 10.',
   'Confirmar fecha de baja y edad; explicar los 12 meses consecutivos (un atraso reinicia el año); pasar a la mesa de Viraal (financia 14 pagos, se paga directo al IMSS).',
   '{"edad_min":58.8,"semanas_min":450,"por_vencer_dias":180}'),
  ('pension_hoy', 2, 20, null,
   'Trámite de pensión Ley 73',
   'Iniciar tu trámite de pensión',
   'Ya cumples edad, semanas y derechos; cada mes sin tramitar es pensión que no cobras.',
   'Ley 73, no pensionado, 60 años o más, 500 semanas o más y derechos vigentes.',
   'Confirmar fecha real de baja (el retroactivo se topa en 12 meses); revisar escalón de edad y Modalidad 40 antes de tramitar. Llamar primero a quien más está perdiendo.',
   '{"edad_min":60,"semanas_min":500}'),
  ('mod40_retro', 2, 21, 'viraal',
   'Modalidad 40 (Viraal)',
   'Subir tu pensión con Modalidad 40',
   'Cotizar por tu cuenta con mejor salario puede subir mucho tu pensión; hay un momento para hacerlo.',
   'Ley 73, no pensionado, ventana de reingreso viva y Modalidad 40 que sube la pensión. Aplica hoy (retroactiva) o aplica dentro de 6 meses a la fecha del derecho: no cotizar hasta entonces y pagar con financiamiento.',
   'Si ya aplica: costo y aumento día por día con la fecha de trámite; ofrecer financiamiento. Si aplica en N meses: no cotizar, agendar para ese mes.',
   '{"meses_antes":6}'),
  ('credito_pension', 2, 22, null,
   'Crédito con descuento a pensión',
   'Un crédito que se descuenta de tu pensión',
   'Ya cobras tu pensión; podrías precalificar para un crédito con descuento directo.',
   'Pensionado en nómina IMSS. Capacidad de descuento mayor a 350 al mes: detectada; sin dato de capacidad: posible; sin capacidad: no existe.',
   'Si falta la capacidad, una sola pregunta: ¿ya te descuentan algún crédito? «Precalifica», nunca «califica». Nunca montos por WhatsApp; confirmar edad máxima de la financiera.',
   '{"capacidad_min":350}'),
  ('compra_inmueble', 3, 30, null,
   'Inmueble con Infonavit (250–800k)',
   'Convertir tu ahorro Infonavit en un inmueble',
   'Convierte tu ahorro Infonavit en un inmueble que te ayude a cumplir tus objetivos.',
   'Cotizando, sin crédito Infonavit vigente, menor de 62 años y saldo de vivienda entre 250,000 y 799,999.',
   'Preguntar qué quiere: casa propia o patrimonio; precalificación en Mi Cuenta Infonavit; calculadora de Infonavit con proyecto.',
   '{"saldo_min":250000,"saldo_max":799999,"edad_max":62}'),
  ('inversion_inmueble', 3, 31, null,
   'Inversión inmobiliaria con Infonavit (800k+)',
   'Convertir tu saldo Infonavit en una inversión',
   'Convierte tu saldo Infonavit en una inversión inmobiliaria que genere valor y trabaje para ti.',
   'Cotizando, sin crédito Infonavit vigente, menor de 62 años y saldo de vivienda de 800,000 o más.',
   'Conversación de patrimonio: inmueble de mayor valor o inversión con salida a 18 meses; calculadora de Infonavit; conectar con Modalidad 40 y plan de retiro.',
   '{"saldo_min":800000,"edad_max":62}'),
  ('ahorro_voluntario', 3, 40, 'astuto',
   'Ahorro voluntario / PPR',
   'Ahorrar para la pensión que quieres',
   'Entre lo que te tocaría y lo que esperas hay diferencia; ahorrar por tu cuenta la acorta.',
   'Expectativa declarada mayor al 120 % de la pensión estimada.',
   'Partir de su brecha; tres vehículos con beneficio fiscal; en Ley 73 no sube la pensión, sube el efectivo. Requiere cuenta registrada. Comparador de PPR en construcción.',
   '{"factor_brecha":1.2}'),
  ('seguros', 3, 41, 'metlife',
   'Protección (seguro de vida)',
   'Proteger a los tuyos',
   'Hay personas que dependen de ti y nada las cubre si tú faltas.',
   'Dependientes declarados sin seguro de vida.',
   'Confirmar dependientes y cobertura actual; cotización con MetLife.',
   '{}')
) v(codigo, nivel, orden, prov, nombre, cliente, frase, descr, paso, umbrales)
where c.codigo = v.codigo;

update trol3.catalogo_oportunidades set
  activo = false, en_lista_trabajo = false, orden = 99, siguiente_paso = null,
  descripcion = 'APAGADA (206): ' || descripcion
where codigo in ('mejoravit_activo','credito_infonavit_activo','mod40_prospectiva') and descripcion not like 'APAGADA (206)%';

-- Checklist por oportunidad: prospectiva → mod40_retro; crédito Infonavit → compra; compra → inversión.
insert into trol3.checklist_catalogo (codigo_oportunidad, item, detalle, quien, orden, activo)
select 'mod40_retro', item, detalle, quien, orden, activo from trol3.checklist_catalogo s
 where s.codigo_oportunidad = 'mod40_prospectiva'
   and not exists (select 1 from trol3.checklist_catalogo t where t.codigo_oportunidad = 'mod40_retro' and t.item = s.item);
insert into trol3.checklist_catalogo (codigo_oportunidad, item, detalle, quien, orden, activo)
select 'compra_inmueble', item, detalle, quien, orden, activo from trol3.checklist_catalogo s
 where s.codigo_oportunidad = 'credito_infonavit_activo'
   and not exists (select 1 from trol3.checklist_catalogo t where t.codigo_oportunidad = 'compra_inmueble' and t.item = s.item);
insert into trol3.checklist_catalogo (codigo_oportunidad, item, detalle, quien, orden, activo)
select 'inversion_inmueble', item, detalle, quien, orden, activo from trol3.checklist_catalogo s
 where s.codigo_oportunidad = 'compra_inmueble'
   and not exists (select 1 from trol3.checklist_catalogo t where t.codigo_oportunidad = 'inversion_inmueble' and t.item = s.item);
update trol3.checklist_catalogo set activo = false where codigo_oportunidad in ('mod40_prospectiva','mejoravit_activo','credito_infonavit_activo');

-- Fichas: O5 y O8 apuntan a los códigos vivos.
update trol3.fichas set oportunidades = array_remove(oportunidades, 'mod40_prospectiva') where 'mod40_prospectiva' = any(oportunidades);
update trol3.fichas set oportunidades = array['compra_inmueble','inversion_inmueble']::text[]
 where 'mejoravit_activo' = any(oportunidades) or 'credito_infonavit_activo' = any(oportunidades);

-- ---------------------------------------------------------------------------
-- 4. Funciones con listas de códigos (parche sobre la definición viva)
-- ---------------------------------------------------------------------------
do $$
declare r record; def text;
begin
  for r in select * from (values
    ('trol3._potencial(uuid)', '''pension_hoy'',''mod40_prospectiva'',''mod40_retro'',''reactivacion_mod10'',''recuperar_ley73'',''reactivar_derechos''', '''pension_hoy'',''mod40_retro'',''reactivacion_mod10'',''recuperar_ley73'''),
    ('trol3.cambiar_estado_oportunidad(uuid,trol3.estado_oportunidad,text,text,date,text)', 'codigo in (''compra_inmueble'',''credito_infonavit_activo'')', 'codigo in (''compra_inmueble'',''inversion_inmueble'')'),
    ('trol3.guardar_asesoria_infonavit(uuid,jsonb,jsonb,uuid,uuid,jsonb,text)', 'codigo = ''credito_infonavit_activo''', 'codigo in (''compra_inmueble'',''inversion_inmueble'')'),
    ('trol3.guardar_asesoria_infonavit(uuid,jsonb,jsonb,uuid,uuid,jsonb,text,text,integer)', 'codigo = ''credito_infonavit_activo''', 'codigo in (''compra_inmueble'',''inversion_inmueble'')')
  ) v(fn, viejo, nuevo) loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.viejo in def) = 0 then raise exception '206: ancla no encontrada en %', r.fn; end if;
    execute replace(def, r.viejo, r.nuevo);
  end loop;
  -- registrar_nomina_imss: la firma varía; se busca por nombre.
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'trol3' and p.proname = 'registrar_nomina_imss' loop
    def := pg_get_functiondef(r.oid);
    if position('(''pension_hoy'',''mod40_retro'',''mod40_prospectiva'',''reactivar_derechos'')' in def) > 0 then
      execute replace(def, '(''pension_hoy'',''mod40_retro'',''mod40_prospectiva'',''reactivar_derechos'')', '(''pension_hoy'',''mod40_retro'')');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. evaluar_persona v2
-- ---------------------------------------------------------------------------
create or replace function trol3.evaluar_persona(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'trol3', 'public'
as $function$
declare e record; codigos text[] := '{}'; ident text; um text;
        m40_vencida boolean := false; ya_pens boolean := false; derechos_ok boolean;
        u jsonb; v_hoy date := trol3._hoy_mx();
        -- Infonavit
        inm_min numeric; inm_max numeric; inv_min numeric; inm_edad numeric;
        -- AFORE / crédito pensión
        afore_saldo_min numeric; cp_min numeric;
        -- Modalidad 40
        m40_meses int; v_ult date; v_nac date; d_derecho date; m40_hoy boolean; m40_pronto boolean; m40_nueva numeric; m40_urg date;
begin
  select * into e from trol3.v_expediente where persona_id = p_id;
  if not found then return '{}'::jsonb; end if;

  select umbrales into u from trol3.catalogo_oportunidades where codigo = 'compra_inmueble';
  inm_min := coalesce((u->>'saldo_min')::numeric, 250000); inm_max := coalesce((u->>'saldo_max')::numeric, 799999); inm_edad := coalesce((u->>'edad_max')::numeric, 62);
  select umbrales into u from trol3.catalogo_oportunidades where codigo = 'inversion_inmueble';
  inv_min := coalesce((u->>'saldo_min')::numeric, 800000);
  select umbrales into u from trol3.catalogo_oportunidades where codigo = 'cambio_afore';
  afore_saldo_min := coalesce((u->>'saldo_min')::numeric, 400000);
  select umbrales into u from trol3.catalogo_oportunidades where codigo = 'credito_pension';
  cp_min := coalesce((u->>'capacidad_min')::numeric, 350);
  select umbrales into u from trol3.catalogo_oportunidades where codigo = 'mod40_retro';
  m40_meses := coalesce((u->>'meses_antes')::int, 6);

  select valor#>>'{}' into ident from trol3.v_mejor_dato where persona_id = p_id and campo = 'estatus_identidad';
  select valor#>>'{}' into um from trol3.v_mejor_dato where persona_id = p_id and campo = 'ultima_modalidad';
  select (valor#>>'{}')::date into v_ult from trol3.v_mejor_dato where persona_id = p_id and campo = 'ultima_cotizacion' limit 1;
  select fecha_nacimiento into v_nac from trol3.personas where id = p_id;
  m40_vencida := (um = 'mod40' and e.limite_mod40 is not null and e.limite_mod40 < v_hoy);
  ya_pens := coalesce(e.estatus_nomina = 'pensionado', false);
  -- 100: la fecha manda sobre la bandera.
  derechos_ok := case when e.fin_conservacion is not null
                      then e.fin_conservacion >= v_hoy
                      else coalesce(e.conserva_derechos, true) end;

  -- ---------------- Orden de situación (checklist) ----------------
  if ident = 'por_confirmar' then perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','alerta','alta','Confirma tu CURP: no encontramos tu información del IMSS con ella');
  elsif e.inconsistencia_imss is not null then perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','alerta','alta', e.inconsistencia_imss);
  elsif e.ley is null and e.consultas_fallidas > 0 then perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','alerta','alta','No fue posible obtener información del IMSS ('||e.consultas_fallidas||' intentos fallidos)');
  elsif e.ley is not null then perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','ok','baja',null);
  else perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','sin_dato','media','Sin consulta IMSS'); end if;

  if e.semanas_validadas is not null and e.semanas_declaradas is not null and e.semanas_declaradas - e.semanas_validadas >= 26 then
    perform trol3._ck(p_id, 'semanas_reconocidas','alerta','media','Declara '||e.semanas_declaradas||' semanas vs '||e.semanas_validadas||' reconocidas');
  elsif e.semanas_validadas is not null then perform trol3._ck(p_id, 'semanas_reconocidas','ok','baja',null);
  else perform trol3._ck(p_id, 'semanas_reconocidas','sin_dato','media','Sin semanas validadas'); end if;

  if e.afore_actual is null then perform trol3._ck(p_id, 'afore_top','sin_dato','baja','No sabemos tu AFORE');
  else perform trol3._ck(p_id, 'afore_top','ok','baja',e.afore_actual); end if;

  if e.cuenta_registrada is false then perform trol3._ck(p_id, 'cuenta_registrada','alerta','media','Cuenta AFORE sin registrar (CDA)');
  elsif e.cuenta_registrada is true then perform trol3._ck(p_id, 'cuenta_registrada','ok','baja',null);
  else perform trol3._ck(p_id, 'cuenta_registrada','sin_dato','baja',null); end if;

  if ya_pens then perform trol3._ck(p_id, 'derechos_vigentes','no_aplica','baja','Ya está pensionado');
  elsif e.ley = 'Ley97' then perform trol3._ck(p_id, 'derechos_vigentes','no_aplica','baja',null);
  elsif e.ley = 'Ley73' and not derechos_ok then perform trol3._ck(p_id, 'derechos_vigentes','alerta','alta',
        case when e.fin_conservacion is not null then 'Derechos Ley 73 vencieron el '||e.fin_conservacion else 'Derechos Ley 73 no vigentes' end);
  elsif e.ley = 'Ley73' and e.fin_conservacion is not null and e.fin_conservacion < v_hoy + 180 then perform trol3._ck(p_id, 'derechos_vigentes','alerta','alta','Derechos vencen '||e.fin_conservacion);
  elsif e.ley = 'Ley73' then perform trol3._ck(p_id, 'derechos_vigentes','ok','baja',null);
  else perform trol3._ck(p_id, 'derechos_vigentes','sin_dato','media',null); end if;

  -- 206: la ventana de Mod 40 vencida deja de ser oportunidad (entender_situacion) y es orden de situación.
  if ya_pens or e.ley <> 'Ley73' or e.ley is null then perform trol3._ck(p_id, 'ventana_mod40','no_aplica','baja',null);
  elsif m40_vencida then perform trol3._ck(p_id, 'ventana_mod40','alerta','media','Ventana de reingreso a Mod 40 vencida el '||e.limite_mod40||': requiere 52 semanas en régimen obligatorio');
  elsif um = 'mod40' then perform trol3._ck(p_id, 'ventana_mod40','ok','baja','Reingreso a Mod 40 hasta '||coalesce(e.limite_mod40::text,'?'));
  else perform trol3._ck(p_id, 'ventana_mod40','no_aplica','baja',null); end if;

  if e.etapa in ('asesorado','cliente') then perform trol3._ck(p_id, 'situacion_entendida','ok','baja',null);
  else perform trol3._ck(p_id, 'situacion_entendida','alerta','baja','Pendiente sesión con asesor'); end if;

  if e.ley_en is null then perform trol3._ck(p_id, 'datos_vigentes','sin_dato','media',null);
  elsif e.ley_vigente is false then perform trol3._ck(p_id, 'datos_vigentes','alerta','media','Datos IMSS de '||to_char(e.ley_en,'DD-Mon-YYYY')||'; conviene actualizar');
  else perform trol3._ck(p_id, 'datos_vigentes','ok','baja',null); end if;

  -- ---------------- Oportunidades ----------------
  if ident <> 'por_confirmar' or ident is null then
    if e.inconsistencia_imss is not null or (e.ley is null and e.consultas_fallidas > 0) then
      codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'inconsistencia_imss', null, '{}'::jsonb, coalesce(e.inconsistencia_imss,'Sin información IMSS tras consultas fallidas'), null);
    end if;
  end if;
  if e.semanas_validadas is not null and e.semanas_declaradas is not null and e.semanas_declaradas - e.semanas_validadas >= 26 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'reconocimiento_semanas', null, jsonb_build_object('delta_semanas', e.semanas_declaradas - e.semanas_validadas), 'Declara '||e.semanas_declaradas||' semanas vs '||e.semanas_validadas||' reconocidas: posibles semanas no reconocidas', null);
  end if;
  if e.cuenta_registrada is false then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'cuenta_sin_registrar', null, '{}'::jsonb, 'Cuenta AFORE no registrada', null);
  end if;

  -- 206: AFORE sólo con saldo relevante; sigue siendo `posible` hasta conocer la AFORE.
  if e.afore_actual is null and e.saldo_rcv97 is not null and e.saldo_rcv97 > afore_saldo_min then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'cambio_afore', null, jsonb_build_object('saldo_rcv97', e.saldo_rcv97), 'Saldo de '||trol3.mxn(e.saldo_rcv97)||' y no sabemos la AFORE: preguntarla y comparar', null, '{afore_actual}', 'posible');
  end if;

  if not ya_pens and e.ley = 'Ley73' and e.edad >= 60 and coalesce(e.semanas,0) >= 500 and derechos_ok then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'pension_hoy',
            nullif(coalesce(e.pension_base,0),0) * 12,
            jsonb_build_object('pension_mensual', e.pension_base, 'edad', e.edad, 'semanas', e.semanas),
            case when coalesce(e.pension_base,0) > 0
                 then 'Cumple edad, semanas y derechos: tramitar la pensión'
                 else 'Cumple edad, semanas y derechos: tramitar la pensión; falta calcular cuánto le toca' end,
            null,
            case when coalesce(e.pension_base,0) > 0 then '{}'::text[] else '{pension_base}'::text[] end);
  end if;

  -- 206: una sola Modalidad 40. Aplica hoy (retroactiva), o aplica dentro de `meses_antes`
  -- a la fecha del derecho D = la más tardía entre última cotización y los 60 años.
  if not ya_pens and e.ley = 'Ley73' and not m40_vencida then
    d_derecho := greatest(v_ult, (v_nac + interval '60 years')::date);
    m40_hoy := coalesce(e.mod40_retro_aplica,false) and coalesce(e.pension_mod40_retro,0) > coalesce(e.pension_base,0);
    m40_pronto := not m40_hoy and d_derecho is not null and d_derecho > v_hoy and d_derecho <= v_hoy + (m40_meses * 30)
                  and coalesce(e.pension_mod40_futuro,0) > coalesce(e.pension_base,0) * 1.15;
    if m40_hoy or m40_pronto then
      m40_nueva := case when m40_hoy then e.pension_mod40_retro else e.pension_mod40_futuro end;
      m40_urg := case when m40_hoy then e.limite_mod40 else least(d_derecho, e.limite_mod40) end;
      codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'mod40_retro', (m40_nueva - coalesce(e.pension_base,0))*12,
            jsonb_build_object('pension_base', e.pension_base, 'pension_mod40', m40_nueva, 'costo_retro', case when m40_hoy then e.costo_retro end,
                               'ultima_modalidad', um, 'aplica_hoy', m40_hoy, 'fecha_derecho', d_derecho),
            case when m40_hoy and um = 'mod40'
                   then 'Reingreso Mod 40 (baja de continuación voluntaria): ventana de 12 meses vence '||coalesce(e.limite_mod40::text,'?')||'; +'||round(m40_nueva - coalesce(e.pension_base,0))||' MXN/mes'
                 when m40_hoy
                   then 'Mod 40 retroactiva aplica hoy: +'||round(m40_nueva - coalesce(e.pension_base,0))||' MXN/mes'
                 else 'Mod 40 aplica desde '||to_char(d_derecho,'DD-Mon-YYYY')||': +'||round(m40_nueva - coalesce(e.pension_base,0))||' MXN/mes; no cotizar hasta entonces' end,
            m40_urg);
    end if;
  end if;

  -- 206: crédito a pensionados sólo con capacidad; sin dato queda `posible`.
  if ya_pens then
    if e.capacidad_credito is null then
      codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'credito_pension', null,
            jsonb_build_object('pension_liquida', e.pension_nomina_liquida, 'pension_bruta', e.pension_nomina_bruta, 'prestamos_activos', e.prestamos_nomina),
            'Pensionado; falta saber su capacidad de descuento (¿ya le descuentan algún crédito?)', null, '{capacidad_credito}', 'posible');
    elsif e.capacidad_credito > cp_min then
      codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'credito_pension', e.capacidad_credito*12,
            jsonb_build_object('capacidad_mensual', e.capacidad_credito, 'pension_liquida', e.pension_nomina_liquida,
                               'pension_bruta', e.pension_nomina_bruta, 'prestamos_activos', e.prestamos_nomina),
            'Pensionado con capacidad de $'||round(e.capacidad_credito)||' al mes sobre su pensión', null);
    end if;
  end if;

  -- 206: Infonavit = compra de inmueble en dos segmentos; sin Mejoravit.
  if e.status_empleo = 'empleado' and coalesce(e.edad,0) < inm_edad and coalesce(e.credito_infonavit,false) = false then
    if coalesce(e.saldo_infonavit,0) >= inv_min then
      codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'inversion_inmueble', e.saldo_infonavit, jsonb_build_object('saldo_infonavit', e.saldo_infonavit, 'segmento', 'B'), 'Saldo de vivienda de '||trol3.mxn(e.saldo_infonavit)||' cotizando y sin crédito: inversión inmobiliaria', null);
    elsif coalesce(e.saldo_infonavit,0) between inm_min and inm_max then
      codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'compra_inmueble', e.saldo_infonavit, jsonb_build_object('saldo_infonavit', e.saldo_infonavit, 'segmento', 'A'), 'Saldo de vivienda de '||trol3.mxn(e.saldo_infonavit)||' cotizando y sin crédito: compra de inmueble', null);
    end if;
  end if;

  if e.expectativa_pension is not null and coalesce(e.pension_base,0) > 0 and e.expectativa_pension > e.pension_base * 1.2 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'ahorro_voluntario', (e.expectativa_pension - e.pension_base)*12, jsonb_build_object('brecha_mensual', e.expectativa_pension - e.pension_base), 'Brecha entre pensión estimada y expectativa', null);
  end if;
  if coalesce(e.dependientes,0) > 0 and coalesce(e.tiene_seguro,false) = false then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'seguros', null, jsonb_build_object('dependientes', e.dependientes), 'Dependientes sin cobertura declarada', null);
  end if;

  codigos := codigos || trol3.evaluar_gestoria(p_id, e.cabecera_id);
  update trol3.oportunidades o set estado = 'no_aplica', cerrada_en = now()
   where o.persona_id = p_id and o.estado in ('posible','detectada') and not (o.codigo = any(codigos));

  return jsonb_build_object('oportunidades', coalesce(array_length(codigos,1),0), 'identidad', ident,
                            'ya_pensionado', ya_pens, 'derechos_ok', derechos_ok);
end $function$;

-- ---------------------------------------------------------------------------
-- 6. mi_mejor_jugada: textos de /mi alineados al catálogo v2
-- ---------------------------------------------------------------------------
create or replace function trol3.mi_mejor_jugada()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'trol3', 'public'
as $function$
declare pid uuid := trol3.current_persona_id(); e record; o record; txt text; titulo text; base numeric; nueva numeric; costo numeric; d jsonb;
begin
  if pid is null then return null; end if;
  select * into e from trol3.v_expediente where persona_id = pid;
  select o1.*, c.nombre cnombre, c.nombre_cliente, c.frase_corta, c.nivel into o from trol3.oportunidades o1 join trol3.catalogo_oportunidades c on c.codigo = o1.codigo
    where o1.persona_id = pid and o1.estado in ('presentada','en_proceso','detectada') and c.activo and c.nivel in (1,2,3)
    order by case o1.estado when 'en_proceso' then 0 when 'presentada' then 1 else 2 end, o1.valor_estimado desc nulls last limit 1;
  if o.id is null then return null; end if;
  d := coalesce(o.valor_detalle, '{}'::jsonb); base := coalesce(trol3.jnum(d->'pension_base'), e.pension_base);
  titulo := coalesce(o.nombre_cliente, o.cnombre);
  case o.codigo
    when 'mod40_retro' then nueva := trol3.jnum(d->'pension_mod40'); costo := trol3.jnum(d->'costo_retro');
      if coalesce((d->>'aplica_hoy')::boolean, true) then
        txt := format('Hoy te tocarían %s al mes. Pagando la Modalidad 40 retroactiva%s tu pensión pasaría a %s al mes, de por vida. Es una ventana con fecha límite: conviene decidir pronto.', trol3.mxn(base), case when costo is not null then ' (aprox. '||trol3.mxn(costo)||')' else '' end, trol3.mxn(nueva));
      else
        txt := format('Hoy te tocarían %s al mes. A partir de %s podrías pagar Modalidad 40 y tu pensión pasaría a %s al mes, de por vida. Mientras, conviene no cotizar y dejar listo cómo pagarla.', trol3.mxn(base), coalesce(to_char((d->>'fecha_derecho')::date, 'DD/MM/YYYY'), 'la fecha en que ganes el derecho'), trol3.mxn(nueva));
      end if;
    when 'pension_hoy' then txt := format('Cumples edad, semanas y derechos: podrías tramitar hoy una pensión de %s al mes. Antes de hacerlo, vale revisar si esperar o Modalidad 40 la suben.', trol3.mxn(base));
    when 'compra_inmueble' then txt := format('Con %s en tu subcuenta y cotizando, puedes convertir ese ahorro en un inmueble que te ayude a cumplir tus objetivos. Trol lo gestiona directo.', trol3.mxn(trol3.jnum(d->'saldo_infonavit')));
    when 'inversion_inmueble' then txt := format('Con %s en tu subcuenta y cotizando, puedes convertir ese saldo en una inversión inmobiliaria que genere valor y trabaje para ti.', trol3.mxn(trol3.jnum(d->'saldo_infonavit')));
    when 'inconsistencia_imss' then txt := 'No pudimos obtener tu información completa: algo no cuadra en tu registro del IMSS (nombre, dos números de seguridad social o datos distintos). Corregirlo es lo primero; sin eso, cualquier cálculo es a ciegas.';
    when 'reconocimiento_semanas' then
      if d ? 'delta_semanas' then
        txt := format('Declaraste más semanas de las que reconoce el IMSS (%s de diferencia). Cada semana cuenta: vale la pena revisar tu historial y pedir el reconocimiento.', d->>'delta_semanas');
      else
        txt := format('Tu número del IMSS es de %s y tu historial registrado empieza en %s: puede haber semanas que trabajaste y hoy no se te cuentan.', coalesce(d->>'anio_nss','antes'), coalesce(d->>'anio_primera_cotizacion','después'));
      end if;
    when 'cuenta_sin_registrar' then txt := 'Tu cuenta AFORE aparece sin registrar. Es un trámite sencillo y gratuito, y es el primer paso para ahorrar o hacer cualquier trámite.';
    when 'ahorro_voluntario' then txt := format('Entre lo que esperas y lo que te tocaría hay %s al mes de diferencia. El ahorro voluntario (deducible) es la forma más directa de acortarla.', trol3.mxn(trol3.jnum(d->'brecha_mensual')));
    else txt := coalesce(o.frase_corta, o.motivo, '');
  end case;
  return jsonb_build_object('oportunidad_id', o.id, 'codigo', o.codigo, 'estado', o.estado, 'titulo', titulo, 'texto', txt, 'valor', o.valor_estimado, 'urgencia', o.urgencia_fecha,
                            'recomendada', o.estado in ('presentada','en_proceso'), 'experto', (select nombre from trol3.miembros m where m.id = e.cabecera_id));
end $function$;
