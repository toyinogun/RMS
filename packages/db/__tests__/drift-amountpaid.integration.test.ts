import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import { recordPayment, PaymentOverpayError } from '../src/payments-service.js';
import { generateSchedule } from '@solutio/shared/installments';
import { koboFromNaira } from '@solutio/shared/money';
import type { Kobo } from '@solutio/shared/money';
import type { TenantContext } from '@solutio/shared/tenant';

let pg: TestPostgres;
let planId: string;
let tenantId: string;
let userId: string;

const ctx = (): TenantContext => ({
  tenantId,
  user: {
    id: userId,
    authUserId: '01935b7e-0000-7000-8000-AAAAAAAAAAA1',
    role: 'OWNER',
    email: 'owner@atrium.test',
    mustChangePassword: false,
  },
});

beforeAll(async () => {
  pg = await startPostgres();
}, 60_000);

afterAll(async () => {
  await pg?.stop();
});

beforeEach(async () => {
  await pg.prisma.paymentAllocation.deleteMany();
  await pg.prisma.payment.deleteMany();
  await pg.prisma.installment.deleteMany();
  await pg.prisma.plan.deleteMany();
  await pg.prisma.property.deleteMany();
  await pg.prisma.customer.deleteMany();
  await pg.prisma.user.deleteMany();
  await pg.prisma.tenant.deleteMany();

  const tenant = await pg.prisma.tenant.create({
    data: { slug: 'atrium-homes', name: 'Atrium Homes' },
  });
  tenantId = tenant.id;
  const user = await pg.prisma.user.create({
    data: {
      tenantId,
      authUserId: '01935b7e-0000-7000-8000-AAAAAAAAAAA1',
      email: 'owner@atrium.test',
      name: 'Owner',
      role: 'OWNER',
    },
  });
  userId = user.id;

  const customer = await pg.prisma.customer.create({
    data: { tenantId, fullName: 'Test Customer', phone: '+2348012340000' },
  });
  const property = await pg.prisma.property.create({
    data: {
      tenantId,
      code: 'ATR-001',
      title: 'Test Property',
      addressLine: '1 Street',
      city: 'Lekki',
      totalPriceKobo: koboFromNaira(12_000_000),
    },
  });
  const plan = await pg.prisma.plan.create({
    data: {
      tenantId,
      customerId: customer.id,
      propertyId: property.id,
      totalPriceKobo: koboFromNaira(12_000_000),
      depositKobo: koboFromNaira(2_400_000),
      monthlyKobo: koboFromNaira(800_000),
      termMonths: 12,
      startDate: new Date('2026-06-01T00:00:00Z'),
      status: 'ACTIVE',
    },
  });
  planId = plan.id;

  const rows = generateSchedule({
    totalPriceKobo: koboFromNaira(12_000_000),
    depositKobo: koboFromNaira(2_400_000),
    monthlyKobo: koboFromNaira(800_000),
    termMonths: 12,
    startDate: new Date('2026-06-01T00:00:00Z'),
  });
  await pg.prisma.installment.createMany({
    data: rows.map((r) => ({
      tenantId,
      planId,
      sequenceNo: r.sequenceNo,
      dueDate: r.dueDate,
      amountDueKobo: r.amountDueKobo,
    })),
  });
});

async function assertNoDrift() {
  const installments = await pg.prisma.installment.findMany({ where: { planId } });
  for (const inst of installments) {
    const sum = await pg.prisma.paymentAllocation.aggregate({
      where: { installmentId: inst.id },
      _sum: { amountKobo: true },
    });
    const allocated = (sum._sum.amountKobo ?? 0n) as bigint;
    expect(
      inst.amountPaidKobo,
      `drift on installment seq=${inst.sequenceNo}: amountPaidKobo=${inst.amountPaidKobo} but SUM(allocations)=${allocated}`,
    ).toBe(allocated);
  }
}

describe('amountPaidKobo denormalization drift', () => {
  test('single payment exactly covering deposit', async () => {
    await recordPayment(ctx(), {
      planId,
      amountKobo: koboFromNaira(2_400_000) as Kobo,
      paidAt: new Date('2026-06-01T10:00:00Z'),
      method: 'TRANSFER',
    });
    await assertNoDrift();
  });

  test('payment spanning deposit + first two monthlies', async () => {
    await recordPayment(ctx(), {
      planId,
      amountKobo: koboFromNaira(4_000_000) as Kobo,
      paidAt: new Date('2026-06-01T10:00:00Z'),
      method: 'TRANSFER',
    });
    await assertNoDrift();
  });

  test('overpayment is hard-rejected; no allocations or payment row persisted', async () => {
    await expect(
      recordPayment(ctx(), {
        planId,
        amountKobo: koboFromNaira(20_000_000) as Kobo,
        paidAt: new Date('2026-06-01T10:00:00Z'),
        method: 'CHEQUE',
        reference: 'CHQ-001',
      }),
    ).rejects.toBeInstanceOf(PaymentOverpayError);
    const paymentCount = await pg.prisma.payment.count({ where: { planId } });
    expect(paymentCount).toBe(0);
    await assertNoDrift();
  });

  test('many small payments — every installment touched', async () => {
    for (let i = 0; i < 13; i++) {
      await recordPayment(ctx(), {
        planId,
        amountKobo: koboFromNaira(900_000) as Kobo,
        paidAt: new Date('2026-06-01T10:00:00Z'),
        method: 'CASH',
      });
    }
    await assertNoDrift();
  });
});
