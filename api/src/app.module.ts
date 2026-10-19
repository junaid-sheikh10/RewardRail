import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClicksModule } from './clicks/clicks.module';
import { HealthModule } from './health/health.module';
import { OffersModule } from './offers/offers.module';
import { PostbacksModule } from './postbacks/postbacks.module';
import { PrismaModule } from './prisma/prisma.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    OffersModule,
    ClicksModule,
    PostbacksModule,
    WalletModule,
  ],
})
export class AppModule {}
