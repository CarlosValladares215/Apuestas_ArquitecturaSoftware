import Link from 'next/link';
import { APP_VERSION } from '@apuestas/shared';

export function SiteFooter() {
  return (
    <footer role="contentinfo" className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <strong className="site-footer-title">
            Plataforma de Apuestas Deportivas UTPL · v{APP_VERSION}
          </strong>
          <p className="site-footer-copy">
            Entorno académico · +18 · Sin dinero real. Saldo derivado exclusivamente de ledger de
            doble entrada y validación servidor a servidor.
          </p>
        </div>

        <div className="site-footer-links" aria-label="Enlaces institucionales">
          <Link href="/" className="site-footer-link">
            Cartelera
          </Link>
          <Link href="/wallet" className="site-footer-link">
            Billetera
          </Link>
          <Link href="/seguridad" className="site-footer-link">
            Seguridad 2FA
          </Link>
          <Link href="/registro" className="site-footer-link">
            Registro (+18)
          </Link>
        </div>

        <p className="site-footer-meta">
          RBAC estricto (Apostador · Operador · Administrador) · Cookies httpOnly · Proyecto
          Arquitectura de Software
        </p>
      </div>
    </footer>
  );
}
