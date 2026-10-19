import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

// The simulator signs requests with the real secret, so it must not exist in production.
// Answering 404 (not 403) means a production server doesn't even admit the route exists.
// Checked per request, not at boot, so the behaviour is easy to test.
//
// One deliberate exception: a PUBLIC DEMO (e.g. the hosted portfolio copy) needs the
// simulator, because the demo panel is the point. Setting DEMO_MODE=true opts in
// explicitly. In that mode anyone can create credits for the demo users, which is
// acceptable only because the database holds nothing but demo data.
@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true') {
      throw new NotFoundException();
    }
    return true;
  }
}
