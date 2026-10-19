import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { isValidSignature } from './signature';

// Runs BEFORE the ValidationPipe (Nest order: guards, then pipes). So a caller
// without a valid signature gets a bare 401 and learns nothing about our payload
// schema, and a malformed body is only judged (400) after the sender proved who they are.
// Nothing is stored here: unauthenticated requests never touch the database.
@Injectable()
export class SignatureGuard implements CanActivate {
  private readonly secret: string;

  constructor(config: ConfigService) {
    // getOrThrow: if the secret is missing the app refuses to boot. Failing open here
    // (an empty secret) would let anyone who guesses that sign their own postbacks.
    this.secret = config.getOrThrow<string>('POSTBACK_SECRET');
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const signature = req.header('x-signature');
    if (!isValidSignature(req.rawBody, signature, this.secret)) {
      throw new UnauthorizedException('Invalid signature');
    }
    return true;
  }
}
