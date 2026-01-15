import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { PaymentProvider } from '../../generated/enums.js';

export class CreatePaymentTransactionDto {
  @IsUUID()
  @IsOptional()
  orderId?: string;

  @IsString()
  @IsNotEmpty()
  clientTransactionId: string;

  @IsUUID()
  @IsOptional()
  addressId?: string;

  @ValidateIf(
    (o) =>
      o.paymentMethodId !== undefined &&
      o.paymentMethodId !== null &&
      o.paymentMethodId !== '' &&
      o.paymentMethodId !== 'payphone-default',
  )
  @IsUUID()
  @IsOptional()
  paymentMethodId?: string;

  @IsEnum(PaymentProvider)
  @IsOptional()
  paymentProvider?: PaymentProvider;

  @IsOptional()
  payphoneData?: Record<string, unknown>;
}
