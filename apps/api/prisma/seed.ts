import { PrismaClient } from '@prisma/client';
import { DEMO_JOBS } from './demo-jobs';

const DAY_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo seed is disabled in production (set ALLOW_DEMO_SEED=true to override)');
  }

  const prisma = new PrismaClient();
  try {
    const now = Date.now();
    for (const [index, { daysAgo, ...job }] of DEMO_JOBS.entries()) {
      // Сдвиг по минутам сохраняет стабильный порядок для заказов одного дня.
      const createdAt = new Date(now - daysAgo * DAY_MS - index * 60_000);
      await prisma.job.upsert({
        where: { id: job.id },
        create: { ...job, createdAt },
        update: { ...job },
      });
    }
    console.log(`Seeded ${DEMO_JOBS.length} demo jobs`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
