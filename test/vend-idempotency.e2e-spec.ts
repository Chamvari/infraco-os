import { Pool } from 'pg';

/**
 * CRITICAL TEST — prepaid-vend idempotency (SRS UTIL-TKN-005, the "duplicate
 * callback" guarantee).
 *
 * Fires N concurrent real payment callbacks carrying the SAME platform_txn_id
 * straight at the actual util.token_vend table (real DB, NOT mocked Prisma) and
 * asserts EXACTLY ONE token row is created — the other N-1 are cleanly rejected
 * by the partial unique index uq_vend_platform_txn (SQLSTATE 23505). This proves
 * single-vend-per-payment is enforced at the database layer, with no TOCTOU race
 * window that an app-level "if exists" pre-check would leave open.
 *
 * Mirrors test/allocation-lock.e2e-spec.ts. Run with:
 *   npm run test:vend-idempotency
 * Requires the DB up (npm run db:up) with the schema + migration 001 applied.
 */
const CONNECTION =
  process.env.DATABASE_URL ??
  'postgresql://infraco:dev_change_me@localhost:5432/infraco_os';

const CONCURRENCY = 50;

/** Each concurrent callback resolves to one of these (mirrors the service). */
type Attempt = 'inserted' | 'duplicate' | string;

describe('Vend idempotency (UTIL-TKN-005)', () => {
  let pool: Pool;
  let developmentId: string;
  let meterId: string;
  let tariffId: string;
  const platformTxnId = `PTX-RACE-${Date.now()}`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: CONNECTION, max: CONCURRENCY + 5 });

    // A development to hang the meter/tariff off (reuse a seeded one if present).
    const dev = await pool.query(
      `SELECT development_id FROM sales.development WHERE dev_type = 'residential' LIMIT 1`,
    );
    developmentId =
      dev.rows[0]?.development_id ??
      (
        await pool.query(
          `INSERT INTO sales.development (name, dev_type)
           VALUES ('Vend Test Dev','residential') RETURNING development_id`,
        )
      ).rows[0].development_id;

    // A flat power tariff: USD 0.50/kWh, no fixed charge.
    tariffId = (
      await pool.query(
        `INSERT INTO util.tariff (utility_type, name, structure, rate, fixed_charge, currency)
         VALUES ('power'::util.utility_type, $1, 'flat', 0.50, 0, 'USD')
         RETURNING tariff_id`,
        [`Race Tariff ${Date.now()}`],
      )
    ).rows[0].tariff_id;

    // One prepaid power meter on the mock adapter, contended by N callbacks.
    meterId = (
      await pool.query(
        `INSERT INTO util.meter
           (utility_type, development_id, serial_no, is_prepaid, adapter, tariff_id)
         VALUES ('power'::util.utility_type, $1, $2, true, 'mock'::util.meter_adapter, $3)
         RETURNING meter_id`,
        [developmentId, `PWR-RACE-${Date.now()}`, tariffId],
      )
    ).rows[0].meter_id;
  });

  afterAll(async () => {
    // Clean up test rows (children first).
    await pool.query(`DELETE FROM util.token_vend WHERE platform_txn_id = $1`, [
      platformTxnId,
    ]);
    await pool.query(`DELETE FROM util.meter WHERE meter_id = $1`, [meterId]);
    await pool.query(`DELETE FROM util.tariff WHERE tariff_id = $1`, [tariffId]);
    await pool.end();
  });

  it(`commits exactly one of ${CONCURRENCY} concurrent callbacks for the same platform_txn_id`, async () => {
    // Each "callback" is an independent INSERT into util.token_vend carrying the
    // SAME platform_txn_id — exactly what N duplicate Payments callbacks produce.
    // The partial unique index must let one through and reject the rest with 23505.
    const callback = (i: number): Promise<Attempt> =>
      pool
        .query(
          `INSERT INTO util.token_vend
             (meter_id, utility_type, token_kind, amount_paid, currency, units,
              tariff_id, token_code, adapter, platform_txn_id, status)
           VALUES ($1::uuid, 'power'::util.utility_type, 'credit'::util.token_kind,
                   50, 'USD', 100, $2::uuid, $3, 'mock'::util.meter_adapter, $4, 'issued')
           RETURNING vend_id`,
          [meterId, tariffId, `TOKEN-${i}`, platformTxnId],
        )
        .then(() => 'inserted' as const)
        .catch((e) => {
          // SQLSTATE 23505 = unique_violation — the constraint rejected a duplicate.
          if (e?.code === '23505') return 'duplicate' as const;
          return e.message as string;
        });

    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => callback(i)),
    );

    const inserted = results.filter((r) => r === 'inserted').length;
    const duplicates = results.filter((r) => r === 'duplicate').length;

    expect(inserted).toBe(1); // exactly one token row created
    expect(duplicates).toBe(CONCURRENCY - 1); // all others rejected by the constraint
    // No callback failed for any reason OTHER than the unique violation.
    expect(inserted + duplicates).toBe(CONCURRENCY);

    // And the DB agrees: precisely one row exists for this platform transaction.
    const count = await pool.query(
      `SELECT count(*)::int AS n FROM util.token_vend WHERE platform_txn_id = $1`,
      [platformTxnId],
    );
    expect(count.rows[0].n).toBe(1);
  });
});
