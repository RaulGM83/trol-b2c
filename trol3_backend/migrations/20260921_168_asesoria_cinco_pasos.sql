-- 168: la asesoría como sesión de cinco pasos (fase 3a).
--
-- La asesoría estaba repartida en cinco pestañas sin secuencia, y no quedaba
-- registro de que se dio: ni en qué paso va, ni qué camino se recomendó. Ahora es
-- una sesión (trol3.asesorias) con cinco pasos —1 Su situación · 2 Lo que
-- encontramos · 3 Escenarios · 4 Nuestra recomendación · 5 Acuerdos— de navegación
-- LIBRE (Raul, 21-sep): `pasos_vistos` marca por dónde se pasó, no obliga a nada.
--
-- El diagnóstico avanzado se cuelga de la sesión (diagnostico_id) cuando se abra,
-- al salir del paso 3: sin escenario cerrado no puede nacer. Se arma siempre y se
-- ENTREGA sólo a quien tiene el beneficio.
--
-- `mostrar_costos`: en "Presentar" el cliente ve pensiones; lo que cuesta cada
-- camino sólo si el asesor prende este interruptor.
--
-- asesoria_vista(persona) es lo que pintan la vista del asesor y "Presentar": una
-- sola lectura, para que la pantalla que se comparte en videollamada no dependa de
-- las 700 líneas del expediente.
--
-- catalogo_oportunidades.frase_cliente: cada hallazgo dicho en una frase. Salen del
-- borrador de fichas (claude/73), que Raul está corrigiendo: son texto de arranque.

create table if not exists trol3.asesorias (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  asesor_id uuid references trol3.miembros(id),
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
  paso smallint not null default 1 check (paso between 1 and 5),
  pasos_vistos smallint[] not null default '{}',
  escenario_recomendado uuid references trol3.escenarios(id) on delete set null,
  mostrar_costos boolean not null default false,
  notas jsonb not null default '{}'::jsonb,
  diagnostico_id uuid references trol3.diagnosticos(id) on delete set null,
  iniciada_en timestamptz not null default now(),
  cerrada_en timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists asesorias_persona_idx on trol3.asesorias (persona_id, iniciada_en desc);
create unique index if not exists asesorias_una_abierta on trol3.asesorias (persona_id) where estado = 'abierta';
alter table trol3.asesorias enable row level security;
drop policy if exists asesorias_miembros on trol3.asesorias;
create policy asesorias_miembros on trol3.asesorias for all using (trol3.es_miembro()) with check (trol3.es_miembro());
grant select, insert, update, delete on trol3.asesorias to authenticated, service_role;

alter table trol3.catalogo_oportunidades add column if not exists frase_cliente text;
update trol3.catalogo_oportunidades c set frase_cliente = v.f
from (values
  ('reconocimiento_semanas', 'Hay semanas que sí trabajaste y que el IMSS no te está contando. Cada 52 que se recuperan suben el porcentaje de tu pensión.'),
  ('recuperar_ley73', 'Apareces como Ley 97, pero tu número de seguridad social es anterior a 1997: si se localizan tus semanas de antes, regresas a Ley 73.'),
  ('inconsistencia_imss', 'Algo no cuadra en tu registro del IMSS, y mientras no se corrija cualquier cálculo es a ciegas. Es lo primero que se arregla.'),
  ('unificacion_nss', 'Tienes dos números de seguridad social y tus semanas están repartidas entre los dos. Unificarlos las junta.'),
  ('reactivacion_mod10', 'Tus derechos de Ley 73 se vencieron o están por vencer. Se recuperan cotizando doce meses seguidos por tu cuenta.'),
  ('mod40_retro', 'Puedes cotizar por tu cuenta con el salario que elijas para subir tu promedio. En Ley 73 eso puede multiplicar tu pensión, y tiene fecha límite.'),
  ('mod40_prospectiva', 'Puedes cotizar por tu cuenta con el salario que elijas de aquí a tu retiro, para subir tu promedio y sumar semanas.'),
  ('pension_hoy', 'Ya cumples edad, semanas y derechos: puedes iniciar tu trámite hoy. Cada mes que pasa es pensión que no cobras.'),
  ('cuenta_sin_registrar', 'Tu cuenta AFORE aparece sin registrar. Sin registro no puedes ahorrar ni hacer trámites; se arregla fácil.'),
  ('cambio_afore', 'Todas las AFORE invierten tu dinero, pero no rinden igual. Estar en una de las mejores no cuesta nada.'),
  ('mejoravit_activo', 'Estás cotizando y no tienes crédito vigente: tu subcuenta de vivienda te da acceso a dinero hoy para mejorar tu casa.'),
  ('credito_infonavit_activo', 'Tienes un saldo alto en tu subcuenta de vivienda y estás cotizando: puedes usarlo como crédito ahora.'),
  ('compra_inmueble', 'Con tu saldo de vivienda y cotizando, tienes capacidad de crédito para comprar.'),
  ('credito_pension', 'Como ya cobras tu pensión, puedes tener un crédito que se descuenta de ella.'),
  ('ahorro_voluntario', 'Entre lo que esperas recibir y lo que te tocaría hay una diferencia. El ahorro voluntario es la forma más directa de acortarla.'),
  ('seguros', 'Tienes personas que dependen de ti y ninguna cobertura si faltas.')
) as v(c, f)
where c.codigo = v.c and c.frase_cliente is null;

create or replace function trol3.asesoria_abrir(p_persona uuid)
returns trol3.asesorias
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
declare a trol3.asesorias; mid uuid := trol3.current_miembro_id();
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  select * into a from trol3.asesorias where persona_id = p_persona and estado = 'abierta';
  if found then return a; end if;
  insert into trol3.asesorias (persona_id, asesor_id) values (p_persona, mid) returning * into a;
  perform trol3.registrar_interaccion(p_persona, 'nota', 'asesor', mid, 'interna', 'Inició una asesoría', false, jsonb_build_object('asesoria_id', a.id));
  return a;
end $function$;

create or replace function trol3.asesoria_marcar(p_id uuid, p_paso int default null, p_nota text default null, p_mostrar_costos boolean default null, p_escenario uuid default null, p_cerrar boolean default false)
returns trol3.asesorias
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
declare a trol3.asesorias; mid uuid := trol3.current_miembro_id();
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  update trol3.asesorias x set
    paso = coalesce(p_paso, x.paso),
    pasos_vistos = case when p_paso is null or p_paso = any(x.pasos_vistos) then x.pasos_vistos else array_append(x.pasos_vistos, p_paso::smallint) end,
    notas = case when p_nota is null then x.notas else x.notas || jsonb_build_object(coalesce(p_paso, x.paso)::text, p_nota) end,
    mostrar_costos = coalesce(p_mostrar_costos, x.mostrar_costos),
    escenario_recomendado = coalesce(p_escenario, x.escenario_recomendado),
    estado = case when p_cerrar then 'cerrada' else x.estado end,
    cerrada_en = case when p_cerrar then now() else x.cerrada_en end,
    updated_at = now()
  where x.id = p_id
  returning * into a;
  if not found then raise exception 'asesoria_no_existe'; end if;
  if p_cerrar then
    perform trol3.registrar_interaccion(a.persona_id, 'nota', 'asesor', mid, 'interna', 'Cerró la asesoría', false, jsonb_build_object('asesoria_id', a.id));
  end if;
  return a;
end $function$;

create or replace function trol3.asesoria_vista(p_persona uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'trol3', 'public'
as $function$
declare e record; pa jsonb; hist jsonb; ops jsonb; ses jsonb; escs jsonb;
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  select * into e from trol3.v_expediente where persona_id = p_persona;
  if e.persona_id is null then return null; end if;
  pa := trol3.parada_de(p_persona);

  select d.valor->'historial' into hist from trol3.datos d
   where d.persona_id = p_persona and d.campo = 'semilla' and jsonb_typeof(d.valor->'historial') = 'array'
   order by d.obtenido_en desc nulls last limit 1;
  if hist is null and e.legacy_cliente_id is not null then
    select c.calculo_pensional->'historial' into hist from public.clientes c
     where c.id = e.legacy_cliente_id and jsonb_typeof(c.calculo_pensional->'historial') = 'array';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'codigo', o.codigo, 'estado', o.estado, 'nivel', c.nivel,
           'nombre', coalesce(c.nombre_cliente, c.nombre), 'frase', c.frase_cliente,
           'motivo', o.motivo, 'urgencia', o.urgencia_fecha,
           -- sólo para el asesor: "Presentar" no pinta estos dos
           'valor', o.valor_estimado, 'nombre_interno', c.nombre)
         order by case when c.nivel = 1 or o.codigo = 'reactivacion_mod10' then 0 else 1 end, o.valor_estimado desc nulls last), '[]'::jsonb)
    into ops
    from trol3.oportunidades o join trol3.catalogo_oportunidades c on c.codigo = o.codigo and c.activo
   where o.persona_id = p_persona and o.estado::text in ('detectada','presentada','interesada','en_proceso')
     and o.codigo not in ('entender_situacion','asesoria_avanzada','referidos');

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'tipo', s.tipo, 'creado_en', s.creado_en, 'inputs', s.inputs, 'resultado', s.resultado) order by s.creado_en desc), '[]'::jsonb)
    into escs from trol3.escenarios s where s.persona_id = p_persona;

  select to_jsonb(a) into ses from trol3.asesorias a where a.persona_id = p_persona order by (a.estado = 'abierta') desc, a.iniciada_en desc limit 1;

  return jsonb_build_object(
    'cliente', jsonb_build_object('nombre', e.nombre, 'apellidos', e.apellidos, 'edad', e.edad, 'fecha_nacimiento', e.fecha_nacimiento,
                                  'ley', e.ley, 'semanas', e.semanas, 'semanas_capa', e.semanas_capa, 'status_empleo', e.status_empleo,
                                  'conserva_derechos', e.conserva_derechos, 'fin_conservacion', e.fin_conservacion,
                                  'dolor_principal', e.dolor_principal, 'expectativa_pension', e.expectativa_pension,
                                  'afore_actual', e.afore_actual, 'saldo_rcv97', e.saldo_rcv97, 'saldo_infonavit', e.saldo_infonavit,
                                  'saldo_infonavit_capa', e.saldo_infonavit_capa, 'datos_al', e.ley_en),
    'numeros', jsonb_build_object('pension_base', e.pension_base, 'pension_maxima', e.pension_maxima,
                                  'pension_mod40_retro', e.pension_mod40_retro, 'costo_retro', e.costo_retro, 'limite_mod40', e.limite_mod40),
    'experto', pa->>'experto',
    'parada', pa->'parada',
    'hallazgos', coalesce(pa->'hallazgos', '[]'::jsonb),
    'en_orden', pa->'en_orden',
    'oportunidades', ops,
    'historial', coalesce(hist, '[]'::jsonb),
    'escenarios', escs,
    'sesion', ses);
end $function$;

revoke all on function trol3.asesoria_abrir(uuid), trol3.asesoria_marcar(uuid, int, text, boolean, uuid, boolean), trol3.asesoria_vista(uuid) from public, anon;
grant execute on function trol3.asesoria_abrir(uuid), trol3.asesoria_marcar(uuid, int, text, boolean, uuid, boolean), trol3.asesoria_vista(uuid) to authenticated, service_role;