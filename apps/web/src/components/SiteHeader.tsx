'use client';

import Link from 'next/link';
import { APP_VERSION } from '@apuestas/shared';
import { ROLE_METADATA, useSession } from '../context/session-context';
import { IconMenu } from './nav-icons';

interface SiteHeaderProps {
  currentPath?: string;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

const ROUTE_TITLES: Readonly<Record<string, string>> = {
  '/': 'Cartelera deportiva',
  '/wallet': 'Billetera y depósitos',
  '/operador': 'Panel de operador y cuotas',
  '/registro': 'Registro de apostador',
  '/login': 'Acceso seguro',
  '/verificar-correo': 'Verificación de correo',
  '/seguridad': 'Seguridad y 2FA TOTP',
  '/admin/usuarios': 'Administración RBAC y auditoría',
};

export function SiteHeader({
  currentPath,
  sidebarOpen,
  onToggleSidebar,
}: Readonly<SiteHeaderProps>) {
  const { user, loading, logout } = useSession();
  const sectionTitle = (currentPath ? ROUTE_TITLES[currentPath] : undefined) ?? 'Plataforma UTPL';
  const roleMeta = user ? ROLE_METADATA[user.role] : null;

  return (
    <header className="topbar" role="banner">
      <div className="topbar-inner">
        <div className="topbar-brand-group">
          {onToggleSidebar ? (
            <button
              type="button"
              className="mobile-menu-btn"
              aria-label={sidebarOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
              aria-expanded={Boolean(sidebarOpen)}
              aria-controls="app-sidebar"
              onClick={onToggleSidebar}
            >
              <IconMenu />
              <span>Menú</span>
            </button>
          ) : null}
          <Link href="/" className="brand brand-link">
            Apuestas Deportivas UTPL
          </Link>
          <span className="version-tag">
            {sectionTitle} · v{APP_VERSION}
          </span>
        </div>

        <div className="topbar-session" aria-live="polite">
          {loading ? (
            <span className="session-pill session-pill-guest">Verificando sesión...</span>
          ) : user && roleMeta ? (
            <>
              <span className="session-user-email">{user.email}</span>
              <span className={roleMeta.badgeClass}>Rol: {roleMeta.title}</span>
              <button
                type="button"
                className="btn-logout-inline"
                onClick={() => {
                  void logout();
                }}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <span className="session-pill session-pill-guest">Modo visitante</span>
              <Link href="/login" className="topbar-action-link">
                Ingresar
              </Link>
              <Link href="/registro" className="topbar-action-cta">
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
