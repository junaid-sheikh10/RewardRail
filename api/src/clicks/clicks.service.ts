import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClickDto } from './create-click.dto';

@Injectable()
export class ClicksService {
  constructor(private readonly prisma: PrismaService) {}

  // The user taps "Start offer". One click per (user, offer): a second tap returns
  // the same clickId, so all progress stays attached to one click.
  async create({ userId, offerId }: CreateClickDto): Promise<{ clickId: string }> {
    const [user, offer] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
      this.prisma.offer.findUnique({ where: { id: offerId }, select: { id: true } }),
    ]);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);

    // Random, unguessable id: a guessable one would make fake postbacks easier.
    // (The signature is the real protection; this is defence in depth.)
    const clickId = `clk_${randomUUID()}`;

    // Insert first, catch the unique violation: the database decides who wins a race,
    // not a "find, then create" check that two simultaneous requests could both pass.
    try {
      await this.prisma.click.create({ data: { clickId, userId, offerId } });
      return { clickId };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.click.findUniqueOrThrow({
          where: { userId_offerId: { userId, offerId } },
          select: { clickId: true },
        });
        return { clickId: existing.clickId };
      }
      throw error;
    }
  }
}
