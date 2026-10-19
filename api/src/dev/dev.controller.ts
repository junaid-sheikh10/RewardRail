import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { signBody } from '../postbacks/signature';
import { DevOnlyGuard } from './dev-only.guard';
import { ResetUserDto, SimulatePostbackDto } from './simulate-postback.dto';

// DEMO ONLY. This is the "advertiser simulator" for the demo panel.
//
// The tradeoff, on purpose: the browser must never know POSTBACK_SECRET (anyone with it
// can forge credits). So the browser asks THIS server to act as the advertiser: the
// server signs with the secret and calls our own public POST /postbacks over real HTTP.
// Going through HTTP means the simulated postbacks hit exactly the same guard,
// validation and service as a real advertiser's would. It is switched off in production.
@Controller('dev')
@UseGuards(DevOnlyGuard)
export class DevController {
  private readonly secret: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.secret = config.getOrThrow<string>('POSTBACK_SECRET');
  }

  @Post('simulate-postback')
  @HttpCode(200)
  async simulate(@Body() dto: SimulatePostbackDto, @Req() req: Request) {
    const body = JSON.stringify({
      eventId: dto.eventId ?? `evt_${randomUUID()}`,
      clickId: dto.clickId,
      event: dto.event,
      payoutCents: dto.payoutCents ?? 0,
      timestamp: dto.timestamp ?? Math.floor(Date.now() / 1000),
    });
    const signature = dto.validSignature === false ? 'f'.repeat(64) : signBody(body, this.secret);

    // Our own listening port, from the socket: never from a client-controlled header.
    const url = `http://127.0.0.1:${req.socket.localPort}/postbacks`;
    const send = async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
        body,
      });
      return { httpStatus: res.status, body: (await res.json().catch(() => null)) as unknown };
    };

    const results = await Promise.all(Array.from({ length: dto.repeat ?? 1 }, send));
    return { eventId: JSON.parse(body).eventId as string, results };
  }

  // Lets the demo be run again: wipes ONE user's clicks, postbacks, claims and ledger entries.
  // Deliberately NOT how the real ledger works (it is append-only); this is a demo reset.
  @Post('reset')
  @HttpCode(200)
  async reset(@Body() dto: ResetUserDto) {
    return this.prisma.$transaction(async (tx) => {
      const clicks = await tx.click.findMany({ where: { userId: dto.userId }, select: { clickId: true } });
      const clickIds = clicks.map((c) => c.clickId);
      await tx.claim.deleteMany({ where: { userId: dto.userId } });
      const ledger = await tx.ledgerEntry.deleteMany({ where: { userId: dto.userId } });
      const postbacks = await tx.postback.deleteMany({ where: { clickId: { in: clickIds } } });
      await tx.click.deleteMany({ where: { userId: dto.userId } });
      return { deleted: { ledgerEntries: ledger.count, postbacks: postbacks.count, clicks: clickIds.length } };
    });
  }
}
