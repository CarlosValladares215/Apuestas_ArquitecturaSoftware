import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Plataforma de Apuestas Deportivas — UTPL',
  description:
    'Plataforma web académica de apuestas deportivas con seguridad antifraude, ledger inmutable y resultados en tiempo real.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
