import { Controller, Get, Param } from '@nestjs/common';
import { WalletService } from './wallet.service';

@Controller('users/:id/wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  get(@Param('id') userId: string) {
    return this.wallet.getWallet(userId);
  }
}
