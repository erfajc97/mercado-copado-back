import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreatePaymentTransactionDto {
  @IsUUID()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  clientTransactionId: string;
}
