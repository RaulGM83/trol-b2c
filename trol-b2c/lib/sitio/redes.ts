// Redes sociales de Trol. Una liga vacía no se muestra.
export const REDES: { nombre: string; url: string }[] = [
  { nombre: 'Facebook', url: '' },
  { nombre: 'Instagram', url: '' },
  { nombre: 'LinkedIn', url: '' },
];
export const redesActivas = () => REDES.filter((r) => r.url);
