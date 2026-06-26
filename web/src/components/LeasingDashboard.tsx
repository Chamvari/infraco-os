import { useEffect, useState } from 'react';
import {
  api,
  ArrearsRisk,
  LeaseStatement,
  RentRoll,
  RentRollRow,
} from '../api';

// Arrears risk ramp: green = current, amber = 1–30, escalating to red at 90+.
const RISK_COLOR: Record<ArrearsRisk, string> = {
  current: '#2e9e5b',
  d1_30: '#e0a800',
  d31_60: '#e8731a',
  d61_90: '#d9602a',
  d90_plus: '#d23f3f',
};

const RISK_LABEL: Record<ArrearsRisk, string> = {
  current: 'Current',
  d1_30: '1–30 days',
  d31_60: '31–60 days',
  d61_90: '61–90 days',
  d90_plus: '90+ days',
};

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SortDir = 'desc' | 'asc';

export function LeasingDashboard() {
  const [roll, setRoll] = useState<RentRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<RentRollRow | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRoll(await api.rentRoll());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // A selected occupied row opens the lease-detail view.
  if (selected && selected.leaseId) {
    return (
      <LeaseDetail
        leaseId={selected.leaseId}
        onBack={() => setSelected(null)}
      />
    );
  }

  const rows = roll ? sortByArrears(roll.rows, sortDir) : [];
  const s = roll?.summary;

  return (
    <section>
      <div className="section-head" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {roll && (
        <div className="hint" style={{ marginBottom: 12 }}>
          Period {roll.period} · as of {roll.asOf}
        </div>
      )}

      {error && (
        <div className="banner error">
          Couldn’t load the rent roll: {error}
          <div className="banner-hint">
            Is the backend running on <code>localhost:3000</code>?
          </div>
        </div>
      )}

      <div className="cards">
        <div className="card kpi">
          <div className="kpi-label">Occupied / vacant</div>
          <div className="kpi-value">
            {s ? `${s.occupied} / ${s.vacant}` : '—'}
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Billed this month</div>
          <div className="kpi-value">{s ? money(s.totalBilledThisMonth) : '—'}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Collected</div>
          <div className="kpi-value">{s ? money(s.totalCollected) : '—'}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Total arrears</div>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>
            {s ? money(s.totalArrears) : '—'}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Rent roll</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Premises</th>
              <th>Tenant</th>
              <th className="num">Monthly rent</th>
              <th className="num">Billed</th>
              <th className="num">Collected</th>
              <th
                className="num sortable"
                onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                title="Sort by arrears"
              >
                Arrears {sortDir === 'desc' ? '▼' : '▲'}
              </th>
              <th className="num">Days</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {roll && rows.length > 0 ? (
              rows.map((r) => (
                <tr
                  key={r.premisesId}
                  className={r.vacant ? 'row-vacant' : 'row-click'}
                  onClick={() => !r.vacant && setSelected(r)}
                >
                  <td>
                    <span
                      className="risk-bar"
                      style={{ background: r.vacant ? 'var(--line)' : RISK_COLOR[r.riskCategory] }}
                    />
                    {r.premises}
                  </td>
                  <td>
                    {r.vacant ? <span className="status status-available">Vacant</span> : r.tenant}
                  </td>
                  <td className="num">{r.monthlyRent != null ? money(r.monthlyRent) : '—'}</td>
                  <td className="num">{money(r.billedThisMonth)}</td>
                  <td className="num">{money(r.collected)}</td>
                  <td className="num">
                    {r.arrearsTotal > 0 ? (
                      <strong style={{ color: 'var(--danger)' }}>{money(r.arrearsTotal)}</strong>
                    ) : (
                      money(r.arrearsTotal)
                    )}
                  </td>
                  <td className="num">{r.daysOverdue}</td>
                  <td>
                    {r.vacant ? (
                      <span className="hint">—</span>
                    ) : (
                      <span
                        className="risk-pill"
                        style={{ background: RISK_COLOR[r.riskCategory] }}
                      >
                        {RISK_LABEL[r.riskCategory]}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="empty">
                  {loading ? 'Loading…' : 'No premises found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="legend">
          {(Object.keys(RISK_LABEL) as ArrearsRisk[]).map((k) => (
            <span key={k} className="legend-item">
              <span className="dot" style={{ background: RISK_COLOR[k] }} />
              {RISK_LABEL[k]}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function sortByArrears(rows: RentRollRow[], dir: SortDir): RentRollRow[] {
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => sign * (a.arrearsTotal - b.arrearsTotal));
}

// -- Lease detail -------------------------------------------------------------

function LeaseDetail({ leaseId, onBack }: { leaseId: string; onBack: () => void }) {
  const [stmt, setStmt] = useState<LeaseStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api
      .leaseStatement(leaseId)
      .then((s) => live && setStmt(s))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [leaseId]);

  return (
    <section>
      <div className="section-head">
        <button className="btn ghost small" onClick={onBack}>
          ← Back to rent roll
        </button>
        <button className="btn ghost" disabled>
          {loading ? 'Loading…' : ' '}
        </button>
      </div>

      {error && (
        <div className="banner error">Couldn’t load the lease statement: {error}</div>
      )}

      {stmt && (
        <>
          <div className="section-head">
            <h1>
              {stmt.lease.premises} · {stmt.lease.tenant}
            </h1>
            <span className="status status-sold">{stmt.lease.status}</span>
          </div>

          <div className="cards">
            <div className="card kpi">
              <div className="kpi-label">Monthly rent</div>
              <div className="kpi-value">
                {stmt.lease.currency} {money(stmt.lease.rentAmount)}
              </div>
              {stmt.lease.underRented && stmt.lease.marketRate != null && (
                <div className="hint" style={{ color: 'var(--danger)' }}>
                  Under market ({money(stmt.lease.marketRate)})
                </div>
              )}
            </div>
            <div className="card kpi">
              <div className="kpi-label">Outstanding</div>
              <div className="kpi-value" style={{ color: 'var(--danger)' }}>
                {money(stmt.totals.outstanding)}
              </div>
            </div>
            <div className="card kpi">
              <div className="kpi-label">Term</div>
              <div className="kpi-value" style={{ fontSize: 16 }}>
                {stmt.lease.startDate} → {stmt.lease.endDate}
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Invoice history</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Due</th>
                  <th className="num">Amount</th>
                  <th className="num">Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stmt.invoices.length > 0 ? (
                  stmt.invoices.map((i) => (
                    <tr key={i.invoiceId}>
                      <td className="mono">{i.reference}</td>
                      <td style={{ textTransform: 'capitalize' }}>{i.type}</td>
                      <td>{i.dueDate}</td>
                      <td className="num">{money(i.amount)}</td>
                      <td className="num">{money(i.amountPaid)}</td>
                      <td>
                        <span
                          className={
                            i.status === 'overdue'
                              ? 'status status-withheld'
                              : i.status === 'paid'
                                ? 'status status-available'
                                : 'status status-reserved'
                          }
                        >
                          {i.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="empty">
                      No invoices on this lease yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Maintenance requests</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Raised</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>SLA due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stmt.maintenance.length > 0 ? (
                  stmt.maintenance.map((m) => (
                    <tr key={m.requestId}>
                      <td>{m.createdAt.slice(0, 10)}</td>
                      <td>{m.category ?? '—'}</td>
                      <td style={{ textTransform: 'capitalize' }}>{m.priority}</td>
                      <td>{m.slaDue ? m.slaDue.slice(0, 10) : '—'}</td>
                      <td style={{ textTransform: 'capitalize' }}>{m.status}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty">
                      No maintenance requests on this premises.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
