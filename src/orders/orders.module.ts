import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { PaymentsModule } from '../payments/payments.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    forwardRef(() => PaymentsModule), // Necesario para acceder a PayphoneProvider
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
