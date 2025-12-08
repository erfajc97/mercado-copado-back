import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { CreatePaymentTransactionDto } from './dto/create-payment-transaction.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { LoggedInUserData } from '../interfaces/authenticated-user.interface.js';
import { PaymentStatus } from '../generated/enums.js';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-transaction')
  @UseGuards(JwtAuthGuard)
  async createPaymentTransaction(
    @CurrentUser() user: LoggedInUserData,
    @Body() createPaymentTransactionDto: CreatePaymentTransactionDto,
  ) {
    return this.paymentsService.createPaymentTransaction(
      user.id,
      createPaymentTransactionDto,
    );
  }

  @Get('transaction/:clientTransactionId')
  @Public()
  async getPaymentTransaction(
    @Param('clientTransactionId') clientTransactionId: string,
  ) {
    return this.paymentsService.getPaymentTransaction(clientTransactionId);
  }

  @Get('my-pending-payments')
  @UseGuards(JwtAuthGuard)
  getMyPendingPayments(@CurrentUser() user: LoggedInUserData) {
    return this.paymentsService.getUserPendingPayments(user.id);
  }

  @Delete('my-pending-payments/:transactionId')
  @UseGuards(JwtAuthGuard)
  async deleteMyPendingPayment(
    @CurrentUser() user: LoggedInUserData,
    @Param('transactionId') transactionId: string,
  ) {
    return this.paymentsService.deleteUserPendingPayment(
      user.id,
      transactionId,
    );
  }

  @Post('update-status')
  @Public()
  async updatePaymentStatus(
    @Body()
    body: {
      clientTransactionId: string;
      status: PaymentStatus;
      payphoneData?: Record<string, unknown>;
    },
  ) {
    return this.paymentsService.updatePaymentStatus(
      body.clientTransactionId,
      body.status,
      body.payphoneData,
    );
  }

  @Post('phone-payment')
  @UseGuards(JwtAuthGuard)
  async processPhonePayment(
    @CurrentUser() user: LoggedInUserData,
    @Body()
    body: {
      orderId: string;
      phoneNumber: string;
      clientTransactionId: string;
    },
  ) {
    return this.paymentsService.processPhonePayment(
      user.id,
      body.orderId,
      body.phoneNumber,
      body.clientTransactionId,
    );
  }
}
