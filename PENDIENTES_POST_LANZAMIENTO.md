# Pendientes post-lanzamiento (diagnóstico 2-jul-2026)

Acciones derivadas del diagnóstico de la estrategia (app + email + WhatsApp), en orden de prioridad.

## 🔴 Urgente (hoy/mañana)

1. **Recuperar órdenes SPEI pendientes.** Hay una orden real de $500 (Diagnóstico Avanzado) del 2-jul 2:33 AM sin completar (cliente `19f7c245-4640-432a-81f3-33c3dcdbe452`). Contactar por WhatsApp: reenviar CLABE u ofrecer pago con tarjeta. Definir seguimiento automático para toda orden `pendiente` > 1h.
2. **Activar Segmento B.** 4,531 leads con 100 pts precargados ($453k pts comprometidos) y solo 18 han entrado. Enviar el email/WhatsApp B0 "ya tienes puntos para activar tu cálculo".

## 🟠 Esta semana

3. **Destrabar el desbloqueo (0/116 convirtieron).** Probar con un lote de la base con semilla: precargar 100 pts de cortesía (como al Segmento B) o primera actualización gratis. Señal de los datos: los 2 únicos intentos de compra fueron del producto de $500, no del de $100.
4. **Arreglar atribución antes de escalar:**
   - Aplicar `migracion_atribucion.sql` (la tabla `atribuciones` NO existe en prod).
   - Re-etiquetar los botones del email: hoy usan `link_experiencia_app` con `?c=manual` → clics de email indistinguibles de envíos manuales. Usar `?c=email_<campania>`.
5. **Escalar WhatsApp por lotes** (Mod 40 → Ley 97 → Infonavit), vigilando calidad del número. WA rinde ~13% CTR vs ~2% del email.
6. **Revisar CTA/form de `/calcula`:** ~108 visitas → 5 leads (~5%). Eslabón más débil del canal frío.

## 🟡 Después

7. Rediseño de la experiencia post-login (siguiente paso claro + gamificación + asesoría básica) — ver `PROPUESTA_MEJORAS_EXPERIENCIA.md`.
8. Validar firma `x-signature` del webhook MP (pendiente desde Sprint 1).
9. Dedupe `clientes` por CURP · purga/cifrado de backups con PII.

## Números de referencia del lanzamiento (29-jun → 2-jul)

- 290 abrieron su link `/e/` · ~165 cuentas nuevas · 116 vinculadas → **40% apertura→login** (la fricción no es el OTP).
- **0** desbloqueos por puntos · **0** compras reales · **0** refresh Jordan · 2 referidos · 10 encuestas.
- WhatsApp piloto ~501 enviados → 67 clientes abrieron (~13%).
- Email (1-jul) ≈ campaña "manual": 211 clientes abrieron su link.
