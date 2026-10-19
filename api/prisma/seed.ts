// Demo data. Run with: npm run db:seed (from api/)
// Uses fixed ids so the frontend can refer to demo users directly,
// and upserts so running it twice is harmless.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const users = [
  { id: 'user_alice', displayName: 'Alice' },
  { id: 'user_bob', displayName: 'Bob' },
];

const offers = [
  {
    id: 'offer_dragon',
    title: 'Dragon Quest Saga',
    description: 'Install the game and level up your dragon rider.',
    milestones: [
      { key: 'install', label: 'Install and open the game', payoutCents: 50 },
      { key: 'level_5', label: 'Reach level 5', payoutCents: 100 },
      { key: 'level_10', label: 'Reach level 10', payoutCents: 250 },
    ],
  },
  {
    id: 'offer_farm',
    title: 'Pixel Farm',
    description: 'Grow crops, raise animals, build the coziest farm.',
    milestones: [
      { key: 'level_3', label: 'Reach level 3', payoutCents: 75 },
      { key: 'first_purchase', label: 'Make your first in-game purchase', payoutCents: 500 },
    ],
  },
  {
    id: 'offer_gems',
    title: 'Gem Puzzle Blast',
    description: 'Match-3 puzzles with a twist.',
    milestones: [
      { key: 'level_20', label: 'Clear level 20', payoutCents: 150 },
      { key: 'level_50', label: 'Clear level 50', payoutCents: 400 },
    ],
  },
];

async function main() {
  for (const user of users) {
    await prisma.user.upsert({ where: { id: user.id }, update: user, create: user });
  }

  for (const { milestones, ...offer } of offers) {
    await prisma.offer.upsert({ where: { id: offer.id }, update: offer, create: offer });

    for (const [index, m] of milestones.entries()) {
      await prisma.milestone.upsert({
        where: { offerId_key: { offerId: offer.id, key: m.key } },
        update: { label: m.label, payoutCents: m.payoutCents, sortOrder: index },
        create: { ...m, offerId: offer.id, sortOrder: index },
      });
    }
  }

  console.log(`Seeded ${users.length} users and ${offers.length} offers.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
