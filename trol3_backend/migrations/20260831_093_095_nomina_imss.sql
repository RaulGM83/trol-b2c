-- 093–095 (31-ago-2026): verificación de nómina de pensiones IMSS (Credifintech).
--
-- Por qué: al revisar la lista de "pensionarse hoy con retroactivo" (590 personas
-- de 60.5+, Ley 73, 500+ semanas, 6 meses sin cotizar), los 10 primeros se
-- verificaron uno por uno en la Solicitud de capacidad de Credifintech y
-- 9 YA ESTABAN PENSIONADOS. El motor generaba pension_hoy sin poder saberlo.
--
-- Aplicadas vía MCP el 31-ago-2026. El texto íntegro de las funciones vive en
-- Supabase (migraciones 093_verificacion_nomina_imss, 094_motor_respeta_nomina_
-- y_credito_pension, 095_rpc_registrar_nomina_imss).

-- 093 -----------------------------------------------------------------------
-- Campos nuevos (grupo 'nomina', capa validado, proveedor 'credifintech'):
--   estatus_nomina_imss (pensionado|sin_registro, 180 d)
--   pension_nomina_bruta / pension_nomina_liquida (90 d)
--   tipo_pension_nomina (180 d)
--   capacidad_credito_pension (45 d)
--   prestamos_nomina_activos (45 d, único NO visible al cliente)
insert into trol3.catalogo_campos
  (campo, nombre, grupo, tipo, unidad, vigencia_dias, editable_cliente, visible_cliente, visible_aliado, orden, opciones)
values
  ('estatus_nomina_imss','Estatus en nómina de pensiones IMSS','nomina','text',null,180,false,true,false,70,
   array['pensionado','sin_registro']),
  ('pension_nomina_bruta','Pensión real (pago ordinario)','nomina','number','mxn',90,false,true,false,71,null),
  ('pension_nomina_liquida','Pensión real (líquido que recibe)','nomina','number','mxn',90,false,true,false,72,null),
  ('tipo_pension_nomina','Tipo de pensión (nómina IMSS)','nomina','text',null,180,false,true,false,73,null),
  ('capacidad_credito_pension','Capacidad de crédito sobre la pensión','nomina','number','mxn',45,false,true,false,74,null),
  ('prestamos_nomina_activos','Préstamos activos sobre la pensión','nomina','number',null,45,false,false,false,75,null)
on conflict (campo) do nothing;

create table if not exists trol3.verificaciones_nomina (
  id            bigserial primary key,
  persona_id    uuid references trol3.personas(id) on delete set null,
  nss           text not null,
  resultado     text not null check (resultado in ('pensionado','sin_registro','error')),
  payload       jsonb not null default '{}'::jsonb,
  verificado_en timestamptz not null default now(),
  actor         trol3.actor_tipo not null default 'sistema'
);
create index if not exists ix_vn_persona on trol3.verificaciones_nomina (persona_id, verificado_en desc);
create index if not exists ix_vn_nss on trol3.verificaciones_nomina (nss);
alter table trol3.verificaciones_nomina enable row level security;
drop policy if exists vn_miembros on trol3.verificaciones_nomina;
create policy vn_miembros on trol3.verificaciones_nomina for all to authenticated
  using (trol3.es_miembro()) with check (trol3.es_miembro());

-- v_expediente: se recreó agregando al final estatus_nomina, pension_nomina_bruta,
-- pension_nomina_liquida, tipo_pension_nomina, capacidad_credito, prestamos_nomina
-- y nomina_verificada_en. El resto de la vista quedó igual.

-- 094 -----------------------------------------------------------------------
-- evaluar_persona: variable ya_pens := (e.estatus_nomina = 'pensionado').
--   · pension_hoy, mod40_retro, mod40_prospectiva, reactivar_derechos y el aviso
--     de ventana Mod 40 vencida ahora llevan `not ya_pens`.
--   · checklist derechos_vigentes: 'no_aplica' con nota "Ya está pensionado".
--   · REGLA NUEVA credito_pension (existía en el catálogo sin disparador):
--       ya_pens and capacidad_credito > 350
--       valor_estimado = capacidad * 12
--   · retiro_infonavit_pension NO lleva `not ya_pens`: la subcuenta de vivienda
--     se retira igual estando pensionado.

-- 095 -----------------------------------------------------------------------
-- trol3.registrar_nomina_imss(p_nss text, p_resultado text, p_payload jsonb)
--   Busca la persona por NSS (solo dígitos, merged_into is null), deja fila en
--   verificaciones_nomina, escribe los datos con _dato_si_cambio y, si es
--   pensionado, también status_empleo='pensionado' y cierra las oportunidades
--   de pensión que estén en presentada/interesada/en_proceso con
--   motivo_perdida='ya_pensionado' (las detectadas las cierra el trigger).
--   Guarda el estatus TAMBIÉN cuando es 'sin_registro': ése es el candidato real.
--   Ejecutable por authenticated y service_role; revocada para anon.
