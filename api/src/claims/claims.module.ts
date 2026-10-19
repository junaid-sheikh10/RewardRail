import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicClaimClassifier } from './anthropic-claim-classifier';
import { CLAIM_CLASSIFIER, ClaimClassifier, DisabledClaimClassifier } from './claim-classifier';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  controllers: [ClaimsController],
  providers: [
    ClaimsService,
    {
      provide: CLAIM_CLASSIFIER,
      inject: [ConfigService],
      // No LLM_API_KEY → the feature is disabled and the app still works (rules + human queue).
      useFactory: (config: ConfigService): ClaimClassifier => {
        const apiKey = config.get<string>('LLM_API_KEY');
        if (!apiKey) return new DisabledClaimClassifier();
        // Short timeout and one retry: a slow model must not hang a user's request.
        const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
        const model = config.get<string>('LLM_MODEL') || 'claude-opus-5-5';
        return new AnthropicClaimClassifier((params) => client.messages.create(params), model);
      },
    },
  ],
})
export class ClaimsModule {}
