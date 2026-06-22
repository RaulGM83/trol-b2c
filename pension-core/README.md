# @trol/pension-core

Motor de cálculo pensional **compartido** entre el portal de asesores (B2B) y la app de cliente final (B2C). Extraído verbatim de `trol-portal/src/lib/imss` (port fiel del Excel CALCULADORA, validado al 0.5% contra el caso MOJA).

## API
- `computeLey73(entrada)` · `computeLey97(entrada)` · `computeProyectoMod40(entrada)`
- `parseSemillaV2(jsonb)` — construye la entrada desde la semilla `calculo_pensional` v2 de Supabase
- Tablas y tipos: `./tablas`, `./types`

## Por qué existe
Una sola fuente de verdad del cálculo: sin drift entre lo que ve el asesor y lo que ve el cliente (Plan Maestro §18–§19).

## Tests
`npm test` corre la suite de paridad contra el Excel (vitest).
