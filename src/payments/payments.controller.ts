import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaymentsService } from './payments.service.js';
import { CreatePaymentTransactionDto } from './dto/create-payment-transaction.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { LoggedInUserData } from '../interfaces/authenticated-user.interface.js';
import { PaymentStatus, OrderStatus } from '../generated/enums.js';
import { PaymentProvider } from '../generated/enums.js';
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

  @Post('create-transaction-without-order')
  @UseGuards(JwtAuthGuard)
  async createPaymentTransactionWithoutOrder(
    @CurrentUser() user: LoggedInUserData,
    @Body() createPaymentTransactionDto: CreatePaymentTransactionDto,
  ) {
    return this.paymentsService.createPaymentTransactionWithoutOrder(
      user.id,
      createPaymentTransactionDto,
    );
  }

  @Post('create-transaction-and-order')
  @UseGuards(JwtAuthGuard)
  async createTransactionAndOrder(
    @CurrentUser() user: LoggedInUserData,
    @Body() createPaymentTransactionDto: CreatePaymentTransactionDto,
  ) {
    return this.paymentsService.createTransactionAndOrder(
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
      addressId: string;
      paymentMethodId?: string; // Opcional para PAYPHONE
      phoneNumber: string;
      clientTransactionId: string;
      payphoneResponse?: Record<string, unknown>; // Respuesta de Payphone desde el frontend
    },
  ) {
    return this.paymentsService.processPhonePayment(
      user.id,
      body.addressId,
      body.paymentMethodId || undefined, // Solo pasar si existe y no es vacío
      body.phoneNumber,
      body.clientTransactionId,
      body.payphoneResponse,
    );
  }

  @Post('create-order-from-transaction')
  @UseGuards(JwtAuthGuard)
  async createOrderFromTransaction(
    @CurrentUser() user: LoggedInUserData,
    @Body()
    body: {
      clientTransactionId: string;
      initialStatus?: OrderStatus;
    },
  ) {
    return this.paymentsService.createOrderFromPaymentTransaction(
      body.clientTransactionId,
      body.initialStatus || OrderStatus.pending,
    );
  }

  @Post('cash-deposit')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('depositImage'))
  async processCashDeposit(
    @CurrentUser() user: LoggedInUserData,
    @Body()
    body: {
      addressId: string;
      clientTransactionId: string;
      orderId?: string; // Para retry de pagos en órdenes existentes
    },
    @UploadedFile() depositImageFile: Express.Multer.File,
  ) {
    if (!depositImageFile) {
      throw new BadRequestException('La imagen del depósito es requerida');
    }

    return this.paymentsService.processCashDeposit(
      user.id,
      body.addressId,
      body.clientTransactionId,
      depositImageFile,
      body.orderId, // Pasar orderId si existe
    );
  }

  @Post('regenerate-transaction')
  @UseGuards(JwtAuthGuard)
  async regenerateTransaction(
    @CurrentUser() user: LoggedInUserData,
    @Body()
    body: {
      orderId: string;
      paymentProvider?: PaymentProvider;
      paymentMethodId?: string;
      payphoneData?: Record<string, unknown>;
    },
  ) {
    return await this.paymentsService.regenerateTransactionForOrder(
      body.orderId,
      user.id,
      body.paymentProvider || PaymentProvider.PAYPHONE,
      body.paymentMethodId,
      body.payphoneData,
    );
  }

  @Post('verify-multiple-transactions')
  @UseGuards(JwtAuthGuard)
  async verifyMultipleTransactions(
    @CurrentUser() user: LoggedInUserData,
    @Body()
    body: {
      clientTransactionIds: string[];
    },
  ) {
    return await this.paymentsService.verifyMultipleTransactions(
      body.clientTransactionIds,
      user.id,
    );
  }
}
