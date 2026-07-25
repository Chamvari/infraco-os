import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma.service';
import { SmsProvider, SmsProviderRegistry } from './sms-provider';

/**
 * Unit tests for NotificationsService (PLAT-NOTIF-001/002). Prisma, the BullMQ
 * queue, and the SMS provider are all mocked, so nothing touches a database,
 * Redis, or the carrier. Verifies queueing, immediate send through the active
 * SmsProvider, delivery-status persistence to core.notification, and the
 * USSD/DLR handlers.
 */
describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let queue: { add: jest.Mock };
  let providerSend: jest.Mock;
  let providers: { active: jest.Mock };

  const recipient = { kind: 'customer' as const, id: 'cust-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ notification_id: 'notif-1' }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    providerSend = jest.fn();
    const provider: SmsProvider = { name: 'smspop', send: providerSend };
    providers = { active: jest.fn().mockReturnValue(provider) };
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      queue as unknown as never,
      providers as unknown as SmsProviderRegistry,
    );
  });

  // ── queueing + persistence ──────────────────────────────────

  describe('sendSms (queued)', () => {
    it('queues a job and records a queued core.notification when a recipient is given', async () => {
      const res = await service.sendSms({
        to: '+263771234567',
        message: 'hi',
        recipient,
        templateCode: 'WELCOME',
      });

      expect(res.status).toBe('queued');
      expect(res.messageId).toBe('job-1');
      expect(queue.add).toHaveBeenCalledWith(
        'sms',
        expect.objectContaining({ to: '+263771234567', notificationId: 'notif-1' }),
      );
      const ins = prisma.$queryRawUnsafe.mock.calls[0];
      expect(String(ins[0])).toContain('INSERT INTO core.notification');
      expect(ins[1]).toBe('customer'); // recipient_kind
      expect(ins[2]).toBe('cust-1'); // recipient_id
      expect(ins[3]).toBe('sms'); // channel
      expect(ins[4]).toBe('WELCOME'); // template_code
      expect(ins[6]).toBe('queued'); // status
      // Queued path must NOT hit the carrier synchronously.
      expect(providerSend).not.toHaveBeenCalled();
    });

    it('does not persist when no recipient uuid is available (recipient_id is NOT NULL)', async () => {
      await service.sendSms({ to: '+263771234567', message: 'hi' });
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        'sms',
        expect.objectContaining({ notificationId: null }),
      );
    });
  });

  // ── immediate send (through the active provider) ────────────

  describe('sendSms (immediate)', () => {
    it('sends via the provider and marks the notification sent', async () => {
      providerSend.mockResolvedValue({ ok: true, providerMessageId: 'sp-1' });

      const res = await service.sendSms({
        to: '+263771234567',
        message: 'hi',
        enqueue: false,
        recipient,
      });

      expect(res.status).toBe('sent');
      expect(res.messageId).toBe('sp-1');
      expect(providerSend).toHaveBeenCalledWith('+263771234567', 'hi', expect.any(String));
      const upd = prisma.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('UPDATE core.notification'),
      );
      expect(upd![1]).toBe('notif-1'); // notification_id
      expect(upd![2]).toBe('sent'); // status
      expect(upd![3]).toBe('sp-1'); // providerMessageId
    });

    it('marks the notification failed when the provider reports not-ok', async () => {
      providerSend.mockResolvedValue({ ok: false, error: 'smspop down' });

      const res = await service.sendSms({
        to: '+263771234567',
        message: 'hi',
        enqueue: false,
        recipient,
      });

      expect(res.status).toBe('failed');
      const upd = prisma.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('UPDATE core.notification'),
      );
      expect(upd![2]).toBe('failed');
    });
  });

  // ── templates / bulk ────────────────────────────────────────

  describe('sendTemplate', () => {
    it('renders the template body and records the template code', async () => {
      await service.sendTemplate(
        'WELCOME',
        { name: 'Tendai', standRef: 'A12' },
        { to: '+263771234567', recipient },
      );
      const ins = prisma.$queryRawUnsafe.mock.calls[0];
      expect(ins[4]).toBe('WELCOME'); // template_code
      const queued = queue.add.mock.calls[0][1];
      expect(queued.message).toContain('Welcome to InfraCo, Tendai');
      expect(queued.message).toContain('A12');
    });
  });

  describe('sendBulk', () => {
    it('chunks recipients into batches of 1000 and queues each', async () => {
      const recips = Array.from({ length: 2500 }, (_, i) => `+26377${i}`);
      const res = await service.sendBulk(recips, 'estate-wide notice');
      expect(res.batches).toBe(3);
      expect(res.totalRecipients).toBe(2500);
      expect(queue.add).toHaveBeenCalledTimes(3);
      expect(queue.add.mock.calls[0][0]).toBe('sms_bulk');
    });
  });

  // ── USSD ────────────────────────────────────────────────────

  describe('handleUssd', () => {
    it('returns the root menu for an empty session', async () => {
      const out = await service.handleUssd({ sessionId: 's1', phoneNumber: '+263', text: '' });
      expect(out).toContain('CON Welcome to InfraCo');
    });

    it('returns a terminal (END) balance response for option 1', async () => {
      const out = await service.handleUssd({ sessionId: 's1', phoneNumber: '+263', text: '1' });
      expect(out.startsWith('END')).toBe(true);
    });

    it('returns the invalid response for an unknown option', async () => {
      const out = await service.handleUssd({ sessionId: 's1', phoneNumber: '+263', text: '9' });
      expect(out).toContain('Invalid option');
    });
  });

  // ── DLR (PLAT-NOTIF-002) ────────────────────────────────────

  describe('recordDeliveryReport', () => {
    it('marks a notification sent on a Delivered DLR, matched by provider id', async () => {
      const res = await service.recordDeliveryReport('sp-1', 'Delivered');
      expect(res.updated).toBe(1);
      const upd = prisma.$executeRawUnsafe.mock.calls[0];
      expect(String(upd[0])).toContain("payload->>'providerMessageId'");
      expect(upd[1]).toBe('sp-1');
      expect(upd[2]).toBe('sent');
    });

    it('marks a notification failed on a failure DLR and records the reason', async () => {
      await service.recordDeliveryReport('sp-2', 'Failed', 'UserInBlackList');
      const upd = prisma.$executeRawUnsafe.mock.calls[0];
      expect(upd[2]).toBe('failed');
      expect(upd[4]).toBe('UserInBlackList');
    });
  });
});
