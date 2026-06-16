import { Pool } from 'pg';

/**
 * CRITICAL TEST — the allocation lock (SRS STND-INV-004, acceptance criterion §17).
 *
 * Fires N concurrent sales.reserve_plot() calls at the SAME plot and asserts
 * that EXACTLY ONE succeeds. This proves no double-allocation and no race,
 * enforced at the database layer. Run with: npm run test:allocation
 *
 * Requires the DB up (npm run db:up) with the schema applied.
 */
const CONNECTION =
  process.env.DATABASE_URL ??
  'postgresql://infraco:dev_change_me@localhost:5432/infraco_os';

const CONCURRENCY = 50;

describe('Allocation lock (STND-INV-004)', () => {
  let pool: Pool;
  let developmentId: string;
  let plotId: string;
  const customerIds: string[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: CONNECTION, max: CONCURRENCY + 5 });

    // Use the seeded residential development, or create one if missing.
    const dev = await pool.query(
      `SELECT development_id FROM sales.development WHERE dev_type = 'residential' LIMIT 1`,
    );
    developmentId = dev.rows[0]?.development_id
      ?? (await pool.query(
            `INSERT INTO sales.development (name, dev_type) VALUES ('Test Dev','residential') RETURNING development_id`,
          )).rows[0].development_id;

    // One fresh available plot.
    plotId = (await pool.query(
      `INSERT INTO sales.plot (development_id, plot_number, plot_type, status, price)
       VALUES ($1, $2, 'residential', 'available', 15000)
       RETURNING plot_id`,
      [developmentId, `T-${Date.now()}`],
    )).rows[0].plot_id;

    // N distinct customers to contend for it.
    for (let i = 0; i < CONCURRENCY; i++) {
      const c = await pool.query(
        `INSERT INTO fin.customer (customer_type, first_name, last_name)
         VALUES ('residential_buyer', 'Race', $1) RETURNING customer_id`,
        [`Tester${i}`],
      );
      customerIds.push(c.rows[0].customer_id);
    }
  });

  afterAll(async () => {
    // Clean up test rows (children first).
    await pool.query(`DELETE FROM sales.reservation WHERE plot_id = $1`, [plotId]);
    await pool.query(`DELETE FROM sales.plot WHERE plot_id = $1`, [plotId]);
    await pool.query(
      `DELETE FROM fin.customer WHERE customer_id = ANY($1::uuid[])`,
      [customerIds],
    );
    await pool.end();
  });

  it(`allows exactly one of ${CONCURRENCY} concurrent reservations to succeed`, async () => {
    const attempts = customerIds.map((customerId) =>
      pool
        .query(`SELECT sales.reserve_plot($1::uuid, $2::uuid, NULL, 60) AS rid`, [plotId, customerId])
        .then(() => 'ok' as const)
        .catch((e) => (e.message as string)),
    );

    const results = await Promise.all(attempts);
    const succeeded = results.filter((r) => r === 'ok').length;
    const conflicts = results.filter(
      (r) => typeof r === 'string' && r.includes('PLOT_NOT_AVAILABLE'),
    ).length;

    expect(succeeded).toBe(1);                 // exactly one winner
    expect(conflicts).toBe(CONCURRENCY - 1);   // all others cleanly rejected

    // And the DB agrees: one active reservation, plot is 'reserved'.
    const active = await pool.query(
      `SELECT count(*)::int AS n FROM sales.reservation WHERE plot_id = $1 AND status = 'active'`,
      [plotId],
    );
    expect(active.rows[0].n).toBe(1);

    const status = await pool.query(`SELECT status FROM sales.plot WHERE plot_id = $1`, [plotId]);
    expect(status.rows[0].status).toBe('reserved');
  });
});
