import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ClaimsService } from './claims.service';
import { CreateClaimDto } from './create-claim.dto';

@Controller('claims')
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Post()
  create(@Body() dto: CreateClaimDto) {
    return this.claims.create(dto);
  }

  // The support queue. Open in this demo (there is no auth); a real system would restrict it.
  @Get()
  list(@Query('status') status?: string) {
    if (status !== undefined && status !== 'resolved' && status !== 'needs_human') {
      throw new BadRequestException('status must be "resolved" or "needs_human"');
    }
    return this.claims.list(status);
  }
}
