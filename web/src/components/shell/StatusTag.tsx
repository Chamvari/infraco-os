import type { ReactNode } from 'react';

// ok = emerald, pend = gold, info = sky, red = coral (matches the demo's .tag.*).
export type StatusKind = 'ok' | 'pend' | 'info' | 'red';

/** StatusTag — small rounded pill in one of the four status colours. */
export function StatusTag({
  kind,
  children,
}: {
  kind: StatusKind;
  children: ReactNode;
}) {
  return <span className={`tag ${kind}`}>{children}</span>;
}
