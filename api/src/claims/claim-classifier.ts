import { z } from 'zod';
import { ClaimFacts } from './claim-rules';

// The ONLY shape we accept back from a model. Anything else (wrong category, confidence
// outside 0..1, missing field, extra prose around the JSON) is treated as "the model
// failed" and the claim goes to a human. We never trust a model's output because it
// looks plausible: we validate it like any other untrusted input.
export const ClassificationSchema = z.object({
  category: z.enum(['already_credited', 'not_tracked_yet', 'likely_fraud', 'needs_human']),
  confidence: z.number().min(0).max(1),
  reply: z.string().min(1).max(600),
});
export type Classification = z.infer<typeof ClassificationSchema>;

// Below this the answer is not shown as authoritative: a person decides instead.
export const MIN_CONFIDENCE = 0.7;

export type ParseResult = { ok: true; value: Classification } | { ok: false; reason: string };

// Pure: raw model output (a JSON string, or an already-parsed value) → validated result.
export function parseClassification(raw: unknown): ParseResult {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'invalid JSON' };
    }
  }
  const parsed = ClassificationSchema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: 'schema mismatch' };
}

export interface ClassifyInput {
  message: string;
  facts: ClaimFacts;
}

// A port: the service depends on this, not on any provider. Tests plug in a fake, the app
// plugs in the Anthropic adapter, and with no API key a "disabled" one is used.
// classify() returns the model's RAW output; validation happens in the service.
export interface ClaimClassifier {
  isEnabled(): boolean;
  classify(input: ClassifyInput): Promise<unknown>;
}

export const CLAIM_CLASSIFIER = Symbol('CLAIM_CLASSIFIER');

// Used when LLM_API_KEY is not set: the feature degrades to rules + the human queue.
export class DisabledClaimClassifier implements ClaimClassifier {
  isEnabled() {
    return false;
  }
  classify(): Promise<unknown> {
    return Promise.reject(new Error('LLM triage is disabled (no LLM_API_KEY)'));
  }
}
