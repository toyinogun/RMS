import { describe, expect, test, vi } from 'vitest';

vi.mock('@solutio/db/client', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

describe('GET /api/health', () => {
  test('returns 200 with status ok when DB responds', async () => {
    const { GET } = await import('../route.js');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok' });
  });
});
