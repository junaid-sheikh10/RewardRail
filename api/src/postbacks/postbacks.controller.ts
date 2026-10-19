import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { PostbackDto } from './dto/postback.dto';
import { PostbacksService } from './postbacks.service';
import { SignatureGuard } from './signature.guard';

@Controller('postbacks')
export class PostbacksController {
  constructor(private readonly postbacks: PostbacksService) {}

  // 200 for credited, duplicate AND rejected: the request itself was handled.
  // If we answered errors for duplicates, the advertiser would keep retrying.
  // A bad or missing signature gets 401 from SignatureGuard, which runs before the
  // ValidationPipe, so unsigned callers never see our validation errors.
  @Post()
  @UseGuards(SignatureGuard)
  @HttpCode(200)
  receive(@Body() dto: PostbackDto) {
    return this.postbacks.handle(dto);
  }

  @Get()
  list(@Query('clickId') clickId?: string) {
    return this.postbacks.list(clickId);
  }
}
