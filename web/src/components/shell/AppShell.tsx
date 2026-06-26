import type { ReactNode } from 'react';

export type NavItem = { id: string; icon: string; label: string };
export type NavSection = { label: string; items: NavItem[] };

/**
 * AppShell — the dark #0E1726 left sidebar (brand + labelled nav sections +
 * sign-out) and the main column with a sticky top bar (title/subtitle on the
 * left; month pill + user avatar on the right). Content renders in `.wrap`.
 * Mirrors the demo's .nav / .main / .top structure.
 */
export function AppShell({
  sections,
  activeId,
  onNavigate,
  title,
  subtitle,
  month,
  userInitials,
  roleLabel = 'Admin',
  onSignOut,
  children,
}: {
  sections: NavSection[];
  activeId: string;
  onNavigate: (id: string) => void;
  title: string;
  subtitle?: string;
  month: string;
  userInitials: string;
  roleLabel?: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className="ic-shell">
      <nav className="nav">
        <div className="brand">
          <div className="brand-logo">IC</div>
          <div>
            <div className="brand-name">InfraCo OS</div>
            <div className="brand-sub">{roleLabel}</div>
          </div>
        </div>

        {sections.map((section) => (
          <div key={section.label}>
            <div className="nav-label">{section.label}</div>
            {section.items.map((item) => (
              <button
                key={item.id}
                className={`nav-item${item.id === activeId ? ' active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <span className="ic">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}

        <button className="nav-logout" onClick={onSignOut}>
          <span className="ic">⏏</span>
          <span>Sign out</span>
        </button>
      </nav>

      <div className="main">
        <div className="top">
          <div>
            <h1>{title}</h1>
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          <div className="top-right">
            <span className="pill">● {month}</span>
            <div className="avatar">{userInitials}</div>
          </div>
        </div>
        <div className="wrap">{children}</div>
      </div>
    </div>
  );
}
