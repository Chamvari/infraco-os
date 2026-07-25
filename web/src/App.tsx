import { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { ForcePasswordChange } from './components/ForcePasswordChange';
import { ForceMfaEnrol } from './components/ForceMfaEnrol';
import { ChangePasswordForm } from './components/ChangePasswordForm';
import { FinanceDashboard } from './components/FinanceDashboard';
import { PlotInventory } from './components/PlotInventory';
import { MapView } from './components/MapView';
import { ReservationFlow } from './components/ReservationFlow';
import { LeasingDashboard } from './components/LeasingDashboard';
import { useAuth } from './auth';
import { can } from './roles';
import {
  api,
  type CollectionsSummary,
  type ArrearsBucket,
  type Plot,
  type ApprovalRecord,
} from './api';
import { AppShell, type NavSection } from './components/shell/AppShell';
import { KpiCard } from './components/shell/KpiCard';
import { Panel } from './components/shell/Panel';
import { StatusTag } from './components/shell/StatusTag';
import { ProgressBar } from './components/shell/ProgressBar';

// Static nav for now — pages get wired into these ids in a later pass.
const NAV: NavSection[] = [
  {
    label: 'Operations',
    items: [
      { id: 'dashboard', icon: '📊', label: 'Dashboard' },
      { id: 'sitemap', icon: '🗺️', label: 'Site map' },
      { id: 'debtors', icon: '💳', label: 'Debtors' },
      { id: 'development', icon: '🏗️', label: 'Development' },
      { id: 'compliance', icon: '🛡️', label: 'Compliance' },
      { id: 'smscentre', icon: '💬', label: 'SMS centre' },
    ],
  },
  {
    label: 'Channels',
    items: [
      { id: 'resident', icon: '📱', label: 'Resident app' },
      { id: 'tenant', icon: '🏢', label: 'Tenant portal' },
      { id: 'contractor', icon: '🏗️', label: 'Contractor' },
      { id: 'ussd', icon: '📟', label: 'USSD flow' },
      { id: 'sales', icon: '🌍', label: 'Sales site' },
      { id: 'exec', icon: '📈', label: 'Board view' },
    ],
  },
];

const TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Estate operations', subtitle: 'Kwekwe Estate · live' },
  debtors: { title: 'Debtors', subtitle: 'Arrears ageing & top debtors' },
  sitemap: { title: 'Site map', subtitle: 'Plot allocation & GIS' },
  sales: { title: 'Sales', subtitle: 'Plot inventory' },
  tenant: { title: 'Tenant portal', subtitle: 'Rent roll & leases' },
};

function initials(username?: string): string {
  if (!username) return '··';
  const parts = username.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const letters = (parts.length >= 2 ? parts[0][0] + parts[1][0] : username.slice(0, 2));
  return letters.toUpperCase();
}

// Gate: login → forced password change → forced MFA enrol → admin shell.
export function App() {
  const { user } = useAuth();
  if (!user) return <LoginPage />;
  if (user.mustChangePassword) return <ForcePasswordChange />;
  if (user.mustEnrolMfa) return <ForceMfaEnrol />;
  return <AdminApp />;
}

function AdminApp() {
  const { user, logout } = useAuth();
  const [active, setActive] = useState('dashboard');
  const [reservePlotId, setReservePlotId] = useState('');
  const [showChangePw, setShowChangePw] = useState(false);

  const canReserve = can(user, 'sales');

  // Reserving jumps to the Sales view with the chosen plot pre-filled.
  function goReserve(plotId: string) {
    setReservePlotId(plotId);
    setActive('sales');
  }
  function navigate(id: string) {
    setReservePlotId('');
    setActive(id);
  }

  const meta = TITLES[active] ?? {
    title: NAV.flatMap((s) => s.items).find((i) => i.id === active)?.label ?? '',
    subtitle: 'Coming soon',
  };

  let content;
  if (active === 'dashboard') content = <DashboardPreview />;
  else if (active === 'debtors') content = <FinanceDashboard />;
  else if (active === 'sitemap')
    content = <MapView onReserve={canReserve ? goReserve : undefined} />;
  else if (active === 'tenant') content = <LeasingDashboard />;
  else if (active === 'sales')
    content = reservePlotId ? (
      <>
        <button
          className="btn ghost small"
          style={{ marginBottom: 14 }}
          onClick={() => setReservePlotId('')}
        >
          ← Back to plots
        </button>
        <ReservationFlow initialPlotId={reservePlotId} onReserved={() => {}} />
      </>
    ) : (
      <PlotInventory onReserve={canReserve ? goReserve : undefined} />
    );
  else content = <Placeholder label={meta.title} />;

  return (
    <>
      <AppShell
        sections={NAV}
        activeId={active}
        onNavigate={navigate}
        title={meta.title}
        subtitle={meta.subtitle}
        month="Jun 2026"
        userInitials={initials(user?.username)}
        roleLabel={user?.roles?.[0] ?? 'Admin'}
        onSignOut={logout}
        onChangePassword={() => setShowChangePw(true)}
      >
        {content}
      </AppShell>

      {showChangePw && (
        <div
          onClick={() => setShowChangePw(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(14,23,38,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: 24,
              width: 'min(420px, 94vw)',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            <div className="brand" style={{ fontSize: 16, marginBottom: 12 }}>
              Change password
            </div>
            <ChangePasswordForm
              onCancel={() => setShowChangePw(false)}
              onDone={() => window.setTimeout(() => setShowChangePw(false), 900)}
            />
          </div>
        </div>
      )}
    </>
  );
}

const fmtUsd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// Live dashboard: every figure below comes from a real backend call. On a fresh
// database these start at/near zero — that's expected and correct.
function DashboardPreview() {
  const [collections, setCollections] = useState<CollectionsSummary | null>(null);
  const [arrears, setArrears] = useState<ArrearsBucket[] | null>(null);
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      api.collectionsSummary(),
      api.arrearsAgeing(),
      api.listPlots(),
      api.approvals('pending'),
    ]).then(([c, a, p, ap]) => {
      if (!live) return;
      if (c.status === 'fulfilled') setCollections(c.value);
      if (a.status === 'fulfilled') setArrears(a.value);
      if (p.status === 'fulfilled') setPlots(p.value);
      if (ap.status === 'fulfilled') setApprovals(ap.value);
      const failed = [c, a, p, ap].find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      if (failed) setError(failed.reason?.message ?? 'Some data failed to load');
    });
    return () => {
      live = false;
    };
  }, []);

  // Arrears book = overdue buckets only (everything except 'current').
  const overdue = (arrears ?? []).filter((b) => b.bucket !== 'current');
  const arrearsTotal = overdue.reduce((s, b) => s + b.total, 0);
  const arrearsAccts = overdue.reduce((s, b) => s + b.accounts, 0);
  const d90 = (arrears ?? []).find((b) => b.bucket === 'd90_plus');

  const total = plots?.length ?? 0;
  const sold = (plots ?? []).filter((p) => p.status === 'sold').length;
  const reserved = (plots ?? []).filter((p) => p.status === 'reserved').length;
  const available = (plots ?? []).filter((p) => p.status === 'available').length;

  return (
    <>
      {error && (
        <div className="panel" style={{ borderLeft: '4px solid var(--coral)', color: 'var(--coral-d)' }}>
          Couldn’t load some dashboard data: {error}
        </div>
      )}

      <div className="stats">
        <KpiCard
          label="Collections (MTD)"
          value={collections ? fmtUsd(collections.mtd) : '—'}
          accent="emerald"
          deltaDir={collections?.deltaPct != null && collections.deltaPct < 0 ? 'down' : 'up'}
          delta={
            collections == null
              ? undefined
              : collections.deltaPct != null
                ? `${collections.deltaPct}% vs last mo`
                : `${collections.mtdCount} payments`
          }
        />
        <KpiCard
          label="Arrears book"
          value={arrears ? fmtUsd(arrearsTotal) : '—'}
          accent="coral"
          deltaDir="down"
          delta={arrears ? `${arrearsAccts} accounts` : undefined}
        />
        <KpiCard
          label="Stands sold"
          value={plots ? sold.toLocaleString('en-US') : '—'}
          accent="teal"
          delta={plots ? `of ${total} · ${pct(sold, total)}%` : undefined}
        />
        <KpiCard
          label="Stands available"
          value={plots ? available.toLocaleString('en-US') : '—'}
          accent="sky"
          delta={plots ? `${reserved} reserved` : undefined}
        />
      </div>

      <div className="grid2">
        <Panel title="Pending approvals" icon="✅">
          {approvals == null ? (
            <div className="panel-row">
              <div className="t2">Loading…</div>
            </div>
          ) : approvals.length === 0 ? (
            <div className="panel-row">
              <div>
                <div className="t1">No pending approvals</div>
                <div className="t2">The DoA queue is clear</div>
              </div>
              <StatusTag kind="ok">Clear</StatusTag>
            </div>
          ) : (
            approvals.map((a) => (
              <div className="panel-row warn" key={a.approvalId}>
                <div>
                  <div className="t1">
                    {a.actionCode}
                    {a.amount ? ` · ${fmtUsd(a.amount)}` : ''}
                  </div>
                  <div className="t2">{a.entityRef ?? `Initiated ${a.initiatedAt.slice(0, 10)}`}</div>
                </div>
                <StatusTag kind="pend">Pending</StatusTag>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Inventory & arrears" icon="📈">
          <ProgressBar
            label="Stands sold"
            value={pct(sold, total)}
            valueLabel={`${sold} / ${total}`}
            color="var(--emerald)"
          />
          <ProgressBar
            label="Reserved"
            value={pct(reserved, total)}
            valueLabel={`${reserved} / ${total}`}
            color="var(--gold)"
          />
          <ProgressBar
            label="Overdue 90+ (of arrears)"
            value={pct(d90?.total ?? 0, arrearsTotal)}
            valueLabel={fmtUsd(d90?.total ?? 0)}
            color="var(--coral)"
          />
        </Panel>
      </div>
    </>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <Panel>
      <div style={{ padding: '40px 8px', textAlign: 'center', color: 'var(--mist)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🚧</div>
        <div style={{ fontWeight: 700, color: 'var(--slate)', fontSize: 15 }}>{label}</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>This page will be built into the shell next.</div>
      </div>
    </Panel>
  );
}
