# 107 · Informe Trol #1 — «El día que el IMSS cerró la Modalidad 40»: diseño del análisis de impacto

**Estado:** diseño cerrado con Raúl el 24-oct-2026; nada corrido todavía (sólo conteos de base). Serie **«Informe Trol»**: #1 primera lectura esta semana, #2 mapa completo en 2–3 semanas, después notas cortas cada vez que haya noticia.

**Tesis:** nadie más tiene 8,815 historiales reales de Ley 73 pasados por el mismo motor bajo las dos reglas (`claude/106`). Tres preguntas: ¿quién perdió cuánto?, ¿qué compra de verdad el dinero extra de la Modalidad 10?, ¿qué debería corregir el IMSS en su revisión a 12 meses?

## 1. Decisiones (24-oct)

| # | Tema | Decisión |
|---|---|---|
| 1 | Audiencia | Dos voces en un mismo activo: **prensa/público** (aterrizado a la persona) e **industria/aliados** (metodología, cifras, propuestas). |
| 2 | Línea base «antes» | Titular con **potencial** (máximo teórico: Mod 40 retro 5 años a 25 UMA, retiro óptimo) y **banda realista** (potencial × tasa histórica de ejecución nuestra). «Planeado» (138 en vuelo + 450 detectadas) sólo como «lo que ya pasó». |
| 3 | Cobertura de Mod 10 | Lectura inicial correcta; se verifica contra LSS/RACERF en el paso 2 (§5). |
| 4 | Extrapolación | Sí, pero **sin cifras enormes en portada**: el informe aterriza en personas (arquetipos y medianas por grupo); la escala nacional va como rango en metodología. |
| 5 | Nosotros y la industria | **No se nombra a Viraal.** Trol declara que no tiene ingresos relevantes de Mod 40 retroactiva (el piloto nunca arrancó). Sí se dice que **los despachos cuyo modelo era el retro son quienes más pierden y quienes liderarán los amparos**. |
| 6 | Momento | Aprovechar que todos hablan del tema: publicar rápido con lo que ya hay y **seguir opinando en el tiempo** (serie). |
| 7 | Marca | «Informe Trol» como serie numerada. |

## 2. Lo que ya sabemos de la base (24-oct, recálculo v5.8 cerrado: 8,921 ok · 12 error)

8,815 personas Ley 73 no pensionadas en `trol3.v_segmentos_mod40_2026`:

| Seg. | Quiénes | n | Mujeres | Edad mediana |
|---|---|---|---|---|
| A | inscrito en Mod 40 (conserva condiciones) | 99 | 33 % | 59 |
| B | ex-Mod 40 < 12 m | 56 | 20 % | 60 |
| C | Mod 40 en vuelo al corte | 138 | 19 % | 60 |
| D | desempleado 60+ con derechos | 443 | 13 % | 61 |
| E | desempleado < 60 con derechos | 1,863 | 20 % | 57 |
| F | derechos perdidos | 2,693 | 24 % | 58 |
| G | última Mod 10 | 260 | 24 % | 59 |
| H | empleado | 3,263 | 18 % | 57 |

Entre los 60+ con derechos (`pension_hoy` con tres caminos, 1,310): **tramitar ya 61 % · Mod 10 33 % · Mod 40 topada 2 %** (60 sin caminos). La Mod 40 topada casi nunca gana: titular en sí mismo.

## 3. Métrica por persona (dos mundos, un motor)

pension-core reproduce el mundo viejo (`hoy < 2026-10-22`) y el nuevo (`caminosLey73` + `sugerirInicio`).

| Métrica | Mundo viejo | Mundo nuevo |
|---|---|---|
| Mejor pensión alcanzable (P) | Mod 40 retro hasta 5 años a 25 UMA (`computeProyectoMod40`), retiro óptimo 60–65 | máx(tramitar ya · Mod 40 topada · Mod 10 a 25 UMA), inicio sugerido, horizontes 12–60 m, retiro 60–65 |
| Costo de cuotas (C) | retro al pago vigente | con la rampa de cuotas 2026–2030 |
| Derivadas | ΔP mensual · ΔP vitalicia (esperanza de vida CONAPO a la edad de retiro, por sexo; 0 % y 3.5 % real) · ΔC · **precio por peso de pensión** (C/ΔP) · años de retraso para igualar la pensión vieja · meses de recuperación (umbral de casa: 36) |

Supuestos fijos: 25 UMA como salario objetivo en los dos mundos; UMA y PMG 2026 (PMG $10,635); sin inflación (términos reales); mismo motor y mismos datos para los dos mundos. **Entrada** = el mismo armado de perfil que usa la calculadora (semilla 2.2 de `public.clientes.calculo_pensional` → `EntradaCalculo`), no se reinventa.

Nota conocida: para empleados < 60 la «pensión hoy» de n8n es el Escenario Base; en el informe se usa pension-core consistentemente (sin cotizar).

## 4. Grupos para presentar

| Grupo | Segmentos | Qué les cambió | Corte interno |
|---|---|---|---|
| **1. La jugada cerrada** | D + E + C (2,444) | Perdieron el retro a 25 UMA; Mod 40 topada a su último salario; sólo queda Mod 10 hacia adelante | edad ≤55 (aún llenan 250 semanas) · 56–59 (parcial, retrasan retiro) · 60+ (pensionarse ya vs esperar hasta 5 años) × último SBC en terciles |
| **2. Los que llegaron a tiempo** | A + B (155) | Conservan condiciones; B re-entra con tope = su salario de Mod 40 | pendiente IMSS: si A puede subir salario |
| **3. Los que siguen adentro** | H (3,263) | El tope depende del último SBC: cotizando alto, intactos; cotizando bajo, su último salario vale más que nunca (pregunta C de `claude/106`) | SBC ≥ tope deseado vs < |
| **4. La puerta de atrás** | F + G (2,953) | Reactivar con Mod 10 ya no abre la Mod 40: se quedan en Mod 10, más cara | con / sin conservación |
| **Transversal: mujeres** | 13–33 % por segmento | Salarios registrados más bajos y más huecos → el retro era su ecualizador | por grupo |
| Ley 97 | fuera | una línea | — |

**Arquetipos (aterrizar a la persona):** 6 personas compuestas, una por grupo/corte, construidas con las medianas de su celda (nunca un cliente real): nombre ficticio, edad, semanas, último salario, situación; «antes» (pensión y costo), «ahora» (tres caminos), pérdida, y qué le conviene hacer. Son la portada del informe público.

## 5. Mod 10 vs Mod 40: el valor de la diferencia

**Qué compra el dinero extra** (verificar citas en el paso 2):
- Mod 40 = continuación voluntaria: sólo Invalidez y Vida + RCV (LSS 218–219).
- Mod 10 = incorporación voluntaria al régimen obligatorio, trabajador independiente (LSS 13 fr. I y 222 fr. II a): además, **Enfermedades y Maternidad en especie** (titular y beneficiarios: cónyuge/concubina, hijos, padres dependientes) y **Riesgos de Trabajo en especie**; sin prestaciones en dinero (subsidios). Por confirmar: periodicidad de pago (mensual vs anualidad), edad límite, tiempos de espera, si se exige no tener relación laboral.
- IV está en las dos: no cuenta en la diferencia.

**La cuenta de la diferencia a 25 UMA** (estimación inicial, a verificar con tarifario): cuota fija EyM (20.4 % UMA) + excedente sobre 3 UMA (1.10 % + 0.40 %) + gastos médicos de pensionados (1.05 % + 0.375 %) + RT (prima) ≈ **$3,500–4,500 al mes** (~$42–54k al año). Se publica la tabla por salario (3, 10, 25 UMA).

**Tres referencias para valuarlo** (una sola gráfica *edad vs. precio anual*):
1. **El precio del propio IMSS**: Mod 33 (tabulador 2026 por edad), titular + cónyuge.
2. **Aseguradora privada**: GMM a 45 / 55 / 60 / 64 con pareja (3 cotizaciones + AMIS/CNSF), con deducible, coaseguro y exclusión de preexistencias; y el dato clave: **a partir de ~64 años no venden póliza nueva**.
3. **Riesgo de bolsillo**: costo de un evento (infarto, cirugía) en hospital privado.

Conclusiones a probar: a los 60, la Mod 10 es el seguro integral más barato que se puede comprar en México; a los 45 la comparación se invierte. Y: para quien ya tiene IMSS por otro lado (beneficiario) o GMM de su ex-empresa, el extra vale cero → **hay que preguntarlo** (Lukas, calculadora, ficha O5), porque cambia la recomendación entre Mod 10 y Mod 40.

## 6. Lo que se dice, con nivel de evidencia (hecho · estimación · opinión)

**Bueno**
- Se acabó la barrera de los $700k–1M de un jalón: el nuevo mundo se paga mes a mes. *(hecho)*
- El retro era para quien tenía liquidez; el nuevo mundo es para quien tiene tiempo. Menos regresivo en ese eje. *(opinión con datos)*
- Los menores de 55 llegan a la misma pensión y de paso se llevan cobertura médica. *(estimación)*

**Controversial**
- Un día de aviso (DOF 21-oct, vigente 22-oct): 138 personas en vuelo sólo en nuestra base. *(hecho)*
- Regresivo por salario: el tope al último SBC congela al que ganó poco. Pérdida por tercil. *(estimación)*
- Lo que pierde el trabajador es lo que se ahorra Hacienda (la Ley 73 la paga el gobierno). Monto en la base; nacional como rango. *(estimación)*
- «Tu último salario registrado vale una fortuna»: el incentivo a inflar los últimos meses es obvio y el IMSS lo va a cerrar. No se recomienda nada; se muestra la matemática y el riesgo de regla. *(opinión)*
- Las mujeres pierden más. *(estimación)*
- **Despachos y amparos**: los despachos cuyo modelo era el retro son los que más pierden y van a liderar los amparos. Nuestra lectura, sin ser abogados: quien ya estaba inscrito tiene un derecho adquirido (y el acuerdo lo respeta); quien no había iniciado tenía una expectativa, y el amparo masivo que le vendan va a ser cuesta arriba. Trol no vende amparos. *(opinión; consultar abogado)*

**Propositivo** (lo que nos distingue de una queja): tres alternativas para la revisión a 12 meses, costeadas con la base: tope = promedio actualizado de 24 meses · retro de 12 meses · transitorio para quien tenía trámite iniciado.

## 7. El activo y la serie

- **Informe Trol #1 — Primera lectura** (esta semana, con lo ya calculado): los 5 números de §2, la cuenta de la Mod 10 vs 40 (§5), un arquetipo por grupo con los tres caminos del motor actual, y la postura (§6). Blog + LinkedIn + one-pager de prensa + WhatsApp a la base (campaña `m40` ya en curso) + nota a aliados.
- **Informe Trol #2 — El mapa completo** (2–3 semanas): dos mundos por persona (§3), mapa de calor edad × salario, grupos (§4), mujeres, propuestas costeadas, metodología y límites, 6 arquetipos con antes/después.
- **Notas cortas** cada vez que haya noticia: amparos, aclaración del IMSS sobre inscritos, primeras inscripciones de Mod 10 de clientes, tarifas 2027, revisión a 12 meses.
- **Fase 2**: calculadora pública «¿cuánto te quitó el acuerdo?» (pension-core, captura leads).

Formato: informe en Docs (exportable a PDF), 6 gráficas sueltas (PNG), one-pager. Siempre con fecha y número de serie.

## 8. Supuestos, riesgos y reglas de publicación

- **Frescura**: SISEC viejo = último SBC viejo, y del último SBC depende el tope. Titular con validados ≤ 18 meses; el resto como sensibilidad. Excluir semillas huecas y duplicados.
- **Anonimato**: celdas de ≥ 20 personas; arquetipos compuestos; cero datos personales en el repo (export a `_claude_tmp`, resultados en `archivo.impacto_mod40_2026`).
- **Interés declarado**: Trol asesora y vende consultas; no tiene ingresos relevantes de Mod 40 retro; no vende amparos.
- Nunca «oficial»; «esto no es asesoría legal»; el IMSS puede volver a cambiar; cifras a la fecha de corte de datos.

## 9. Pasos

| # | Paso | Entrega | Tiempo |
|---|---|---|---|
| 1 | Cerrar diseño | este doc | hecho |
| 2 | Hechos y fuentes | ficha de supuestos: DOF literal, LSS/RACERF para Mod 10 y 40, tabulador Mod 33 2026, 3 cotizaciones GMM + AMIS, rampa de cuotas 2026–2030, esperanza de vida CONAPO, cifras públicas de Mod 40 (IMSS) para el rango nacional | 1 sesión |
| 3 | Informe Trol #1 | borrador con §2 + §5 + arquetipos con el motor actual + postura; revisión de Raúl; publicación | 2 sesiones |
| 4 | Motor en lote | script TS sobre pension-core, dos mundos, en la máquina de Raúl (export CSV desde Supabase → `_claude_tmp`); salida a `archivo.impacto_mod40_2026` | 1–2 sesiones |
| 5 | Validación | 20 casos TS vs n8n v5.8 (pendiente de `claude/106`), 5 casos leídos por Mónica y Lorena, 3 contra la calculadora del IMSS | ½ sesión |
| 6 | Informe Trol #2 | hallazgos, gráficas, propuestas costeadas, redacción, revisión, publicación | 2–3 sesiones |

## 10. Pendientes de este doc
- Verificar las cuatro dudas de cobertura de Mod 10 (§5) y las citas de LSS.
- Conseguir las 3 cotizaciones GMM (Raúl o búsqueda web).
- Decidir canal de prensa (¿quién recibe el one-pager?).
- 12 clientes del recálculo en error («Calculos no dejó semilla v5.8»): revisar antes del lote.
