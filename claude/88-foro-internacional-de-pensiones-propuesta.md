# 88 — Foro Internacional de Pensiones (21-oct-2026): propuesta (27 sep 2026)

Sigue a `claude/83` (Finnosummit) y `claude/87` (lo que aprendimos de los 7). **Estado: semanas 1 y 2 construidas (190–193f); ver "Construido" abajo. Faltan: tarjetas del kit (Raul con Millas), ensayo general.**

## Lo que dijo Raul

- **FIP XV, 21 de octubre, recinto Munet, CDMX** (foropensiones.org). El organizador (cálculos actuariales) manda el correo a sus registrados; nosotros ponemos tarjetas en el kit y en el recinto.
- **Entrada por web**, no por WhatsApp: la experiencia empieza ahí y "los vamos activando", automático o con el equipo, cuando llegue su información.
- **Perfil**: ecosistema de pensiones (planes, aseguradoras: aliados B2B potenciales) y **CFO / directores de RH de los clientes del organizador**: empleados de posición alta, con potencial de traspaso de AFORE, Infonavit y asesoría; varios con la cuenta por poner en orden. De ahí pueden salir alianzas y empresas.
- **Lo que se regala**: asesoría básica = sus números + **sesión de 20 min con asesor** + **cashback en su AFORE vía Millas para el Retiro**.
- Co-branding FIP + Millas: asumir que sí y que hay permiso (alianza con Millas firmada). Landing y alcance por afinar; Millas puede ayudar con materiales.
- **Millas**: que el ahorro se genere **desde la experiencia de Trol** (su link como opción). Los clientes que Millas nos mande de su base son otro proyecto, pero conviene diseñar pensando en ellos (podría salir antes).
- **SISEC**: intentar **Belvo** para que llegue aunque sea viejo; después opción **manual, caso a caso**, para mandar a ventanilla. Si Jordan falla masivamente, ventanilla tampoco estará.
- Consultas las absorbe Trol. 2–3 asesores en sitio: resolver dudas y coordinar para después. **Mismo Lukas**, prompt ajustado (no habrá campaña esos días).
- **Éxito**: ≥ 70 registrados antes, ≥ 70 en el evento; el equipo busca a todos; **≥ $300 k de ingresos** con cualquier producto.

## Decisiones de Raul (27-sep, segunda ronda)

1. **Millas, mecánica**: el ahorro se manda a una **CLABE de Millas asignada a Trol, con la CURP del cliente como referencia**. Cashback **10 % sólo sobre lo que paga a Trol en asesorías; 5 % en gestorías**. Nada sobre aliados.
2. **Equipo**: presenciales **Raul y Lore**; Moni por confirmar; **Andrea y Vero en el chat**. La sesión de 20 min se agenda en el calendario del asesor asignado (`link_citas_para`); en el stand se resuelven dudas y se coordina.
3. **CURP obligatoria en la landing.**
4. **Diagnóstico avanzado se vende en la sesión** (no va de cortesía).
5. **Belvo sigue vivo.**
6. **Logos**: Millas en `trol-b2c/public/marca/millas-color.png` y `millas-blanco.png` (PNG con fondo transparente, recortados del JPG que mandó Raul; conviene pedirle a Millas el SVG). El del FIP, tentativo, del sitio foropensiones.org.
7. **La landing ofrece también empezar por chat** con la ref del evento (tercera ronda).

Consecuencias:
- El cashback es un **movimiento contable por `pago_recibido`** (10 % asesorías / 5 % gestorías) con estado *por depositar → depositado*; la liquidación es una transferencia de Trol a la CLABE de Millas con la CURP como referencia, que se registra (referencia bancaria) desde una lista "por depositar" en Negocio. El cliente lo ve en su cuenta como "$X van a tu AFORE vía Millas".
- "Ahorra desde aquí" = la misma CLABE + su CURP como referencia, dicho en la cuenta con botón de copiar (y su link de Millas como alternativa); puntos → ahorro 10:1 por el mismo canal. No hay API.
- Reparto de cabecera del FIP: **Raul · Lore · Andrea · Vero** (Moni si confirma), en `trol3.config.evento_asesores` (jsonb por código).

## Los números que ordenan el diseño

- 24 días. El correo del organizador saldrá probablemente entre el 5 y el 12 de octubre: **la landing y el flujo tienen que estar vivos el 5 de octubre**; las plantillas de WhatsApp co-brandeadas hay que meterlas a Meta esta semana.
- $300 k entre ~140 personas ≈ **$2,100 por persona**. No sale de diagnósticos de $500: sale de traspasos de AFORE (Astuto/SURA), Infonavit (Astuto), Mod 40 con acompañamiento, y uno o dos B2B. La experiencia tiene que llevar a la sesión de 20 min, y la sesión a una propuesta.
- El perfil es **Ley 97, 35–55, cotizando, salario alto**: exactamente el que en Finnosummit vio un hero pensado para Ley 73 (`claude/87`). Para ellos la historia es *ahorro, AFORE e Infonavit*, no Mod 40.

## El flujo

```
Correo del FIP ──► app.trol.mx/fip (landing co-brandeada)
                      │  nombre · WhatsApp (OTP) · CURP (obligatoria, con ayuda) · consentimiento
                      ▼
                 cuenta creada (canal evento · código fip2026 · experto por reparto · sesión de cortesía)
                      │  consulta: Belvo → Jordan → [manual: ventanilla · constancia PDF]
                      ▼
      ┌── llegó ───► aviso por WhatsApp (plantilla FIP) + su cuenta con números ──► "Agenda tus 20 min"
      │
      └── no llegó ─► "Seguimos buscando; te avisamos" + panel del equipo por código (Belvo viejo / Jordan / ventanilla / pedir constancia)
                                                                                  │
                      sesión de 20 min (paso 0 → 1 → 2, cierre con propuesta) ◄───┘
                      │
                      ▼
      Millas: ahorrar desde la cuenta (CLABE + CURP) · cashback 10 % asesorías / 5 % gestorías
```

### 1. Landing `/fip` y alta web (nuevo)
- Una página fuera de `/trabajo` y de `/mi`: logos FIP · Millas · Trol; *"El FIP y Millas te regalan tu asesoría básica de pensión"*; qué incluye (números oficiales del IMSS, sesión de 20 min, cashback a tu AFORE); tres campos y una casilla.
- **Teléfono con OTP** (Twilio Verify ya existe en `/e`), **CURP obligatoria con ayuda** ("¿dónde la encuentro?"), consentimiento con el texto leído (como `alta_en_evento`, 181).
- Alta = `alta_en_evento('fip2026', …)` extendida: canal `evento`, código `fip2026`, **cabecera por reparto** entre `config.evento_asesores`, beneficio de cortesía **`sesion_experto`**, consulta disparada. Sin diagnóstico de cortesía.
- El QR de las tarjetas apunta a la misma landing (`/i/fip2026` → web, no WhatsApp). Botón "prefiero por WhatsApp" que abre a Lukas con `ref:fip2026`.
- Después del alta, botón grande *"Abre tu chat con Lukas"* (wa.me con `ref:fip2026`): **abre el hilo** para que el aviso de "llegó tu información" entre por Lukas y no por plantilla.

### 2. Consultas: la cascada y qué le decimos
- Política del código: **Belvo primero** → si `sin_resultado` o sin respuesta en 20 min, **Jordan normal automático** → si tampoco, **"pendiente de revisión"** en el panel del evento para decidir a mano: ventanilla ($52), pedir constancia PDF al cliente (ya la leemos), o dejarlo para la sesión.
- Mensajes al cliente: en la cuenta *"Estamos buscando tu información en el IMSS; te avisamos por WhatsApp"* (sin "no la devolvió" hasta que el equipo decida); si Belvo llegó viejo: *"Tus números son con información del IMSS de {fecha}; en tu sesión la actualizamos"* — y el asesor ve la fecha en el paso 0.
- **Panel `/trabajo/evento` por código**: registrados, estado de consulta, botones "Reintentar por Jordan" / "Ventanilla" / "Pedir constancia" / "Ya lo llamé", y el contador contra la meta (70 / 70 / $300 k).

### 3. `/mi` versión FIP (lo que se queda para Millas)
- **Franja co-brandeada** cuando `codigo_origen` ∈ {fip2026, millas}: *"Tu asesoría básica es cortesía del FIP y de Millas para el Retiro"*.
- **Parada 2 "nos toca a nosotros"** para quien tiene experto: *"{Asesora} te va a llamar para tu sesión de 20 min"* + botón principal **"Agendar mi sesión"** (link de citas del asesor asignado). Segunda visita sin gesto → el mismo botón arriba de todo.
- **Hero Ley 97**: *"Llevas N semanas · tu ahorro para el retiro va en ~$X · a tu edad lo que más mueve tu pensión es …"*; los dos números (hoy → máxima) en segundo plano. Ley 73 mantiene el hero actual.
- **Millas al frente**: tarjeta *"Ahorra desde aquí"* (CLABE de Millas + su CURP como referencia, copiar con un clic; link de Millas como alternativa), **cashback acumulado** (por depositar / depositado) y la CDA (AFORE actual · cuenta registrada · si puede recibir ahorro) como estado visible. Puntos → ahorro 10:1 por el mismo canal (`millas_clabe` por fin con valor).
- **Cashback**: `pago_recibido` de asesoría → 10 %; de gestoría → 5 %; movimiento en `trol3.cashback` (persona, pago, base, pct, monto, estado, referencia, depositado_en). Lista "Por depositar a Millas" en Negocio.

### 4. Lukas para el FIP (prompt v20.7)
- Bloque `ref:fip2026`: saludo co-brandeado, no repite el alta si ya existe (llegó por web), pide CURP sólo si falta, y su objetivo es **agendar la sesión de 20 min**, no explicar.
- Evento `consulta_lista` para este código: la frase incluye "cortesía del FIP y Millas" y el botón de agenda.

### 5. Equipo y cartera
- Los registrados caen en Calientes (`llego_hoy`) del asesor asignado; a la mañana siguiente en Tibios por `cadencia`. **Reto del día durante octubre: tocar a todos los del FIP antes del 21.**
- En sitio: Raul y Lore con tablet en `/presentar/<id>?modo=evento` (paso 0 → 1 → 2 → agendar). Andrea y Vero en el chat.

## Calendario (24 días)

| Semana | Qué | Entregable |
|---|---|---|
| **28-sep → 4-oct** | Landing `/fip` + alta web (OTP, CURP, consentimiento, reparto de asesores, beneficio) · política de consultas del código + panel del evento · **plantillas FIP a Meta** · parada 2 "nos toca" + agenda · franja co-brandeada | flujo completo probado con nuestros números |
| **5 → 11-oct** | Hero Ley 97 · Millas: tarjeta de ahorro + cashback + CDA visible · Lukas v20.7 · tarjetas para el kit (QR a `/fip`) | correo del FIP puede salir |
| **12 → 18-oct** | Ensayo general con el equipo (tablet, presentar, cartera) · materiales de Millas · ajustes con los primeros registrados reales | lista de "no salió" en cero o con decisión |
| **19 → 21-oct** | Operación: reto diario, panel del evento, sesiones | 70 / 70 / $300 k |

## Construido (27-sep, semana 1)

**Base (aplicadas y exportadas a `trol3_backend/migrations/`):**
- **190** `fip_alta_web_y_cascada`: código `fip2026`; config `politica_proveedor_codigo` (Belvo primero), `evento_fallback_jordan`, `evento_asesores` (Raul · Lore · Andrea · Vero), `evento_beneficio` (`sesion_experto`), `evento_marca`; `pedir_consulta` lee la política por código; trigger `tg_consulta_fallback_evento` (Belvo `sin_resultado`/`error` → Jordan una vez, evento `consulta_reintentada`); RPC **`alta_web_evento(codigo, nombre, curp, consentimiento)`** (sesión OTP, `vincular_sesion('evento','ref:fip2026')`, CURP de otra persona → `{ok:false, motivo:'curp_de_otra_persona'}`, consentimiento, reparto de cabecera por menor carga, beneficio, CURP → consulta); `marca_evento(codigo)` (anon).
- **191** `fip_panel_evento`: config `evento_meta` (70 / 70 / $300 k, fecha 21-oct); RPC **`evento_panel(codigo)`** → `resumen` (clics, registrados antes/el día, vía web/chat/pasillo, sin CURP, con historial, buscando, atoradas, entraron, base 5/5, con sesión, sesión hecha, pagaron, ingresos, meta) + `filas` (una por persona con consulta, intentos, historial, base, cita, pagado, experto, último seguimiento).
- **192** `mi_fip_sesion_millas`: tabla **`trol3.cashback`** (por orden cumplida: 10 % `productos.tipo='asesoria'`, 5 % `catalogo_productos_gestoria`, 0 lo demás; sólo personas con aliado Millas) con trigger en `ordenes`; config `cashback_pct`, `millas_clabe` (vacía), `millas_link` (vacía); `aliado_millas(persona)`, `cashback_pct(producto)`, **`mi_marca()`**, **`mi_millas()`**; `parada_de` parchada: parada 2 con `sesion_experto` → `toca='trol'`, `cta='agendar'`, "{Experto} te va a contactar para tu sesión de 20 minutos" / si ya hay cita, "Tu sesión con X es el D de mes a las HH:MM"; parada 1 en códigos con cascada → "Seguimos buscando tu información" (sin "no la devolvió"); una ventanilla en curso cuenta como esperando. Probado con la persona `Prueba Trol3` (rollback).

**App (`trol-b2c`):**
- **`/fip`** (`app/fip/page.tsx` + `fip-form.tsx`): landing co-brandeada (Trol · FIP · Millas), qué te llevas, formulario nombre + celular (OTP) + CURP + consentimiento → `alta_web_evento`; si ya hay sesión salta el SMS; pantalla "listo" con *Entrar a mi cuenta* y *Abrir mi chat con Lukas* (wa.me `ref:fip2026`); "¿Prefieres por WhatsApp?" en la página y en el formulario; CURP ajena → resolver por chat; registra la visita como clic de `fip2026`. Logo del FIP: `/marca/fip-blanco.png` (si no existe, cae a texto).
- **`/i/fip2026`** → redirige a `/fip` (el QR de las tarjetas cae en la web).
- **`/trabajo/evento/panel?c=fip2026`** (`components/trol3/EventoPanel.tsx`): tres metas con barra, embudo, filtros por situación (historial atorado · buscando · sin CURP · no han entrado · faltan preguntas · por agendar · con sesión · sesión hecha · pagaron), por persona "qué le toca" y botones **Reintentar Jordan · Belvo · Ventanilla · Pedir constancia · Llamé/contestó · Sin respuesta · WhatsApp · Expediente**; la acción `accionEvento` deja una interacción con `metadata.evento_accion` (último seguimiento visible, para que dos asesores no le caigan a la misma persona). Link desde la pantalla del pasillo.
- **`/mi`**: franja "Tu asesoría básica es cortesía de …" (`mi_marca`), CTA `agendar` con el link de citas del experto (+ WhatsApp como alternativa), tarjeta **Millas** (`components/trol3/MillasCard.tsx`: CLABE + CURP con copiar, cashback acumulado por depositar/depositado, detalle por movimiento; sin CLABE muestra "muy pronto").

**Queda para la semana 2:** hero Ley 97 · plantillas FIP a Meta (`fip_cuenta_lista`, recordatorio de sesión) · Lukas v20.7 (bloque `ref:fip2026` + evento `pedir_constancia`, que hoy manda `accionEvento` con la plantilla `trol_retomar` si el chat está cerrado) · lista "Por depositar a Millas" en Negocio (marcar depositado con referencia) · tarjetas con QR a `/fip` · CDA visible en la tarjeta de Millas · decidir si la parada 2 "nos toca" se generaliza a todo cliente con cabecera (`claude/87`, punto 1) o se queda sólo con `sesion_experto`.

## Construido (28-sep, semana 2)

Decisiones de Raul (28-sep): hero Ley 97 con su meta si la tenemos (el estimado de AFORE se mejorará después con casos reales, como mínimo o rango); gestorías se cobran con "Registrar un cobro"; cashback **con IVA, sobre lo que paga a Trol** (no sobre su ahorro ni lo que haga en Millas); "nos toca a nosotros" en parada 2 **para todos** los clientes con experto; tarjetas del kit se revisan con Millas; **nunca decir «oficial»** (Trol no es un medio autorizado por el IMSS: «tu información real» / «del IMSS»).

**Base:**
- **193** parada 2 con experto → `toca='trol'`, `cta='agendar'` ("Raúl te va a explicar lo que encontramos" + *Agendar con Raúl*; la cortesía conserva su texto; con cita futura, "Tu sesión con X es el …"); parada 1 `pedir_constancia` cuando el equipo la pidió (14 días); `registrar_cobro(persona, producto, medio, referencia, monto)` acepta gestorías y monto; `cashback_lista(estado)`, `cashback_depositar(ids, referencia)` (deja nota visible al cliente); `mi_millas` con CDA; `tg_avisar_consulta_lista` elige plantilla por código (`evento_plantilla_cuenta_lista`: fip2026 → `fip_cuenta_lista`) y manda `codigo` en el payload; `citas.recordada_en` + `recordar_sesiones()` + job `trol3-recordar-sesiones` (minuto 7 de cada hora) con interruptor `config.recordatorio_sesion = 'off'`.
- **193b/c** `ordenes.producto` tiene FK a `productos`: las gestorías entran como producto `gestoria` (inactivo) con `metadata.gestoria_codigo`; `cashback_pct('gestoria') = 5`.
- **193d** textos de cara al cliente sin «oficial» en `parada_de`, `mi_misiones`, `declarar`, `evaluar_persona`, `aplicar_regla_identidad`, `registrar_sisec`, `migrar_desde_public`, `sync_desde_cliente`.
- **193e** ⚠️ bug de la semana 1: `alta_por_telefono` pone de cabecera al dueño del código (fip2026 → Raul), así que el reparto de `alta_web_evento` nunca entraba y por chat no había ni reparto ni cortesía. Ahora `tg_persona_evento` (after insert en personas) reparte entre `evento_asesores` y otorga `evento_beneficio` por cualquier puerta. Probado: dos altas seguidas → Lore y Andrea, ambas con `sesion_experto`.
- **193f** `resumen_bot` (trolExpediente) trae `codigo_origen`, `evento` (marca) y `link_citas` del experto (o el general si no tiene).

**App:** Hero Ley 97 en `/mi` (`HeroLey97` + `MetaRetiro`: meta vs. "si todo sigue igual" con barra, brecha al mes, "A tu edad, lo que más lo mueve" — registrar cuenta / AFORE que rinda más / ahorro voluntario con liga a la tarjeta de Millas; saldo AFORE marcado "(estimado)" si no es real) · CTA `constancia` en `/mi` (pasos + subir PDF + WhatsApp) · `CobroPanel` con gestorías y monto con IVA (dice el cashback generado) · **Negocio → Por depositar a Millas** (`/trabajo/millas`: seleccionar, copiar lista CURP·nombre·monto para Millas, marcar depositado con referencia; pestaña Depositado) · Negocio → Panel del evento · tarjeta de Millas con estado del CDA · "Pedir constancia" usa `trol_constancia` · textos sin «oficial» en `/fip`, `/mi`, paso 0, Presentar y Asesoría (quedan ~90 en otras pantallas y en el sitio: barrido pendiente).

**WhatsApp:** `fip_cuenta_lista`, `trol_constancia`, `trol_recordatorio_sesion` dadas de alta en Tako (Utilidad, Tako Asesoría, **en revisión**). Textos en `tako/plantillas-whatsapp.md` §6.

**Lukas v20.7** (`tako/prompt-lukas-v20.7.md`, completo sobre v20.6 — v20.6 nunca se pegó): §14.5-E Foro (saludo co-brandeado, no repetir alta, objetivo agendar con `link_citas`, Millas sin prometer rendimientos, diagnóstico no es cortesía, "seguimos buscando"), regla dura 11 (nunca «oficial»), línea de privacidad al pedir la CURP, botones nuevos en §14.4.1, eventos `pedir_constancia` y `recordatorio_sesion`, `consulta_lista` con `codigo`.

## Pendiente
- **Logo del FIP**: no se pudo bajar de foropensiones.org (framerusercontent bloqueado desde aquí); Raul lo pone como `trol-b2c/public/marca/fip-blanco.png` y `fip-color.png`. Confirmar permiso con el organizador.
- ~~CLABE de Millas~~ cargada el 28-sep (`millas_clabe` = 646180388520000243, STP, dígito verificador ok; referencia = CURP del cliente). Falta sólo el link de Millas (`millas_link`), opcional.
- **Pendiente (Raul, 28-sep):** `link_citas` de **Lore y Vero** en `trol3.miembros` (hoy sólo Raul y Andrea; sin él, sus clientes del FIP agendan con el link general).
- Pegar **Lukas v20.7**; cuando Meta apruebe `trol_recordatorio_sesion`, encender `recordatorio_sesion`.
- Barrido de «oficial» en el resto de pantallas y el sitio.
- Tarjetas del kit con QR a `app.trol.mx/i/fip2026` (→ `/fip`), por definir con Millas.
- Aplicar la 185 (política por canal) antes de tocar la del FIP.
- Pedir a Millas el SVG de su logo.
