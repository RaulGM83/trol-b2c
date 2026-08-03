# Plantillas de WhatsApp — Tako / Meta (B2C, lanzamiento lunes)

⚠️ **Acción crítica (sábado AM):** las plantillas de marketing requieren **aprobación de Meta** (puede tardar horas). Enviarlas HOY para tenerlas listas el lunes.

**Formato Meta:** categoría **MARKETING**, idioma es_MX. Variables `{{1}}`, `{{2}}`… Evitar URLs acortadas raras; usar el dominio propio `app.trol.mx`. No prometer montos garantizados (consistente con el posicionamiento anti-fraude).

**Variables sugeridas por plantilla:** `{{1}} = nombre`, link va como variable de URL o en botón.

---

> 📌 **Las plantillas listas para copiar y pegar (con el recordatorio de contexto y el opt-out) están abajo, en la sección "▶️ Formato Tako — copia cada bloque en su casilla".** Usa esas. Esta lista de nombres es solo el índice:
>
> 1. `reactivacion_calculadora` — reactivación general (con semilla)
> 2. `reactivacion_mod40` — Modalidad 40 (piloto del lunes, mayor palanca)
> 3. `nuevo_herramienta` — cliente nuevo (junto al PDF) · Utility
> 4. `frio_calcula` — lead frío sin CURP
> 5. `referidos_invita` — referidos (gánala sin costo)

---

## Operación en Tako

1. Cargar las plantillas y enviarlas a **aprobación de Meta** (sábado).
2. Export desde Supabase (Table editor → SQL → Download CSV):
   ```sql
   -- Piloto: Modalidad 40 + Ley 97 (mayor palanca)
   select v.nombre, v.telefono, v.url_herramienta, v.ley
   from vista_links_reactivacion v
   where v.ley = 'Ley97'
   order by v.nombre;     -- ~977

   -- Blast completo (después del piloto)
   select nombre, telefono, url_herramienta, ley
   from vista_links_reactivacion
   order by ley;          -- 7,966
   ```
   Para el piloto Mod 40 puro, cruzar contra `vista_ruteo` (`producto_estrella='MODALIDAD_40'`).
3. Mapear columnas del CSV a las variables de la plantilla (`nombre → {{1}}`, `url_herramienta → {{2}}`).
4. Enviar **piloto (~200 Mod 40)** el lunes AM, medir aperturas 1–2 h en `links_campania`, y si OK ampliar.

## Referidos: cómo comparte el cliente (mejores prácticas)

**Principio:** que el cliente **reenvíe desde SU propio WhatsApp** (orgánico, gratis, con su credibilidad) — **NO** que nosotros mandemos a sus amigos desde el número de Trol (sería spam a terceros sin consentimiento + costo). Lo que ya está construido en `/referidos` es lo correcto; estas son las mejores prácticas y mejoras:

1. **Link personal, no código.** Ya usan `/r/<cliente_id>` (no un código que el amigo teclea). El link es un toque; el código mete fricción. Mantener links.
2. **Botón "Compartir por WhatsApp" con mensaje prellenado y sin número destino** (`wa.me/?text=…`) — ya implementado (`lib/whatsapp.ts`). Abre WhatsApp y el cliente **elige contactos o grupos**; el mensaje ya viene escrito. Esta es la vía principal para reenviar a grupos.
3. **Botón "Copiar mi link"** — ya implementado. Respaldo para pegar en estados, bio, otros chats.
4. **(Mejora alta prioridad) Vista previa OG del link.** Cuando alguien pega `/r/` o `/calcula` en un grupo, WhatsApp arma una **tarjeta con imagen+título** solo si la página tiene meta OpenGraph (`og:title`, `og:description`, `og:image`). Sin OG sale un link pelón. Agregar OG a `/calcula` (y al destino de `/r`) sube mucho el CTR del reenvío a grupos. **Es la mejora de mayor impacto.**
5. **(Mejora) Share sheet nativo** `navigator.share()` en móvil: un botón que abre el menú del sistema (WhatsApp, Telegram, Messenger, SMS…) para quien comparte fuera de WhatsApp. Fallback a los botones actuales en desktop.
6. **Mensaje pensado para reenvío.** El actual ("Te comparto El Trol para calcular tu pensión del IMSS 🧮 Yo ya vi la mía…") está bien. Variante centrada en el beneficio del amigo (mejor para grupos):
   > 🧮 ¿Sabes cuánto te tocaría de pensión del IMSS? Yo ya vi la mía con El Trol. Calcula la tuya gratis aquí 👉 {url}

**Resumen para tu duda:** sí, **dale al cliente una "plantilla" lista para reenviar** — pero que salga de su teléfono vía el botón de compartir prellenado (ya lo tienen), no que la enviemos nosotros. Link > código. Suma OG preview + share nativo y queda redondo.

## ▶️ Formato Tako — copia cada bloque en su casilla

Cada plantilla está partida por **las mismas casillas que ves en Tako** (Encabezado · Cuerpo · Muestras de variables · Pie de página · Botones). Copia cada bloque a su campo. Donde dice *(dejar vacío)* / *(ninguno)*, no pongas nada.

---

### 1. `reactivacion_calculadora`

**Nombre de la plantilla:** `reactivacion_calculadora`
**Categoría:** Marketing · **Idioma:** Español (MEX)
**Encabezado:** *(dejar vacío)*

**Cuerpo:**
```
Hola {{1}} 👋 Te saludamos de El Trol, donde hace un tiempo calculaste tu pensión. ¡Tenemos una novedad para ti! Estrenamos una calculadora interactiva: mueve tu edad de retiro, semanas y ahorro y mira en vivo cómo cambia tu pensión del IMSS, con tus datos ya cargados. Pruébala aquí:
{{2}}
Cualquier duda, contéstanos por este chat. 🙌
```

**Muestras de variables:**
```
{{1}} → Juan
{{2}} → https://app.trol.mx/e/5b00d32b-88d6-4276-b6b8-bf818fcc3b4c?c=reactivacion
```

**Pie de página:**
```
Responde BAJA para no recibir más mensajes.
```

**Botones:** *(ninguno)*

---

### 2. `reactivacion_mod40`  *(piloto del lunes)*

**Nombre de la plantilla:** `reactivacion_mod40`
**Categoría:** Marketing · **Idioma:** Español (MEX)
**Encabezado:** *(dejar vacío)*

**Cuerpo:**
```
Hola {{1}} 👋 Te saludamos de El Trol, donde hace un tiempo calculaste tu pensión. ¡Tenemos una novedad para ti! Con Modalidad 40 tu pensión del IMSS puede multiplicarse, y ahora puedes verlo en nuestra nueva calculadora interactiva, con tus datos ya cargados. Descubre tu mejor jugada aquí:
{{2}}
Cualquier duda, contéstanos por aquí. 🙌
```

**Muestras de variables:**
```
{{1}} → Juan
{{2}} → https://app.trol.mx/e/5b00d32b-88d6-4276-b6b8-bf818fcc3b4c?c=reactivacion
```

**Pie de página:**
```
Responde BAJA para no recibir más mensajes.
```

**Botones:** *(ninguno)*

---

### 3. `nuevo_herramienta`  *(clientes nuevos, junto al PDF)*

**Nombre de la plantilla:** `nuevo_herramienta`
**Categoría:** Utility · **Idioma:** Español (MEX)
**Encabezado:** *(dejar vacío)*

**Cuerpo:**
```
Hola {{1}}, aquí está tu diagnóstico 📄 {{2}}
Y ahora puedes verlo interactivo: ajusta los escenarios y mira tu mejor jugada aquí 👉 {{3}}
Cualquier duda, contéstanos por este chat.
```

**Muestras de variables:**
```
{{1}} → Juan
{{2}} → https://app.trol.mx/doc/diagnostico.pdf
{{3}} → https://app.trol.mx/e/5b00d32b-88d6-4276-b6b8-bf818fcc3b4c?c=nuevo
```

**Pie de página:** *(dejar vacío — es un mensaje de servicio que el cliente pidió)*

**Botones:** *(ninguno)*

---

### 4. `frio_calcula`  *(lead frío sin CURP)*

**Nombre de la plantilla:** `frio_calcula`
**Categoría:** Marketing · **Idioma:** Español (MEX)
**Encabezado:** *(dejar vacío)*

**Cuerpo:**
```
¿Cuánto te quedaría de pensión? Calcúlalo en 1 minuto, sin dar tu CURP 👉 {{1}}
Si quieres tu número exacto del IMSS, te ayudamos por aquí.
```

**Muestras de variables:**
```
{{1}} → https://app.trol.mx/calcula?ref=tako
```

**Pie de página:**
```
Responde BAJA para no recibir más mensajes.
```

**Botones:** *(ninguno)*

---

### 5. `referidos_invita`  *(gánala sin costo)*

**Nombre de la plantilla:** `referidos_invita`
**Categoría:** Marketing · **Idioma:** Español (MEX)
**Encabezado:** *(dejar vacío)*

**Cuerpo:**
```
Hola {{1}}, te saludamos de El Trol. ¿Quieres tu calculadora de pensión sin costo? 🎁 Invita a un amigo con tu link personal: cuando llegue a su diagnóstico, ganas 100 puntos y desbloqueas tu calculadora. Tu link:
{{2}}
Compártelo y empieza a sumar puntos. 🙌
```

**Muestras de variables:**
```
{{1}} → Juan
{{2}} → https://app.trol.mx/r/5b00d32b-88d6-4276-b6b8-bf818fcc3b4c
```

**Pie de página:**
```
Responde BAJA para no recibir más mensajes.
```

**Botones:** *(ninguno)*

---

> **Reglas de Meta para las variables (ya aplicadas arriba):**
> - El cuerpo **no puede empezar ni terminar con una variable** `{{ }}` → siempre hay texto antes y después (por eso cada plantilla cierra con una línea tipo "Cualquier duda, contéstanos por aquí").
> - **No** pongas dos variables juntas (`{{1}} {{2}}`); deja texto entre ellas.
> - Numéralas en orden y sin saltos: `{{1}}`, `{{2}}`, `{{3}}`.
>
> **Tip de aprobación:** no uses URLs acortadas ni "gratis/garantizado" en exceso; el dominio propio `app.trol.mx` ayuda a que Meta apruebe más rápido. Si una plantilla Marketing se rechaza, reenvíala como Utility solo si de verdad es seguimiento de un servicio que el usuario pidió.

---

## 🛡️ Buenas prácticas para NO penalizar la cuenta (calidad del número)

WhatsApp puntúa la **calidad** de tu número según cuánta gente te **bloquea o reporta**. Si baja, Meta te limita el envío (o tumba el número). Para protegerlo:

1. **Recordatorio de contexto (ya incluido):** abrir con "te saludamos de El Trol, hace un tiempo te registraste" hace que la persona te reconozca y **no te reporte como spam**. Es la mejor defensa.
2. **Salida fácil (opt-out, ya incluido en el pie):** "Responde BAJA para no recibir más mensajes." Da la opción de salir sin bloquearte — un BAJA no te penaliza, un bloqueo sí.
3. **Honrar el BAJA de inmediato:** mantén en Tako una **lista de exclusión**; quien responda BAJA no vuelve a recibir. (Esto es lo más importante operativamente.)
4. **Solo a quien te dejó su número:** la base con semilla se registró contigo → hay relación previa (cumple). No mandar a números comprados o ajenos.
5. **Calentar el número:** empieza con el **piloto chico** (Mod 40), vigila la calidad en WhatsApp Manager 24–48 h, y solo si sigue "Verde/Alta" amplías. No pases de 0 a 7,000 de golpe.
6. **Ritmo por capacidad:** lotes diarios que el equipo pueda **contestar**; conversaciones sin respuesta = mala señal.
7. **Mensaje limpio:** un solo CTA, sin MAYÚSCULAS sostenidas, sin exceso de emojis ni "gratis/garantizado", sin links acortados.
8. **Vigila el tablero:** si la calidad baja a Media/Baja, **frena** y deja descansar el número antes de seguir.

## Recordatorios de cumplimiento

- WhatsApp verificado (OBA verde) en el número emisor.
- "El trámite IMSS es gratis / sin anticipos" visible.
- Sin montos garantizados; cifra puntual siempre con su aclaración (eso vive en la app).
- Respetar opt-out de WhatsApp.
