import { useEffect, useState } from 'react';
import { FinanceDashboard } from './components/FinanceDashboard';
import { PlotInventory } from './components/PlotInventory';
import { MapView } from './components/MapView';
import { ReservationFlow } from './components/ReservationFlow';
import { LeasingDashboard } from './components/LeasingDashboard';

type Tab = 'finance' | 'leasing' | 'plots' | 'map' | 'reserve';

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

export function App() {
  const [tab, setTabState] = useState<Tab>(tabFromPath);
  const [reservePlotId, setReservePlotId] = useState('');

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
          <button
            className={tab === 'finance' ? 'tab active' : 'tab'}
            onClick={() => setTab('finance')}
          >
            Finance
          </button>
          <button
            className={tab === 'leasing' ? 'tab active' : 'tab'}
            onClick={() => setTab('leasing')}
          >
            Leasing
          </button>
          <button
            className={tab === 'plots' ? 'tab active' : 'tab'}
            onClick={() => setTab('plots')}
          >
            Plots
          </button>
          <button
            className={tab === 'map' ? 'tab active' : 'tab'}
            onClick={() => setTab('map')}
          >
            Map
          </button>
          <button
            className={tab === 'reserve' ? 'tab active' : 'tab'}
            onClick={() => setTab('reserve')}
          >
            Reserve a plot
          </button>
        </nav>
      </header>

      <main className="content">
        {tab === 'finance' && <FinanceDashboard />}
        {tab === 'leasing' && <LeasingDashboard />}
        {tab === 'plots' && <PlotInventory onReserve={reserveFromInventory} />}
        {tab === 'map' && <MapView onReserve={reserveFromInventory} />}
        {tab === 'reserve' && (
          <ReservationFlow
            initialPlotId={reservePlotId}
            onReserved={() => setReservePlotId('')}
          />
        )}
      </main>
    </div>
  );
}
