# `v_segmentos_campana` — historia de las migraciones 099 … 108b

Entre el 1 y el 3 de septiembre de 2026 la vista `trol3.v_segmentos_campana` se redefinió
**once veces**. Cada versión reescribía la definición completa (~247 líneas), no un delta,
así que **sólo la última tiene efecto**. Por eso en esta carpeta vive un único archivo con
la definición vigente — `108b_segmentos_con_retroactivo_correcto.sql` — y no las once.

Este README existe para que la numeración no tenga un hueco inexplicable y para dejar el
rastro de qué se decidió en cada paso. El razonamiento largo está en los docs del proyecto
`claude/31` … `claude/39`, y la fuente original de cada una sigue viva en
`supabase_migrations.schema_migrations` del proyecto `orgagfdxygtjiwqvgckw`.

## Lo que sí está en esta carpeta

| Archivo | Qué define |
|---|---|
| `100_fin_conservacion_manda_sobre_la_bandera.sql` | `trol3.evaluar_persona` |
| `101_belvo_no_refresca.sql` | `trol3.pedir_consulta` |
| `107_nombre_saludo_para_campanas.sql` | `trol3.nombre_saludo`, `trol3.nombre_dudoso` |
| `108_retroactivo_desde_baja_o_adquisicion_de_derechos.sql` | `trol3.meses_retro` |
| `108b_segmentos_con_retroactivo_correcto.sql` | `trol3.v_segmentos_campana` (versión final) |

Orden de aplicación: 100 → 101 → 107 → 108 → 108b. La vista depende de las tres funciones
de 107 y 108, así que va al final.

## Las diez versiones intermedias de la vista

Todas fueron `create view` sobre `trol3.v_segmentos_campana`. Fechas en CDMX.

| # | Fecha | Qué cambió |
|---|---|---|
| 099 | 1-sep 13:51 | Versión inicial. Segmentos `c1`–`c5` y `r1`–`r3`; `variante` sólo afirma empleado/desempleado si `status_empleo` tiene ≤90 días, si no `neutral` |
| 099b | 1-sep 13:55 | Bucket `x_revisar` para los 56 expedientes donde `conserva_derechos = true` contradice una `fin_conservacion` ya pasada |
| 099c | 1-sep 13:57 | Se parte el segmento Mod 40 en `r3a` (viene de Mod 40, reingreso) y `r3b` (nunca estuvo) |
| 100b | 1-sep 15:07 | La vista adopta la regla de 100: `fin_conservacion` manda sobre la bandera. Nace `derechos_ok` |
| 102 | 2-sep 05:03 | Los `r1` se parten por consecuencia: negativa total vs pensión chica |
| 103 | 2-sep 05:11 | Piso de **450 semanas** para prometer Ley 73; por debajo, `r1_lejos` |
| 104 | 2-sep 05:38 | Los `r*` sólo aplican de **59 años en adelante** (salvo `r2`); `r4` a un año |
| 105 | 2-sep 05:51 | `r4` por **fecha de cumpleaños 60** dentro de 14 meses, no por edad entera |
| 106 | 2-sep 06:02 | `r2` sin piso de edad |
| 107b | 2-sep 09:24 | El saludo usa `trol3.nombre_saludo` y se expone `nombre_dudoso` |
| 108b | 3-sep 20:02 | Retroactivo desde la más tardía entre la baja y los 60, topado a 12 meses: `inicio_retro`, `meses_retro`, `retroactivo_estimado` |

## Nota sobre reproducibilidad

Cuatro de las versiones intermedias (**099b, 099c, 100b y 102**) hacían `create view` sin
`drop view` previo. Funcionaron porque la vista se borraba a mano en la consola antes de
correrlas, pero aplicadas en orden sobre una base limpia habrían fallado con
*relation already exists*. El archivo final que sí se conserva trae su `drop view if exists`
y un `grant select` explícito, así que corre solo.

Regla para lo que venga: **toda migración que redefina una vista debe traer su propio
`drop view if exists ... ;` cuando cambien las columnas**, o usar `create or replace view`
cuando no cambien. Nunca depender de un paso manual en la consola.

---
Exportado el 4-sep-2026. Los cinco archivos `.sql` de esta carpeta se verificaron por MD5
contra `supabase_migrations.schema_migrations`: son idénticos a lo que está aplicado en
producción.
