import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Read-only analytics over the whole database (admin) or one user (insights).
 *
 * Privacy: admin queries only touch counts, timestamps, statuses and durations.
 * They never select journal bodies/titles, session summaries, topics, goal text
 * or reflections. A user's own insights may use their own topics and word counts.
 *
 * "Active" means the user did something: wrote a journal entry, started a
 * session or checked in on a goal. Sign-ins and page views are not tracked.
 */

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const DAY_MS = 86_400_000;

// Every user action that counts as activity, with its owner and timestamp.
const ACTIVITY = `
  SELECT "userId", "createdAt" AS at, 'journal' AS kind FROM journal_entries
  UNION ALL
  SELECT "userId", "createdAt", 'session' FROM therapy_sessions
  UNION ALL
  SELECT g."userId", c."createdAt", 'checkin'
    FROM goal_check_ins c JOIN goals g ON g.id = c."goalId"`;

// Local-midnight start of a window of $2 days ending today, in time zone $1.
const SINCE = `((date_trunc('day', now() AT TIME ZONE $1) - make_interval(days => $2::int - 1)) AT TIME ZONE $1)`;

const USER_ROW = `
  SELECT u.id, u.email, u."displayName", u."createdAt", u."journalOnly",
         u."enabled",
         u."graduatedAt", u."privacyReviewedAt",
    (SELECT count(*) FROM journal_entries j WHERE j."userId" = u.id)::int AS "journalEntries",
    (SELECT count(*) FROM therapy_sessions s WHERE s."userId" = u.id AND s.status = 'saved')::int AS "savedSessions",
    (SELECT count(*) FROM goal_check_ins c JOIN goals g ON g.id = c."goalId" WHERE g."userId" = u.id)::int AS "checkIns",
    (SELECT count(*) FROM appointments a WHERE a."userId" = u.id AND a."cancelledAt" IS NULL)::int AS appointments,
    (SELECT max(x.at) FROM (
        SELECT max("createdAt") AS at FROM journal_entries WHERE "userId" = u.id
        UNION ALL SELECT max("createdAt") FROM therapy_sessions WHERE "userId" = u.id
        UNION ALL SELECT max(c."createdAt") FROM goal_check_ins c JOIN goals g ON g.id = c."goalId" WHERE g."userId" = u.id
    ) x) AS "lastActiveAt"
  FROM users u`;

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  journalOnly: boolean;
  enabled: boolean;
  graduatedAt: Date | null;
  privacyReviewedAt: Date | null;
  journalEntries: number;
  savedSessions: number;
  checkIns: number;
  appointments: number;
  lastActiveAt: Date | null;
}

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v));
const day = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

/** Percentage change from `prev` to `cur`; null when there is no baseline. */
function delta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DataSource) {}

  private q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.query(sql, params);
  }

  /** Permanently removes one account and all rows owned by it via DB cascades. */
  async deleteUser(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const user = (await tx.query<{ id: string }[]>(
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      )) as { id: string }[];
      if (!user.length) throw new NotFoundException();

      // Keep this explicit instead of relying only on database cascades. It
      // also works against older production schemas created before a cascade
      // constraint was added.
      await tx.query(
        'DELETE FROM goal_check_ins WHERE "goalId" IN (SELECT id FROM goals WHERE "userId" = $1)',
        [userId],
      );
      await tx.query('DELETE FROM password_resets WHERE "userId" = $1', [userId]);
      await tx.query('DELETE FROM goals WHERE "userId" = $1', [userId]);
      await tx.query('DELETE FROM therapy_sessions WHERE "userId" = $1', [userId]);
      await tx.query('DELETE FROM journal_entries WHERE "userId" = $1', [userId]);
      await tx.query('DELETE FROM appointments WHERE "userId" = $1', [userId]);
      await tx.query('DELETE FROM users WHERE id = $1', [userId]);
    });
  }

  async setUserEnabled(userId: string, enabled: boolean): Promise<{ enabled: boolean }> {
    const rows = await this.q<{ enabled: boolean }>(
      'UPDATE users SET "enabled" = $2, "tokenVersion" = "tokenVersion" + 1 WHERE id = $1 RETURNING "enabled"',
      [userId, enabled],
    );
    if (!rows.length) throw new NotFoundException();
    return { enabled: rows[0].enabled };
  }

  // ---------------------------------------------------------------- admin

  async overview(days: number, tz: string) {
    const p = [tz, days];
    const [
      [totals],
      [win],
      series,
      [funnel],
      sessionStatus,
      durations,
      [goalStats],
      checkInRates,
      [appts],
      apptKinds,
      heat,
      cohorts,
    ] = await Promise.all([
      this.q(`
        SELECT
          (SELECT count(*) FROM users)::int AS users,
          (SELECT count(*) FROM users WHERE "journalOnly")::int AS "journalOnly",
          (SELECT count(*) FROM users WHERE "graduatedAt" IS NOT NULL)::int AS graduated,
          (SELECT count(*) FROM journal_entries)::int AS "journalEntries",
          (SELECT count(*) FROM therapy_sessions WHERE status = 'saved')::int AS "savedSessions",
          (SELECT coalesce(sum("durationSeconds"), 0) FROM therapy_sessions WHERE status = 'saved')::bigint AS "sessionSeconds",
          (SELECT count(*) FROM goal_check_ins)::int AS "checkIns",
          (SELECT count(DISTINCT "userId") FROM (${ACTIVITY}) a WHERE a.at >= now() - interval '1 day')::int AS dau,
          (SELECT count(DISTINCT "userId") FROM (${ACTIVITY}) a WHERE a.at >= now() - interval '7 days')::int AS wau,
          (SELECT count(DISTINCT "userId") FROM (${ACTIVITY}) a WHERE a.at >= now() - interval '30 days')::int AS mau`),
      this.q(
        `WITH b AS (SELECT ${SINCE} AS since, ${SINCE} - make_interval(days => $2::int) AS prev)
        SELECT
          (SELECT count(*) FROM users, b WHERE "createdAt" >= b.since)::int AS "newUsers",
          (SELECT count(*) FROM users, b WHERE "createdAt" >= b.prev AND "createdAt" < b.since)::int AS "newUsersPrev",
          (SELECT count(DISTINCT "userId") FROM (${ACTIVITY}) a, b WHERE a.at >= b.since)::int AS "activeUsers",
          (SELECT count(DISTINCT "userId") FROM (${ACTIVITY}) a, b WHERE a.at >= b.prev AND a.at < b.since)::int AS "activeUsersPrev",
          (SELECT count(*) FROM journal_entries, b WHERE "createdAt" >= b.since)::int AS "journalEntries",
          (SELECT count(*) FROM journal_entries, b WHERE "createdAt" >= b.prev AND "createdAt" < b.since)::int AS "journalEntriesPrev",
          (SELECT count(*) FROM therapy_sessions, b WHERE "createdAt" >= b.since)::int AS sessions,
          (SELECT count(*) FROM therapy_sessions, b WHERE "createdAt" >= b.prev AND "createdAt" < b.since)::int AS "sessionsPrev",
          (SELECT count(*) FROM therapy_sessions, b WHERE "createdAt" >= b.since AND status = 'failed')::int AS "failedSessions",
          (SELECT count(*) FROM goal_check_ins, b WHERE "createdAt" >= b.since)::int AS "checkIns",
          (SELECT count(*) FROM goal_check_ins, b WHERE "createdAt" >= b.prev AND "createdAt" < b.since)::int AS "checkInsPrev"
        FROM b`,
        p,
      ),
      this.q(
        `WITH b AS (SELECT ${SINCE} AS since),
        days AS (
          SELECT generate_series((SELECT since FROM b) AT TIME ZONE $1, now() AT TIME ZONE $1, interval '1 day')::date AS day
        ),
        act AS (
          SELECT (a.at AT TIME ZONE $1)::date AS day, a."userId", a.kind
          FROM (${ACTIVITY}) a, b WHERE a.at >= b.since
        ),
        sign AS (
          SELECT ("createdAt" AT TIME ZONE $1)::date AS day, count(*) AS n
          FROM users, b WHERE "createdAt" >= b.since GROUP BY 1
        ),
        agg AS (
          SELECT day,
            count(*) FILTER (WHERE kind = 'journal') AS journal,
            count(*) FILTER (WHERE kind = 'session') AS sessions,
            count(*) FILTER (WHERE kind = 'checkin') AS "checkIns",
            count(DISTINCT "userId") AS active
          FROM act GROUP BY day
        )
        SELECT d.day, coalesce(s.n, 0)::int AS signups, coalesce(a.active, 0)::int AS "activeUsers",
               coalesce(a.journal, 0)::int AS "journalEntries", coalesce(a.sessions, 0)::int AS sessions,
               coalesce(a."checkIns", 0)::int AS "checkIns"
        FROM days d LEFT JOIN sign s ON s.day = d.day LEFT JOIN agg a ON a.day = d.day
        ORDER BY d.day`,
        p,
      ),
      this.q(`
        SELECT
          (SELECT count(*) FROM users)::int AS "signedUp",
          (SELECT count(*) FROM users WHERE "privacyReviewedAt" IS NOT NULL)::int AS onboarded,
          (SELECT count(DISTINCT "userId") FROM journal_entries)::int AS "wroteJournal",
          (SELECT count(DISTINCT "userId") FROM therapy_sessions WHERE status = 'saved')::int AS "savedSession",
          (SELECT count(DISTINCT g."userId") FROM goal_check_ins c JOIN goals g ON g.id = c."goalId")::int AS "checkedIn",
          (SELECT count(DISTINCT "userId") FROM appointments)::int AS "addedAppointment"`),
      this.q(
        `SELECT status, count(*)::int AS n FROM therapy_sessions GROUP BY status ORDER BY n DESC`,
      ),
      this.q(`
        SELECT bucket, count(*)::int AS n FROM (
          SELECT CASE
            WHEN "durationSeconds" < 900 THEN '< 15 min'
            WHEN "durationSeconds" < 1800 THEN '15–30 min'
            WHEN "durationSeconds" < 2700 THEN '30–45 min'
            WHEN "durationSeconds" < 3600 THEN '45–60 min'
            ELSE '60+ min' END AS bucket,
            CASE
            WHEN "durationSeconds" < 900 THEN 1 WHEN "durationSeconds" < 1800 THEN 2
            WHEN "durationSeconds" < 2700 THEN 3 WHEN "durationSeconds" < 3600 THEN 4 ELSE 5 END AS ord
          FROM therapy_sessions WHERE status = 'saved' AND "durationSeconds" IS NOT NULL
        ) x GROUP BY bucket, ord ORDER BY ord`),
      this.q(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE active)::int AS active,
               count(*) FILTER (WHERE "completedAt" IS NOT NULL)::int AS completed,
               (SELECT round(avg("durationSeconds") / 60.0, 1) FROM therapy_sessions WHERE status = 'saved') AS "avgSessionMinutes"
        FROM goals`),
      this.q(`
        SELECT g.cadence, count(*)::int AS total, count(*) FILTER (WHERE c.completed)::int AS done
        FROM goal_check_ins c JOIN goals g ON g.id = c."goalId" GROUP BY g.cadence ORDER BY g.cadence`),
      this.q(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE "cancelledAt" IS NOT NULL)::int AS cancelled,
               count(*) FILTER (WHERE "cancelledAt" IS NULL AND "startsAt" > now())::int AS upcoming
        FROM appointments`),
      this.q(
        `SELECT kind, count(*)::int AS n FROM appointments WHERE "cancelledAt" IS NULL GROUP BY kind ORDER BY n DESC`,
      ),
      this.q(
        `WITH b AS (SELECT ${SINCE} AS since)
        SELECT extract(isodow FROM a.at AT TIME ZONE $1)::int AS dow,
               extract(hour FROM a.at AT TIME ZONE $1)::int AS hour,
               count(*)::int AS n
        FROM (${ACTIVITY}) a, b WHERE a.at >= b.since GROUP BY 1, 2`,
        p,
      ),
      this.q(
        `WITH c AS (
          SELECT id, "createdAt", date_trunc('week', "createdAt" AT TIME ZONE $1)::date AS week
          FROM users
          WHERE "createdAt" >= (date_trunc('week', now() AT TIME ZONE $1) - interval '7 weeks') AT TIME ZONE $1
        ), act AS (${ACTIVITY})
        SELECT c.week, count(*)::int AS size,
          ${[1, 2, 3, 4]
            .map(
              (k) => `count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM act a WHERE a."userId" = c.id
                  AND a.at >= c."createdAt" + interval '${7 * k} days'
                  AND a.at <  c."createdAt" + interval '${7 * (k + 1)} days'))::int AS w${k}`,
            )
            .join(',\n')}
        FROM c GROUP BY c.week ORDER BY c.week`,
        [tz],
      ),
    ]);

    const now = Date.now();
    const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const h of heat) heatmap[num(h.dow) - 1][num(h.hour)] = num(h.n);

    return {
      generatedAt: new Date().toISOString(),
      days,
      tz,
      totals: {
        users: num(totals.users),
        journalOnly: num(totals.journalOnly),
        graduated: num(totals.graduated),
        journalEntries: num(totals.journalEntries),
        savedSessions: num(totals.savedSessions),
        sessionHours: Math.round(num(totals.sessionSeconds) / 360) / 10,
        checkIns: num(totals.checkIns),
        dau: num(totals.dau),
        wau: num(totals.wau),
        mau: num(totals.mau),
      },
      period: {
        newUsers: {
          value: num(win.newUsers),
          change: delta(num(win.newUsers), num(win.newUsersPrev)),
        },
        activeUsers: {
          value: num(win.activeUsers),
          change: delta(num(win.activeUsers), num(win.activeUsersPrev)),
        },
        journalEntries: {
          value: num(win.journalEntries),
          change: delta(num(win.journalEntries), num(win.journalEntriesPrev)),
        },
        sessions: {
          value: num(win.sessions),
          change: delta(num(win.sessions), num(win.sessionsPrev)),
        },
        checkIns: {
          value: num(win.checkIns),
          change: delta(num(win.checkIns), num(win.checkInsPrev)),
        },
        sessionFailureRate: num(win.sessions)
          ? Math.round((num(win.failedSessions) / num(win.sessions)) * 1000) /
            10
          : null,
      },
      series: series.map((r) => ({
        day: day(r.day),
        signups: num(r.signups),
        activeUsers: num(r.activeUsers),
        journalEntries: num(r.journalEntries),
        sessions: num(r.sessions),
        checkIns: num(r.checkIns),
      })),
      funnel: [
        { step: 'Signed up', users: num(funnel.signedUp) },
        { step: 'Completed privacy review', users: num(funnel.onboarded) },
        { step: 'Wrote a journal entry', users: num(funnel.wroteJournal) },
        { step: 'Saved a session', users: num(funnel.savedSession) },
        { step: 'Checked in on a goal', users: num(funnel.checkedIn) },
      ],
      adoption: {
        appointments: num(funnel.addedAppointment),
      },
      sessions: {
        byStatus: sessionStatus.map((r) => ({
          status: String(r.status),
          count: num(r.n),
        })),
        durations: durations.map((r) => ({
          bucket: String(r.bucket),
          count: num(r.n),
        })),
        avgMinutes:
          goalStats.avgSessionMinutes == null
            ? null
            : Number(goalStats.avgSessionMinutes),
      },
      goals: {
        total: num(goalStats.total),
        active: num(goalStats.active),
        completed: num(goalStats.completed),
        checkInRates: checkInRates.map((r) => ({
          cadence: String(r.cadence),
          total: num(r.total),
          done: num(r.done),
        })),
      },
      appointments: {
        total: num(appts.total),
        cancelled: num(appts.cancelled),
        upcoming: num(appts.upcoming),
        byKind: apptKinds.map((r) => ({
          kind: String(r.kind),
          count: num(r.n),
        })),
      },
      /** heatmap[isoWeekday-1][hour] = actions in the period. */
      heatmap,
      cohorts: cohorts.map((r) => {
        const start = new Date(`${day(r.week)}T00:00:00Z`).getTime();
        // Week k after signup is only complete for everyone once the cohort's last
        // signup day + 7(k+1) days has passed.
        const weeks = [r.w1, r.w2, r.w3, r.w4].map((v, i) =>
          start + 7 * DAY_MS + 7 * (i + 2) * DAY_MS <= now ? num(v) : null,
        );
        return { week: day(r.week), size: num(r.size), retained: weeks };
      }),
    };
  }

  async users(opts: {
    search?: string;
    sort?: string;
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }) {
    const sortable = [
      'createdAt',
      'lastActiveAt',
      'journalEntries',
      'savedSessions',
      'checkIns',
    ];
    const sort = sortable.includes(opts.sort ?? '') ? opts.sort! : 'createdAt';
    const order = opts.order === 'asc' ? 'ASC' : 'DESC';
    const like = opts.search
      ? `%${opts.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      : null;
    const where = `WHERE ($1::text IS NULL OR u.email ILIKE $1 OR u."displayName" ILIKE $1)`;
    const [rows, [count]] = await Promise.all([
      this.q<AdminUserRow>(
        `SELECT * FROM (${USER_ROW} ${where}) t
         ORDER BY "${sort}" ${order} NULLS LAST, t."createdAt" DESC
         LIMIT $2 OFFSET $3`,
        [like, opts.limit ?? 25, opts.offset ?? 0],
      ),
      this.q(`SELECT count(*)::int AS n FROM users u ${where}`, [like]),
    ]);
    return { items: rows, total: num(count.n) };
  }

  async user(id: string, days: number, tz: string) {
    const [row] = await this.q<AdminUserRow>(`${USER_ROW} WHERE u.id = $1`, [
      id,
    ]);
    if (!row) throw new NotFoundException('User not found');
    const p = [tz, days, id];
    const [series, statuses, [goals], [appts]] = await Promise.all([
      this.q(
        `WITH b AS (SELECT ${SINCE} AS since),
        days AS (SELECT generate_series((SELECT since FROM b) AT TIME ZONE $1, now() AT TIME ZONE $1, interval '1 day')::date AS day),
        act AS (
          SELECT (a.at AT TIME ZONE $1)::date AS day, a.kind
          FROM (${ACTIVITY}) a, b WHERE a."userId" = $3 AND a.at >= b.since
        )
        SELECT d.day,
          count(a.kind) FILTER (WHERE a.kind = 'journal')::int AS "journalEntries",
          count(a.kind) FILTER (WHERE a.kind = 'session')::int AS sessions,
          count(a.kind) FILTER (WHERE a.kind = 'checkin')::int AS "checkIns"
        FROM days d LEFT JOIN act a ON a.day = d.day GROUP BY d.day ORDER BY d.day`,
        p,
      ),
      this.q(
        `SELECT status, count(*)::int AS n FROM therapy_sessions WHERE "userId" = $1 GROUP BY status`,
        [id],
      ),
      this.q(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE g.active)::int AS active,
           count(*) FILTER (WHERE g."completedAt" IS NOT NULL)::int AS completed,
           (SELECT count(*) FROM goal_check_ins c JOIN goals g2 ON g2.id = c."goalId" WHERE g2."userId" = $1 AND c.completed)::int AS "checkInsDone",
           (SELECT coalesce(sum("durationSeconds"), 0) FROM therapy_sessions WHERE "userId" = $1 AND status = 'saved')::int AS "sessionSeconds"
         FROM goals g WHERE g."userId" = $1`,
        [id],
      ),
      this.q(
        `SELECT count(*) FILTER (WHERE "cancelledAt" IS NULL AND "startsAt" <= now())::int AS past,
                count(*) FILTER (WHERE "cancelledAt" IS NULL AND "startsAt" > now())::int AS upcoming,
                count(*) FILTER (WHERE "cancelledAt" IS NOT NULL)::int AS cancelled
         FROM appointments WHERE "userId" = $1`,
        [id],
      ),
    ]);
    return {
      user: row,
      days,
      series: series.map((r) => ({
        day: day(r.day),
        journalEntries: num(r.journalEntries),
        sessions: num(r.sessions),
        checkIns: num(r.checkIns),
      })),
      sessions: {
        byStatus: statuses.map((r) => ({
          status: String(r.status),
          count: num(r.n),
        })),
        minutes: Math.round(num(goals.sessionSeconds) / 60),
      },
      goals: {
        total: num(goals.total),
        active: num(goals.active),
        completed: num(goals.completed),
        checkInsDone: num(goals.checkInsDone),
      },
      appointments: {
        past: num(appts.past),
        upcoming: num(appts.upcoming),
        cancelled: num(appts.cancelled),
      },
    };
  }

  // -------------------------------------------------------------- insights

  /** A user's own analytics ("Insights"). */
  async insights(userId: string, days: number, tz: string) {
    const p = [tz, days, userId];
    const [
      series,
      [totals],
      [win],
      activeDays,
      weekday,
      timeOfDay,
      topics,
      rates,
    ] = await Promise.all([
      this.q(
        `WITH b AS (SELECT ${SINCE} AS since),
          days AS (SELECT generate_series((SELECT since FROM b) AT TIME ZONE $1, now() AT TIME ZONE $1, interval '1 day')::date AS day),
          act AS (
            SELECT (a.at AT TIME ZONE $1)::date AS day, a.kind
            FROM (${ACTIVITY}) a, b WHERE a."userId" = $3 AND a.at >= b.since
          )
          SELECT d.day,
            count(a.kind) FILTER (WHERE a.kind = 'journal')::int AS "journalEntries",
            count(a.kind) FILTER (WHERE a.kind = 'session')::int AS sessions,
            count(a.kind) FILTER (WHERE a.kind = 'checkin')::int AS "checkIns"
          FROM days d LEFT JOIN act a ON a.day = d.day GROUP BY d.day ORDER BY d.day`,
        p,
      ),
      this.q(
        `SELECT
            (SELECT count(*) FROM journal_entries WHERE "userId" = $1)::int AS "journalEntries",
            (SELECT coalesce(sum(array_length(regexp_split_to_array(btrim(body), '\\s+'), 1)), 0)
               FROM journal_entries WHERE "userId" = $1)::int AS words,
            (SELECT count(*) FROM therapy_sessions WHERE "userId" = $1 AND status = 'saved')::int AS "savedSessions",
            (SELECT coalesce(sum("durationSeconds"), 0) FROM therapy_sessions WHERE "userId" = $1 AND status = 'saved')::int AS "sessionSeconds",
            (SELECT count(*) FROM goals WHERE "userId" = $1)::int AS goals,
            (SELECT count(*) FROM goals WHERE "userId" = $1 AND "completedAt" IS NOT NULL)::int AS "goalsCompleted",
            (SELECT count(*) FROM appointments WHERE "userId" = $1 AND "cancelledAt" IS NULL AND "startsAt" <= now())::int AS "appointmentsPast",
            (SELECT count(*) FROM appointments WHERE "userId" = $1 AND "cancelledAt" IS NULL AND "startsAt" > now())::int AS "appointmentsUpcoming"`,
        [userId],
      ),
      this.q(
        `WITH b AS (SELECT ${SINCE} AS since, ${SINCE} - make_interval(days => $2::int) AS prev),
          a AS (SELECT * FROM (${ACTIVITY}) x WHERE x."userId" = $3)
          SELECT
            count(*) FILTER (WHERE a.kind = 'journal' AND a.at >= b.since)::int AS journal,
            count(*) FILTER (WHERE a.kind = 'journal' AND a.at >= b.prev AND a.at < b.since)::int AS "journalPrev",
            count(*) FILTER (WHERE a.kind = 'session' AND a.at >= b.since)::int AS sessions,
            count(*) FILTER (WHERE a.kind = 'session' AND a.at >= b.prev AND a.at < b.since)::int AS "sessionsPrev",
            count(*) FILTER (WHERE a.kind = 'checkin' AND a.at >= b.since)::int AS "checkIns",
            count(*) FILTER (WHERE a.kind = 'checkin' AND a.at >= b.prev AND a.at < b.since)::int AS "checkInsPrev",
            count(DISTINCT (a.at AT TIME ZONE $1)::date) FILTER (WHERE a.at >= b.since)::int AS "activeDays"
          FROM b LEFT JOIN a ON true`,
        p,
      ),
      this.q(
        `SELECT DISTINCT (a.at AT TIME ZONE $1)::date AS day
           FROM (${ACTIVITY}) a WHERE a."userId" = $2 ORDER BY 1 DESC LIMIT 1000`,
        [tz, userId],
      ),
      this.q(
        `SELECT extract(isodow FROM "createdAt" AT TIME ZONE $1)::int AS dow, count(*)::int AS n
           FROM journal_entries WHERE "userId" = $2 GROUP BY 1`,
        [tz, userId],
      ),
      this.q(
        `SELECT CASE
              WHEN h BETWEEN 5 AND 11 THEN 'Morning'
              WHEN h BETWEEN 12 AND 16 THEN 'Afternoon'
              WHEN h BETWEEN 17 AND 21 THEN 'Evening'
              ELSE 'Night' END AS part, count(*)::int AS n
           FROM (SELECT extract(hour FROM "createdAt" AT TIME ZONE $1)::int AS h
                 FROM journal_entries WHERE "userId" = $2) x GROUP BY 1`,
        [tz, userId],
      ),
      this.q(
        `SELECT t.topic, count(*)::int AS n
           FROM therapy_sessions s, jsonb_array_elements_text(s.topics) AS t(topic)
           WHERE s."userId" = $1 AND s.status = 'saved'
           GROUP BY t.topic ORDER BY n DESC, t.topic LIMIT 8`,
        [userId],
      ),
      this.q(
        `SELECT g.cadence, count(*)::int AS total, count(*) FILTER (WHERE c.completed)::int AS done
           FROM goal_check_ins c JOIN goals g ON g.id = c."goalId"
           WHERE g."userId" = $1 GROUP BY g.cadence ORDER BY g.cadence`,
        [userId],
      ),
    ]);

    const { current, longest } = streaks(
      activeDays.map((r) => day(r.day)),
      todayIn(tz),
    );
    const dow = Array<number>(7).fill(0);
    for (const r of weekday) dow[num(r.dow) - 1] = num(r.n);
    const parts = ['Morning', 'Afternoon', 'Evening', 'Night'];

    return {
      days,
      tz,
      series: series.map((r) => ({
        day: day(r.day),
        journalEntries: num(r.journalEntries),
        sessions: num(r.sessions),
        checkIns: num(r.checkIns),
      })),
      totals: {
        journalEntries: num(totals.journalEntries),
        words: num(totals.words),
        savedSessions: num(totals.savedSessions),
        sessionMinutes: Math.round(num(totals.sessionSeconds) / 60),
        goals: num(totals.goals),
        goalsCompleted: num(totals.goalsCompleted),
        appointmentsPast: num(totals.appointmentsPast),
        appointmentsUpcoming: num(totals.appointmentsUpcoming),
      },
      period: {
        journalEntries: {
          value: num(win.journal),
          change: delta(num(win.journal), num(win.journalPrev)),
        },
        sessions: {
          value: num(win.sessions),
          change: delta(num(win.sessions), num(win.sessionsPrev)),
        },
        checkIns: {
          value: num(win.checkIns),
          change: delta(num(win.checkIns), num(win.checkInsPrev)),
        },
        activeDays: num(win.activeDays),
      },
      streak: { current, longest },
      journalByWeekday: dow,
      journalByTimeOfDay: parts.map((part) => ({
        part,
        count: num(timeOfDay.find((r) => r.part === part)?.n),
      })),
      topics: topics.map((r) => ({ topic: String(r.topic), count: num(r.n) })),
      checkInRates: rates.map((r) => ({
        cadence: String(r.cadence),
        total: num(r.total),
        done: num(r.done),
      })),
    };
  }
}

function todayIn(tz: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/** Streaks over distinct active days (YYYY-MM-DD, newest first). */
export function streaks(daysDesc: string[], today: string) {
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of daysDesc) {
    const t = ms(d);
    run = prev !== null && prev - t === DAY_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  // The current streak counts back from today, or from yesterday if today
  // has no activity yet (so it doesn't reset to 0 first thing in the morning).
  let current = 0;
  if (daysDesc.length) {
    const gap = (ms(today) - ms(daysDesc[0])) / DAY_MS;
    if (gap <= 1) {
      current = 1;
      for (let i = 1; i < daysDesc.length; i++) {
        if (ms(daysDesc[i - 1]) - ms(daysDesc[i]) === DAY_MS) current++;
        else break;
      }
    }
  }
  return { current, longest };
}
