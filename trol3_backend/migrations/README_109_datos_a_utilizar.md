# 109 · Datos a utilizar — los cinco vehículos de ahorro

Tres migraciones que van juntas y en orden: **109 → 109b → 109c**.

| Archivo | Qué define |
|---|---|
| `109_datos_a_utilizar_cinco_vehiculos.sql` | 5 campos nuevos en `trol3.catalogo_campos`; `trol3.campos_datos_a_utilizar()`; `trol3.limpiar_datos_a_utilizar()` |
| `109b_rpc_guardado_acepta_paquete_completo.sql` | `public.guardar_saldos_corregidos`, `trol3.guardar_saldos_consulta_aliado` |
| `109c_sync_datos_a_utilizar_a_trol3.sql` | `trol3.sync_saldos_corregidos` |

## Por qué

Hasta el 5-sep el asesor sólo podía corregir dos números —lo disponible en la
AFORE y el saldo Infonavit— y todo lo demás quedaba estimado. Peor: el plan de
retiro de la empresa se contaba **dentro** de la AFORE, aunque no rinde igual
ni se retira igual, y un PPR de aseguradora simplemente no existía en el
modelo. El caso que lo destapó fue Eva Santos, con dinero en Infonavit y en el
plan corporativo de Pepsico.

Ahora son cinco vehículos, cada uno con su saldo de hoy, su aportación mensual
donde aplica, y su rendimiento real hacia adelante en el motor:

| Vehículo | Rendimiento real | Dónde entra |
|---|---|---|
| AFORE (RCV + voluntario) | 3% | cuenta individual |
| Plan de retiro de la empresa | 2% | encima de la pensión |
| Otros planes (PPR, fondos, caja) | 1% | encima de la pensión |
| Infonavit | 0% | **antes** del piso de la PMG |

Esa última fila es la que explica por qué el Infonavit puede no mover nada: como
entra antes de la mínima garantizada, en un cliente que cae al piso se lo come
la PMG. El voluntario y los planes privados siempre suman, porque van encima.

## Decisiones que quedaron en el diseño

**Un `p_datos jsonb`, no nueve parámetros.** Las dos RPC ya tenían
`p_disponible_afore` y `p_infonavit` posicionales. Agregar siete más habría
hecho la firma impronunciable y habría roto a cualquier llamador que pasara
argumentos por posición. Los dos viejos siguen ahí y **ganan** cuando llegan
con valor, así que quien no se actualizó no nota nada.

**`create or replace` no sirve para esto.** Agregar parámetros —aunque tengan
default— no reemplaza la función: crea una sobrecarga, y dos funciones con el
mismo nombre dejan a PostgREST sin saber a cuál llamar. Por eso 109b dropea la
firma vieja por su lista exacta de argumentos antes de crear la nueva.

**Borrar es explícito.** El merge conserva lo que no se manda; un campo sólo
desaparece si viaja en `p_borrar`. El front acota ese arreglo a los campos que
el panel muestra, así que la calculadora de Mod 40 —que sólo enseña dos— no
puede borrar los otros siete.

**Los interruptores no se guardan.** Incluir o no incluir un vehículo es una
pregunta de escenario, no un dato del cliente. Vive en la sesión del navegador
y se pierde al salir, a propósito: guardarlo sería congelar una hipótesis como
si fuera un hecho.

## Prueba de ida y vuelta

Verificada el 5-sep dentro de una transacción abortada: escribir tres campos
nuevos en `public.clientes.saldos_corregidos` y llamar a
`trol3.sync_saldos_corregidos` los deja en `trol3.datos` con capa `declarado`,
3 de 3, sin tocar los que no venían.
