import Link from 'next/link';
import { APP_VERSION } from '@apuestas/shared';

const NAV_ITEMS = [
  { href: '/', label: 'Cartelera' },
  { href: '/wallet', label: 'Billetera' },
  { href: '/operador', label: 'Operador' },
  { href: '/registro', label: 'Registro' },
  { href: '/login', label: 'Ingresar' },
  { href: '/verificar-correo', label: 'Verificar correo' },
  { href: '/seguridad', label: 'Seguridad 2FA' },
  { href: '/admin/usuarios', label: 'Admin' },
] as const;

interface SiteHeaderProps {
  currentPath?: string;
}

export function SiteHeader({ currentPath }: SiteHeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-brand-group">
          <Link href="/" className="brand brand-link">
            Apuestas Deportivas UTPL
          </Link>
          <span className="version-tag">v{APP_VERSION} · Sandbox académico</span>
        </div>

        <nav aria-label="Navegación principal" className="topbar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPath === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={isActive ? 'nav-pill nav-pill-active' : 'nav-pill'}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
