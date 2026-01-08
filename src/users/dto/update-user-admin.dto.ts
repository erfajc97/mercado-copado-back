import { IsString, IsOptional, IsEmail, Matches } from 'class-validator';

export class UpdateUserAdminDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

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
