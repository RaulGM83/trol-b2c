// Redes sociales de Trol. Una liga vacía no se muestra.
export const REDES: { nombre: string; url: string }[] = [
  { nombre: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61566460580024' },
  { nombre: 'Instagram', url: 'https://www.instagram.com/trolfinanciero/' },
  { nombre: 'LinkedIn', url: 'https://www.linkedin.com/company/trol-financiero/' },
];
export const redesActivas = () => REDES.filter((r) => r.url);
