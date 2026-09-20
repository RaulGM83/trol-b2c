# Plantillas de WhatsApp — Trol 3.0

## Las tres reglas

**1. Exactamente una variable en el cuerpo, y siempre llena: la URL.**

El editor de Tako soporta variables en el cuerpo pero no en la URL del botón (el
botón de "Enlace" no ofrece campo de ejemplo, y Meta rechaza una URL dinámica sin
él). Así que el link va escrito en el mensaje, como `{{1}}`.

El `#132000` que mató a las 20 de Viraal no lo causaron las variables, lo causó el
desajuste: la plantilla esperaba dos y mandamos una. Con **una sola, nunca opcional**,
eso no puede volver a pasar. Lo que está prohibido es una plantilla con dos variables
de cuerpo, o con una que a veces se manda y a veces no.

**La variable no puede ir al principio ni al final del texto** — Meta rechaza la
plantilla. Siempre con texto antes y después.

**2. El botón es de respuesta rápida, no de enlace.**

Un botón de URL abre el navegador y **no** genera ningún mensaje del cliente: la
ventana de 24 h sigue cerrada y seguimos mudos aunque haya entrado a leer. Un botón de
respuesta rápida envía su texto **como mensaje del cliente**: abre la ventana, gratis
y por iniciativa suya, y le llega a Lukas como un entrante normal.

**3. Pie de página siempre: `Responde BAJA para no recibir más mensajes.`**
Engancha con `postbaja`, que Lukas tiene como obligatoria (§14.3).

## La URL que va en `{{1}}`

`https://app.trol.mx/c/AB7K9QX2PMRT`

Doce caracteres, sin parámetros a la vista. Entra **con un clic y sin código por SMS**:
el destino (su cuenta, pestaña Hoy) lo decide la ruta, y la campaña se guarda en la
fila del token al generarlo. El alfabeto no tiene caracteres ambiguos (nada de 0/O ni
1/I/L), así que se puede dictar por teléfono cuando alguien llame porque "no le abre".

Ejemplo para la aprobación: `https://app.trol.mx/c/D7PRK8S2ETRX`

No hay que armarlo a mano en ningún lado: `/avisar` lo genera solo y rellena el `{{1}}`
cuando cae a plantilla. Quien llama a `/avisar` no pasa `componentes`.

---

## 1. `trol_cuenta_lista` — reactivación genérica

Categoría: **Marketing**. Es lo que es; pedirla como utility se cae en revisión.

Encabezado: `Toma control de tu pensión`

> Ya tienes tu cuenta en Trol: ahí está tu pensión estimada, lo que podrías llegar a
> cobrar y qué te falta para lograrlo. Ábrela aquí: {{1}} — es tuya, entra cuando
> quieras.

Botón: `[Tengo una duda]` · `c=react`

Es verdad siempre, para cualquiera con expediente. No promete un dato nuevo, así que
no se quema si el cliente entra y ve lo mismo que la última vez.

## 2. `trol_reabrir` — respaldo de `/avisar`

Categoría: **Utility**. Es una novedad sobre un caso que el cliente ya nos confió.

> Tenemos una novedad en tu caso. La dejamos en tu cuenta Trol: {{1}} — ábrela cuando
> puedas.

Botón: `[Cuéntame]` · `c=aviso`

Deliberadamente genérica: una sola plantilla sirve para cualquier evento (llegó su
información, se agendó su sesión, hay un documento nuevo). El detalle lo cuenta Lukas
en cuanto entra al chat. **Es la que más falta hace**: hoy, si la ventana está
cerrada, el aviso simplemente no sale.

## 3. `trol_oportunidad` — genérica de oportunidad

Categoría: **Utility**.

> Tu experto revisó tu caso y encontró algo que te conviene. Te lo dejamos aquí:
> {{1}} — o si prefieres, te lo explicamos por este chat.

Botón: `[Quiero saber más]` · `c=op`

Se conecta desde el catálogo, no desde el código:

```sql
update trol3.catalogo_oportunidades set plantilla = 'trol_oportunidad'
where plantilla is null;
```

## 4. Las dos específicas que sí ganan su aprobación

El resto vive bien con la genérica. Éstas tienen volumen y un valor que se entiende
solo en una línea.

### `trol_op_mod40` — `mod40_prospectiva`, `mod40_retro`
> Por tu edad y tus semanas, tu caso es de los que más suben la pensión con Modalidad
> 40. Tu experto ya lo revisó y los números están aquí: {{1}} — cualquier duda, me
> dices.

Botón: `[Quiero saber más]` · `c=op_mod40`

### `trol_op_semanas` — `reconocimiento_semanas`, `inconsistencia_imss`
> Encontramos semanas cotizadas que el IMSS no te está reconociendo. Lo puedes ver
> aquí: {{1}} — y si quieres que alguien te lo explique, me escribes.

Botón: `[Quiero saber más]` · `c=op_semanas`

```sql
update trol3.catalogo_oportunidades set plantilla = 'trol_op_mod40'
where codigo in ('mod40_prospectiva','mod40_retro');
update trol3.catalogo_oportunidades set plantilla = 'trol_op_semanas'
where codigo in ('reconocimiento_semanas','inconsistencia_imss');
```

### `trol_op_infonavit` — Infonavit
> Tu saldo de Infonavit es dinero tuyo, y hay formas de aprovecharlo sin perderlo
> cuando te pensiones. Tu experto ya revisó qué aplica en tu caso: {{1}} — si quieres
> que te lo explique con calma, me escribes.

Botón: `[Quiero saber más]` · `c=op_infonavit`

### `trol_op_gestion` — trámites que hacemos por él
> Hay un trámite ante el IMSS que en tu caso vale la pena hacer, y lo podemos hacer
> nosotros por ti. Te lo dejamos explicado aquí: {{1}} — cualquier duda, por este
> mismo chat te contesto.

Botón: `[Quiero saber más]` · `c=op_gestion`

### `trol_op_reactivarcuenta` — derechos inactivos
> Tus derechos ante el IMSS están inactivos, y eso todavía se puede revertir. Te
> dejamos lo que aplica en tu caso: {{1}} — si prefieres que te lo cuente por aquí,
> nada más dime.

Botón: `[Quiero saber más]` · `c=op_reactivarcuenta`

### Mapa al catálogo — confirmar antes de correrlo

Recuperar Ley 73 es gestión, no reactivación (corregido).

| Plantilla | Códigos |
|---|---|
| `trol_op_mod40` | `mod40_prospectiva`, `mod40_retro` |
| `trol_op_semanas` | `reconocimiento_semanas`, `inconsistencia_imss` |
| `trol_op_infonavit` | `mejoravit_activo`, `credito_infonavit_activo`, `compra_inmueble`, `retiro_infonavit_pension` |
| `trol_op_gestion` | `pension_hoy`, `unificacion_nss`, `recuperar_ley73` |
| `trol_op_reactivarcuenta` | `reactivacion_mod10`, `reactivar_derechos` |
| `trol_oportunidad` | todo lo demás |

```sql
update trol3.catalogo_oportunidades set plantilla = 'trol_op_infonavit'
where codigo in ('mejoravit_activo','credito_infonavit_activo','compra_inmueble','retiro_infonavit_pension');
update trol3.catalogo_oportunidades set plantilla = 'trol_op_gestion'
where codigo in ('pension_hoy','unificacion_nss','recuperar_ley73');
update trol3.catalogo_oportunidades set plantilla = 'trol_op_reactivarcuenta'
where codigo in ('reactivacion_mod10','reactivar_derechos');
-- y al final, la genérica para lo que quede suelto:
update trol3.catalogo_oportunidades set plantilla = 'trol_oportunidad' where plantilla is null;
```

## 5. `trol_refresco` — para cuando actualicemos por nuestra cuenta

Todavía no se sube. Sólo tiene sentido **después** de refrescar el SISEC, porque
afirma que el dato cambió.

> Volvimos a consultar tu información ante el IMSS y tus números cambiaron. Ya están
> actualizados aquí: {{1}} — échales un ojo.

Botón: `[Tengo una duda]` · `c=refresco`

Regla dura: **no se manda a nadie cuyo SISEC no se haya refrescado en esa tanda.** Si
se manda a ciegas y el cliente entra y ve lo mismo, es la única de las cinco que nos
cuesta credibilidad.

---

## Estado del código

Hecho:
- **149** — el link corto y amistoso (`/c/<codigo>`), con su ruta en la app.
- **149** — `/avisar` genera el `mi_link` y arma el `{{1}}` del cuerpo por su cuenta.
  Quien lo llama no pasa `componentes`, así que no hay forma de desajustar el número
  de parámetros: el `#132000` se vuelve imposible por construcción.
- **148** — `catalogo_oportunidades.plantilla`, para que cada oportunidad elija texto.

Falta, y es de Tako, no de código:
- Dar de alta las cinco plantillas y que Meta las apruebe.
- Pegar **v20.3** del prompt (§14.4.1: qué hacer cuando aprietan la respuesta rápida).
- Correr los `update` del mapa de arriba, sólo cuando cada plantilla esté aprobada.
