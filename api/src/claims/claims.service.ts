import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { applyRules, ClaimFacts } from './claim-rules';
import { CreateClaimDto } from './create-claim.dto';

const NEEDS_HUMAN_REPLY =
  "Thanks, we couldn't settle this automatically. A support agent will look at it and get back to you.";

@Injectable()
export class ClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  // "I reached level 10 but wasn't paid."
  //
  // SAFETY BOUNDARY: this service READS clicks, postbacks and the ledger, and WRITES only
  // the Claim table. There is deliberately no code path from here to LedgerEntry: whatever
  // the rules or a model say, a claim can never create money. Only signed postbacks can.
  async create(dto: CreateClaimDto) {
    const facts = await this.gatherFacts(dto.userId, dto.offerId);

    // Step 2: deterministic rules first (free, instant, can't hallucinate).
    const answer = applyRules(facts);

    // Step 3 (the model) plugs in here. Until it does, anything the rules can't decide
    // goes to the human queue, which is also what happens when the model is unavailable.
    const result = answer
      ? { status: 'resolved' as const, category: answer.category, source: 'rules' as const, reply: answer.reply }
      : { status: 'needs_human' as const, category: 'needs_human' as const, source: 'fallback' as const, reply: NEEDS_HUMAN_REPLY };

    try {
      return await this.prisma.claim.create({
        data: { userId: dto.userId, offerId: dto.offerId, message: dto.message, ...result },
      });
    } catch (error) {
      // unique(userId, offerId): the database enforces one claim per user and offer.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already filed a claim for this offer.');
      }
      throw error;
    }
  }

  // Step 1: code (not the model) collects the facts.
  private async gatherFacts(userId: string, offerId: string): Promise<ClaimFacts> {
    const [user, offer] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
      this.prisma.offer.findUnique({
        where: { id: offerId },
        include: { milestones: { orderBy: { sortOrder: 'asc' }, select: { id: true, key: true, label: true } } },
      }),
    ]);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);

    const clicks = await this.prisma.click.findMany({ where: { userId, offerId }, select: { clickId: true } });
    const [postbacks, ledger] = await Promise.all([
      this.prisma.postback.findMany({
        where: { clickId: { in: clicks.map((c) => c.clickId) } },
        orderBy: { receivedAt: 'asc' },
        select: { eventKey: true, status: true, rejectReason: true },
      }),
      this.prisma.ledgerEntry.findMany({
        where: { userId, offerId },
        orderBy: { createdAt: 'asc' },
        select: { milestoneId: true, amountCents: true, createdAt: true, milestone: { select: { label: true } } },
      }),
    ]);

    return {
      offer: { title: offer.title, milestones: offer.milestones },
      clickCount: clicks.length,
      postbacks,
      ledger: ledger.map((e) => ({
        milestoneId: e.milestoneId,
        milestoneLabel: e.milestone?.label ?? null,
        amountCents: e.amountCents,
        createdAt: e.createdAt,
      })),
    };
  }
}
