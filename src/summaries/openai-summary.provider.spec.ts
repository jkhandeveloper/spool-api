import OpenAI from 'openai';
import type { ConfigService } from '@nestjs/config';
import { OpenAISummaryProvider } from './openai-summary.provider.js';
import { SummaryError, type SessionSummary } from './summary.types.js';
import { pickSummaryProvider } from '../config/configuration.js';

const summary: SessionSummary = {
  title: 'Making space for yourself',
  topics: ['Boundaries'],
  mainPoints: ['Work has felt overwhelming.'],
  takeaways: ['Your needs deserve space, too.'],
  dailyGoal: 'Take a five-minute grounding break.',
  weeklyGoal: 'Practice one clear boundary.',
};

const config = {
  get: (key: string) => ({ 'summary.openaiModel': 'test-model' })[key] as never,
} as unknown as ConfigService;

function providerReturning(parse: (body: unknown) => Promise<unknown>) {
  const client = { responses: { parse } } as unknown as OpenAI;
  return new OpenAISummaryProvider(config, client);
}

const input = {
  transcript: 'I have been feeling a lot of stress about work lately.',
  prompts: ['Work stress'],
};

describe('OpenAISummaryProvider', () => {
  it('returns the parsed summary and sends the transcript and prompts', async () => {
    let body: Record<string, unknown> = {};
    const provider = providerReturning((b) => {
      body = b as Record<string, unknown>;
      return Promise.resolve({
        status: 'completed',
        output: [],
        output_parsed: summary,
      });
    });

    await expect(provider.summarize(input)).resolves.toEqual(summary);
    expect(body.model).toBe('test-model');
    expect(body.store).toBe(false);
    expect(body.input).toContain('- Work stress');
    expect(body.input).toContain('<transcript>');
  });

  it('throws a non-retryable error on refusal', async () => {
    const provider = providerReturning(() =>
      Promise.resolve({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'refusal', refusal: 'no' }] },
        ],
        output_parsed: null,
      }),
    );
    const err = await provider.summarize(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SummaryError);
    expect((err as SummaryError).retryable).toBe(false);
  });

  it('throws a retryable error when the output is incomplete', async () => {
    const provider = providerReturning(() =>
      Promise.resolve({
        status: 'incomplete',
        output: [],
        output_parsed: null,
      }),
    );
    const err = await provider.summarize(input).catch((e: unknown) => e);
    expect((err as SummaryError).retryable).toBe(true);
  });

  it('falls back to the local summary when the API is unreachable', async () => {
    const provider = providerReturning(() =>
      Promise.reject(new OpenAI.APIConnectionError({ message: 'offline' })),
    );
    const out = await provider.summarize(input);
    expect(out.title).toBe('Work stress');
    expect(out.dailyGoal).toBeTruthy();
  });
});

describe('pickSummaryProvider', () => {
  it('honours an explicit choice', () => {
    expect(
      pickSummaryProvider({ SUMMARY_PROVIDER: 'local', OPENAI_API_KEY: 'k' }),
    ).toBe('local');
    expect(pickSummaryProvider({ SUMMARY_PROVIDER: 'Anthropic' })).toBe(
      'anthropic',
    );
  });

  it('prefers OpenAI when its key is set', () => {
    expect(pickSummaryProvider({ OPENAI_API_KEY: 'sk-test' })).toBe('openai');
    expect(pickSummaryProvider({ SUMMARY_PROVIDER: '' })).toBe('anthropic');
  });
});
