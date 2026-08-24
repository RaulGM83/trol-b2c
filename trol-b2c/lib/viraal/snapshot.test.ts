// ============================================================================
// Snapshot inmutable del escenario autorizado.
//
// Lo que se protege aquí es una promesa: la fila guardada se basta a sí misma.
// Si mañana alguien le quita un campo a `inputs`, el round-trip deja de poder
// recalcularse y este archivo se pone rojo.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';

import { MOTOR_ID, MOTOR_VERSION } from '@/lib/imss/version';
import type { Palancas } from '@/lib/imss/types';
import {
  construirSnapshot,
  recomputarDesdeInputs,
  snapshotEsDelMotorActual,
  type InputsSnapshot,
} from '@/lib/viraal/snapshot';
import {
  guardarEscenarioAutorizado,
  type ClienteRpcEscenario,
} from '@/lib/viraal/escenario';
import {
  historialMod40,
  LIMITE_EXPEDIENTE,
  semillaMod40,
} from '@/lib/viraal/__fixtures__/semilla-mod40';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Las mismas palancas que usa la Mesa Viraal ("a día de hoy").
const palancasMesa: Palancas = {
  edadRetiro: 0,
  pctTiempoCotizando: 0,
  salarioMod40: 2933.75,
  recuperarSemanasDescontadas: false,
  recuperarSemanasMod40Retro: false,
  salarioCotizacionRetro: 'MAXIMO',
  usaCreditoInfonavit: false,
  ahorroVoluntarioMensual: 0,
};

const entrada = (fecha: string, over: Partial<Parameters<typeof construirSnapshot>[0]> = {}) => ({
  semilla: semillaMod40,
  historial: historialMod40,
  fechaTramite: d(fecha),
  limiteInscripcionMod40: LIMITE_EXPEDIENTE,
  palancas: palancasMesa,
  ...over,
});

/** Ida y vuelta por jsonb: es lo que de verdad le pasa a la fila en Postgres. */
const porJsonb = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ============================================================================
// 1. El snapshot se basta a sí mismo
// ============================================================================

describe('construirSnapshot — auto-contenido', () => {
  const s = construirSnapshot(entrada('2026-08-24'))!;

  it('estampa la versión y la implementación del motor', () => {
    expect(s.inputs.motor_version).toBe(MOTOR_VERSION);
    expect(s.inputs.motor_id).toBe(MOTOR_ID);
    // La RPC rechaza inputs sin motor_version: el check vive también en la base.
    expect(s.inputs).toHaveProperty('motor_version');
  });

  it('guarda todo lo que el motor necesita para volver a correr', () => {
    expect(s.inputs.semilla).toEqual(semillaMod40);
    expect(s.inputs.historial).toEqual(historialMod40);
    expect(s.inputs.fecha_tramite).toBe('2026-08-24');
    expect(s.inputs.limite_inscripcion_mod40).toBe(LIMITE_EXPEDIENTE);
    expect(s.inputs.palancas).toEqual(palancasMesa);
  });

  it('trae los diez bloques numéricos y nada más', () => {
    expect(Object.keys(s.resultado).sort()).toEqual(
      [
        'conProyecto',
        'costos',
        'creditoDxn',
        'efectivo',
        'financiamiento',
        'multiplicadorPension',
        'multiplicadorValor',
        'pagoImss',
        'sinProyecto',
        'totalAPagar',
      ].sort(),
    );
    // fechaTramite y ventana viven en sus propias columnas, no aquí.
    expect(s.resultado).not.toHaveProperty('fechaTramite');
    expect(s.resultado).not.toHaveProperty('ventana');
  });

  it('todo número del resultado es finito (jsonb no avisa de NaN)', () => {
    // JSON.stringify convierte NaN e Infinity en null SIN error, así que un
    // snapshot con una división rota se guardaría como nulos silenciosos.
    const revisar = (v: unknown, ruta: string) => {
      if (typeof v === 'number') {
        expect(Number.isFinite(v), `${ruta} = ${v}`).toBe(true);
      } else if (v && typeof v === 'object') {
        for (const [k, hijo] of Object.entries(v)) revisar(hijo, `${ruta}.${k}`);
      }
    };
    revisar(s.resultado, 'resultado');
    // Y si alguno se colara, el viaje por jsonb lo delataría como null.
    expect(porJsonb(s.resultado)).toEqual(s.resultado);
  });

  it('serializa las fechas de la ventana a ISO (sobreviven a jsonb)', () => {
    expect(s.ventana.ultimaBaja).toBe('2024-09-30');
    expect(s.ventana.fechaLimite).toBe(LIMITE_EXPEDIENTE);
    expect(porJsonb(s.ventana)).toEqual(s.ventana);
  });

  it('congela los avisos que el asesor tenía enfrente', () => {
    expect(s.avisos).toEqual(s.ventana.avisos_proyecto);
    expect(s.avisos.length).toBeGreaterThan(0);
    // Este expediente ya tiene la ventana vencida: se autoriza igual, con aviso.
    expect(s.ventana.estado).toBe('vencida');
    expect(s.avisos.some((a) => a.includes('ya no puedes inscribirte'))).toBe(true);
  });

  it('el límite del expediente le gana al de 5 años de la semilla', () => {
    expect(semillaMod40.perfil.fechas.limite_inscripcion_mod40).toBe('2029-09-29');
    expect(s.ventana.fechaLimite).toBe('2025-09-30');
  });
});

// ============================================================================
// 2. Round-trip: guardar → leer → recalcular
// ============================================================================

describe('round-trip contra el motor', () => {
  it('recalcular desde los inputs guardados da el mismo resultado, campo por campo', () => {
    const s = construirSnapshot(entrada('2026-08-24'))!;
    // Simula el viaje real: el objeto se serializa a jsonb, se guarda y se relee.
    const guardado = porJsonb(s);
    const recomputado = recomputarDesdeInputs(guardado.inputs as InputsSnapshot)!;

    expect(recomputado).not.toBeNull();
    // Campo por campo, no solo el total.
    for (const clave of Object.keys(guardado.resultado) as Array<keyof typeof guardado.resultado>) {
      expect({ [clave]: recomputado[clave] }).toEqual({ [clave]: guardado.resultado[clave] });
    }
    expect(recomputado).toEqual(guardado.resultado);
  });

  it('el round-trip aguanta palancas distintas de las de la mesa', () => {
    const s = construirSnapshot(
      entrada('2026-08-24', {
        palancas: { ...palancasMesa, edadRetiro: 65, recuperarSemanasDescontadas: true },
        umasProyecto: 12,
        semanasExtra: -40,
      }),
    )!;
    const guardado = porJsonb(s);
    expect(guardado.inputs.umas_proyecto).toBe(12);
    expect(guardado.inputs.semanas_extra).toBe(-40);
    expect(recomputarDesdeInputs(guardado.inputs as InputsSnapshot)).toEqual(guardado.resultado);
  });

  it('HOY coinciden; si mañana divergen, manda el snapshot', () => {
    // Este test documenta la regla, no la fuerza: cuando el motor cambie, el
    // recálculo dará otra cosa y ESTO es lo esperado. Lo que nunca puede pasar
    // es que la fila guardada cambie sola.
    const s = construirSnapshot(entrada('2026-08-24'))!;
    const guardado = porJsonb(s);
    const antes = JSON.stringify(guardado.resultado);
    recomputarDesdeInputs(guardado.inputs as InputsSnapshot);
    expect(JSON.stringify(guardado.resultado)).toBe(antes);
  });

  it('detecta un snapshot hecho con un motor viejo', () => {
    const s = construirSnapshot(entrada('2026-08-24'))!;
    expect(snapshotEsDelMotorActual(s.inputs)).toBe(true);
    expect(snapshotEsDelMotorActual({ motor_version: 'trol-b2c/lib/imss@2020.01.01.1' })).toBe(false);
  });
});

// ============================================================================
// 3. Reautorizar no toca lo anterior
// ============================================================================

describe('una autorización nueva no modifica la anterior', () => {
  it('cambiar la fecha de trámite produce otro snapshot, sin tocar el primero', () => {
    const primero = construirSnapshot(entrada('2025-06-01'))!;
    const congelado = porJsonb(primero);

    const segundo = construirSnapshot(entrada('2026-08-24'))!;

    expect(segundo.inputs.fecha_tramite).not.toBe(primero.inputs.fecha_tramite);
    expect(segundo.resultado.pagoImss.meses).not.toBe(primero.resultado.pagoImss.meses);
    // La ventana estaba viva en junio de 2025 y vencida hoy: la evidencia de lo
    // que se autorizó entonces no puede cambiar de opinión.
    expect(primero.ventana.estado).toBe('vigente');
    expect(segundo.ventana.estado).toBe('vencida');
    expect(porJsonb(primero)).toEqual(congelado);
  });
});

// ============================================================================
// 4. La escritura: contrato con la RPC
// ============================================================================

describe('guardarEscenarioAutorizado', () => {
  const idFalso = '11111111-2222-3333-4444-555555555555';
  const clienteOk = (): ClienteRpcEscenario & { rpc: ReturnType<typeof vi.fn> } => ({
    rpc: vi.fn().mockResolvedValue({ data: idFalso, error: null }),
  });

  it('llama a la RPC con el snapshot exacto, sin re-derivar nada', async () => {
    const s = construirSnapshot(entrada('2026-08-24'))!;
    const db = clienteOk();
    const r = await guardarEscenarioAutorizado(db, { personaId: 'p-1' }, s);

    expect(r).toEqual({ ok: true, id: idFalso });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = db.rpc.mock.calls[0];
    expect(fn).toBe('autorizar_escenario');
    expect(args.p_persona).toBe('p-1');
    expect(args.p_consulta_aliado).toBeNull();
    expect(args.p_tipo).toBe('autorizacion');
    // Identidad, no igualdad: son los MISMOS objetos que se imprimen en el PDF.
    expect(args.p_inputs).toBe(s.inputs);
    expect(args.p_resultado).toBe(s.resultado);
    expect(args.p_ventana).toBe(s.ventana);
  });

  it('acepta la consulta de aliado como sujeto', async () => {
    const s = construirSnapshot(entrada('2026-08-24'))!;
    const db = clienteOk();
    await guardarEscenarioAutorizado(db, { consultaAliadoId: 'c-9' }, s);
    const args = db.rpc.mock.calls[0][1];
    expect(args.p_persona).toBeNull();
    expect(args.p_consulta_aliado).toBe('c-9');
  });

  it('propaga el error de la RPC en vez de tragárselo', async () => {
    const s = construirSnapshot(entrada('2026-08-24'))!;
    const db: ClienteRpcEscenario = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'no_autorizado' } }),
    };
    expect(await guardarEscenarioAutorizado(db, { personaId: 'p-1' }, s)).toEqual({
      ok: false,
      error: 'no_autorizado',
    });
  });

  it('no da por buena una RPC que no devuelve id', async () => {
    const s = construirSnapshot(entrada('2026-08-24'))!;
    const db: ClienteRpcEscenario = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const r = await guardarEscenarioAutorizado(db, { personaId: 'p-1' }, s);
    expect(r.ok).toBe(false);
  });

  it('el payload sobrevive a jsonb sin perder nada', async () => {
    const s = construirSnapshot(entrada('2026-08-24'))!;
    const db = clienteOk();
    await guardarEscenarioAutorizado(db, { personaId: 'p-1' }, s);
    const args = db.rpc.mock.calls[0][1];
    expect(porJsonb(args.p_inputs)).toEqual(args.p_inputs);
    expect(porJsonb(args.p_resultado)).toEqual(args.p_resultado);
    expect(porJsonb(args.p_ventana)).toEqual(args.p_ventana);
  });
});
