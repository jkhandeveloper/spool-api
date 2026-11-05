import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

// Requires a Postgres database; see README ("Running the tests").
process.env.DATABASE_URL ??=
  'postgres://spool:spool@localhost:55432/spool_test';
process.env.NODE_ENV = 'test';
process.env.SUMMARY_PROVIDER = 'local';
process.env.DB_SYNCHRONIZE = 'false';

const TRANSCRIPT =
  "I've been feeling a lot of stress at work lately and it spills into the evenings. " +
  'We talked about how hard it is to say no when my manager asks for more. ' +
  'I want to protect some time for myself to recharge after work each day.';

describe('Spool API (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = setupApp(moduleRef.createNestApplication()) as INestApplication<App>;
    await app.init();
    const db = app.get(DataSource);
    await db.query(
      'TRUNCATE users, password_resets, journal_entries, therapy_sessions, goals, goal_check_ins, appointments CASCADE',
    );
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  let n = 0;
  async function signUp(extra: Record<string, unknown> = {}) {
    const email = `user${Date.now()}${n++}@example.com`;
    const res = await http
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct horse battery', ...extra })
      .expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken as string}` };
    return {
      email,
      auth,
      tokens: res.body as { accessToken: string; refreshToken: string },
    };
  }

  async function waitForStatus(
    auth: Record<string, string>,
    id: string,
    status: string,
  ) {
    for (let i = 0; i < 50; i++) {
      const res = await http
        .get(`/api/v1/sessions/${id}`)
        .set(auth)
        .expect(200);
      if (res.body.status === status) return res.body;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`session ${id} never reached ${status}`);
  }

  it('reports health without auth', async () => {
    await http.get('/api/v1/health').expect(200, { status: 'ok' });
  });

  describe('auth', () => {
    it('rejects requests without a token', async () => {
      await http.get('/api/v1/me').expect(401);
    });

    it('registers, logs in, refreshes and logs out', async () => {
      const { email, auth, tokens } = await signUp({ displayName: 'Sam' });
      const me = await http.get('/api/v1/me').set(auth).expect(200);
      expect(me.body).toMatchObject({
        email,
        displayName: 'Sam',
        journalOnly: false,
      });
      expect(me.body.passwordHash).toBeUndefined();

      await http
        .post('/api/v1/auth/register')
        .send({ email, password: 'another password' })
        .expect(409);
      await http
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong password' })
        .expect(401);
      await http
        .post('/api/v1/auth/login')
        .send({ email: email.toUpperCase(), password: 'correct horse battery' })
        .expect(200);

      const refreshed = await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);
      expect(refreshed.body.accessToken).toEqual(expect.any(String));

      // An access token cannot be used as a refresh token.
      await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.accessToken })
        .expect(401);

      await http.post('/api/v1/auth/logout').set(auth).expect(204);
      await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('resets a password with a single-use token', async () => {
      const { email, tokens } = await signUp();
      const forgot = await http
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(202);
      const token = forgot.body.devResetToken as string;
      expect(token).toEqual(expect.any(String));

      // Unknown emails get the same response shape, without a token.
      const unknown = await http
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@example.com' })
        .expect(202);
      expect(unknown.body.devResetToken).toBeUndefined();

      await http
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'brand new password' })
        .expect(204);
      await http
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'again again' })
        .expect(400);
      await http
        .post('/api/v1/auth/login')
        .send({ email, password: 'brand new password' })
        .expect(200);
      // Resetting signs out existing devices.
      await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('validates input', async () => {
      await http
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);
      await http
        .post('/api/v1/auth/register')
        .send({
          email: 'a@example.com',
          password: 'long enough pw',
          isAdmin: true,
        })
        .expect(400);
    });
  });

  describe('privacy, settings and account', () => {
    it('records the privacy review and blocks recording in journal-only mode', async () => {
      const { auth } = await signUp();
      const res = await http
        .post('/api/v1/me/privacy-review')
        .set(auth)
        .send({ journalOnly: true })
        .expect(200);
      expect(res.body.privacyReviewedAt).toEqual(expect.any(String));
      await http
        .post('/api/v1/sessions')
        .set(auth)
        .send({ consentConfirmed: true })
        .expect(403);

      await http
        .patch('/api/v1/me')
        .set(auth)
        .send({ journalOnly: false, textSize: 'large' })
        .expect(200);
      await http
        .post('/api/v1/sessions')
        .set(auth)
        .send({ consentConfirmed: true })
        .expect(201);
      await http
        .patch('/api/v1/me')
        .set(auth)
        .send({ reminderTime: '25:00' })
        .expect(400);
    });

    it('exports data and deletes the account with password confirmation', async () => {
      const { auth, email } = await signUp();
      await http
        .post('/api/v1/journal')
        .set(auth)
        .send({ body: 'A note' })
        .expect(201);
      const exported = await http
        .get('/api/v1/me/export')
        .set(auth)
        .expect(200);
      expect(exported.body.journal).toHaveLength(1);
      expect(exported.body.profile.email).toBe(email);

      await http
        .post('/api/v1/me/delete-account')
        .set(auth)
        .send({ password: 'nope' })
        .expect(401);
      await http
        .post('/api/v1/me/delete-account')
        .set(auth)
        .send({ password: 'correct horse battery' })
        .expect(204);
      await http
        .post('/api/v1/auth/login')
        .send({ email, password: 'correct horse battery' })
        .expect(401);
    });
  });

  describe('journal', () => {
    it('creates, lists, edits and deletes entries, scoped to the owner', async () => {
      const { auth } = await signUp();
      const other = await signUp();

      const created = await http
        .post('/api/v1/journal')
        .set(auth)
        .send({
          body: 'Finding my balance\nI need a little more space to recharge.',
        })
        .expect(201);
      expect(created.body.title).toBe('Finding my balance');
      expect(created.body.includeInPrompts).toBe(true);
      const id = created.body.id as string;

      const list = await http.get('/api/v1/journal').set(auth).expect(200);
      expect(list.body.total).toBe(1);

      await http.get(`/api/v1/journal/${id}`).set(other.auth).expect(404);
      await http
        .patch(`/api/v1/journal/${id}`)
        .set(other.auth)
        .send({ title: 'x' })
        .expect(404);

      const updated = await http
        .patch(`/api/v1/journal/${id}`)
        .set(auth)
        .send({ title: 'Balance', includeInPrompts: false })
        .expect(200);
      expect(updated.body).toMatchObject({
        title: 'Balance',
        includeInPrompts: false,
      });

      await http.delete(`/api/v1/journal/${id}`).set(auth).expect(204);
      await http.get(`/api/v1/journal/${id}`).set(auth).expect(404);
      await http.get('/api/v1/journal/not-a-uuid').set(auth).expect(400);
    });
  });

  describe('session journey', () => {
    it('turns journal notes into prompts, summarizes, reviews and saves goals', async () => {
      const { auth } = await signUp();
      await http
        .post('/api/v1/journal')
        .set(auth)
        .send({ title: 'Work stress', body: 'Overwhelmed.' })
        .expect(201);
      await http
        .post('/api/v1/journal')
        .set(auth)
        .send({
          title: 'Private',
          body: 'Not for the session',
          includeInPrompts: false,
        })
        .expect(201);

      const prompts = await http
        .get('/api/v1/sessions/prompts')
        .set(auth)
        .expect(200);
      expect(prompts.body.map((p: { prompt: string }) => p.prompt)).toEqual([
        'Work stress',
      ]);

      await http
        .post('/api/v1/sessions')
        .set(auth)
        .send({ consentConfirmed: false })
        .expect(400);
      const started = await http
        .post('/api/v1/sessions')
        .set(auth)
        .send({ consentConfirmed: true, prompts: ['Work stress'] })
        .expect(201);
      expect(started.body.status).toBe('recording');
      const id = started.body.id as string;

      const submitted = await http
        .post(`/api/v1/sessions/${id}/transcript`)
        .set(auth)
        .send({ transcript: TRANSCRIPT, durationSeconds: 768 })
        .expect(202);
      expect(submitted.body.status).toBe('processing');
      expect(submitted.body.transcript).toBeUndefined();

      // Can't submit twice.
      await http
        .post(`/api/v1/sessions/${id}/transcript`)
        .set(auth)
        .send({ transcript: TRANSCRIPT, durationSeconds: 1 })
        .expect(409);

      const draft = await waitForStatus(auth, id, 'draft');
      expect(draft.mainPoints.length).toBeGreaterThan(0);
      expect(draft.dailyGoal).toEqual(expect.any(String));

      // The transcript is erased once the draft exists.
      const raw = await app
        .get(DataSource)
        .query('SELECT transcript FROM therapy_sessions WHERE id = $1', [id]);
      expect(raw[0].transcript).toBeNull();

      // Draft is not yet in history.
      expect(
        (await http.get('/api/v1/sessions').set(auth).expect(200)).body,
      ).toHaveLength(0);

      await http
        .patch(`/api/v1/sessions/${id}`)
        .set(auth)
        .send({
          title: 'Making space for yourself',
          dailyGoal: 'Take a five-minute walk.',
        })
        .expect(200);

      const saved = await http
        .post(`/api/v1/sessions/${id}/save`)
        .set(auth)
        .send({ keep: true })
        .expect(200);
      expect(saved.body.session.status).toBe('saved');

      const history = await http.get('/api/v1/sessions').set(auth).expect(200);
      expect(history.body).toHaveLength(1);
      expect(history.body[0].title).toBe('Making space for yourself');

      const goals = await http.get('/api/v1/goals').set(auth).expect(200);
      expect(
        goals.body.map((g: { cadence: string; text: string }) => [
          g.cadence,
          g.text,
        ]),
      ).toEqual([
        ['daily', 'Take a five-minute walk.'],
        ['weekly', 'Practice one clear boundary.'],
      ]);

      // Notes from before the saved session are no longer offered as prompts.
      expect(
        (await http.get('/api/v1/sessions/prompts').set(auth).expect(200)).body,
      ).toHaveLength(0);

      // A second session's goals replace the first ones; "keep" false discards the summary itself.
      const second = await http
        .post('/api/v1/sessions')
        .set(auth)
        .send({ consentConfirmed: true })
        .expect(201);
      await http
        .post(`/api/v1/sessions/${second.body.id}/transcript`)
        .set(auth)
        .send({ transcript: TRANSCRIPT, durationSeconds: 60 })
        .expect(202);
      await waitForStatus(auth, second.body.id as string, 'draft');
      await http
        .patch(`/api/v1/sessions/${second.body.id}`)
        .set(auth)
        .send({ dailyGoal: 'Drink a glass of water.' })
        .expect(200);
      const notKept = await http
        .post(`/api/v1/sessions/${second.body.id}/save`)
        .set(auth)
        .send({ keep: false })
        .expect(200);
      expect(notKept.body.session).toBeNull();
      await http
        .get(`/api/v1/sessions/${second.body.id}`)
        .set(auth)
        .expect(404);

      const goalsAfter = await http.get('/api/v1/goals').set(auth).expect(200);
      expect(
        goalsAfter.body.find((g: { cadence: string }) => g.cadence === 'daily')
          .text,
      ).toBe('Drink a glass of water.');
      expect(goalsAfter.body).toHaveLength(2);
    });

    it('fails without a retry when nothing was heard, and can be discarded', async () => {
      const { auth } = await signUp();
      const s = await http
        .post('/api/v1/sessions')
        .set(auth)
        .send({ consentConfirmed: true })
        .expect(201);
      const res = await http
        .post(`/api/v1/sessions/${s.body.id}/transcript`)
        .set(auth)
        .send({ transcript: 'hello', durationSeconds: 3 })
        .expect(202);
      expect(res.body).toMatchObject({ status: 'failed', canRetry: false });
      await http
        .post(`/api/v1/sessions/${s.body.id}/retry`)
        .set(auth)
        .expect(409);

      const pending = await http
        .get('/api/v1/sessions/pending')
        .set(auth)
        .expect(200);
      expect(pending.body).toHaveLength(1);
      await http.delete(`/api/v1/sessions/${s.body.id}`).set(auth).expect(204);
    });
  });

  describe('goals', () => {
    it('supports check-ins, edits and completion', async () => {
      const { auth } = await signUp();
      const goal = await http
        .post('/api/v1/goals')
        .set(auth)
        .send({ cadence: 'daily', text: 'Take a grounding break' })
        .expect(201);
      const id = goal.body.id as string;

      await http
        .post(`/api/v1/goals/${id}/check-ins`)
        .set(auth)
        .send({ completed: true, reflection: 'It helped' })
        .expect(201);
      const detail = await http
        .get(`/api/v1/goals/${id}`)
        .set(auth)
        .expect(200);
      expect(detail.body.doneThisPeriod).toBe(true);
      expect(detail.body.checkIns).toHaveLength(1);

      await http
        .patch(`/api/v1/goals/${id}`)
        .set(auth)
        .send({ text: 'Take a 5 minute break' })
        .expect(200);
      const done = await http
        .patch(`/api/v1/goals/${id}`)
        .set(auth)
        .send({ completed: true })
        .expect(200);
      expect(done.body.active).toBe(false);
      expect(
        (await http.get('/api/v1/goals').set(auth).expect(200)).body,
      ).toHaveLength(0);
    });
  });

  describe('appointments, graduation and today', () => {
    it('manages appointments and summarizes the day', async () => {
      const { auth } = await signUp();
      const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
      const later = new Date(Date.now() + 9 * 86_400_000).toISOString();

      const a = await http
        .post('/api/v1/appointments')
        .set(auth)
        .send({ startsAt: later, kind: 'video' })
        .expect(201);
      const b = await http
        .post('/api/v1/appointments')
        .set(auth)
        .send({ startsAt: soon, location: 'Clinic' })
        .expect(201);
      await http
        .post('/api/v1/appointments')
        .set(auth)
        .send({ startsAt: 'tomorrow' })
        .expect(400);

      const next = await http
        .get('/api/v1/appointments/next')
        .set(auth)
        .expect(200);
      expect(next.body.appointment.id).toBe(b.body.id);

      await http
        .patch(`/api/v1/appointments/${b.body.id}`)
        .set(auth)
        .send({ location: 'Room 4' })
        .expect(200);
      await http
        .delete(`/api/v1/appointments/${b.body.id}`)
        .set(auth)
        .expect(204);
      const nextAfter = await http
        .get('/api/v1/appointments/next')
        .set(auth)
        .expect(200);
      expect(nextAfter.body.appointment.id).toBe(a.body.id);

      const list = await http.get('/api/v1/appointments').set(auth).expect(200);
      expect(list.body).toHaveLength(1);

      const today = await http
        .get('/api/v1/today?hour=20')
        .set(auth)
        .expect(200);
      expect(today.body).toMatchObject({
        reminder: expect.any(String),
        meditation: { id: 'safe-place', label: 'Evening meditation' },
        nextAppointment: { id: a.body.id },
        journalThisWeek: 0,
      });

      const grad = await http.post('/api/v1/me/graduate').set(auth).expect(200);
      expect(grad.body.graduatedAt).toEqual(expect.any(String));
      expect(
        (await http.get('/api/v1/appointments/next').set(auth).expect(200)).body
          .appointment,
      ).toBeNull();
    });

    it('serves meditations', async () => {
      const { auth } = await signUp();
      const list = await http.get('/api/v1/meditations').set(auth).expect(200);
      expect(list.body.length).toBeGreaterThan(0);
      await http.get('/api/v1/meditations/safe-place').set(auth).expect(200);
      await http.get('/api/v1/meditations/nope').set(auth).expect(404);
    });
  });
});
