import { Controller, Get, Param } from '@nestjs/common';
import { OffersService } from './offers.service';

@Controller()
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get('offers')
  findAll() {
    return this.offers.findAll();
  }

  @Get('users/:id/offers')
  findAllForUser(@Param('id') userId: string) {
    return this.offers.findAllForUser(userId);
  }
}
