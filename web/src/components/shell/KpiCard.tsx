import type { ReactNode } from 'react';

export type KpiAccent = 'emerald' | 'teal' | 'gold' | 'sky' | 'indigo' | 'coral';
export type KpiDelta = 'up' | 'down' | 'neutral';

// Accent → the demo's single-letter left-bar class (.stat.e / .t / .g / .s / .i / .c).
const ACCENT_CLASS: Record<KpiAccent, string> = {
  emerald: 'e', teal: 't', gold: 'g', sky: 's', indigo: 'i', coral: 'c',
};

/**
 * KpiCard — white card with a coloured left accent bar, a label, a big number,
 * and an optional coloured delta line with a direction arrow.
 * Mirrors the demo's `.stat` block.
 */
export function KpiCard({
  label,
  value,
  delta,
  deltaDir = 'neutral',
  accent = 'emerald',
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  deltaDir?: KpiDelta;
  accent?: KpiAccent;
}) {
  const arrow = deltaDir === 'up' ? '▲' : deltaDir === 'down' ? '▼' : '';
  const deltaClass = deltaDir === 'up' ? 'up' : deltaDir === 'down' ? 'down' : 'neu';
  return (
    <div className={`stat ${ACCENT_CLASS[accent]}`}>
      <div className="lab">{label}</div>
      <div className="val">{value}</div>
      {delta != null && (
        <div className={`chg ${deltaClass}`}>
          {arrow && <span>{arrow}</span>}
          {delta}
        </div>
      )}
    </div>
  );
}
