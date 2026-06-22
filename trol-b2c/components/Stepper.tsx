// Stepper firma "Tu avance" — 6 pasos del modelo de progreso del cliente (§16).
const PASOS = ['Tus datos', 'Diagnóstico', 'Mejor jugada', 'Calculadora', 'Asesoría', 'Implementar'];

export function Stepper({ activo }: { activo: number }) {
  return (
    <div className="mb-6">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Tu avance</div>
      <div className="flex gap-1.5">
        {PASOS.map((p, i) => (
          <div key={p} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= activo ? 'bg-lime' : 'bg-line'}`} />
            <div className={`mt-1 text-[10px] ${i === activo ? 'font-bold text-ink' : 'text-muted'}`}>{p}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
