/**
 * ProgressBar — labelled track with a coloured fill, mirroring the demo's
 * `.bar-row` / `.bar-top` / `.bar` block. `value` is a 0–100 percentage;
 * `color` accepts any CSS colour (default emerald) so callers can theme the fill.
 */
export function ProgressBar({
  label,
  value,
  valueLabel,
  color = 'var(--emerald)',
}: {
  label?: string;
  value: number;
  valueLabel?: string;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const showTop = label != null || valueLabel != null;
  return (
    <div className="bar-row">
      {showTop && (
        <div className="bar-top">
          <span className="nm">{label}</span>
          <span className="vl">{valueLabel ?? `${Math.round(pct)}%`}</span>
        </div>
      )}
      <div className="bar">
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
