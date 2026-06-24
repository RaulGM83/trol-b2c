# Pipeline CONSAR → Supabase (Fase 2 del comparador)

Objetivo: refrescar mensualmente los datos del comparador de AFOREs desde fuentes oficiales, para alimentar IRN por generación, **Fuga**, **Crecimiento** y el pilar de Inversión del score.

## Tablas destino (ya creadas en Supabase)

- **`afore_mercado`** (1 fila por AFORE, snapshot): `cuentas`, `aum_mdp`, `cedidos_cuentas`, `recibidos_cuentas`, `cedidos_mdp`, `recibidos_mdp`, `gasto_comercial_mdp`, `periodo`. → De aquí la vista calcula fuga y crecimiento.
- **`afore_irn`** (1 fila por AFORE × generación): `afore`, `generacion`, `irn`, `periodo`. → Matriz oficial del IRN.
- **`afore_datos`** (ya existente): comisión y "fortaleza" editable.
- La vista **`vista_comparador_afore`** ya cruza todo y expone `fuga_cuentas_pct`, `fuga_saldo_pct`, captación, etc. El comparador la lee; en cuanto haya filas en `afore_mercado`, la columna Fuga se llena sola.

## Fuentes (CSV de descarga directa, GET sin auth)

Base: `https://repodatos.atdt.gob.mx/api_update/consar/<dataset>/<archivo>.csv`

| Dato | Dataset | Archivo confirmado |
|---|---|---|
| Rendimientos por SIEFORE | `rendimientos_afore` | `10_rendimientos_precio_bolsa.csv` |
| Precios de bolsa (valor acción, diario) | `precios_bolsa_siefore` | `01_precios_bolsa_siefores.csv` |
| Traspasos | `traspasos_afore_afore` | (abrir ficha para el nombre exacto del CSV) |
| Cuentas administradas | `cuentas_administradas_afore` | (idem) |
| Activos netos (AUM) | `activos_netos_siefore` | (idem) |
| Comisiones | `comisiones_siefore` | (idem) |

> Páginas de las fichas para confirmar el nombre del archivo y las **columnas exactas**: `https://www.datos.gob.mx/dataset/<dataset>`. Abre cada CSV una vez y verifica encabezados antes de mapear.

El **IRN por generación** no está como matriz limpia en datos.gob.mx; vive en SISET: descarga `https://www.consar.gob.mx/gobmx/aplicativo/siset/tdf/Indice_Rendimiento_Neto.xlsx` (Excel). Para v1 se puede cargar `afore_irn` a mano una vez al mes desde ese Excel; automatizarlo requiere parsear el xlsx.

## Flujo n8n (mensual)

1. **Schedule Trigger** — día 16 de cada mes (CONSAR publica ~día 15).
2. **HTTP Request** (uno por CSV) → descarga el archivo (Response: String).
3. **Code / Spreadsheet File** → parsea el CSV. Filtra al **periodo más reciente** y agrupa por AFORE. Para traspasos, suma **12 meses** de cedidos y recibidos.
4. **Code (transformar)** → arma un objeto por AFORE con: `cuentas`, `aum_mdp`, `cedidos_cuentas`, `recibidos_cuentas`, `cedidos_mdp`, `recibidos_mdp`, `periodo`. (La fuga y el crecimiento NO se calculan aquí; los calcula la vista en Supabase.)
5. **Supabase (Upsert)** → tabla `afore_mercado`, on conflict `afore`. (Reusa tu credencial Supabase de los otros flujos.)
6. (Opcional) Otro Upsert a `afore_comisiones`/`afore_datos` para refrescar comisión.

Para el IRN: un branch que lea el xlsx de SISET → upsert a `afore_irn` (afore, generacion, irn). Si por ahora se carga manual, omite este branch.

### Mapeo de nombres de AFORE
Normaliza a los nombres del catálogo del comparador: `Azteca, Banorte, Citibanamex, Coppel, Inbursa, Invercap, PensionISSSTE, Principal, Profuturo, SURA`. Ojo: CONSAR usa "XXI-Banorte" (→ `Banorte`) y a veces "Banamex" (→ `Citibanamex`). Mete un map de equivalencias en el Code node.

## Alternativa sin n8n (Vercel Cron)
Si prefieres mantenerlo en el repo: una ruta `app/api/cron/consar/route.ts` (server, con service role) que haga el mismo fetch+upsert, disparada por **Vercel Cron** (mensual). No la dejé escrita porque conviene confirmar las columnas reales de cada CSV primero para no parsear a ciegas. Cuando tengas los encabezados, la armo en minutos.

## Cálculo de fuga y crecimiento (ya vive en la vista, para referencia)
- **Fuga en cuentas** = `cedidos_cuentas / cuentas` · **Fuga en saldos** = `cedidos_mdp / aum_mdp` (mayor = peor). Bruta (solo salidas).
- **Crecimiento** = `recibidos_*`; **agresividad** = crecimiento alto + `gasto_comercial_mdp` alto.

## Disclaimers (mantener en el comparador)
No somos CONSAR ni una AFORE · cifras IRN/comisiones de CONSAR + fecha · "rendimientos pasados no garantizan resultados futuros" · información educativa, no asesoría · no tramitamos traspasos (gratis por canales oficiales).
