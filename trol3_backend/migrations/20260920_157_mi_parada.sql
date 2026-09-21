-- 157: "Aquí vas" — en qué parada va el cliente, a quién le toca y qué sigue.
--
-- /mi contestaba "¿qué sabemos de ti?" y el cliente pregunta "¿dónde voy y qué
-- me toca?". La respuesta vive aquí y no en el TSX, igual que mi_misiones():
-- cinco paradas (1 Tu información · 2 Tu diagnóstico · 3 Tu plan · 4 En trámite ·
-- 5 Tu pensión), UNA sola cosa que sigue, y siempre con dueño ('cliente' o 'trol').
--
-- Decisiones (claude/70): en la parada 2 el paso es el chat; una oportunidad
-- que ningún experto ha presentado se nombra SIN pesos; las tareas de datos
-- nunca son "lo que sigue"; 'situacion_entendida' no es un hallazgo (es alerta
-- para todo el mundo: es justo el paso de la parada 2).
--
-- "Esperando" sólo cuenta consultas de las últimas 24 h: las 78 imss_historial
-- que siguen 'en_proceso' son zombies de hace semanas y prometerle "te avisamos
-- en unos minutos" a esa gente sería mentirle.
--
-- parada_de(uuid) es interna (pruebas y, después, el expediente del asesor);
-- el cliente sólo alcanza mi_parada().

create or replace function trol3.parada_de(p_persona uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'trol3', 'public'
as $function$
declare
  e record; o record; ult record;
  ident text;
  meses constant text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  info_oficial boolean; esperando boolean; fallo boolean;
  parada int; sub text; toca text; titulo text; texto text; cta text; boton text; mensaje_wa text; frase text; pie text;
  hallazgos jsonb; en_orden int; n_cosas int; tramite jsonb; faltan_cliente int; hechos int; total int;
  experto text; op jsonb := null;
begin
  if p_persona is null then return null; end if;
  select * into e from trol3.v_expediente where persona_id = p_persona;
  if e.persona_id is null then return null; end if;

  select nombre into experto from trol3.miembros m where m.id = e.cabecera_id;
  select valor#>>'{}' into ident from trol3.v_mejor_dato where persona_id = p_persona and campo = 'estatus_identidad';
  select c.estado, c.created_at into ult from trol3.consultas c
    where c.persona_id = p_persona and c.tipo = 'imss_historial' order by c.created_at desc limit 1;

  info_oficial := e.ley is not null and e.ley_capa = 'validado';
  esperando := ult.estado in ('solicitada','en_proceso') and ult.created_at > now() - interval '24 hours';
  fallo := not info_oficial and e.curp is not null and not coalesce(esperando, false) and ult.estado is not null;

  -- La oportunidad que manda: la más avanzada y, entre iguales, la que más vale.
  select o1.id, o1.codigo, o1.estado, o1.valor_estimado, o1.urgencia_fecha, c.nombre
    into o
    from trol3.oportunidades o1 join trol3.catalogo_oportunidades c on c.codigo = o1.codigo
   where o1.persona_id = p_persona and c.activo
     and o1.estado in ('ganada','en_proceso','interesada','presentada','detectada')
   order by case o1.estado when 'en_proceso' then 0 when 'interesada' then 1 when 'presentada' then 2 when 'ganada' then 3 else 4 end,
            o1.valor_estimado desc nulls last
   limit 1;

  -- Lo que encontramos: sólo alertas, dichas en llano.
  select coalesce(jsonb_agg(jsonb_build_object('item', x.item, 'severidad', x.severidad, 'titulo', x.t, 'detalle', x.d)
                            order by case x.severidad when 'alta' then 0 when 'media' then 1 else 2 end, x.item), '[]'::jsonb)
    into hallazgos
    from (
      select ci.item, ci.severidad,
        case ci.item
          when 'derechos_vigentes' then case
              when e.fin_conservacion is not null and e.fin_conservacion >= current_date
                then 'Tus derechos de Ley 73 vencen el ' || extract(day from e.fin_conservacion)::int || ' de ' || meses[extract(month from e.fin_conservacion)::int] || ' de ' || extract(year from e.fin_conservacion)::int
              else 'Tus derechos de Ley 73 ya no están vigentes' end
          when 'semanas_reconocidas' then 'Hay semanas trabajadas que el IMSS no te reconoce'
          when 'cuenta_registrada' then 'Tu cuenta AFORE aparece sin registrar'
          when 'cuenta_sin_inconsistencias' then 'Hay algo que no cuadra en tu registro del IMSS'
          when 'afore_top' then 'Tu AFORE no está entre las de mejor rendimiento'
          when 'datos_vigentes' then 'Tu información del IMSS ya tiene tiempo'
          else ci.item end as t,
        case ci.item
          when 'derechos_vigentes' then case
              when e.fin_conservacion is not null and e.fin_conservacion >= current_date
                then 'Si vencen, habría que volver a cotizar para recuperarlos. Conviene verlo antes de esa fecha.'
              else 'Se recuperan volviendo a cotizar. Sin eso, el IMSS no otorga la pensión de Ley 73.' end
          when 'semanas_reconocidas' then 'Cada semana que falta baja tu pensión. Se pueden recuperar.'
          when 'cuenta_registrada' then 'Sin registro no puedes ahorrar ni hacer retiros. Es un trámite sencillo.'
          when 'cuenta_sin_inconsistencias' then 'Podemos ayudarte a identificar qué es y a corregirlo.'
          when 'afore_top' then 'Cambiarte no cuesta y puede darte más rendimiento sin hacer nada más.'
          when 'datos_vigentes' then 'Conviene actualizarla para que tus números sean los de hoy.'
          else ci.detalle end as d
      from trol3.checklist_items ci
      where ci.persona_id = p_persona and ci.estado = 'alerta'
        and ci.item <> 'situacion_entendida'
        -- sin información oficial, "algo no cuadra" ya ES la tarjeta de lo que sigue
        and not (ci.item = 'cuenta_sin_inconsistencias' and not info_oficial)
    ) x;
  select count(*) into en_orden from trol3.checklist_items ci
   where ci.persona_id = p_persona and ci.estado = 'ok' and ci.item <> 'situacion_entendida';

  n_cosas := jsonb_array_length(hallazgos) + (select count(*) from trol3.oportunidades o2 join trol3.catalogo_oportunidades c2 on c2.codigo = o2.codigo
                                               where o2.persona_id = p_persona and c2.activo and o2.estado in ('detectada','presentada','interesada'));

  if o.id is not null then
    op := jsonb_build_object('id', o.id, 'codigo', o.codigo, 'estado', o.estado, 'nombre', o.nombre,
                             -- los pesos sólo cuando un experto ya la presentó
                             'valor', case when o.estado in ('presentada','interesada','en_proceso','ganada') then o.valor_estimado end,
                             'urgencia', o.urgencia_fecha);
  end if;

  ------------------------------------------------------------------ paradas
  if o.estado = 'en_proceso' then
    parada := 4; sub := 'tramite';
    select coalesce(jsonb_agg(jsonb_build_object('id', oc.id, 'item', cc.item, 'detalle', cc.detalle, 'quien', cc.quien,
                                                 'estado', oc.estado, 'hecho', oc.estado in ('entregado','validado'))
                              order by (oc.estado in ('entregado','validado')) desc, cc.orden), '[]'::jsonb),
           count(*) filter (where cc.quien = 'cliente' and oc.estado = 'pendiente'),
           count(*) filter (where oc.estado in ('entregado','validado')),
           count(*)
      into tramite, faltan_cliente, hechos, total
      from trol3.oportunidad_checklist oc join trol3.checklist_catalogo cc on cc.id = oc.item_id
     where oc.oportunidad_id = o.id and oc.estado <> 'no_aplica';
    titulo := 'Tu trámite: ' || o.nombre;
    if faltan_cliente > 0 then
      toca := 'cliente';
      texto := case when total > 0 then 'Vamos ' || hechos || ' de ' || total || '. ' else '' end
               || case when faltan_cliente = 1 then 'De tu lado falta una cosa' else 'De tu lado faltan ' || faltan_cliente || ' cosas' end
               || '; lo demás lo llevamos nosotros.';
      frase := 'Tu trámite va caminando. ' || case when faltan_cliente = 1 then 'Hoy sólo falta una cosa de tu lado.' else 'Faltan ' || faltan_cliente || ' cosas de tu lado.' end;
    else
      toca := 'trol';
      texto := case when total > 0 then 'Vamos ' || hechos || ' de ' || total || '. ' else '' end
               || 'Hoy no falta nada de tu lado: te avisamos por WhatsApp en cuanto haya un avance.';
      frase := 'Tu trámite va caminando. Hoy no tienes nada pendiente.';
    end if;
    cta := 'tramite'; boton := 'Preguntar por mi trámite';
    mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Quiero saber cómo va mi trámite: ' || o.nombre || '.';

  elsif o.estado in ('presentada','interesada') then
    parada := 3; sub := o.estado; toca := 'cliente';
    titulo := o.nombre;
    texto := null; -- el texto con números lo da mi_mejor_jugada(): una sola fuente
    cta := 'avanzar'; boton := 'Quiero avanzar';
    pie := case when experto is not null then 'Te lo recomienda ' || experto || ', de Trol.' end;
    frase := coalesce(experto, 'Tu experto') || ' ya revisó tu caso. Tienes una recomendación esperando tu respuesta.';
    mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Vi lo que me recomiendan: ' || o.nombre || '. Quiero avanzar.';

  elsif o.estado = 'ganada' then
    parada := 5; sub := 'logrado'; toca := 'trol';
    titulo := 'Lo lograste: ' || o.nombre;
    texto := 'Esto ya quedó. Si quieres ver qué más se puede hacer con tu pensión, escríbenos.';
    cta := 'chat'; boton := 'Ver qué más hay para mí';
    frase := 'Llegaste. Lo que sigue es cuidar lo que lograste.';
    mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Ya terminé mi trámite de ' || o.nombre || ' y quiero saber qué más puedo hacer.';

  elsif info_oficial then
    parada := 2; sub := case when o.id is not null then 'con_hallazgo' when jsonb_array_length(hallazgos) > 0 then 'con_alerta' else 'en_orden' end;
    toca := 'cliente';
    if sub = 'en_orden' then
      titulo := 'Revisa tus números con alguien de Trol';
      texto := 'No encontramos nada urgente en tu caso, y eso es buena noticia. En el chat te explicamos qué significan tus números y si hay forma de subirlos.';
    else
      titulo := 'Que te expliquen lo que encontramos';
      texto := 'Revisamos tu historial y hay ' || case when n_cosas = 1 then 'una cosa' else n_cosas || ' cosas' end || ' en tu caso.'
               || case when o.id is not null then ' La más importante: ' || o.nombre || '. Un experto te confirma si aplica y cuánto vale para ti.'
                       else ' Te explicamos qué significan y qué se puede hacer.' end;
    end if;
    cta := 'chat'; boton := 'Que me lo expliquen por WhatsApp';
    pie := 'Te contestamos al momento, a cualquier hora. Sin costo.';
    frase := 'Ya tenemos tu información. Falta que alguien te la explique.';
    mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Ya vi mis números y quiero que me expliquen lo que encontraron en mi caso'
                  || case when o.id is not null then ' (' || o.nombre || ')' else '' end || '.';

  else
    parada := 1;
    if e.curp is null then
      sub := 'sin_curp'; toca := 'cliente';
      titulo := 'Comparte tu CURP';
      texto := 'Con ella buscamos tu información oficial en el IMSS, sin costo. Así sabrás cuántas semanas tienes y cuánto te tocaría de pensión.';
      cta := 'curp'; boton := null;
      frase := 'Para empezar sólo necesitamos tu CURP.';
      mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Quiero darles mi CURP por aquí.';
    elsif esperando then
      sub := 'esperando'; toca := 'trol';
      titulo := 'Te avisamos por WhatsApp en cuanto llegue';
      texto := 'No tienes que hacer nada. Si el IMSS tarda más de lo normal, también te lo decimos.';
      cta := null; boton := null;
      frase := 'Ya tenemos tu CURP. El IMSS suele contestar en unos minutos.';
      mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Estoy esperando mi información del IMSS y tengo una duda.';
    elsif ident = 'confirmada_con_problema' then
      sub := 'curp_con_problema'; toca := 'trol';
      titulo := 'Tu CURP está bien; el problema está en tu registro del IMSS';
      texto := 'Pasa más de lo que parece: un nombre mal capturado, dos números de seguridad social, datos que no coinciden. Podemos ayudarte a identificar qué es y a corregirlo.';
      cta := 'chat'; boton := 'Verlo con alguien de Trol';
      frase := 'El IMSS no nos dio tu información. Hay que revisar tu registro.';
      mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Confirmé que mi CURP está bien y aun así el IMSS no entrega mi información. Quiero que me ayuden a revisar mi registro.';
    elsif fallo then
      -- Lo más común es un carácter mal escrito: eso lo arregla él solo. Si la
      -- CURP está bien, entonces es su registro, y ahí entramos nosotros.
      sub := case when ident = 'por_confirmar' then 'confirmar_curp' else 'revisar_curp' end; toca := 'cliente';
      titulo := 'Revisa que tu CURP esté bien escrita';
      texto := 'El IMSS no nos entregó tu información. Casi siempre es un carácter mal capturado: si lo corriges, volvemos a buscar de inmediato. Si tu CURP está bien, puede ser otra inconsistencia en tu registro; podemos ayudarte a identificarla y corregirla.';
      cta := 'curp_revisar'; boton := 'Mi CURP está bien, ayúdenme';
      frase := 'El IMSS no nos dio tu información. Empecemos por revisar tu CURP.';
      mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Mi CURP está bien escrita pero el IMSS no entrega mi información. ¿Me ayudan a revisar qué pasa con mi registro?';
    else
      sub := 'por_buscar'; toca := 'cliente';
      titulo := 'Busquemos tu información oficial';
      texto := 'Ya tenemos tu CURP. Con un toque la buscamos en el IMSS, sin costo, y te avisamos por WhatsApp cuando llegue.';
      cta := 'consulta_imss'; boton := null;
      frase := 'Ya tenemos tu CURP. Falta traer tu información del IMSS.';
      mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Quiero que busquen mi información del IMSS.';
    end if;
  end if;

  return jsonb_build_object(
    'parada', parada, 'sub', sub, 'toca', toca, 'frase', frase,
    'titulo', titulo, 'texto', texto, 'pie', pie,
    'cta', cta, 'boton', boton, 'mensaje_wa', mensaje_wa,
    'oportunidad', op, 'experto', experto,
    'hallazgos', hallazgos, 'en_orden', en_orden,
    'tramite', coalesce(tramite, '[]'::jsonb));
end $function$;

create or replace function trol3.mi_parada()
returns jsonb
language sql
stable security definer
set search_path to 'trol3', 'public'
as $function$ select trol3.parada_de(trol3.current_persona_id()) $function$;

revoke all on function trol3.parada_de(uuid) from public, anon, authenticated;
revoke all on function trol3.mi_parada() from public, anon;
grant execute on function trol3.mi_parada() to authenticated;
grant execute on function trol3.parada_de(uuid) to service_role;