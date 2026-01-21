import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { EmailModule } from '../email/email.module.js';
import { OrderNotificationService } from './services/order-notification.service.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    EmailModule,
    forwardRef(() => PaymentsModule), // Necesario para acceder a PayphoneProvider
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderNotificationService],
  exports: [OrdersService, OrderNotificationService],
})
export class OrdersModule {}
