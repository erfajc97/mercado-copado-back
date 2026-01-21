import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePaymentTransactionDto } from './dto/create-payment-transaction.dto.js';
import {
  PaymentStatus,
  OrderStatus,
  PaymentProvider,
} from '../generated/enums.js';
import { OrdersService } from '../orders/orders.service.js';
import { PayphoneProvider } from './providers/payphone.provider.js';
import { PaymentTransactionService } from './services/payment-transaction.service.js';
import { PaymentOrderService } from './services/payment-order.service.js';
import { PaymentWebhookService } from './services/payment-webhook.service.js';
import { PaymentCashDepositService } from './services/payment-cash-deposit.service.js';
import { PaymentCryptoService } from './services/payment-crypto.service.js';
import type * as runtime from '@prisma/client/runtime/client';

/**
 * Servicio facade para pagos.
 * Delega operaciones a servicios especializados manteniendo
 * la interfaz pública para compatibilidad con el controller.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => OrdersService))
    private ordersService: OrdersService,
    private payphoneProvider: PayphoneProvider,
    private transactionService: PaymentTransactionService,
    private orderService: PaymentOrderService,
    private webhookService: PaymentWebhookService,
    private cashDepositService: PaymentCashDepositService,
    private cryptoService: PaymentCryptoService,
  ) {}

  // ============================================
  // TRANSACCIONES - Delegado a PaymentTransactionService
  // ============================================

  async createPaymentTransaction(
    userId: string,
    createPaymentTransactionDto: CreatePaymentTransactionDto,
  ) {
    return this.transactionService.create(userId, createPaymentTransactionDto);
  }

  async createPaymentTransactionWithoutOrder(
    userId: string,
    createPaymentTransactionDto: CreatePaymentTransactionDto,
  ) {
    return this.transactionService.createWithoutOrder(
      userId,
      createPaymentTransactionDto,
    );
  }

  async createTransactionAndOrder(
    userId: string,
    createPaymentTransactionDto: CreatePaymentTransactionDto,
  ) {
    return this.transactionService.createWithOrder(
      userId,
      createPaymentTransactionDto,
    );
  }

  async getPaymentTransaction(clientTransactionId: string) {
    return this.transactionService.getByClientTransactionId(
      clientTransactionId,
    );
  }

  getUserPendingPayments(userId: string) {
    return this.transactionService.getUserPendingPayments(userId);
  }

  async deleteUserPendingPayment(userId: string, transactionId: string) {
    return this.transactionService.deleteUserPendingPayment(
      userId,
      transactionId,
    );
  }

  async regenerateTransactionForOrder(
    orderId: string,
    userId: string,
    paymentProvider: PaymentProvider = PaymentProvider.PAYPHONE,
    paymentMethodId?: string,
    payphoneData?: Record<string, unknown>,
  ) {
    return this.transactionService.regenerateForOrder(
      orderId,
      userId,
      paymentProvider,
      paymentMethodId,
      payphoneData,
    );
  }

  async verifyMultipleTransactions(
    clientTransactionIds: string[],
    userId: string,
  ) {
    return this.transactionService.verifyMultiple(clientTransactionIds, userId);
  }

  // ============================================
  // ÓRDENES - Delegado a PaymentOrderService
  // ============================================

  async createOrderFromPaymentTransaction(
    clientTransactionId: string,
    initialStatus: OrderStatus = OrderStatus.pending,
  ) {
    return this.orderService.createOrderFromTransaction(
      clientTransactionId,
      initialStatus,
    );
  }

  async updatePaymentStatus(
    clientTransactionId: string,
    status: PaymentStatus,
    payphoneData?: Record<string, unknown>,
  ) {
    return this.orderService.updatePaymentStatus(
      clientTransactionId,
      status,
      payphoneData,
    );
  }

  // ============================================
  // WEBHOOKS - Delegado a PaymentWebhookService
  // ============================================

  async handleMercadoPagoWebhook(dataId: string): Promise<void> {
    return this.webhookService.handleMercadoPagoWebhook(dataId);
  }

  async verifyAndUpdateMercadoPagoPayment(
    paymentId: string,
    externalReference: string,
  ) {
    return this.webhookService.verifyAndUpdateMercadoPagoPayment(
      paymentId,
      externalReference,
    );
  }

  // ============================================
  // DEPÓSITOS EN EFECTIVO - Delegado a PaymentCashDepositService
  // ============================================

  async processCashDeposit(
    userId: string,
    addressId: string,
    clientTransactionId: string,
    depositImageFile: Express.Multer.File,
    existingOrderId?: string,
  ) {
    return this.cashDepositService.processCashDeposit(
      userId,
      addressId,
      clientTransactionId,
      depositImageFile,
      existingOrderId,
    );
  }

  // ============================================
  // DEPÓSITOS CRYPTO - Delegado a PaymentCryptoService
  // ============================================

  async processCryptoDeposit(
    userId: string,
    addressId: string,
    clientTransactionId: string,
    depositImageFile: Express.Multer.File,
    existingOrderId?: string,
  ) {
    return this.cryptoService.processCryptoDeposit(
      userId,
      addressId,
      clientTransactionId,
      depositImageFile,
      existingOrderId,
    );
  }

  // ============================================
  // PAGOS POR TELÉFONO - Mantenido en facade por complejidad
  // ============================================

  async processPhonePayment(
    userId: string,
    addressId: string,
    paymentMethodId: string | undefined,
    phoneNumber: string,
    clientTransactionId: string,
    payphoneResponse?: Record<string, unknown>,
  ) {
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: {
        clientTransactionId,
        userId,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada');
    }

    if (payphoneResponse) {
      const updatedTransaction = await this.prisma.paymentTransaction.update({
        where: { clientTransactionId },
        data: {
          payphoneData: payphoneResponse as runtime.InputJsonValue,
        },
        include: {
          order: true,
        },
      });

      if (!updatedTransaction.orderId) {
        try {
          await this.createOrderFromPaymentTransaction(
            clientTransactionId,
            OrderStatus.pending,
          );
        } catch {
          // No lanzar error, la orden se puede crear después
        }
      }

      return {
        transaction: updatedTransaction,
        payphoneResponse,
      };
    }

    try {
      const payphoneResponseData =
        await this.payphoneProvider.processPhonePayment(
          phoneNumber,
          Number(transaction.amount),
          clientTransactionId,
        );
      const updatedTransaction = await this.prisma.paymentTransaction.update({
        where: { clientTransactionId },
        data: {
          payphoneData: payphoneResponseData as runtime.InputJsonValue,
        },
        include: {
          order: true,
        },
      });

      if (!updatedTransaction.orderId) {
        try {
          await this.createOrderFromPaymentTransaction(
            clientTransactionId,
            OrderStatus.pending,
          );
        } catch {
          // No lanzar error, la orden se puede crear después
        }
      }

      return {
        transaction: updatedTransaction,
        payphoneResponse: payphoneResponseData,
      };
    } catch (error: unknown) {
      await this.prisma.paymentTransaction.update({
        where: { clientTransactionId },
        data: {
          status: PaymentStatus.failed,
        },
      });

      throw new Error(
        error instanceof Error
          ? error.message
          : 'Error al procesar el pago por teléfono',
      );
    }
  }

  // ============================================
  // UTILIDADES
  // ============================================

  async generatePaymentLink(
    amount: number,
    clientTransactionId: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.payphoneProvider.processPayment(
      amount,
      clientTransactionId,
      metadata,
    );
  }
}
