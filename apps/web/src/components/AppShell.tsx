'use client';

import { ReactNode, useState } from 'react';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { SiteSidebar } from './SiteSidebar';

interface AppShellProps {
  currentPath: string;
  children: ReactNode;
}

export function AppShell({ currentPath, children }: Readonly<AppShellProps>) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <SiteSidebar
        currentPath={currentPath}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => {
          setMobileMenuOpen(false);
        }}
      />

      {mobileMenuOpen ? (
        <div
          className="sidebar-backdrop"
          aria-hidden="true"
          onClick={() => {
            setMobileMenuOpen(false);
          }}
        />
      ) : null}

      <div className="app-workspace">
        <SiteHeader
          currentPath={currentPath}
          sidebarOpen={mobileMenuOpen}
          onToggleSidebar={() => {
            setMobileMenuOpen((prev) => !prev);
          }}
        />
        <div className="app-content">{children}</div>
        <SiteFooter />
      </div>
    </div>
  );
}
