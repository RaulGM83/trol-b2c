# Spec — Fecha de trámite libre en Mod 40 \+ ventana de 12 meses (24-ago-2026)

Para ejecutar en Claude Code desde `~/Claude/Projects/b2c experiencia`. El lado Supabase **ya está hecho** (esta sesión); aquí va lo de pension-core y UI. Guardar este archivo en `claude/` y referenciarlo desde el handoff.

## 1\. Contexto y decisiones tomadas

- Hoy las calculadoras Mod 40 (Mesa Viraal, pestaña Calculadoras del expediente, `public/viraal/calc.html`) calculan "a hoy" (`computeProyectoMod40` con `edadRetiro=0`) o ancladas al escenario base. En la realidad el trámite se hace en otra fecha.  
- **Decisión Raúl**: parámetro **fecha de inicio de trámite** (default hoy) en las tres superficies. Mueve ventana retroactiva, meses de pago, UMA aplicable por año y semanas acumuladas a esa fecha. Fechas inválidas **avisan, no bloquean** (como el checklist). La fecha se **congela en el escenario guardado y en los `inputs` de la autorización Viraal**. Barrido automático de fechas óptimas: v2, por ahora manual.

### Regla nueva (art. 220 LSS, ya viva en Supabase)

Si la **última cotización** del historial fue Mod 40 ("CONTINUACION VOLUNTARIA EN EL REGIMEN OBLIGATORIO", RP terminado en `9999940`) y hay baja, la ventana de reactivación **no es de 5 años (art. 219\) sino de 12 meses** desde la baja, y el "retro" son las **cuotas omitidas desde esa baja, con recargos**. Decisión Raúl: toda baja de Mod 40 se trata como mora (en la práctica la gente deja de pagar; solo se dan de baja formal al pensionarse). Pasado el plazo: reingresar al régimen obligatorio ≥52 semanas y reintentar. Fuera de plazo: ≥60 años → evaluar pensión directa; \<60 → asesoría.

## 2\. Lo que ya quedó en Supabase (no repetir)

- Campo `ultima_modalidad` (calculado, grupo imss) derivado del historial de la semilla; doble señal empleador/RP. Función `trol3.derivar_ultima_modalidad(persona, historial, ts)` \+ trigger en `trol3.datos` cuando llega semilla nueva (cubre sync y cualquier camino, sin tocar n8n).  
- Si `ultima_modalidad='mod40'` con baja: `limite_inscripcion_mod40` \= baja \+ 12 meses, capa calculado proveedor `trol3`, escrito con **\+1 segundo** para ganarle en misma capa al límite de 5 años de la semilla.  
- `evaluar_persona`: no emite `mod40_retro`/`mod40_prospectiva` con ventana vencida; en ventana llevan `urgencia_fecha` \= límite y motivo de reingreso; vencida y \<60 → `entender_situacion` con motivo 52 semanas.  
- Backfill 24-ago: 181 personas con última cotización Mod 40 (74 vigentes, 49 en ventana, 58 vencidos); 26 `mod40_retro` cerrados no\_aplica; 22 `entender_situacion` nuevos; pension\_hoy 87→89.  
- Migraciones: `ultima_modalidad_mod40_ventana_12m`, `evaluar_persona_ventana_mod40`, `mod40_prospectiva_fecha_limite_en_ventana`.

## 3\. pension-core

1. **`fechaTramite` como parámetro explícito** (default \= hoy) en `computeProyectoMod40` y en todo lo que hoy asume `new Date()`: UMA del año de la fecha (y de cada año del tramo), semanas acumuladas a la fecha, meses retro contados hacia atrás desde la fecha, edad a la fecha. Mapear TODAS las anclas de "hoy" antes de tocar (buscar `new Date`, `Date.now`, `hoy`).  
2. **`ventanaMod40(historial, fechaTramite)`** nueva:  
   - Entrada: historial (registros con empleador/RP/fechas) \+ fecha de trámite.  
   - Salida: `{ ultimaBaja, ultimaModalidad: 'obligatorio'|'mod40'|'independiente'|'otra_voluntaria', plazo: '5a'|'12m', fechaLimite, estado: 'vigente'|'por_vencer'|'vencida', avisos: string[] }`.  
   - Detección idéntica a la de Supabase (empleador ILIKE '%CONTINUACION VOLUNTARIA%' OR RP \~ `9999940$`). Mantener las dos implementaciones alineadas; comentario cruzado en ambas.  
3. **Corte del retro según caso**:  
   - Última modalidad obligatorio: ventana normal (inscripción retroactiva al día siguiente de la baja, dentro de 5 años; el pago cubre desde la baja hasta la formalización con actualizaciones/recargos).  
   - Última modalidad mod40 con baja: el retro son las cuotas omitidas desde la baja de Mod 40, con recargos; solo si `fechaTramite` ≤ límite de 12 meses. Al reingresar, el SBC no puede ser menor al que tenía (art. 65 RLSS-ACRF) — validar contra el último SBC del historial.  
   - Mod 40 vigente (sin baja): no hay retro; solo prospectiva.  
4. **Avisos (nunca bloqueo)**: fecha fuera de ventana ("a esta fecha ya no aplica; el límite era X"), conservación de derechos vencida a la fecha, edad insuficiente a la fecha, retro parcial ("a esta fecha solo puedes cubrir N meses"). Si el historial no trae detalle de patrón: aviso "no podemos confirmar la modalidad de tu última baja".  
5. **Tests**: goldens intactos con `fechaTramite = hoy` (mismos números que antes, bit a bit); fecha movida adelante/atrás cruzando año de UMA; última baja Mod 40 dentro / fuera de 12 meses; Mod 40 vigente; caso "SEGUROS ESPECIALES" con RP `…9999940` (debe clasificar mod40 por RP); SBC de reingreso \< último SBC (debe avisar).

## 4\. UI

- **Mesa Viraal** (`MesaViraal.tsx` \+ `lib/viraal/prefill.ts`): date picker "Fecha de inicio de trámite" (default hoy). Recalcula en vivo. Los avisos de `ventanaMod40` visibles junto al encabezado. La fecha entra a los `inputs` de la autorización (queda congelada en el documento).  
- **Pestaña Calculadoras** del expediente (`/trabajo/p/[id]`): mismo date picker en Mod 40; al guardar escenario, la fecha se persiste como override del escenario (no toca `datos`).  
- **`public/viraal/calc.html`**: date picker; se mantiene la restricción de no superar la tabla.  
- Copy de los avisos en lenguaje llano; para clientes con última modalidad mod40, mostrar la fecha límite siempre ("tu ventana de reingreso vence el X") aunque la fecha elegida sea válida.

## 5\. Persistencia

- Escenario: la fecha de trámite viaja como override más del escenario (junto a semanas/SBC/etc.), compartible con el asesor como hoy.  
- Autorización Viraal: fecha en `inputs`; verificar que el PDF/documento la muestre.

## 6\. Pendiente relacionado (fuera de esta sesión)

- **n8n Calculadora Trol (B2B)**: el flag aplica/no-aplica que se manda a aliados debe usar la misma regla (misma detección \+ 12 meses). Lado Raúl o sesión conjunta con el MCP de n8n.  
- pension-core podría emitir `limite_inscripcion_mod40` ya correcto en la semilla (hoy lo corrige trol3 con el \+1s); si se hace, dejar el override de trol3 como red de seguridad.  
- Barrido automático de fechas óptimas (v2).

## 7\. Gotchas conocidos

- `trol-b2c/node_modules/@trol/pension-core` fue symlink roto; verificar que apunta a `~/Claude/Projects/b2c experiencia/pension-core` antes de confiar en `tsc`.  
- Los goldens no atrapan datos de catálogo ni fechas: renderizar y correr un caso real antes de dar por bueno.  
- Push lo hace Raúl desde su terminal; commits con la identidad del handoff §6.  
- La fecha límite que muestra la UI debe salir del expediente (`limite_inscripcion_mod40` mejor dato), no recalcularse distinto en el front — una sola verdad.

