import { Body, Controller, Post } from '@nestjs/common';
import { ClicksService } from './clicks.service';
import { CreateClickDto } from './create-click.dto';

@Controller('clicks')
export class ClicksController {
  constructor(private readonly clicks: ClicksService) {}

  @Post()
  create(@Body() dto: CreateClickDto) {
    return this.clicks.create(dto);
  }
}
