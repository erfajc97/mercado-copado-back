import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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

  @IsUUID()
  @IsOptional()
  paymentMethodId?: string;

  @IsEnum(PaymentProvider)
  @IsOptional()
  paymentProvider?: PaymentProvider;
}
