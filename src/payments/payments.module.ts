import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PayphoneProvider } from './providers/payphone.provider.js';
import { MercadoPagoProvider } from './providers/mercadopago.provider.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { EmailModule } from '../email/email.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
// Servicios especializados
import { PaymentTransactionService } from './services/payment-transaction.service.js';
import { PaymentOrderService } from './services/payment-order.service.js';
import { PaymentWebhookService } from './services/payment-webhook.service.js';
import { PaymentCashDepositService } from './services/payment-cash-deposit.service.js';
import { PaymentCryptoService } from './services/payment-crypto.service.js';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => OrdersModule),
    EmailModule,
    HttpModule,
    CloudinaryModule,
  ],
  controllers: [PaymentsController],
  providers: [
    // Proveedores de pago
    PayphoneProvider,
    MercadoPagoProvider,
    // Servicios especializados
    PaymentTransactionService,
    PaymentOrderService,
    PaymentWebhookService,
    PaymentCashDepositService,
    PaymentCryptoService,
    // Facade principal
    PaymentsService,
  ],
  exports: [
    PaymentsService,
    PayphoneProvider,
    MercadoPagoProvider,
    // Exportar servicios especializados para uso directo si es necesario
    PaymentTransactionService,
    PaymentOrderService,
  ],
})
export class PaymentsModule {}
