import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

// The body an advertiser (MMP) sends us. See CLAUDE.md → "Postback contract".
export class PostbackDto {
  // Unique per event on the advertiser's side. Retries reuse the same eventId,
  // which is how we recognise duplicates.
  @IsString()
  @IsNotEmpty()
  eventId: string;

  // The id we generated when the user started the offer.
  @IsString()
  @IsNotEmpty()
  clickId: string;

  // Which milestone was reached, matches Milestone.key (e.g. "level_10").
  @IsString()
  @IsNotEmpty()
  event: string;

  // What the advertiser claims to pay. Stored for auditing, NOT used for crediting.
  @IsInt()
  @Min(0)
  payoutCents: number;

  // Unix seconds, when the event happened. Useful for replay protection.
  @IsInt()
  timestamp: number;
}

// What POST /postbacks answers.
export type PostbackResult =
  | { status: 'credited'; amountCents: number }
  | { status: 'duplicate' }
  | { status: 'rejected'; reason: 'unknown_click' | 'unknown_milestone' | 'timestamp_in_future' };
