export default function SinAcceso() {
  return (
    <main className="mx-auto max-w-md px-5 py-12 text-sm">
      <p>Tu cuenta no está registrada como miembro del equipo Trol. Pide a un admin que te dé de alta.</p>
      <form action="/trabajo/salir" method="post"><button className="mt-4 rounded-lg border px-3 py-2">Salir</button></form>
    </main>
  );
}
