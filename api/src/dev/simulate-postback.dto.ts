import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

// What the demo panel sends to the dev-only simulator. Not the advertiser's postback
// itself: the server turns this into a real, signed postback.
export class SimulatePostbackDto {
  @IsString()
  @IsNotEmpty()
  clickId: string;

  @IsString()
  @IsNotEmpty()
  event: string;

  // Omit for a fresh eventId. With `repeat` > 1 every copy shares ONE eventId,
  // which is exactly an MMP retrying the same event.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  eventId?: string;

  // What the "advertiser" claims to pay. Defaults to the milestone's payout on the caller's side.
  @IsOptional()
  @IsInt()
  @Min(0)
  payoutCents?: number;

  @IsOptional()
  @IsInt()
  timestamp?: number;

  // false → send a deliberately wrong signature, to show fakes are rejected.
  @IsOptional()
  @IsBoolean()
  validSignature?: boolean;

  // How many identical requests to fire AT THE SAME TIME.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  repeat?: number;
}

export class ResetUserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
