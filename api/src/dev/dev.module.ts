import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevOnlyGuard } from './dev-only.guard';

@Module({
  controllers: [DevController],
  providers: [DevOnlyGuard],
})
export class DevModule {}
