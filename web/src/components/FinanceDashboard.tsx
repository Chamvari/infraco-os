import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, ArrearsBucket, Debtor } from '../api';

// Severity ramp for the ageing buckets (green -> red).
const BUCKET_COLOR: Record<string, string> = {
  current: '#2e9e5b',
  d1_30: '#9bbf30',
  d31_60: '#e0a800',
  d61_90: '#e8731a',
  d90_plus: '#d23f3f',
};

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function FinanceDashboard() {
  const [ageing, setAgeing] = useState<ArrearsBucket[] | null>(null);
  const [debtors, setDebtors] = useState<Debtor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [a, d] = await Promise.all([api.arrearsAgeing(), api.topDebtors()]);
      setAgeing(a);
      setDebtors(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totalArrears = ageing
    ? ageing.filter((b) => b.bucket !== 'current').reduce((s, b) => s + b.total, 0)
    : 0;

  return (
    <section>
      <div className="section-head" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="banner error">
          Couldn’t load data: {error}
          <div className="banner-hint">
            Is the backend running on <code>localhost:3000</code>?
          </div>
        </div>
      )}

      <div className="cards">
        <div className="card kpi">
          <div className="kpi-label">Total arrears (overdue)</div>
          <div className="kpi-value">{money(totalArrears)}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Accounts in arrears</div>
          <div className="kpi-value">
            {ageing
              ? ageing
                  .filter((b) => b.bucket !== 'current')
                  .reduce((s, b) => s + b.accounts, 0)
              : '—'}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Arrears ageing</h2>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={ageing ?? []} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => money(Number(v))} width={90} />
              <Tooltip
                formatter={(value: number) => money(Number(value))}
                labelFormatter={(l) => `Ageing: ${l}`}
              />
              <Bar dataKey="total" name="Outstanding" radius={[4, 4, 0, 0]}>
                {(ageing ?? []).map((b) => (
                  <Cell key={b.bucket} fill={BUCKET_COLOR[b.bucket] ?? '#888'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2>Top debtors</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Account</th>
              <th className="num">Balance</th>
              <th className="num">Days overdue</th>
            </tr>
          </thead>
          <tbody>
            {debtors && debtors.length > 0 ? (
              debtors.map((d) => (
                <tr key={d.accountId}>
                  <td>{d.customer}</td>
                  <td className="mono">{d.reference}</td>
                  <td className="num">
                    {d.currency} {money(d.balance)}
                  </td>
                  <td className="num">
                    <span className={d.daysOverdue > 0 ? 'pill overdue' : 'pill'}>
                      {d.daysOverdue}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="empty">
                  {loading ? 'Loading…' : 'No debtors with an outstanding balance.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
