import { Module } from '@nestjs/common';
import { PostbacksController } from './postbacks.controller';
import { PostbacksService } from './postbacks.service';
import { SignatureGuard } from './signature.guard';

@Module({
  controllers: [PostbacksController],
  providers: [PostbacksService, SignatureGuard],
})
export class PostbacksModule {}
