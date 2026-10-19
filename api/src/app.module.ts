import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaimsModule } from './claims/claims.module';
import { ClicksModule } from './clicks/clicks.module';
import { DevModule } from './dev/dev.module';
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
    ClaimsModule,
    PostbacksModule,
    WalletModule,
    DevModule, // demo-only routes; every route in it 404s when NODE_ENV=production
  ],
})
export class AppModule {}
