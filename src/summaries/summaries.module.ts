import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicSummaryProvider } from './anthropic-summary.provider.js';
import { LocalSummaryProvider } from './local-summary.provider.js';
import { SUMMARY_PROVIDER } from './summary.types.js';

@Module({
  providers: [
    {
      provide: SUMMARY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('summary.provider') === 'local'
          ? new LocalSummaryProvider()
          : new AnthropicSummaryProvider(config),
    },
  ],
  exports: [SUMMARY_PROVIDER],
})
export class SummariesModule {}
