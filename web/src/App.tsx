import { useEffect, useState } from 'react';
import { FinanceDashboard } from './components/FinanceDashboard';
import { PlotInventory } from './components/PlotInventory';
import { MapView } from './components/MapView';
import { ReservationFlow } from './components/ReservationFlow';
import { LeasingDashboard } from './components/LeasingDashboard';
import { LoginPage } from './components/LoginPage';
import { useAuth } from './auth';
import { can, type Capability } from './roles';

type Tab = 'finance' | 'leasing' | 'plots' | 'map' | 'reserve';

// Tab catalogue. `cap` is the capability a user must hold for the tab to appear
// — mirrors the @Roles guard on the endpoint each tab calls, so the nav never
// offers a view the API would 403.
const TABS: { id: Tab; label: string; cap: Capability }[] = [
  { id: 'finance', label: 'Finance', cap: 'read_finance' },
  { id: 'leasing', label: 'Leasing', cap: 'read_finance' },
  { id: 'plots', label: 'Plots', cap: 'read_sales' },
  { id: 'map', label: 'Map', cap: 'read_sales' },
  { id: 'reserve', label: 'Reserve a plot', cap: 'sales' },
];

// The app has no router; tabs are deep-linkable by syncing to the URL path so
// e.g. http://localhost:5173/leasing opens the Leasing tab directly.
const PATH_TO_TAB: Record<string, Tab> = {
  '/': 'finance',
  '/finance': 'finance',
  '/leasing': 'leasing',
  '/plots': 'plots',
  '/map': 'map',
  '/reserve': 'reserve',
};

function tabFromPath(): Tab {
  return PATH_TO_TAB[window.location.pathname] ?? 'finance';
}

// Gate: render the admin shell only for an authenticated principal, otherwise
// the login screen. Keeping this thin wrapper separate from Shell means all of
// Shell's hooks run unconditionally (rules of hooks).
export function App() {
  const { user } = useAuth();
  return user ? <Shell /> : <LoginPage />;
}

function Shell() {
  const { user, logout } = useAuth();
  const [tab, setTabState] = useState<Tab>(tabFromPath);
  const [reservePlotId, setReservePlotId] = useState('');

  // Only the tabs this user's roles permit. A deep link (or a stale tab after
  // sign-out/in) to a forbidden view falls back to the first allowed tab.
  const visibleTabs = TABS.filter((t) => can(user, t.cap));
  const canReserve = can(user, 'sales');
  const activeTab = visibleTabs.some((t) => t.id === tab)
    ? tab
    : visibleTabs[0]?.id;

  function setTab(next: Tab) {
    setTabState(next);
    const path = next === 'finance' ? '/' : `/${next}`;
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
  }

  // Keep the tab in sync with browser back/forward.
  useEffect(() => {
    const onPop = () => setTabState(tabFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function reserveFromInventory(plotId: string) {
    setReservePlotId(plotId);
    setTab('reserve');
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          InfraCo OS <span className="brand-sub">Admin</span>
        </div>
        <nav className="tabs">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              className={activeTab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="session">
          <span className="session-user">
            {user?.username}
            {user?.roles?.[0] && (
              <span className="session-role">{user.roles[0]}</span>
            )}
          </span>
          <button className="btn ghost small" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="content">
        {!activeTab && (
          <div className="card empty-role">
            <h1>No dashboards available</h1>
            <p className="hint">
              Your role has no views enabled here. Contact an administrator if
              you believe this is a mistake.
            </p>
          </div>
        )}
        {activeTab === 'finance' && <FinanceDashboard />}
        {activeTab === 'leasing' && <LeasingDashboard />}
        {activeTab === 'plots' && (
          <PlotInventory
            onReserve={canReserve ? reserveFromInventory : undefined}
          />
        )}
        {activeTab === 'map' && (
          <MapView onReserve={canReserve ? reserveFromInventory : undefined} />
        )}
        {activeTab === 'reserve' && canReserve && (
          <ReservationFlow
            initialPlotId={reservePlotId}
            onReserved={() => setReservePlotId('')}
          />
        )}
      </main>
    </div>
  );
}
