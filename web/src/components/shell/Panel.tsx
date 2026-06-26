import type { ReactNode } from 'react';

/**
 * Panel — rounded white card with an optional icon + title heading.
 * Mirrors the demo's `.card` block (renamed to `.panel` to avoid colliding
 * with the legacy styles.css `.card`).
 */
export function Panel({
  title,
  icon,
  children,
}: {
  title?: string;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <div className="panel">
      {title && (
        <h3>
          {icon && <span className="ic">{icon}</span>}
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
