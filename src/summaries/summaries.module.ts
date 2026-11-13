import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicSummaryProvider } from './anthropic-summary.provider.js';
import { LocalSummaryProvider } from './local-summary.provider.js';
import { OpenAISummaryProvider } from './openai-summary.provider.js';
import { SUMMARY_PROVIDER } from './summary.types.js';

@Module({
  providers: [
    {
      provide: SUMMARY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        switch (config.get<string>('summary.provider')) {
          case 'local':
            return new LocalSummaryProvider();
          case 'openai':
            return new OpenAISummaryProvider(config);
          default:
            return new AnthropicSummaryProvider(config);
        }
      },
    },
  ],
  exports: [SUMMARY_PROVIDER],
})
export class SummariesModule {}
