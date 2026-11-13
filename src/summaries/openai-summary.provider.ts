import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  SessionSummarySchema,
  SummaryError,
  type SessionSummary,
  type SummaryInput,
  type SummaryProvider,
} from './summary.types.js';
import { LocalSummaryProvider } from './local-summary.provider.js';
import { SUMMARY_SYSTEM_PROMPT, buildSummaryRequest } from './prompt.js';

@Injectable()
export class OpenAISummaryProvider implements SummaryProvider {
  private readonly logger = new Logger(OpenAISummaryProvider.name);
  private readonly localFallback = new LocalSummaryProvider();
  private readonly client: OpenAI;

  constructor(
    private readonly config: ConfigService,
    client?: OpenAI,
  ) {
    this.client =
      client ??
      new OpenAI({
        apiKey: config.get<string>('summary.openaiApiKey') || 'missing',
        timeout: 90_000,
        maxRetries: 2,
      });
  }

  async summarize(input: SummaryInput): Promise<SessionSummary> {
    let response;
    try {
      response = await this.client.responses.parse({
        model: this.config.get<string>('summary.openaiModel') ?? 'gpt-5.4-mini',
        instructions: SUMMARY_SYSTEM_PROMPT,
        input: buildSummaryRequest(input),
        max_output_tokens: 16000,
        // Transcripts are sensitive; don't keep the response on OpenAI's side.
        store: false,
        text: {
          format: zodTextFormat(SessionSummarySchema, 'session_summary'),
        },
      });
    } catch (error) {
      this.logger.warn(
        `OpenAI summary unavailable (${this.describe(error)}); using the local fallback summary`,
      );
      return this.localFallback.summarize(input);
    }

    const refused = response.output.some(
      (item) =>
        item.type === 'message' &&
        item.content.some((part) => part.type === 'refusal'),
    );
    if (refused) {
      this.logger.warn('Summary refused by the model');
      throw new SummaryError(
        "We couldn't create a summary for this session. You can discard it and write a journal entry instead.",
        false,
      );
    }
    if (response.status === 'incomplete' || !response.output_parsed) {
      throw new SummaryError(
        'The summary came back incomplete. Please try again.',
        true,
      );
    }
    return response.output_parsed;
  }

  private describe(error: unknown): string {
    if (
      error instanceof OpenAI.AuthenticationError ||
      error instanceof OpenAI.PermissionDeniedError
    ) {
      return 'OpenAI credentials are missing or invalid (check OPENAI_API_KEY)';
    }
    if (error instanceof OpenAI.APIError) {
      return `OpenAI API error ${error.status ?? 'network'}: ${error.message}`;
    }
    return String(error);
  }
}
