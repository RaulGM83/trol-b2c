import path from 'node:path';
import { defineConfig } from 'vitest/config';

// La app no tenía runner de pruebas: hasta hoy solo `pension-core` corría
// vitest. Se agrega aquí para poder probar el snapshot de escenarios sin
// levantar Next ni pegarle a Supabase.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'components/**/*.test.ts', 'app/**/*.test.ts'],
  },
  resolve: {
    // Mismo alias que tsconfig.json: `@/*` → raíz de trol-b2c.
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
