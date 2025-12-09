import { IsString, IsOptional, Matches } from 'class-validator';

export class UpdateUserProfileDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[0-9A-Za-z-]+$/, {
    message:
      'El documento de identidad solo puede contener números, letras y guiones',
  })
  documentId?: string;
}
