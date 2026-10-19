import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { createTestApp, resetDb } from './helpers/app';
import { createClick, makeBody, sendPostback, seedBasics } from './helpers/postbacks';

// Real server on a real port, real Socket.IO clients, real database.
describe('Realtime: wallet.credited (Phase 3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await app.listen(0);
    url = `http://localhost:${new URL(await app.getUrl()).port}`;
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBasics(prisma);
    await prisma.user.create({ data: { id: 'user_other', displayName: 'Other' } });
  });

  afterEach(() => {
    while (sockets.length) sockets.pop()!.disconnect();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  // Connects as a user and collects every wallet.credited event it receives.
  async function connectAs(userId: string | undefined) {
    const socket = io(url, { auth: userId ? { userId } : {}, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    const events: any[] = [];
    socket.on('wallet.credited', (e) => events.push(e));
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('disconnect', () => reject(new Error('server closed the socket')));
      socket.on('connect_error', reject);
    }).catch(() => undefined);
    return { socket, events };
  }

  const waitFor = async (condition: () => boolean, ms = 2000) => {
    const end = Date.now() + ms;
    while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  };
  const settle = () => new Promise((r) => setTimeout(r, 300)); // time for an event that should NOT arrive

  it('credit → the user receives wallet.credited with the documented payload', async () => {
    const { events } = await connectAs('user_t');
    await sendPostback(app, makeBody()).expect(200);
    await waitFor(() => events.length > 0);
    expect(events).toEqual([
      { userId: 'user_t', amountCents: 250, offerTitle: 'Dragon', milestoneLabel: 'Reach level 10' },
    ]);
  });

  it('nothing is emitted while the credit is still uncommitted; the event comes after the commit', async () => {
    // Make the credit's ledger insert BLOCK mid-transaction: a second, still-open
    // transaction holds an uncommitted row for the same (user, milestone), and Postgres
    // makes our insert wait for it. So the credit is provably "in progress" for as long
    // as we choose, with no timing guesswork.
    const milestone = await prisma.milestone.findFirstOrThrow({ where: { key: 'level_10' } });
    let release!: () => void;
    let holding!: () => void;
    const lockTaken = new Promise<void>((r) => (holding = r));
    const blocker = prisma
      .$transaction(
        async (tx) => {
          await tx.ledgerEntry.create({
            data: { userId: 'user_t', amountCents: 1, offerId: 'offer_t', milestoneId: milestone.id },
          });
          holding();
          await new Promise<void>((r) => (release = r));
          throw new Error('roll back the blocker'); // we never want this row to exist
        },
        { timeout: 15_000 },
      )
      .catch(() => undefined);
    await lockTaken;

    try {
      const { events } = await connectAs('user_t');
      const request = sendPostback(app, makeBody()).then((res) => res); // .then() starts it
      await settle(); // the credit is now stuck waiting for the lock
      expect(events).toHaveLength(0); // an emit-before-commit would already have fired

      release();
      await blocker;
      const res = await request;
      expect(res.body).toEqual({ status: 'credited', amountCents: 250 });
      await waitFor(() => events.length > 0);
      expect(events).toHaveLength(1);
      expect(await prisma.ledgerEntry.count()).toBe(1);
    } finally {
      // Even if an assertion failed above, never leave the lock held: it would stall every later test.
      release?.();
      await blocker;
    }
  });

  it("another user's screen does not receive it", async () => {
    const mine = await connectAs('user_t');
    const other = await connectAs('user_other');
    await sendPostback(app, makeBody()).expect(200);
    await waitFor(() => mine.events.length > 0);
    await settle();
    expect(mine.events).toHaveLength(1);
    expect(other.events).toHaveLength(0);
  });

  it('several tabs of the same user all receive it', async () => {
    const tab1 = await connectAs('user_t');
    const tab2 = await connectAs('user_t');
    await sendPostback(app, makeBody()).expect(200);
    await waitFor(() => tab1.events.length > 0 && tab2.events.length > 0);
    expect(tab1.events).toHaveLength(1);
    expect(tab2.events).toHaveLength(1);
  });

  it('a duplicate does NOT emit again (one credit, one event)', async () => {
    const { events } = await connectAs('user_t');
    await sendPostback(app, makeBody()).expect(200);
    await sendPostback(app, makeBody()).expect(200); // same eventId
    await sendPostback(app, makeBody({ eventId: 'evt_other' })).expect(200); // same milestone
    await waitFor(() => events.length > 0);
    await settle();
    expect(events).toHaveLength(1);
  });

  it('50× concurrent identical postbacks emit exactly once', async () => {
    const { events } = await connectAs('user_t');
    await Promise.all(Array.from({ length: 50 }, () => sendPostback(app, makeBody())));
    await waitFor(() => events.length > 0);
    await settle();
    expect(events).toHaveLength(1);
  });

  it('a rejected postback does NOT emit', async () => {
    const { events } = await connectAs('user_t');
    await sendPostback(app, makeBody({ clickId: 'clk_nope' })).expect(200);
    await settle();
    expect(events).toHaveLength(0);
  });

  it('a rejected postback that is later credited on retry DOES emit (once)', async () => {
    await prisma.click.delete({ where: { clickId: 'clk_test' } });
    const { events } = await connectAs('user_t');
    await sendPostback(app, makeBody()).expect(200); // rejected: no click
    await createClick(prisma);
    await sendPostback(app, makeBody()).expect(200); // credited on retry
    await waitFor(() => events.length > 0);
    await settle();
    expect(events).toHaveLength(1);
  });

  it('if the emit throws, the HTTP response and the money are unaffected', async () => {
    jest.spyOn(app.get(RealtimeGateway), 'emitCredited').mockImplementation(() => {
      throw new Error('socket server exploded');
    });
    const res = await sendPostback(app, makeBody()).expect(200);
    expect(res.body).toEqual({ status: 'credited', amountCents: 250 });
    expect(await prisma.ledgerEntry.count()).toBe(1);
  });

  it('a connection without a userId is closed', async () => {
    const socket = io(url, { auth: {}, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('disconnect', () => resolve()));
    expect(socket.connected).toBe(false);
  });
});
