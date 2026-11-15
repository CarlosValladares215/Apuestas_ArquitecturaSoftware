import { APP_ROLES, APP_VERSION } from '@apuestas/shared';

interface ServiceItem {
  name: string;
  role: string;
  endpoint: string;
}

const PLATFORM_SERVICES: readonly ServiceItem[] = [
  {
    name: 'Aplicación Web',
    role: 'Next.js — Solo presentación y boletos',
    endpoint: 'Vercel',
  },
  {
    name: 'API Principal',
    role: 'NestJS — Autoridad de dinero, cuotas y liquidación',
    endpoint: 'GET /health',
  },
  {
    name: 'Servicio de Reportes',
    role: 'FastAPI + pandas — Lectura analítica aislada',
    endpoint: 'GET /health',
  },
];

export default function HomePage() {
  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Apuestas Deportivas UTPL</span>
          <span className="version-tag">Base v{APP_VERSION} · Sandbox académico</span>
        </div>
      </header>

      <main className="main-container">
        <section aria-labelledby="hero-title">
          <h1 id="hero-title" className="hero-title">
            Plataforma de apuestas deportivas con seguridad verificable
          </h1>
          <p className="hero-copy">
            Fundaciones del monorepo operativas. Esta interfaz funciona en modo de solo
            presentación: todos los saldos, cuotas, validaciones y liquidaciones viven
            exclusivamente en el servidor.
          </p>

          <ul className="principles-list">
            <li className="principle-item">
              <strong className="principle-title">Integridad financiera</strong>
              <p className="principle-desc">
                Libro contable de doble entrada inmutable y confirmación de pagos servidor a
                servidor en entorno sandbox.
              </p>
            </li>
            <li className="principle-item">
              <strong className="principle-title">Roles constitucionales</strong>
              <p className="principle-desc">
                Control de acceso estricto para {APP_ROLES.join(', ')} con auditoría append-only.
              </p>
            </li>
          </ul>
        </section>

        <aside className="board-card" aria-labelledby="services-heading">
          <h2 id="services-heading" className="board-heading">
            Arquitectura de tres servicios
          </h2>
          <p className="board-subtitle">
            Entorno listo para que el equipo desarrolle las especificaciones siguientes.
          </p>

          <ul className="service-list">
            {PLATFORM_SERVICES.map((service) => (
              <li key={service.name} className="service-row">
                <div>
                  <span className="service-name">{service.name}</span>
                  <span className="service-role">{service.role}</span>
                </div>
                <span className="service-endpoint">{service.endpoint}</span>
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </div>
  );
}
