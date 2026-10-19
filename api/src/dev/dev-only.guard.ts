import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

// The simulator signs requests with the real secret, so it must not exist in production.
// Answering 404 (not 403) means a production server doesn't even admit the route exists.
// Checked per request, not at boot, so the behaviour is easy to test.
@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return true;
  }
}
