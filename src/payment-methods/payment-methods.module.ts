import { Module } from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service.js';
import { PaymentMethodsController } from './payment-methods.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService],
  exports: [PaymentMethodsService],
})
export class PaymentMethodsModule {}
