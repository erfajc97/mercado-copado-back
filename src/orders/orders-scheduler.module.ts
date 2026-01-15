import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersSchedulerService } from './orders-scheduler.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, EmailModule],
  providers: [OrdersSchedulerService],
})
export class OrdersSchedulerModule {}
