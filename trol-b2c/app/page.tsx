import { redirect } from 'next/navigation';

// En producción: landing → auth (teléfono+OTP) → /diagnostico.
// En este scaffold, la raíz lleva directo al diagnóstico demo.
export default function Home() {
  redirect('/diagnostico');
}
