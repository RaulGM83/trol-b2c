# Plantillas de WhatsApp — Trol 3.0

## La regla

**Cero variables en el cuerpo. Sólo el botón es dinámico.**

Las 20 de Viraal murieron con `#132000: number of localizable_params (1) does not
match the expected number of params (2)`. Una plantilla sin variables de cuerpo no
puede fallar por eso nunca.

Renunciamos al nombre en el saludo, y está bien: con `/avisar`, el saludo
personalizado lo pone Lukas **dentro** de la conversación, donde sí sabe quién es.
La plantilla sólo tiene que conseguir el clic.

## El botón

Todas llevan un botón de URL dinámica:

- URL base en Meta: `https://app.trol.mx/m/`
- Sufijo dinámico: `<token>?d=mi&c=<motivo>`

El `<token>` es el del `mi_link` (`generar_mi_link`), que entra **con un clic y sin
código por SMS**. No usar `persona_id`: eso aterriza en `/e/<id>`, el link legacy
que pide código, y ahí se pierde a la mitad de los que sí quisieron entrar.

---

## 1. `trol_cuenta_lista` — reactivación genérica

Categoría a solicitar: **Marketing**. Es lo que es; pedirla como utility se cae en revisión.

> Ya tienes tu cuenta en Trol: ahí está tu pensión estimada, lo que podrías llegar a
> cobrar y qué te falta para lograrlo. Entra cuando quieras, es tuya.

Botón: **Ver mi cuenta Trol** · sufijo `<token>?d=mi&c=react`

Es verdad siempre, para cualquiera que tenga expediente. No promete un dato nuevo,
así que no se quema si el cliente entra y ve lo mismo que la última vez.

## 2. `trol_reabrir` — respaldo de `/avisar`

Categoría: **Utility**. Es una novedad sobre un caso que el cliente ya nos confió.

> Tenemos una novedad en tu caso. Ábrela en tu cuenta Trol.

Botón: **Ver la novedad** · sufijo `<token>?d=mi&c=aviso`

Deliberadamente genérica: una sola plantilla tiene que servir para cualquier evento
(llegó su información, se agendó su sesión, hay un documento nuevo). El detalle lo
cuenta Lukas en cuanto el cliente entra al chat. **Es la que más falta hace**: hoy
`/avisar` no tiene a dónde caer y cuando la ventana está cerrada el aviso no sale.

## 3. `trol_oportunidad` — genérica de oportunidad

Categoría: **Utility**.

> Tu experto revisó tu caso y encontró algo que te conviene. Te lo dejamos en tu
> cuenta Trol.

Botón: **Ver lo que encontró** · sufijo `<token>?d=mi&c=op`

Se conecta desde el catálogo, no desde el código:

```sql
update trol3.catalogo_oportunidades set plantilla = 'trol_oportunidad'
where plantilla is null;
```

## 4. Las dos específicas que sí valen la pena

El resto puede vivir con la genérica. Estas dos tienen volumen y un valor que se
entiende solo en una línea:

### `trol_op_mod40` — Modalidad 40 (`mod40_prospectiva`, `mod40_retro`)
> Por tu edad y tus semanas, tu caso es de los que más suben la pensión con
> Modalidad 40. Tu experto ya lo revisó: los números están en tu cuenta Trol.

### `trol_op_semanas` — semanas (`reconocimiento_semanas`, `inconsistencia_imss`)
> Encontramos semanas cotizadas que el IMSS no te está reconociendo. Míralo en tu
> cuenta Trol.

Se conectan igual:

```sql
update trol3.catalogo_oportunidades set plantilla = 'trol_op_mod40'
where codigo in ('mod40_prospectiva','mod40_retro');
update trol3.catalogo_oportunidades set plantilla = 'trol_op_semanas'
where codigo in ('reconocimiento_semanas','inconsistencia_imss');
```

## 5. `trol_refresco` — para cuando actualicemos por nuestra cuenta

Todavía no se sube. Sólo tiene sentido **después** de refrescar el SISEC, porque
afirma que el dato cambió.

> Volvimos a consultar tu información ante el IMSS y tus números cambiaron. Ya están
> actualizados en tu cuenta Trol.

Botón: **Ver mis números nuevos** · sufijo `<token>?d=mi&c=refresco`

Regla dura: **no se manda a nadie cuyo SISEC no se haya refrescado en esa tanda.**
Si se manda a ciegas y el cliente entra y ve lo mismo, es la única de las cinco que
nos cuesta credibilidad.

---

## Antes de encender cualquiera de éstas

`/avisar` todavía **no rellena el parámetro del botón** cuando cae a plantilla: manda
`components` sólo si quien la llama se los pasa. Sin eso, Meta rechaza con el mismo
`#132000` del principio. Falta que `/avisar` genere el `mi_link` y arme el botón solo.
