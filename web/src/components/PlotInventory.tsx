import { useEffect, useState } from 'react';
import { api, Plot } from '../api';

const STATUSES = ['all', 'available', 'reserved', 'sold', 'transferred', 'withheld'] as const;
type Filter = (typeof STATUSES)[number];

const money = (n: number | null, ccy: string) =>
  n == null ? '—' : `${ccy} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const area = (p: Plot) =>
  p.areaHa != null ? `${p.areaHa} ha` : p.areaSqm != null ? `${p.areaSqm} m²` : '—';

/**
 * Plot inventory — live allocation status per plot (STND-INV-002/003), the data
 * behind the GIS map (GIS-001). Available plots can be reserved straight from
 * the list, which hands the plot to the reservation form.
 */
export function PlotInventory({ onReserve }: { onReserve: (plotId: string) => void }) {
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setPlots(await api.listPlots(filter === 'all' ? undefined : filter));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <section>
      <div className="section-head">
        <h1>Plot inventory</h1>
        <button className="btn ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="filters">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={filter === s ? 'chip active' : 'chip'}
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {error && (
        <div className="banner error">
          Couldn’t load plots: {error}
          <div className="banner-hint">
            Is the backend running on <code>localhost:3000</code>?
          </div>
        </div>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Plot</th>
              <th>Development</th>
              <th>Type</th>
              <th className="num">Area</th>
              <th className="num">Price</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {plots && plots.length > 0 ? (
              plots.map((p) => (
                <tr key={p.plotId}>
                  <td className="mono">{p.plotNumber}</td>
                  <td>{p.development}</td>
                  <td>{p.plotType}</td>
                  <td className="num">{area(p)}</td>
                  <td className="num">{money(p.price, p.currency)}</td>
                  <td>
                    <span className={`status status-${p.status}`}>{p.status}</span>
                  </td>
                  <td className="num">
                    {p.status === 'available' && (
                      <button className="btn small" onClick={() => onReserve(p.plotId)}>
                        Reserve
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="empty">
                  {loading ? 'Loading…' : 'No plots for this filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
