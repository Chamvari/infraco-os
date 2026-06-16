import { BadRequestException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../../prisma.service';
import { CustomerService } from '../customer/customer.service';

/**
 * Unit tests for OnboardingService (SRS §4.1a, ONB-001/002/004/007).
 * Prisma + CustomerService are mocked.
 */
describe('OnboardingService', () => {
  let service: OnboardingService;
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let prisma: { withActor: jest.Mock; $queryRawUnsafe: jest.Mock };
  let customers: { createCustomer: jest.Mock; linkWallet: jest.Mock };

  const actor = { actorId: '11111111-1111-1111-1111-111111111111', actorRole: 'registrar' };

  beforeEach(() => {
    tx = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    prisma = {
      withActor: jest.fn((_a, _r, fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      $queryRawUnsafe: jest.fn(),
    };
    customers = {
      createCustomer: jest.fn().mockResolvedValue({ customerId: 'cust-1', duplicateWarnings: [] }),
      linkWallet: jest.fn(),
    };
    service = new OnboardingService(
      prisma as unknown as PrismaService,
      customers as unknown as CustomerService,
    );
  });

  it('ONB-001: onboards a party with KYC pending, reusing the registry write', async () => {
    const res = await service.onboardParty({
      ...actor,
      customerType: 'residential_buyer',
      firstName: 'Tendai',
      lastName: 'Moyo',
      country: 'UK',
      dpaConsent: true,
    });

    expect(customers.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ customerType: 'residential_buyer', kycStatus: 'pending' }),
    );
    expect(res).toEqual({
      customerId: 'cust-1',
      contractorId: null,
      kycStatus: 'pending',
      duplicateWarnings: [],
    });
  });

  it('ONB-007: a contractor party also lands in dev.contractor', async () => {
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ contractor_id: 'ctr-9' }]);
    const res = await service.onboardParty({
      ...actor,
      customerType: 'contractor',
      firstName: 'BuildCo',
      lastName: 'Ltd',
      contractor: { regNumber: 'RC-123', taxClearance: 'TC-9', category: 'civil', prequalified: true },
    });

    expect(res.contractorId).toBe('ctr-9');
    const sql = tx.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO dev.contractor');
  });

  it('ONB-004: rejecting KYC without a reason is a 400', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ customer_id: 'cust-1', kyc_status: 'pending' }]);
    await expect(
      service.reviewKyc('cust-1', { ...actor, decision: 'rejected' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ONB-004: verifying KYC updates status and records the decision', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ customer_id: 'cust-1', kyc_status: 'pending' }]);
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ customer_id: 'cust-1', kyc_status: 'verified' }]);

    const res = await service.reviewKyc('cust-1', { ...actor, decision: 'verified' });

    expect(res.kycStatus).toBe('verified');
    // A durable kyc_decision notification is written alongside the status change.
    const notif = tx.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes('kyc_decision'),
    );
    expect(notif).toBeDefined();
  });

  it('ONB-002: document upload computes the next version', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ customer_id: 'cust-1', kyc_status: 'pending' }]);
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([{ next_version: 3 }]) // version query
      .mockResolvedValueOnce([{ document_id: 'doc-1' }]); // insert

    const res = await service.attachDocument('cust-1', {
      ...actor,
      docType: 'id_passport',
      storageRef: 's3://bucket/id.pdf',
    });

    expect(res).toEqual({ documentId: 'doc-1', docType: 'id_passport', version: 3 });
  });
});
