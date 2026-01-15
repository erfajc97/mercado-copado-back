import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PayphoneProvider } from './providers/payphone.provider.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { EmailModule } from '../email/email.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';

@Module({
  imports: [
    // ConfigModule es global (configurado en app.module.ts), no es necesario importarlo aquí
    PrismaModule,
    forwardRef(() => OrdersModule),
    EmailModule,
    HttpModule,
    CloudinaryModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PayphoneProvider],
  exports: [PaymentsService, PayphoneProvider],
})
export class PaymentsModule {}
