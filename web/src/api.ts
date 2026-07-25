/**
 * Tiny fetch helpers. All URLs are same-origin paths; Vite proxies /auth,
 * /plots, /leases and /api to the NestJS backend on :3000 (see vite.config.ts).
 *
 * Every request carries the bearer token from the session store (Module Z
 * requires it on all routes except /auth/login). A 401 means the token is
 * missing/expired, so we clear the session — the AuthProvider reacts and bounces
 * the user back to the login screen.
 */
import { clearSession, getToken, type SessionUser } from './session';

// -- Auth (Module Z) ----------------------------------------------------------

export interface LoginResponse {
  accessToken: string;
  user: SessionUser;
  mustChangePassword: boolean;
  mfaRequired: boolean;
  mustEnrolMfa: boolean;
}

export interface MfaEnrolResponse {
  secret: string;
  otpauthUri: string;
}

export interface ArrearsBucket {
  bucket: string;
  label: string;
  accounts: number;
  total: number;
}

export interface CollectionsSummary {
  currency: string;
  mtd: number;
  mtdCount: number;
  prevMonth: number;
  deltaPct: number | null;
}

// DoA approval request (core.approval_request), as returned by GET /approvals.
export interface ApprovalRecord {
  approvalId: string;
  actionCode: string;
  entityRef: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  threshold: number | null;
  initiatedBy: string;
  initiatedAt: string;
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

/** Builds request headers, attaching the bearer token when we have one. */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json', ...extra };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Clears the session on 401 so the app falls back to the login screen. */
function handleUnauthorized(res: Response): void {
  if (res.status === 401) clearSession();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    handleUnauthorized(res);
    throw new Error(await errorMessage(res));
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    handleUnauthorized(res);
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
  login: (username: string, password: string) =>
    postJson<LoginResponse>('/auth/login', { username, password }),
  // A wrong current password / weak new password is a FORM error, not a session
  // expiry — so change-password and mfa-verify deliberately do NOT clearSession()
  // on 401 (that would sign the user out mid-flow).
  changePassword: async (
    currentPassword: string,
    newPassword: string,
  ): Promise<LoginResponse> => {
    const res = await fetch('/auth/change-password', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    return res.json() as Promise<LoginResponse>;
  },
  mfaEnroll: () => postJson<MfaEnrolResponse>('/auth/mfa/enroll', {}),
  mfaVerify: async (code: string): Promise<LoginResponse> => {
    const res = await fetch('/auth/mfa/verify', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    return res.json() as Promise<LoginResponse>;
  },
  collectionsSummary: () =>
    getJson<CollectionsSummary>('/api/finance/collections-summary'),
  arrearsAgeing: () => getJson<ArrearsBucket[]>('/api/finance/arrears-ageing'),
  approvals: (status?: string) =>
    getJson<ApprovalRecord[]>(
      status ? `/approvals?status=${encodeURIComponent(status)}` : '/approvals',
    ),
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
