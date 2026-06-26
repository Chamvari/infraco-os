import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Reservation flow — POST /plots/:id/reserve (STND-SALE-001).
 * The backend serialises concurrent attempts via sales.reserve_plot and the
 * partial unique index; a conflict (plot not available) surfaces here.
 *
 * initialPlotId pre-fills the form when arriving from the plot inventory.
 */
export function ReservationFlow({
  initialPlotId = '',
  onReserved,
}: {
  initialPlotId?: string;
  onReserved?: () => void;
}) {
  const [plotId, setPlotId] = useState(initialPlotId);
  const [customerId, setCustomerId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [actorId, setActorId] = useState('');
  const [actorRole, setActorRole] = useState('sales_agent');
  const [expiryMinutes, setExpiryMinutes] = useState(1440);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pick up a plot chosen from the inventory tab.
  useEffect(() => {
    if (initialPlotId) {
      setPlotId(initialPlotId);
      setResult(null);
      setError(null);
    }
  }, [initialPlotId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.reservePlot(plotId.trim(), {
        customerId: customerId.trim(),
        agentId: agentId.trim(),
        actorId: actorId.trim(),
        actorRole: actorRole.trim(),
        expiryMinutes,
      });
      setResult(res.reservationId);
      onReserved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    plotId.trim() && customerId.trim() && actorId.trim() && actorRole.trim();

  return (
    <section>
      <div className="card">
        <form className="form" onSubmit={onSubmit}>
          <label>
            Plot ID
            <input
              value={plotId}
              onChange={(e) => setPlotId(e.target.value)}
              placeholder="UUID of the plot"
              required
            />
          </label>
          <label>
            Customer ID
            <input
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="UUID of the prospect"
              required
            />
          </label>
          <label>
            Agent ID
            <input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="UUID of the agent (optional)"
            />
          </label>
          <div className="form-row">
            <label>
              Actor ID
              <input
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
                placeholder="Acting user UUID (audit)"
                required
              />
            </label>
            <label>
              Actor role
              <input
                value={actorRole}
                onChange={(e) => setActorRole(e.target.value)}
                required
              />
            </label>
            <label>
              Hold (minutes)
              <input
                type="number"
                min={1}
                value={expiryMinutes}
                onChange={(e) => setExpiryMinutes(Number(e.target.value))}
              />
            </label>
          </div>

          <button className="btn" type="submit" disabled={!canSubmit || busy}>
            {busy ? 'Reserving…' : 'Reserve plot'}
          </button>
        </form>

        {result && (
          <div className="banner success">
            Reserved. Reservation ID: <span className="mono">{result}</span>
          </div>
        )}
        {error && <div className="banner error">Reservation failed: {error}</div>}
      </div>

      <p className="hint">
        Tip: a plot can hold at most one active reservation (STND-INV-004). Trying
        to reserve one that isn’t <code>available</code> returns a conflict.
      </p>
    </section>
  );
}
