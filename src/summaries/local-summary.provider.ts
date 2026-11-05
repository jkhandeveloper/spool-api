import { Injectable } from '@nestjs/common';
import type {
  SessionSummary,
  SummaryInput,
  SummaryProvider,
} from './summary.types.js';

/**
 * Offline, deterministic summarizer for development and tests
 * (SUMMARY_PROVIDER=local). It picks out the longest sentences; it does not
 * understand the conversation and should never be used in production.
 */
@Injectable()
export class LocalSummaryProvider implements SummaryProvider {
  summarize({ transcript, prompts }: SummaryInput): Promise<SessionSummary> {
    const sentences = transcript
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.split(/\s+/).length >= 4);
    const longest = [...sentences]
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);
    const mainPoints = longest.length
      ? longest
      : ['This session was short, so there is not much to summarize yet.'];

    return Promise.resolve({
      title: prompts[0] ? prompts[0].slice(0, 40) : 'Your session',
      topics: prompts.slice(0, 2),
      mainPoints,
      takeaways: ['Your needs deserve space, too.'],
      dailyGoal: 'Take a five-minute grounding break.',
      weeklyGoal: 'Practice one clear boundary.',
    });
  }
}
