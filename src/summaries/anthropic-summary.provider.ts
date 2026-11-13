import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
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
export class AnthropicSummaryProvider implements SummaryProvider {
  private readonly logger = new Logger(AnthropicSummaryProvider.name);
  private readonly client = new Anthropic();
  private readonly localFallback = new LocalSummaryProvider();

  constructor(private readonly config: ConfigService) {}

  async summarize({
    transcript,
    prompts,
  }: SummaryInput): Promise<SessionSummary> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.config.get<string>('summary.model') ?? 'claude-opus-5-5',
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort: 'medium',
          format: betaZodOutputFormat(SessionSummarySchema),
        },
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildSummaryRequest({ transcript, prompts }),
          },
        ],
      });
    } catch (error) {
      const summaryError = this.toSummaryError(error);
      this.logger.warn(
        `Claude summary unavailable (${summaryError.message}); using the local fallback summary`,
      );
      return this.localFallback.summarize({ transcript, prompts });
    }

    if (response.stop_reason === 'refusal') {
      this.logger.warn(
        `Summary refused (category: ${response.stop_details?.category ?? 'none'})`,
      );
      throw new SummaryError(
        "We couldn't create a summary for this session. You can discard it and write a journal entry instead.",
        false,
      );
    }
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      throw new SummaryError(
        'The summary came back incomplete. Please try again.',
        true,
      );
    }
    return response.parsed_output;
  }

  private toSummaryError(error: unknown): SummaryError {
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      this.logger.error('Anthropic credentials are missing or invalid');
      return new SummaryError(
        'Summaries are unavailable right now. Please try again later.',
        true,
      );
    }
    if (error instanceof Anthropic.BadRequestError) {
      this.logger.error(`Anthropic rejected the request: ${error.message}`);
      return new SummaryError("We couldn't summarize this session.", false);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return new SummaryError(
        'Spool is busy right now. Please try again in a minute.',
        true,
      );
    }
    if (error instanceof Anthropic.APIError) {
      this.logger.error(
        `Anthropic API error ${error.status}: ${error.message}`,
      );
      return new SummaryError(
        'Something went wrong creating your summary. Please try again.',
        true,
      );
    }
    this.logger.error(`Summary request failed: ${String(error)}`);
    return new SummaryError(
      'We lost the connection while creating your summary. Please try again.',
      true,
    );
  }
}
