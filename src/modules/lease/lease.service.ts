import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AccountService } from '../account/account.service';
import { PaymentsService } from '../payments/payments.service';
import { LedgerService } from '../financial/ledger.service';
import {
  CURRENCY_CODES,
  LEASE_STATUSES,
  RENTAL_UTILITY_TYPES,
  CurrencyCode,
  LeaseStatus,
} from '../../common/enums';
import {
  CreateLeaseDto,
  CreatePremisesDto,
  RenewalAlertDto,
  RentRunDto,
  TransitionLeaseDto,
  UtilityChargeDto,
} from './lease.dto';
import {
  addYears,
  billingPeriodKey,
  effectiveRent,
  firstOfMonth,
} from './rent.util';
import { arrearsBucket, ArrearsRisk } from '../financial/instalment.util';

interface Actor {
  actorId: string;
  actorRole: string;
}

/**
 * Allowed lease lifecycle transitions (LEASE-003):
 *   Draft → Signed → Active → Renewal → Exit (Expired / Terminated)
 * A lease may be terminated from any non-terminal state. 'expired' and
 * 'terminated' are terminal.
 */
const LEASE_TRANSITIONS: Record<LeaseStatus, LeaseStatus[]> = {
  draft: ['signed', 'terminated'],
  signed: ['active', 'terminated'],
  active: ['renewal', 'expired', 'terminated'],
  renewal: ['active', 'expired', 'terminated'],
  expired: [],
  terminated: [],
};

/**
 * LeaseService — Module C, Leasing & Tenancy (SRS §6).
 *
 *   LEASE-001  digitise leases: premises, tenant, dates, rent, escalation, deposit, status
 *   LEASE-003  lifecycle: Draft → Signed → Active → Renewal → Exit
 *   LEASE-004  renewal alerts at configurable notice periods
 *   LEASE-005  market-rate benchmark to flag under-rented premises
 *   LEASE-INV-001 / FIN-RENT-001  on activation, bill rent monthly to the tenant account
 *   FIN-RENT-002  apply escalation automatically at the anniversary
 *   FIN-RENT-003  utility charges added to the rent invoice or raised separately
 *   FIN-RENT-004  per-tenant ledger and statement on demand
 *
 * Rent invoices are linked to the Payments Platform (Module H) and trigger an
 * arrears recompute via the unified ledger (Module A) — the same path the
 * instalment engine uses. Every write runs inside prisma.withActor() so the
 * audit trigger captures the actor (PLAT-AUDIT-001).
 */
@Injectable()
export class LeaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountService,
    private readonly payments: PaymentsService,
    private readonly ledger: LedgerService,
  ) {}

  // -- Premises ---------------------------------------------------------------

  async createPremises(
    dto: CreatePremisesDto,
  ): Promise<{ premisesId: string; name: string }> {
    if (!dto.name || dto.name.trim() === '') {
      throw new BadRequestException('name is required.');
    }
    try {
      return await this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ premises_id: string; name: string }[]>(
          `INSERT INTO lease.premises (development_id, name, description, area_sqm)
           VALUES ($1::uuid, $2, $3, $4)
           RETURNING premises_id, name`,
          dto.developmentId ?? null,
          dto.name.trim(),
          dto.description ?? null,
          dto.areaSqm ?? null,
        );
        return { premisesId: rows[0].premises_id, name: rows[0].name };
      });
    } catch (err: unknown) {
      if (this.pgCode(err) === '23503') {
        throw new NotFoundException(`Development ${dto.developmentId} not found.`);
      }
      throw err;
    }
  }

  async listPremises(): Promise<
    Array<{
      premisesId: string;
      name: string;
      development: string | null;
      areaSqm: number | null;
      activeLeaseId: string | null;
    }>
  > {
    const rows = await this.prisma.$queryRawUnsafe<
      {
        premises_id: string;
        name: string;
        development: string | null;
        area_sqm: string | null;
        active_lease_id: string | null;
      }[]
    >(
      `SELECT p.premises_id::text AS premises_id, p.name,
              d.name AS development, p.area_sqm::text AS area_sqm,
              l.lease_id::text AS active_lease_id
         FROM lease.premises p
         LEFT JOIN sales.development d ON d.development_id = p.development_id
         LEFT JOIN lease.lease l
                ON l.premises_id = p.premises_id AND l.status = 'active'
        ORDER BY p.name`,
    );
    return rows.map((r) => ({
      premisesId: r.premises_id,
      name: r.name,
      development: r.development,
      areaSqm: r.area_sqm == null ? null : Number(r.area_sqm),
      activeLeaseId: r.active_lease_id,
    }));
  }

  // -- Lease creation & lifecycle --------------------------------------------

  /** LEASE-001 — digitise/create a lease (status 'draft'). */
  async createLease(dto: CreateLeaseDto): Promise<{ leaseId: string; status: string }> {
    const currency: CurrencyCode = dto.currency ?? 'USD';
    if (!CURRENCY_CODES.includes(currency)) {
      throw new BadRequestException(`Invalid currency '${currency}'.`);
    }
    if (!(dto.rentAmount >= 0)) {
      throw new BadRequestException('rentAmount must be 0 or greater.');
    }
    if (dto.deposit != null && dto.deposit < 0) {
      throw new BadRequestException('deposit cannot be negative.');
    }
    const start = this.asDate(dto.startDate, 'startDate');
    const end = this.asDate(dto.endDate, 'endDate');
    if (end <= start) {
      throw new BadRequestException('endDate must be after startDate.');
    }

    try {
      return await this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ lease_id: string; status: string }[]>(
          `INSERT INTO lease.lease
             (premises_id, tenant_id, account_id, start_date, end_date, rent_amount,
              currency, escalation_pct, escalation_anniv, deposit, market_rate, status)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::date, $6,
                   $7::fin.currency_code, $8, $9::date, $10, $11, 'draft')
           RETURNING lease_id, status`,
          dto.premisesId,
          dto.tenantId,
          dto.accountId ?? null,
          start,
          end,
          dto.rentAmount,
          currency,
          dto.escalationPct ?? null,
          dto.escalationAnniv ?? null,
          dto.deposit ?? 0,
          dto.marketRate ?? null,
        );
        return { leaseId: rows[0].lease_id, status: rows[0].status };
      });
    } catch (err: unknown) {
      const msg = this.pgMessage(err);
      if (msg.includes('lease_tenant_id_fkey')) {
        throw new NotFoundException(`Tenant ${dto.tenantId} not found.`);
      }
      if (msg.includes('lease_premises_id_fkey')) {
        throw new NotFoundException(`Premises ${dto.premisesId} not found.`);
      }
      if (msg.includes('lease_account_id_fkey')) {
        throw new NotFoundException(`Account ${dto.accountId} not found.`);
      }
      throw err;
    }
  }

  /**
   * LEASE-003 — advance a lease through its lifecycle. On activation, ensure a
   * rental account exists (provision one if needed, LEASE-INV-001) and default
   * the escalation anniversary to startDate + 1y when escalation is configured
   * but no anniversary was set. The DB partial unique index uq_active_lease
   * guarantees at most one active lease per premises.
   */
  async transitionLease(
    leaseId: string,
    dto: TransitionLeaseDto,
  ): Promise<{ leaseId: string; status: LeaseStatus; accountId: string | null }> {
    if (!LEASE_STATUSES.includes(dto.toStatus)) {
      throw new BadRequestException(`Invalid status '${dto.toStatus}'.`);
    }
    const actor: Actor = { actorId: dto.actorId, actorRole: dto.actorRole };

    const lease = await this.loadLeaseRow(leaseId);
    const from = lease.status as LeaseStatus;
    if (from === dto.toStatus) {
      return { leaseId, status: from, accountId: lease.account_id };
    }
    if (!LEASE_TRANSITIONS[from].includes(dto.toStatus)) {
      throw new BadRequestException(
        `Cannot move lease from '${from}' to '${dto.toStatus}'. ` +
          `Allowed: ${LEASE_TRANSITIONS[from].join(', ') || '(terminal state)'}.`,
      );
    }

    // On activation, provision the rental account if the lease has none yet.
    let accountId = lease.account_id;
    if (dto.toStatus === 'active' && !accountId) {
      const acct = await this.accounts.createAccount({
        customerId: lease.tenant_id,
        accountType: 'rental',
        actorId: dto.actorId,
        actorRole: dto.actorRole,
      });
      accountId = acct.accountId;
    }

    // Default the escalation anniversary to start + 1y on activation.
    let escalationAnniv = lease.escalation_anniv;
    if (
      dto.toStatus === 'active' &&
      lease.escalation_pct != null &&
      !escalationAnniv
    ) {
      escalationAnniv = addYears(lease.start_date, 1);
    }

    try {
      await this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE lease.lease
              SET status = $2::lease.lease_status,
                  account_id = $3::uuid,
                  escalation_anniv = $4::date
            WHERE lease_id = $1::uuid`,
          leaseId,
          dto.toStatus,
          accountId,
          escalationAnniv,
        );
      });
    } catch (err: unknown) {
      if (this.pgCode(err) === '23505' || this.pgMessage(err).includes('uq_active_lease')) {
        throw new ConflictException(
          'That premises already has an active lease (uq_active_lease).',
        );
      }
      throw err;
    }

    return { leaseId, status: dto.toStatus, accountId };
  }

  async listLeases(filter?: { status?: string }): Promise<
    Array<{
      leaseId: string;
      premises: string;
      tenant: string;
      status: string;
      rentAmount: number;
      currency: string;
      startDate: string;
      endDate: string;
    }>
  > {
    let status: LeaseStatus | null = null;
    if (filter?.status) {
      if (!LEASE_STATUSES.includes(filter.status as LeaseStatus)) {
        throw new BadRequestException(
          `Invalid status '${filter.status}'. Allowed: ${LEASE_STATUSES.join(', ')}.`,
        );
      }
      status = filter.status as LeaseStatus;
    }

    const rows = await this.prisma.$queryRawUnsafe<
      {
        lease_id: string;
        premises: string;
        tenant: string;
        status: string;
        rent_amount: string;
        currency: string;
        start_date: string;
        end_date: string;
      }[]
    >(
      `SELECT l.lease_id::text AS lease_id, p.name AS premises,
              c.first_name || ' ' || c.last_name AS tenant,
              l.status, l.rent_amount::text AS rent_amount, l.currency,
              l.start_date::text AS start_date, l.end_date::text AS end_date
         FROM lease.lease l
         JOIN lease.premises p ON p.premises_id = l.premises_id
         JOIN fin.customer c ON c.customer_id = l.tenant_id
        WHERE ($1::lease.lease_status IS NULL OR l.status = $1::lease.lease_status)
        ORDER BY l.start_date DESC, p.name`,
      status,
    );
    return rows.map((r) => ({
      leaseId: r.lease_id,
      premises: r.premises,
      tenant: r.tenant,
      status: r.status,
      rentAmount: Number(r.rent_amount),
      currency: r.currency,
      startDate: r.start_date,
      endDate: r.end_date,
    }));
  }

  // -- Rent billing (FIN-RENT-001/002) ---------------------------------------

  /**
   * FIN-RENT-001 — generate the monthly rent invoice for every active lease for
   * the period containing `asOf`. Idempotent: a unique invoice reference
   * (RENT-<lease>-<YYYYMM>) means re-running the same month skips leases already
   * billed. Each new invoice is issued, linked to a Payments Platform bill
   * (Module H), the tenant is notified, and the account position is recomputed.
   */
  async runRentBilling(dto: RentRunDto): Promise<{
    raised: Array<{
      leaseId: string;
      invoiceId: string;
      reference: string;
      amount: number;
    }>;
    skipped: number;
    count: number;
    period: string;
  }> {
    const actor: Actor = { actorId: dto.actorId, actorRole: dto.actorRole };
    const asOf = dto.asOf ?? this.today();
    const periodStart = firstOfMonth(asOf); // due on the 1st of the billing month
    const ym = billingPeriodKey(asOf);

    const leases = await this.prisma.$queryRawUnsafe<
      {
        lease_id: string;
        account_id: string | null;
        tenant_id: string;
        rent_amount: string;
        currency: string;
        escalation_pct: string | null;
        escalation_anniv: string | null;
      }[]
    >(
      `SELECT l.lease_id::text AS lease_id, l.account_id::text AS account_id,
              l.tenant_id::text AS tenant_id, l.rent_amount::text AS rent_amount,
              l.currency, l.escalation_pct::text AS escalation_pct,
              l.escalation_anniv::text AS escalation_anniv
         FROM lease.lease l
        WHERE l.status = 'active'
        ORDER BY l.lease_id`,
    );

    const raised: Array<{
      leaseId: string;
      invoiceId: string;
      reference: string;
      amount: number;
    }> = [];
    let skipped = 0;

    for (const l of leases) {
      // An active lease should always have an account (provisioned on activation),
      // but guard so one mislinked lease can't abort the whole run.
      if (!l.account_id) {
        skipped++;
        continue;
      }

      const amount = effectiveRent(
        Number(l.rent_amount),
        l.escalation_pct == null ? null : Number(l.escalation_pct),
        l.escalation_anniv,
        asOf,
      );
      const reference = `RENT-${l.lease_id.slice(0, 8)}-${ym}`;
      const description = `Rent for ${ym.slice(0, 4)}-${ym.slice(4)}`;

      const invoiceId = await this.prisma.withActor(
        actor.actorId,
        actor.actorRole,
        async (tx) => {
          // ON CONFLICT (reference) DO NOTHING → empty result means already billed.
          const ins = await tx.$queryRawUnsafe<{ invoice_id: string }[]>(
            `INSERT INTO fin.invoice
               (account_id, invoice_type, reference, amount, currency, due_date,
                status, description, source_table, source_id)
             VALUES ($1::uuid, 'rent', $2, $3, $4::fin.currency_code, $5::date,
                     'issued', $6, 'lease', $7)
             ON CONFLICT (reference) DO NOTHING
             RETURNING invoice_id`,
            l.account_id,
            reference,
            amount,
            l.currency,
            periodStart,
            description,
            l.lease_id,
          );
          if (ins.length === 0) return null;

          await tx.$executeRawUnsafe(
            `INSERT INTO core.notification
               (recipient_kind, recipient_id, channel, template_code, payload)
             VALUES ('customer', $1::uuid, 'sms', 'rent_due', $2::jsonb)`,
            l.tenant_id,
            JSON.stringify({ invoiceRef: reference, amount, period: ym }),
          );
          return ins[0].invoice_id;
        },
      );

      if (!invoiceId) {
        skipped++;
        continue;
      }

      // Module H owns the Payments Platform bill (PAY-API-001 / LEASE-INV-001).
      await this.payments.createBill(invoiceId, actor.actorId);
      // Refresh balance / arrears / next-due for the rental account (FIN-RENT-004).
      await this.ledger.recomputeAccount(l.account_id, actor, this.dateObj(asOf));

      raised.push({ leaseId: l.lease_id, invoiceId, reference, amount });
    }

    return { raised, skipped, count: raised.length, period: ym };
  }

  /**
   * FIN-RENT-003 — add a utility charge for a tenant. Default: raise a SEPARATE
   * utility invoice on the rental account. With separate=false, fold the charge
   * into the current month's existing rent invoice (bumping its amount).
   */
  async addUtilityCharge(
    leaseId: string,
    dto: UtilityChargeDto,
  ): Promise<{ invoiceId: string; reference: string; mode: 'separate' | 'merged'; amount: number }> {
    if (!RENTAL_UTILITY_TYPES.includes(dto.utilityType)) {
      throw new BadRequestException(
        `Invalid utilityType '${dto.utilityType}'. Allowed: ${RENTAL_UTILITY_TYPES.join(', ')}.`,
      );
    }
    if (!(dto.amount > 0)) {
      throw new BadRequestException('amount must be greater than 0.');
    }
    const actor: Actor = { actorId: dto.actorId, actorRole: dto.actorRole };
    const lease = await this.loadLeaseRow(leaseId);
    if (!lease.account_id) {
      throw new BadRequestException(
        'Lease has no rental account yet; activate the lease first.',
      );
    }
    const accountId = lease.account_id;
    const asOf = dto.asOf ?? this.today();
    const ym = billingPeriodKey(asOf);
    const separate = dto.separate !== false; // default true

    const result = await this.prisma.withActor(
      actor.actorId,
      actor.actorRole,
      async (tx) => {
        if (!separate) {
          // Fold into this month's rent invoice if one exists and is unpaid.
          const rentRef = `RENT-${leaseId.slice(0, 8)}-${ym}`;
          const found = await tx.$queryRawUnsafe<
            { invoice_id: string; reference: string; amount: string; status: string }[]
          >(
            `SELECT invoice_id::text AS invoice_id, reference, amount::text AS amount, status
               FROM fin.invoice WHERE reference = $1 FOR UPDATE`,
            rentRef,
          );
          if (found.length && ['draft', 'issued'].includes(found[0].status)) {
            const newAmount = Number(found[0].amount) + dto.amount;
            await tx.$executeRawUnsafe(
              `UPDATE fin.invoice
                  SET amount = $1,
                      description = COALESCE(description,'') || $2
                WHERE invoice_id = $3::uuid`,
              newAmount,
              ` + ${dto.utilityType} ${dto.amount}`,
              found[0].invoice_id,
            );
            return {
              invoiceId: found[0].invoice_id,
              reference: found[0].reference,
              mode: 'merged' as const,
              amount: newAmount,
            };
          }
          // No mergeable rent invoice this period → fall through to a separate one.
        }

        const reference = `UTL-${dto.utilityType.toUpperCase()}-${leaseId.slice(0, 8)}-${ym}`;
        const description =
          dto.description ?? `${dto.utilityType} utility for ${ym.slice(0, 4)}-${ym.slice(4)}`;
        const ins = await tx.$queryRawUnsafe<{ invoice_id: string }[]>(
          `INSERT INTO fin.invoice
             (account_id, invoice_type, reference, amount, currency, due_date,
              status, description, source_table, source_id)
           VALUES ($1::uuid, $2::fin.invoice_type, $3, $4, $5::fin.currency_code,
                   $6::date, 'issued', $7, 'lease', $8)
           RETURNING invoice_id`,
          accountId,
          dto.utilityType,
          reference,
          dto.amount,
          lease.currency,
          firstOfMonth(asOf),
          description,
          leaseId,
        );
        return {
          invoiceId: ins[0].invoice_id,
          reference,
          mode: 'separate' as const,
          amount: dto.amount,
        };
      },
    );

    // A separate utility invoice needs its own Payments Platform bill.
    if (result.mode === 'separate') {
      await this.payments.createBill(result.invoiceId, actor.actorId);
    }
    await this.ledger.recomputeAccount(accountId, actor, this.dateObj(asOf));
    return result;
  }

  // -- Rent roll (LEASE-INV-003) ---------------------------------------------

  /**
   * LEASE-INV-003 — the monthly rent roll Finance runs to see every tenant's
   * position at a glance: each active lease with its billing/collection/arrears
   * position for the month containing `asOf`, plus every vacant premises (no
   * active lease) flagged for letting. Rows carry an arrears risk category so
   * the UI can colour-code current → 90+.
   */
  async getRentRoll(asOfIso?: string): Promise<{
    asOf: string;
    period: string;
    rows: Array<{
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
    }>;
    summary: {
      occupied: number;
      vacant: number;
      totalBilledThisMonth: number;
      totalCollected: number;
      totalArrears: number;
    };
  }> {
    const asOf = asOfIso ? this.asDate(asOfIso, 'asOf') : this.today();
    const period = billingPeriodKey(asOf);

    // One row per active lease, with per-month billing/collection and live arrears.
    const leaseRows = await this.prisma.$queryRawUnsafe<
      {
        premises_id: string;
        premises: string;
        lease_id: string;
        tenant: string;
        monthly_rent: string;
        currency: string;
        last_invoice_date: string | null;
        billed_this_month: string;
        collected: string;
        arrears_total: string;
        days_overdue: string;
      }[]
    >(
      `SELECT p.premises_id::text AS premises_id, p.name AS premises,
              l.lease_id::text AS lease_id,
              c.first_name || ' ' || c.last_name AS tenant,
              l.rent_amount::text AS monthly_rent, l.currency,
              (SELECT max(i.created_at)::date::text
                 FROM fin.invoice i WHERE i.account_id = l.account_id) AS last_invoice_date,
              COALESCE((SELECT sum(i.amount) FROM fin.invoice i
                         WHERE i.account_id = l.account_id
                           AND date_trunc('month', i.due_date) = date_trunc('month', $1::date)
                       ), 0)::text AS billed_this_month,
              COALESCE((SELECT sum(le.amount) FROM fin.ledger_entry le
                         WHERE le.account_id = l.account_id AND le.txn_type = 'credit'
                           AND date_trunc('month', le.posted_at) = date_trunc('month', $1::date)
                       ), 0)::text AS collected,
              COALESCE((SELECT sum(i.amount - i.amount_paid) FROM fin.invoice i
                         WHERE i.account_id = l.account_id
                           AND i.status IN ('issued','partially_paid','overdue')
                           AND i.amount_paid < i.amount AND i.due_date < $1::date
                       ), 0)::text AS arrears_total,
              COALESCE((SELECT $1::date - min(i.due_date) FROM fin.invoice i
                         WHERE i.account_id = l.account_id
                           AND i.status IN ('issued','partially_paid','overdue')
                           AND i.amount_paid < i.amount AND i.due_date < $1::date
                       ), 0)::text AS days_overdue
         FROM lease.lease l
         JOIN lease.premises p ON p.premises_id = l.premises_id
         JOIN fin.customer c ON c.customer_id = l.tenant_id
        WHERE l.status = 'active'
        ORDER BY p.name`,
      asOf,
    );

    // Premises with no active lease — vacant, available to let.
    const vacantRows = await this.prisma.$queryRawUnsafe<
      { premises_id: string; premises: string }[]
    >(
      `SELECT p.premises_id::text AS premises_id, p.name AS premises
         FROM lease.premises p
        WHERE NOT EXISTS (
          SELECT 1 FROM lease.lease l
           WHERE l.premises_id = p.premises_id AND l.status = 'active'
        )
        ORDER BY p.name`,
    );

    const rows = [
      ...leaseRows.map((r) => {
        const daysOverdue = Number(r.days_overdue);
        return {
          premisesId: r.premises_id,
          premises: r.premises,
          vacant: false,
          leaseId: r.lease_id,
          tenant: r.tenant,
          monthlyRent: Number(r.monthly_rent),
          currency: r.currency,
          lastInvoiceDate: r.last_invoice_date,
          billedThisMonth: round2(Number(r.billed_this_month)),
          collected: round2(Number(r.collected)),
          arrearsTotal: round2(Number(r.arrears_total)),
          daysOverdue,
          riskCategory: arrearsBucket(daysOverdue),
        };
      }),
      ...vacantRows.map((r) => ({
        premisesId: r.premises_id,
        premises: r.premises,
        vacant: true,
        leaseId: null,
        tenant: null,
        monthlyRent: null,
        currency: null,
        lastInvoiceDate: null,
        billedThisMonth: 0,
        collected: 0,
        arrearsTotal: 0,
        daysOverdue: 0,
        riskCategory: 'current' as ArrearsRisk,
      })),
    ];

    const summary = {
      occupied: leaseRows.length,
      vacant: vacantRows.length,
      totalBilledThisMonth: round2(
        rows.reduce((a, r) => a + r.billedThisMonth, 0),
      ),
      totalCollected: round2(rows.reduce((a, r) => a + r.collected, 0)),
      totalArrears: round2(rows.reduce((a, r) => a + r.arrearsTotal, 0)),
    };

    return { asOf, period, rows, summary };
  }

  // -- Statement (FIN-RENT-004) ----------------------------------------------

  /**
   * FIN-RENT-004 — per-tenant lease statement: lease header, account position,
   * every invoice on the rental account, and the running ledger. Read-only.
   */
  async getLeaseStatement(leaseId: string): Promise<{
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
    invoices: Array<{
      invoiceId: string;
      reference: string;
      type: string;
      amount: number;
      amountPaid: number;
      dueDate: string;
      status: string;
    }>;
    ledger: Awaited<ReturnType<LedgerService['getAccountLedger']>>;
    maintenance: Array<{
      requestId: string;
      category: string | null;
      priority: string;
      status: string;
      description: string | null;
      slaDue: string | null;
      resolvedAt: string | null;
      createdAt: string;
    }>;
  }> {
    const head = await this.prisma.$queryRawUnsafe<
      {
        lease_id: string;
        premises_id: string;
        premises: string;
        tenant: string;
        status: string;
        rent_amount: string;
        currency: string;
        start_date: string;
        end_date: string;
        market_rate: string | null;
        account_id: string | null;
        account_ref: string | null;
        balance: string | null;
      }[]
    >(
      `SELECT l.lease_id::text AS lease_id, p.premises_id::text AS premises_id,
              p.name AS premises,
              c.first_name || ' ' || c.last_name AS tenant, l.status,
              l.rent_amount::text AS rent_amount, l.currency,
              l.start_date::text AS start_date, l.end_date::text AS end_date,
              l.market_rate::text AS market_rate,
              a.account_id::text AS account_id, a.reference AS account_ref,
              a.balance::text AS balance
         FROM lease.lease l
         JOIN lease.premises p ON p.premises_id = l.premises_id
         JOIN fin.customer c ON c.customer_id = l.tenant_id
         LEFT JOIN fin.account a ON a.account_id = l.account_id
        WHERE l.lease_id = $1::uuid`,
      leaseId,
    );
    if (head.length === 0) {
      throw new NotFoundException(`Lease ${leaseId} not found.`);
    }
    const h = head[0];
    const rent = Number(h.rent_amount);
    const marketRate = h.market_rate == null ? null : Number(h.market_rate);

    let invoices: Array<{
      invoiceId: string;
      reference: string;
      type: string;
      amount: number;
      amountPaid: number;
      dueDate: string;
      status: string;
    }> = [];
    let ledger: Awaited<ReturnType<LedgerService['getAccountLedger']>> = [];
    let totals = { billed: 0, paid: 0, outstanding: 0 };

    if (h.account_id) {
      const invRows = await this.prisma.$queryRawUnsafe<
        {
          invoice_id: string;
          reference: string;
          invoice_type: string;
          amount: string;
          amount_paid: string;
          due_date: string;
          status: string;
        }[]
      >(
        `SELECT invoice_id::text AS invoice_id, reference, invoice_type,
                amount::text AS amount, amount_paid::text AS amount_paid,
                due_date::text AS due_date, status
           FROM fin.invoice WHERE account_id = $1::uuid
          ORDER BY due_date, reference`,
        h.account_id,
      );
      invoices = invRows.map((r) => ({
        invoiceId: r.invoice_id,
        reference: r.reference,
        type: r.invoice_type,
        amount: Number(r.amount),
        amountPaid: Number(r.amount_paid),
        dueDate: r.due_date,
        status: r.status,
      }));
      const billed = invoices.reduce((a, i) => a + i.amount, 0);
      const paid = invoices.reduce((a, i) => a + i.amountPaid, 0);
      totals = {
        billed: round2(billed),
        paid: round2(paid),
        outstanding: round2(billed - paid),
      };
      ledger = await this.ledger.getAccountLedger(h.account_id);
    }

    // LEASE-MAINT — maintenance history for this lease/premises (read-only).
    const maintRows = await this.prisma.$queryRawUnsafe<
      {
        request_id: string;
        category: string | null;
        priority: string;
        status: string;
        description: string | null;
        sla_due: string | null;
        resolved_at: string | null;
        created_at: string;
      }[]
    >(
      `SELECT request_id::text AS request_id, category, priority, status,
              description, sla_due::text AS sla_due, resolved_at::text AS resolved_at,
              created_at::text AS created_at
         FROM lease.maintenance_request
        WHERE lease_id = $1::uuid OR premises_id = $2::uuid
        ORDER BY created_at DESC`,
      leaseId,
      h.premises_id,
    );
    const maintenance = maintRows.map((r) => ({
      requestId: r.request_id,
      category: r.category,
      priority: r.priority,
      status: r.status,
      description: r.description,
      slaDue: r.sla_due,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
    }));

    return {
      lease: {
        leaseId: h.lease_id,
        premises: h.premises,
        tenant: h.tenant,
        status: h.status,
        rentAmount: rent,
        currency: h.currency,
        startDate: h.start_date,
        endDate: h.end_date,
        marketRate,
        // LEASE-005 — flag premises rented below benchmark.
        underRented: marketRate != null && rent < marketRate,
      },
      account: h.account_id
        ? {
            accountId: h.account_id,
            reference: h.account_ref as string,
            balance: Number(h.balance ?? 0),
          }
        : null,
      totals,
      invoices,
      ledger,
      maintenance,
    };
  }

  // -- Renewal alerts (LEASE-004) --------------------------------------------

  /**
   * LEASE-004 — find leases approaching expiry within the configured notice
   * windows and queue renewal notifications to the tenant and to Operations
   * users. Returns the leases alerted.
   *
   * Note: there is no per-window "alert sent" ledger yet, so a daily run
   * re-notifies on each day a lease sits inside a window. A dedupe table is a
   * Phase 2 follow-up (tracked against LEASE-004).
   */
  async renewalAlerts(dto: RenewalAlertDto): Promise<{
    asOf: string;
    alerted: Array<{ leaseId: string; premises: string; endDate: string; daysToExpiry: number }>;
  }> {
    const actor: Actor = { actorId: dto.actorId, actorRole: dto.actorRole };
    const asOf = dto.asOf ?? this.today();
    const noticeDays = dto.noticeDays?.length ? dto.noticeDays : [90, 30];
    const horizon = Math.max(...noticeDays);

    const due = await this.prisma.$queryRawUnsafe<
      {
        lease_id: string;
        tenant_id: string;
        premises: string;
        end_date: string;
        days_to_expiry: number;
      }[]
    >(
      `SELECT l.lease_id::text AS lease_id, l.tenant_id::text AS tenant_id,
              p.name AS premises, l.end_date::text AS end_date,
              (l.end_date - $1::date) AS days_to_expiry
         FROM lease.lease l
         JOIN lease.premises p ON p.premises_id = l.premises_id
        WHERE l.status IN ('active','renewal')
          AND l.end_date >= $1::date
          AND l.end_date <= ($1::date + ($2 || ' days')::interval)
        ORDER BY l.end_date`,
      asOf,
      String(horizon),
    );

    // Only alert leases sitting at/under one of the configured windows.
    const alerted = due.filter((r) =>
      noticeDays.some((n) => Number(r.days_to_expiry) <= n),
    );

    if (alerted.length) {
      await this.prisma.withActor(actor.actorId, actor.actorRole, async (tx) => {
        for (const r of alerted) {
          const payload = JSON.stringify({
            leaseId: r.lease_id,
            premises: r.premises,
            endDate: r.end_date,
            daysToExpiry: Number(r.days_to_expiry),
          });
          // Tenant notice.
          await tx.$executeRawUnsafe(
            `INSERT INTO core.notification
               (recipient_kind, recipient_id, channel, template_code, payload)
             VALUES ('customer', $1::uuid, 'sms', 'lease_renewal', $2::jsonb)`,
            r.tenant_id,
            payload,
          );
          // Operations notice — one per active operations user.
          await tx.$executeRawUnsafe(
            `INSERT INTO core.notification
               (recipient_kind, recipient_id, channel, template_code, payload)
             SELECT 'user', u.user_id, 'email', 'lease_renewal_ops', $1::jsonb
               FROM core.app_user u
               JOIN core.user_role ur ON ur.user_id = u.user_id
               JOIN core.role rl ON rl.role_id = ur.role_id
              WHERE rl.code = 'operations'`,
            payload,
          );
        }
      });
    }

    return {
      asOf,
      alerted: alerted.map((r) => ({
        leaseId: r.lease_id,
        premises: r.premises,
        endDate: r.end_date,
        daysToExpiry: Number(r.days_to_expiry),
      })),
    };
  }

  // -- helpers ----------------------------------------------------------------

  private async loadLeaseRow(leaseId: string): Promise<{
    lease_id: string;
    status: string;
    tenant_id: string;
    account_id: string | null;
    start_date: string;
    currency: string;
    escalation_pct: number | null;
    escalation_anniv: string | null;
  }> {
    const rows = await this.prisma.$queryRawUnsafe<
      {
        lease_id: string;
        status: string;
        tenant_id: string;
        account_id: string | null;
        start_date: string;
        currency: string;
        escalation_pct: string | null;
        escalation_anniv: string | null;
      }[]
    >(
      `SELECT lease_id::text AS lease_id, status, tenant_id::text AS tenant_id,
              account_id::text AS account_id, start_date::text AS start_date,
              currency, escalation_pct::text AS escalation_pct,
              escalation_anniv::text AS escalation_anniv
         FROM lease.lease WHERE lease_id = $1::uuid`,
      leaseId,
    );
    if (rows.length === 0) {
      throw new NotFoundException(`Lease ${leaseId} not found.`);
    }
    const r = rows[0];
    return {
      ...r,
      escalation_pct: r.escalation_pct == null ? null : Number(r.escalation_pct),
    };
  }

  /** Validate an ISO date and return the YYYY-MM-DD form for ::date binding. */
  private asDate(iso: string, field: string): string {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) {
      throw new BadRequestException(`${field} must be an ISO date (YYYY-MM-DD).`);
    }
    return iso.slice(0, 10);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private dateObj(iso: string): Date {
    return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  }

  private pgCode(err: unknown): string | undefined {
    const e = err as { code?: string; meta?: { code?: string } };
    return e?.meta?.code ?? e?.code;
  }

  private pgMessage(err: unknown): string {
    const e = err as { meta?: { message?: string }; message?: string };
    return e?.meta?.message ?? e?.message ?? String(err);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
