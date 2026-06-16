/**
 * Tiny fetch helpers. All URLs are same-origin paths; Vite proxies /plots and
 * /api to the NestJS backend on :3000 (see vite.config.ts).
 */

export interface ArrearsBucket {
  bucket: string;
  label: string;
  accounts: number;
  total: number;
}

export interface Debtor {
  accountId: string;
  reference: string;
  customer: string;
  balance: number;
  currency: string;
  daysOverdue: number;
}

export interface PlotGeometry {
  type: string; // 'Polygon'
  coordinates: number[][][]; // rings of [lng, lat]
}

export interface Plot {
  plotId: string;
  plotNumber: string;
  development: string;
  plotType: string;
  areaSqm: number | null;
  areaHa: number | null;
  price: number | null;
  currency: string;
  status: 'available' | 'reserved' | 'sold' | 'transferred' | 'withheld';
  gpsLat: number | null;
  gpsLng: number | null;
  geojson: PlotGeometry | null;
}

export interface ReserveResult {
  reservationId: string;
}

// -- Leasing (Module C) -------------------------------------------------------

export type ArrearsRisk = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export interface RentRollRow {
  premisesId: string;
  premises: string;
  vacant: boolean;
  leaseId: string | null;
  tenant: string | null;
  monthlyRent: number | null;
  currency: string | null;
  lastInvoiceDate: string | null;
  billedThisMonth: number;
  collected: number;
  arrearsTotal: number;
  daysOverdue: number;
  riskCategory: ArrearsRisk;
}

export interface RentRoll {
  asOf: string;
  period: string;
  rows: RentRollRow[];
  summary: {
    occupied: number;
    vacant: number;
    totalBilledThisMonth: number;
    totalCollected: number;
    totalArrears: number;
  };
}

export interface LeaseInvoice {
  invoiceId: string;
  reference: string;
  type: string;
  amount: number;
  amountPaid: number;
  dueDate: string;
  status: string;
}

export interface MaintenanceRequest {
  requestId: string;
  category: string | null;
  priority: string;
  status: string;
  description: string | null;
  slaDue: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface LeaseStatement {
  lease: {
    leaseId: string;
    premises: string;
    tenant: string;
    status: string;
    rentAmount: number;
    currency: string;
    startDate: string;
    endDate: string;
    marketRate: number | null;
    underRented: boolean;
  };
  account: { accountId: string; reference: string; balance: number } | null;
  totals: { billed: number; paid: number; outstanding: number };
  invoices: LeaseInvoice[];
  ledger: unknown[];
  maintenance: MaintenanceRequest[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  return res.json() as Promise<T>;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.message === 'string') return data.message;
    if (Array.isArray(data?.message)) return data.message.join(', ');
  } catch {
    /* not JSON */
  }
  return `${res.status} ${res.statusText}`;
}

export const api = {
  arrearsAgeing: () => getJson<ArrearsBucket[]>('/api/finance/arrears-ageing'),
  topDebtors: () => getJson<Debtor[]>('/api/finance/top-debtors'),
  listPlots: (status?: string) =>
    getJson<Plot[]>(
      status ? `/plots?status=${encodeURIComponent(status)}` : '/plots',
    ),
  reservePlot: (
    plotId: string,
    body: {
      customerId: string;
      agentId: string;
      expiryMinutes?: number;
      actorId: string;
      actorRole: string;
    },
  ) => postJson<ReserveResult>(`/plots/${encodeURIComponent(plotId)}/reserve`, body),
  rentRoll: (asOf?: string) =>
    getJson<RentRoll>(
      asOf ? `/api/leases/rent-roll?asOf=${encodeURIComponent(asOf)}` : '/api/leases/rent-roll',
    ),
  leaseStatement: (leaseId: string) =>
    getJson<LeaseStatement>(`/leases/${encodeURIComponent(leaseId)}/statement`),
};
