'use client';

import Link from 'next/link';
import { type JSX, useEffect } from 'react';
import { APP_VERSION, AppRole } from '@apuestas/shared';
import { ROLE_METADATA, useSession } from '../context/session-context';
import {
  IconBoard,
  IconClose,
  IconLogin,
  IconMailCheck,
  IconShield,
  IconSliders,
  IconUserPlus,
  IconUsers,
  IconWallet,
} from './nav-icons';

interface SidebarNavItem {
  href: string;
  label: string;
  icon: JSX.Element;
}

interface SidebarSection {
  title: string;
  items: SidebarNavItem[];
}

function buildNavSections(role: AppRole | null): SidebarSection[] {
  if (!role) {
    return [
      {
        title: 'Explorar',
        items: [{ href: '/', label: 'Cartelera', icon: <IconBoard className="nav-icon" /> }],
      },
      {
        title: 'Tu cuenta',
        items: [
          { href: '/login', label: 'Ingresar', icon: <IconLogin className="nav-icon" /> },
          { href: '/registro', label: 'Crear cuenta', icon: <IconUserPlus className="nav-icon" /> },
          {
            href: '/verificar-correo',
            label: 'Verificar correo',
            icon: <IconMailCheck className="nav-icon" />,
          },
        ],
      },
    ];
  }

  const sections: SidebarSection[] = [
    {
      title: 'Tu cuenta',
      items: [
        { href: '/', label: 'Cartelera', icon: <IconBoard className="nav-icon" /> },
        { href: '/wallet', label: 'Mi Billetera', icon: <IconWallet className="nav-icon" /> },
        { href: '/seguridad', label: 'Seguridad 2FA', icon: <IconShield className="nav-icon" /> },
      ],
    },
  ];

  if (role === 'operator' || role === 'admin') {
    sections.push({
      title: 'Operación deportiva',
      items: [
        {
          href: '/operador',
          label: 'Panel de Operador',
          icon: <IconSliders className="nav-icon" />,
        },
      ],
    });
  }

  if (role === 'admin') {
    sections.push({
      title: 'Administración',
      items: [
        {
          href: '/admin/usuarios',
          label: 'Usuarios y Auditoría',
          icon: <IconUsers className="nav-icon" />,
        },
      ],
    });
  }

  return sections;
}

interface SiteSidebarProps {
  currentPath?: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function SiteSidebar({
  currentPath,
  mobileOpen,
  onCloseMobile,
}: Readonly<SiteSidebarProps>) {
  const { user } = useSession();

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseMobile();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen, onCloseMobile]);

  const sections = buildNavSections(user?.role ?? null);
  const currentRoleMeta = user ? ROLE_METADATA[user.role] : null;

  return (
    <aside id="app-sidebar" className={mobileOpen ? 'app-sidebar app-sidebar-open' : 'app-sidebar'}>
      <div className="sidebar-brand-row">
        <Link href="/" className="sidebar-brand" onClick={onCloseMobile}>
          <span className="sidebar-brand-dot" aria-hidden="true" />
          <span>
            <strong className="sidebar-brand-title">UTPL Sportsbook</strong>
            <small className="sidebar-brand-sub">v{APP_VERSION} · Sandbox +18</small>
          </span>
        </Link>

        <button
          type="button"
          className="sidebar-close-btn"
          aria-label="Cerrar menú lateral"
          onClick={onCloseMobile}
        >
          <IconClose />
        </button>
      </div>

      <nav aria-label="Navegación por rol" className="sidebar-nav">
        {sections.map((section) => (
          <div key={section.title} className="sidebar-section">
            <p className="sidebar-section-label">{section.title}</p>
            <ul className="sidebar-list">
              {section.items.map((item) => {
                const isActive = currentPath === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={isActive ? 'sidebar-link sidebar-link-active' : 'sidebar-link'}
                      onClick={onCloseMobile}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="sidebar-role-card" aria-label="Roles de acceso en la plataforma">
          <p className="sidebar-role-heading">
            {currentRoleMeta ? `Sesión activa: ${currentRoleMeta.title}` : 'Roles del sistema'}
          </p>
          {currentRoleMeta ? (
            <p className="sidebar-role-desc">{currentRoleMeta.summary}</p>
          ) : (
            <ul className="sidebar-roles-summary">
              <li>
                <strong>Apostador:</strong> cartelera, billetera y 2FA (registro público).
              </li>
              <li>
                <strong>Operador:</strong> gestión de partidos, cuotas y sync en vivo.
              </li>
              <li>
                <strong>Administrador:</strong> roles RBAC y auditoría inmutable.
              </li>
            </ul>
          )}
        </div>
      </nav>
    </aside>
  );
}
