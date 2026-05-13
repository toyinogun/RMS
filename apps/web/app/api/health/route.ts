import { NextResponse } from 'next/server';
import { prisma } from '@solutio/db/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: err instanceof Error ? err.message : 'unknown' },
      { status: 503 },
    );
  }
}
