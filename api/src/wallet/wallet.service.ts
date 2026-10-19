import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface WalletView {
  balanceCents: number;
  entries: Array<{
    id: string;
    amountCents: number;
    type: string;
    offerTitle: string | null;
    milestoneLabel: string | null;
    createdAt: Date;
  }>;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  // Never store or cache a balance number: it is always derived from the ledger,
  // so it cannot drift from the entries that explain it.
  async getWallet(userId: string): Promise<WalletView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const [sum, entries] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({ _sum: { amountCents: true }, where: { userId } }),
      this.prisma.ledgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100, // the balance comes from the SUM above, so capping the history list is safe
        include: { offer: { select: { title: true } }, milestone: { select: { label: true } } },
      }),
    ]);

    return {
      balanceCents: sum._sum.amountCents ?? 0, // empty ledger: SUM is null
      entries: entries.map((e) => ({
        id: e.id,
        amountCents: e.amountCents,
        type: e.type,
        offerTitle: e.offer?.title ?? null, // null for future non-reward entries (cash-outs)
        milestoneLabel: e.milestone?.label ?? null,
        createdAt: e.createdAt,
      })),
    };
  }
}
