import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString()
  @IsNotEmpty({ message: 'El token del gateway es requerido' })
  gatewayToken: string;

  @IsString()
  @IsNotEmpty({ message: 'La marca de la tarjeta es requerida' })
  cardBrand: string;

  @IsString()
  @IsNotEmpty({ message: 'Los últimos 4 dígitos son requeridos' })
  last4Digits: string;

  @IsInt()
  @Min(1)
  @Max(12)
  expirationMonth: number;

  @IsInt()
  @Min(2024)
  expirationYear: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
