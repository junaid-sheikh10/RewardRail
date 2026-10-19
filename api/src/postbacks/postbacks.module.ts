import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { PostbacksController } from './postbacks.controller';
import { PostbacksService } from './postbacks.service';
import { SignatureGuard } from './signature.guard';

@Module({
  imports: [RealtimeModule],
  controllers: [PostbacksController],
  providers: [PostbacksService, SignatureGuard],
})
export class PostbacksModule {}
