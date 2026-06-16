import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService wraps the generated Prisma client.
 *
 * withActor() sets the per-transaction session variables the DB audit trigger
 * reads (SRS PLAT-AUDIT-001), so every change records WHO did it. Always run
 * audited writes inside withActor().
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run a callback inside a transaction with the audit actor context set.
   * actorRole is a free-text role code (e.g. 'finance', 'registrar').
   */
  async withActor<T>(
    actorId: string | null,
    actorRole: string | null,
    fn: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      // SET LOCAL is scoped to this transaction only.
      await tx.$executeRawUnsafe(
        `SET LOCAL infraco.actor_id = '${actorId ?? ''}'`,
      );
      await tx.$executeRawUnsafe(
        `SET LOCAL infraco.actor_role = '${(actorRole ?? '').replace(/'/g, "''")}'`,
      );
      return fn(tx as unknown as PrismaClient);
    });
  }
}
