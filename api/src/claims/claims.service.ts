import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLAIM_CLASSIFIER, ClaimClassifier, MIN_CONFIDENCE, parseClassification } from './claim-classifier';
import { applyRules, ClaimFacts } from './claim-rules';
import { CreateClaimDto } from './create-claim.dto';

const NEEDS_HUMAN_REPLY =
  "Thanks, we couldn't settle this automatically. A support agent will look at it and get back to you.";

type Outcome = {
  status: 'resolved' | 'needs_human';
  category: 'already_credited' | 'not_started' | 'postback_rejected' | 'not_tracked_yet' | 'likely_fraud' | 'needs_human';
  source: 'rules' | 'llm' | 'fallback';
  confidence?: number;
  reply: string;
};

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLAIM_CLASSIFIER) private readonly classifier: ClaimClassifier,
  ) {}

  // "I reached level 10 but wasn't paid."
  //
  // SAFETY BOUNDARY: this service READS clicks, postbacks and the ledger, and WRITES only
  // the Claim table. There is deliberately no code path from here to LedgerEntry: whatever
  // the rules or a model say, a claim can never create money. Only signed postbacks can.
  async create(dto: CreateClaimDto) {
    const facts = await this.gatherFacts(dto.userId, dto.offerId);

    // Step 2: deterministic rules first (free, instant, can't hallucinate).
    const answer = applyRules(facts);
    // Step 3: only if the rules can't decide, ask the model; any problem ends at a human.
    const result: Outcome = answer
      ? { status: 'resolved', category: answer.category, source: 'rules', reply: answer.reply }
      : await this.askModel(dto.message, facts);

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

  // The model only CLASSIFIES and DRAFTS A REPLY. Its output is untrusted input: parsed,
  // validated with zod, and checked against a confidence floor. Every way this can go
  // wrong (no key, network error, refusal, invalid JSON, wrong shape, low confidence)
  // ends the same safe way: the claim waits for a person.
  private async askModel(message: string, facts: ClaimFacts): Promise<Outcome> {
    const toHuman = (confidence?: number): Outcome => ({
      status: 'needs_human',
      category: 'needs_human',
      source: 'fallback',
      confidence,
      reply: NEEDS_HUMAN_REPLY,
    });

    if (!this.classifier.isEnabled()) return toHuman();

    let raw: unknown;
    try {
      raw = await this.classifier.classify({ message, facts });
    } catch (error) {
      this.logger.warn(`Claim triage model call failed: ${(error as Error).message}`);
      return toHuman();
    }

    const parsed = parseClassification(raw);
    if (!parsed.ok) {
      this.logger.warn(`Claim triage output rejected (${parsed.reason})`);
      return toHuman();
    }

    const { category, confidence, reply } = parsed.value;
    if (confidence < MIN_CONFIDENCE) return toHuman(confidence); // keep the number for the admin
    if (category === 'needs_human') return { status: 'needs_human', category, source: 'llm', confidence, reply: NEEDS_HUMAN_REPLY };
    return { status: 'resolved', category, source: 'llm', confidence, reply };
  }

  // The support queue (and history). Newest first, capped.
  list(status?: 'resolved' | 'needs_human') {
    return this.prisma.claim.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { offer: { select: { title: true } }, user: { select: { displayName: true } } },
    });
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
