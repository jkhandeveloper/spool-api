import { z } from 'zod';

export const SessionSummarySchema = z.object({
  title: z
    .string()
    .describe('A gentle 2-5 word title, e.g. "Making space for yourself"'),
  topics: z
    .array(z.string())
    .describe('1-3 short topic tags, e.g. "Boundaries", "Work stress"'),
  mainPoints: z
    .array(z.string())
    .describe('2-4 main points, second person, one sentence each'),
  takeaways: z
    .array(z.string())
    .describe('1-3 key takeaways, short and encouraging'),
  dailyGoal: z
    .string()
    .describe('One small daily step that takes under ten minutes'),
  weeklyGoal: z.string().describe('One achievable step for the coming week'),
});

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export interface SummaryInput {
  transcript: string;
  prompts: string[];
}

export const SUMMARY_PROVIDER = Symbol('SUMMARY_PROVIDER');

export interface SummaryProvider {
  summarize(input: SummaryInput): Promise<SessionSummary>;
}

/** A failure the user can act on; `retryable` drives the "Try again" button. */
export class SummaryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Trims fields to the column limits so a long model answer can't fail the save. */
export function clampSummary(s: SessionSummary): SessionSummary {
  const cut = (v: string, n: number) =>
    v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v;
  const list = (v: string[], max: number, n: number) =>
    v
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, max)
      .map((x) => cut(x, n));
  return {
    title: cut(s.title.trim() || 'Your session', 120),
    topics: list(s.topics, 3, 40),
    mainPoints: list(s.mainPoints, 4, 400),
    takeaways: list(s.takeaways, 3, 400),
    dailyGoal: cut(s.dailyGoal.trim(), 280),
    weeklyGoal: cut(s.weeklyGoal.trim(), 280),
  };
}
