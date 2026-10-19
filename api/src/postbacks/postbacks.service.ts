import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { Click, Milestone, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PostbackDto, PostbackResult } from './dto/postback.dto';

type RejectReason = 'unknown_click' | 'unknown_milestone' | 'timestamp_in_future';

// What we decided about a postback BEFORE writing anything.
type Decision =
  | { kind: 'reject'; reason: RejectReason }
  | { kind: 'credit'; click: Click; milestone: Milestone };

// Replay protection (decision Q5). We only reject timestamps in the FUTURE beyond a
// small clock-skew allowance. We deliberately accept old timestamps: late postbacks are
// real money for a real user, and replays are already harmless because a valid
// signature + the unique eventId means a replay can never pay twice.
const MAX_FUTURE_SKEW_SECONDS = 5 * 60;

@Injectable()
export class PostbacksService {
  private readonly logger = new Logger(PostbacksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // The signature was already verified by SignatureGuard before we get here.
  //
  // Shape: (1) decide with plain reads, (2) write the outcome, (3) if the database
  // says "already exists", turn that into a normal answer. The UNIQUE constraints are
  // the real arbiter; we never "check, then insert" and trust the check.
  async handle(dto: PostbackDto): Promise<PostbackResult> {
    const decision = await this.decide(dto);

    try {
      return await this.write(dto, decision);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      return this.resolveUniqueViolation(dto, error);
    }
  }

  // Reads only. Clicks and milestones don't change while a postback is in flight,
  // so there is no race here worth a transaction.
  private async decide(dto: PostbackDto): Promise<Decision> {
    if (dto.timestamp > Math.floor(Date.now() / 1000) + MAX_FUTURE_SKEW_SECONDS) {
      return { kind: 'reject', reason: 'timestamp_in_future' };
    }

    const click = await this.prisma.click.findUnique({ where: { clickId: dto.clickId } });
    if (!click) return { kind: 'reject', reason: 'unknown_click' };

    const milestone = await this.prisma.milestone.findUnique({
      where: { offerId_key: { offerId: click.offerId, key: dto.event } },
    });
    if (!milestone) return { kind: 'reject', reason: 'unknown_milestone' };

    // Never trust the caller for amounts: we pay OUR number. A mismatch is a data
    // problem on the advertiser's side, not fraud by itself, so we still credit.
    if (dto.payoutCents !== milestone.payoutCents) {
      this.logger.warn(
        `Payout mismatch for ${dto.eventId}: payload says ${dto.payoutCents}, ` +
          `milestone ${milestone.key} pays ${milestone.payoutCents}. Crediting ${milestone.payoutCents}.`,
      );
    }

    return { kind: 'credit', click, milestone };
  }

  private async write(dto: PostbackDto, decision: Decision): Promise<PostbackResult> {
    if (decision.kind === 'reject') {
      // Stored so we can answer "why wasn't I paid?" later, and shown in the demo panel.
      await this.prisma.postback.create({
        data: this.postbackData(dto, 'rejected', decision.reason),
      });
      return { status: 'rejected', reason: decision.reason };
    }

    const { click, milestone } = decision;

    // ONE transaction: the postback row and the ledger entry exist together or not at
    // all. A crash in the middle can never leave a postback marked "credited" with no
    // money behind it (or money with no postback explaining it).
    await this.prisma.$transaction(async (tx) => {
      const postback = await tx.postback.create({ data: this.postbackData(dto, 'credited') });
      await tx.ledgerEntry.create({
        data: {
          userId: click.userId,
          amountCents: milestone.payoutCents, // our number, not dto.payoutCents
          type: 'reward',
          offerId: click.offerId,
          milestoneId: milestone.id,
          postbackId: postback.id,
        },
      });
    });

    return { status: 'credited', amountCents: milestone.payoutCents };
  }

  // Which UNIQUE constraint fired?
  //
  // Why this is handled OUTSIDE the transaction: in Postgres, once a statement fails
  // inside a transaction, the whole transaction is aborted and nothing in it can
  // continue or be saved. So by the time we catch the error, the postback row (if it
  // was created in the same transaction) has been rolled back too. We therefore catch
  // here, and if we still want a record, write it in a separate small write.
  private async resolveUniqueViolation(
    dto: PostbackDto,
    error: Prisma.PrismaClientKnownRequestError,
  ): Promise<PostbackResult> {
    const target = [error.meta?.target].flat().map(String);

    if (target.includes('eventId')) {
      // This exact event was already received. A retry, not an error.
      // (Stage 3 refines this: a previously REJECTED eventId must be re-evaluated.)
      return { status: 'duplicate' };
    }

    if (target.includes('milestoneId')) {
      // A different eventId for a milestone this user was already paid for. The
      // ledger's unique(userId, milestoneId) is what stopped the double payment.
      try {
        await this.prisma.postback.create({
          data: this.postbackData(dto, 'duplicate', 'milestone_already_paid'),
        });
      } catch (inner) {
        // The same eventId raced us and was recorded first. Still a duplicate.
        if (!(inner instanceof Prisma.PrismaClientKnownRequestError) || inner.code !== 'P2002') {
          throw inner;
        }
      }
      return { status: 'duplicate' };
    }

    throw error; // a unique violation we did not expect: do not hide it
  }

  private postbackData(
    dto: PostbackDto,
    status: 'credited' | 'duplicate' | 'rejected',
    rejectReason?: string,
  ): Prisma.PostbackCreateInput {
    return {
      eventId: dto.eventId,
      clickId: dto.clickId,
      eventKey: dto.event,
      payoutCents: dto.payoutCents, // what the advertiser CLAIMED, kept for auditing
      rawPayload: { ...dto },
      status,
      rejectReason,
    };
  }

  // TODO (Stage 4): recent postbacks for the demo panel, newest first,
  // including duplicates and rejected ones. Filter by clickId if given; cap at ~50.
  async list(_clickId?: string): Promise<unknown[]> {
    throw new NotImplementedException('GET /postbacks is not implemented yet');
  }
}
