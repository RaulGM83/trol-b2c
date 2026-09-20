# Plantillas de WhatsApp — Trol 3.0

Ocho plantillas: una de reactivación, una de respaldo y seis de oportunidad. La
última (`trol_refresco`) no se sube todavía.

## Las tres reglas

**1. Exactamente una variable en el cuerpo, y siempre llena: el link.**

El editor de Tako soporta variables en el cuerpo pero no en la URL del botón (el botón
de "Enlace" no ofrece campo de ejemplo, y Meta rechaza una URL dinámica sin él). Así
que el link va escrito dentro del mensaje, como `{{1}}`.

El `#132000` que mató a las 20 de Viraal no lo causaron las variables, lo causó el
desajuste: la plantilla esperaba dos parámetros y mandamos uno. Con **una sola, nunca
opcional**, eso no puede volver a pasar. Lo prohibido es una plantilla con dos
variables de cuerpo, o con una que a veces se manda y a veces no.

**La variable no puede ir al principio ni al final del texto** — Meta rechaza la
plantilla. Siempre con texto antes y después.

**2. El botón es de respuesta rápida, no de enlace.**

Un botón de URL abre el navegador y **no** genera ningún mensaje del cliente: la
ventana de 24 h sigue cerrada y seguimos mudos aunque haya entrado a leer. Un botón de
respuesta rápida envía su texto **como mensaje del cliente**: abre la ventana, gratis
y por iniciativa suya, y le llega a Lukas como un entrante normal.

**3. Pie de página siempre:** `Responde BAJA para no recibir más mensajes.`
Engancha con `postbaja`, que Lukas tiene como obligatoria (§14.3).

## El link que va en `{{1}}`

`https://app.trol.mx/c/AB7K9QX2PMRT`

Doce caracteres, sin parámetros a la vista. Entra **con un clic y sin código por SMS**:
el destino (su cuenta, pestaña Hoy) lo decide la ruta, y la campaña se guarda en la
fila del token al generarlo. El alfabeto no tiene caracteres ambiguos —nada de 0/O ni
1/I/L—, así que se puede dictar por teléfono cuando alguien llame porque "no le abre".

**Ejemplo para la aprobación:** `https://app.trol.mx/c/D7PRK8S2ETRX`

No hay que armarlo a mano en ningún lado: `/avisar` lo genera solo y rellena el `{{1}}`
cuando cae a plantilla. La campaña que queda registrada es el nombre de la plantilla.

---

## 1. `trol_cuenta_lista` — reactivación genérica

Categoría: **Marketing**. Es lo que es; pedirla como utility se cae en revisión.

Encabezado: `Toma control de tu pensión`

> Ya tienes tu cuenta en Trol: ahí está tu pensión estimada, lo que podrías llegar a
> cobrar y qué te falta para lograrlo. Ábrela aquí: {{1}} — es tuya, entra cuando
> quieras.

Botón: `[Tengo una duda]`

Es verdad siempre, para cualquiera con expediente. No promete un dato nuevo, así que
no se quema si el cliente entra y ve lo mismo que la última vez.

## 2. `trol_reabrir` — respaldo de `/avisar`

Categoría: **Utility**. Es una novedad sobre un caso que el cliente ya nos confió.

> Tenemos una novedad en tu caso. La dejamos en tu cuenta Trol: {{1}} — ábrela cuando
> puedas.

Botón: `[Cuéntame]`

Deliberadamente genérica: una sola plantilla sirve para cualquier evento (llegó su
información, se agendó su sesión, hay un documento nuevo). El detalle lo cuenta Lukas
en cuanto entra al chat. **Es la que más falta hace**: hoy, si la ventana está cerrada,
el aviso simplemente no sale.

---

## 3. Las de oportunidad

Todas **Utility**, todas con botón `[Quiero saber más]`. La genérica cubre lo que no
tenga una propia; las cinco específicas tienen volumen y un valor que se entiende solo
en una línea.

### `trol_oportunidad` — genérica
> Tu experto revisó tu caso y encontró algo que te conviene. Te lo dejamos aquí:
> {{1}} — o si prefieres, te lo explicamos por este chat.

### `trol_op_mod40` — Modalidad 40
> Por tu edad y tus semanas, tu caso es de los que más suben la pensión con Modalidad
> 40. Tu experto ya lo revisó y los números están aquí: {{1}} — cualquier duda, me
> dices.

### `trol_op_semanas` — semanas no reconocidas
> Encontramos semanas cotizadas que el IMSS no te está reconociendo. Lo puedes ver
> aquí: {{1}} — y si quieres que alguien te lo explique, me escribes.

### `trol_op_infonavit` — Infonavit
> Tu saldo de Infonavit es dinero tuyo, y hay formas de aprovecharlo sin perderlo
> cuando te pensiones. Tu experto ya revisó qué aplica en tu caso: {{1}} — si quieres
> que te lo explique con calma, me escribes.

### `trol_op_gestion` — trámites que hacemos por él
> Hay un trámite ante el IMSS que en tu caso vale la pena hacer, y lo podemos hacer
> nosotros por ti. Te lo dejamos explicado aquí: {{1}} — cualquier duda, por este
> mismo chat te contesto.

### `trol_op_reactivarcuenta` — derechos inactivos
> Tus derechos ante el IMSS están inactivos, y eso todavía se puede revertir. Te
> dejamos lo que aplica en tu caso: {{1}} — si prefieres que te lo cuente por aquí,
> nada más dime.

### Mapa al catálogo

Cada oportunidad elige su texto desde `catalogo_oportunidades.plantilla` (148), no
desde el código. Recuperar Ley 73 va en **gestión**, no en reactivación.

| Plantilla | Códigos |
|---|---|
| `trol_op_mod40` | `mod40_prospectiva`, `mod40_retro` |
| `trol_op_semanas` | `reconocimiento_semanas`, `inconsistencia_imss` |
| `trol_op_infonavit` | `mejoravit_activo`, `credito_infonavit_activo`, `compra_inmueble`, `retiro_infonavit_pension` |
| `trol_op_gestion` | `pension_hoy`, `unificacion_nss`, `recuperar_ley73` |
| `trol_op_reactivarcuenta` | `reactivacion_mod10`, `reactivar_derechos` |
| `trol_oportunidad` | todo lo demás |

Correr **sólo cuando cada plantilla esté aprobada**: una que no exista en Meta falla y
queda registrada como "NO pudo enviar".

```sql
update trol3.catalogo_oportunidades set plantilla = 'trol_op_mod40'
where codigo in ('mod40_prospectiva','mod40_retro');
update trol3.catalogo_oportunidades set plantilla = 'trol_op_semanas'
where codigo in ('reconocimiento_semanas','inconsistencia_imss');
update trol3.catalogo_oportunidades set plantilla = 'trol_op_infonavit'
where codigo in ('mejoravit_activo','credito_infonavit_activo','compra_inmueble','retiro_infonavit_pension');
update trol3.catalogo_oportunidades set plantilla = 'trol_op_gestion'
where codigo in ('pension_hoy','unificacion_nss','recuperar_ley73');
update trol3.catalogo_oportunidades set plantilla = 'trol_op_reactivarcuenta'
where codigo in ('reactivacion_mod10','reactivar_derechos');
-- y al final, la genérica para lo que quede suelto:
update trol3.catalogo_oportunidades set plantilla = 'trol_oportunidad' where plantilla is null;
```

---

## 4. `trol_refresco` — para cuando actualicemos por nuestra cuenta

**Todavía no se sube.** Sólo tiene sentido después de refrescar el SISEC, porque
afirma que el dato cambió.

> Volvimos a consultar tu información ante el IMSS y tus números cambiaron. Ya están
> actualizados aquí: {{1}} — échales un ojo.

Botón: `[Tengo una duda]`

Regla dura: **no se manda a nadie cuyo SISEC no se haya refrescado en esa tanda.** Si
sale a ciegas y el cliente entra y ve lo mismo, es la única de todas que nos cuesta
credibilidad.

---

## Estado

Hecho en código:
- **148** — `catalogo_oportunidades.plantilla`: cada oportunidad elige su texto.
- **149** — el link corto y amistoso (`/c/<codigo>`) y su ruta en la app.
- **149** — `/avisar` genera el link y arma el `{{1}}` del cuerpo por su cuenta. Quien
  lo llama no pasa `componentes`, así que desajustar el número de parámetros deja de
  ser posible: el `#132000` se vuelve imposible por construcción.

Falta, y es de Tako, no de código:
- Dar de alta las siete plantillas (todas menos `trol_refresco`) y que Meta las apruebe.
- Pegar **v20.3** del prompt (§14.4.1: qué hacer cuando aprietan la respuesta rápida).
- Correr los `update` del mapa, plantilla por plantilla, conforme se aprueben.
