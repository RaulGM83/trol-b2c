-- 256 — Fichas de conocimiento tras el acuerdo DOF 21-oct-2026 (claude/106).
-- O5 pasa de «Mod 40 retroactiva» a «Cotizar por tu cuenta: Mod 40 o Mod 10»
-- (sin oportunidad propia: es asesoría; la de pension_hoy es O6; O5 queda como ficha de conocimiento).
-- O6 (pension_hoy) presenta los tres caminos. O4 (Mod 10 de reactivación) avisa
-- que después de la Mod 10 no hay Mod 40. Historial en trol3.fichas_historial
-- lo lleva el trigger de la tabla.

update trol3.fichas set
  titulo = 'Cotizar por tu cuenta: Modalidad 40 o Modalidad 10',
  oportunidades = '{}'::text[],
  frase = 'Desde el 22 de octubre de 2026 la Modalidad 40 ya no se paga hacia atrás y tiene tope de salario; cotizar por tu cuenta sigue subiendo la pensión, pero ahora la pregunta es con qué modalidad, con qué salario y desde cuándo.',
  cuando_aplica = 'Ley 73 · derechos vigentes · dentro de los **5 años** desde la baja (12 meses si la última fue Mod 40) para Mod 40; Mod 10 no tiene ventana. **No aplica Mod 40 si viene de Mod 10** (independiente). Quien ya estaba inscrito en Mod 40 antes del 22-oct-2026 conserva sus condiciones mientras siga pagando (régimen «anterior» en el expediente).',
  como_explicarlo = E'1. Lo que cambió (acuerdo del Consejo Técnico del IMSS, DOF 21-oct-2026): **nadie paga hacia atrás**; la cotización corre desde que se solicita. Antes de eso, nada de lo que se ofrecía de retroactivo existe ya.\n2. **Modalidad 40**: hasta tu último salario registrado **más una UMA** (unos $117 diarios más). Es la barata.\n3. **Modalidad 10** (independiente): hasta **25 UMA** (~$2,934 diarios), cuesta más, y **después de ella ya no hay Modalidad 40**. Es la vía para subir el salario de verdad.\n4. No se combinan: el plan va entero en una modalidad. La calculadora enseña las dos con su costo mensual y en cuántos meses se recupera.\n5. **Cuándo empezar**: con muchas semanas conviene empezar tarde — unos 5 años de cotización al salario alto llenan el promedio de 250 semanas; pagar más años sólo compra semanas. La calculadora sugiere la fecha de inicio («¿Cuándo le conviene empezar a pagar?»).\n6. Si ya puede pensionarse, cada mes que sigue cotizando es un mes de pensión que no cobra: entra en la cuenta (O6).',
  preguntas = E'- *"¿Puedo pagar lo que no pagué?"* — Ya no. Desde el 22-oct-2026 sólo hacia adelante.\n- *"¿Por qué no me dejan poner el salario que quiero?"* — En Mod 40 el tope es tu último salario + 1 UMA. Si quieres más, es Mod 10, que cuesta más.\n- *"¿Me conviene empezar ya?"* — Casi nunca es «ya»: se enseña la sugerencia de inicio con su costo y su pensión.\n- *"¿Y si estoy trabajando?"* — Mientras pueda seguir empleado, mejor; sólo se mueve la baja si él dice que podría salir pronto.\n- *"¿Me prestan para pagarlo?"* — Por ahora no hay crédito para cuotas mes a mes; sólo para reactivar derechos (O4).',
  documentos = 'Constancia de semanas (Trol) → escenario cerrado de la calculadora con modalidad, salario y fecha de inicio → inscripción digital en el IMSS (la hace el cliente; Trol acompaña) → primera línea de captura.',
  solo_asesor = 'Trol **recomienda**, no ejecuta: Viraal ya no recibe Mod 40 y Mod 10 sólo la ejecuta para reactivar derechos. Pendiente del IMSS: si los ya inscritos pueden subir su salario; mientras, se modela sin subida. El régimen y el tope están en el expediente (`mod40_regimen`, `mod40_sbc_tope`). La regla es temporal: el IMSS la revisa en ~12 meses.',
  en_diagnostico = 'Estrategia (los tres caminos de O6; escenario cerrado de la calculadora).',
  updated_at = now()
where codigo = 'O5';

update trol3.fichas set
  frase = 'Ya cumples edad, semanas y derechos: puedes iniciar tu trámite hoy. Vemos juntos si te conviene tramitar ya o cotizar unos meses más por tu cuenta.',
  como_explicarlo = E'1. Primero la buena noticia, con su número.\n2. **El retroactivo de la pensión**: el IMSS paga hasta **12 meses** hacia atrás, contados desde lo más tardío entre su baja y el día que cumplió 60.\n3. **Los tres caminos**, siempre juntos (el expediente los trae en la oportunidad): tramitar ya · Mod 40 topada 12/24 meses · Mod 10 a 25 UMA 12/24 meses, cada uno con pensión, cuotas, lo que deja de cobrar por seguir cotizando y en cuántos meses se recupera. Regla de casa: si 12 meses de cuotas no se recuperan en **36 meses** de aumento, se tramita ya.\n4. Antes de tramitar, revisar si esperar un escalón de edad la sube (T3).\n5. El trámite ante el IMSS es gratis. Trol acompaña; no pide anticipos en efectivo ni garantiza montos.',
  preguntas = E'- *"¿Cuánto me van a dar de retroactivo?"* — El número del sistema está **proyectado**: corrígelo en vivo con su fecha real de baja.\n- *"¿Y si cotizo un año más?"* — Enséñale los tres caminos: sube la pensión, pero paga cuotas y deja de cobrar 12 mensualidades. En la mayoría gana tramitar ya; quien está en la mínima con muchas semanas es quien más gana con Mod 10 corta al máximo.',
  updated_at = now()
where codigo = 'O6';

update trol3.fichas set
  como_explicarlo = como_explicarlo || E'\n5. **Ojo (acuerdo DOF 21-oct-2026)**: después de una Modalidad 10 ya no se puede contratar Modalidad 40; la pensión será la del promedio de hoy. Se dice antes de firmar.',
  updated_at = now()
where codigo = 'O4' and como_explicarlo not like '%acuerdo DOF 21-oct-2026%';
