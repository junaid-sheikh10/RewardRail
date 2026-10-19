import { IsNotEmpty, IsString } from 'class-validator';

export class CreateClickDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  offerId: string;
}
