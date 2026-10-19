import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService) {}

  // Working: used by the offer wall.
  findAll() {
    return this.prisma.offer.findMany({
      orderBy: { createdAt: 'asc' },
      include: { milestones: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  // Offers plus this user's progress: has the user started each offer, and which
  // milestones have been paid. "Paid" means a LedgerEntry exists, the ledger is the
  // single source of truth, so progress can never disagree with the balance.
  async findAllForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    // Three queries total, however many offers there are (no query per offer).
    const [offers, clicks, paid] = await Promise.all([
      this.findAll(),
      this.prisma.click.findMany({ where: { userId }, select: { offerId: true, clickId: true } }),
      this.prisma.ledgerEntry.findMany({
        where: { userId, milestoneId: { not: null } },
        select: { milestoneId: true },
      }),
    ]);

    const clickByOffer = new Map(clicks.map((c) => [c.offerId, c.clickId]));
    const paidMilestones = new Set(paid.map((p) => p.milestoneId));

    return offers.map((offer) => ({
      ...offer,
      started: clickByOffer.has(offer.id),
      clickId: clickByOffer.get(offer.id) ?? null,
      milestones: offer.milestones.map((m) => ({ ...m, credited: paidMilestones.has(m.id) })),
    }));
  }
}
