import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';
import { FinancialService } from './modules/financial/financial.service';
import { LedgerService } from './modules/financial/ledger.service';
import { PaymentsService } from './modules/payments/payments.service';

/**
 * Verifies the DI graph compiles — in particular the Module A <-> Module H
 * circular dependency resolved with forwardRef. PrismaService is mocked so no
 * database connection is attempted.
 */
describe('Application DI graph', () => {
  it('resolves Module A and Module H services through forwardRef', async () => {
    const prismaMock = {
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    expect(moduleRef.get(FinancialService, { strict: false })).toBeInstanceOf(
      FinancialService,
    );
    expect(moduleRef.get(LedgerService, { strict: false })).toBeInstanceOf(
      LedgerService,
    );
    expect(moduleRef.get(PaymentsService, { strict: false })).toBeInstanceOf(
      PaymentsService,
    );

    await moduleRef.close();
  });
});
