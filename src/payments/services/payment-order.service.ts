import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  PaymentStatus,
  OrderStatus,
  PaymentProvider,
} from '../../generated/enums.js';
import { OrdersService } from '../../orders/orders.service.js';
import { OrderNotificationService } from '../../orders/services/order-notification.service.js';
import type * as runtime from '@prisma/client/runtime/client';

/**
 * Servicio especializado en operaciones de órdenes relacionadas con pagos.
 * Responsabilidad única: gestionar la creación de órdenes desde transacciones
 * y la actualización de estados de pago.
 */
@Injectable()
export class PaymentOrderService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => OrdersService))
    private ordersService: OrdersService,
    @Inject(forwardRef(() => OrderNotificationService))
    private orderNotificationService: OrderNotificationService,
  ) {}

  /**
   * Crea una orden desde una transacción de pago existente.
   */
  async createOrderFromTransaction(
    clientTransactionId: string,
    initialStatus: OrderStatus = OrderStatus.pending,
  ) {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { clientTransactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada');
    }

    if (!transaction.addressId) {
      throw new BadRequestException('La transacción no tiene addressId');
    }

    if (transaction.orderId) {
      return this.prisma.order.findUnique({
        where: { id: transaction.orderId },
        include: {
          address: true,
          items: {
            include: {
              product: {
                include: {
                  images: {
                    orderBy: { order: 'asc' },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });
    }

    const addressId: string = transaction.addressId;
    const order = await this.ordersService.createFromPaymentTransaction(
      transaction.userId,
      addressId,
      initialStatus,
    );

    await this.prisma.paymentTransaction.update({
      where: { clientTransactionId },
      data: { orderId: order.id },
    });

    return order;
  }

  /**
   * Actualiza el estado de una transacción de pago.
   * Si el pago se completa, también actualiza la orden y envía email.
   */
  async updatePaymentStatus(
    clientTransactionId: string,
    status: PaymentStatus,
    payphoneData?: Record<string, unknown>,
  ) {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { clientTransactionId },
      include: {
        order: {
          include: {
            user: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transacción con clientTransactionId "${clientTransactionId}" no encontrada`,
      );
    }

    if (transaction.status === status) {
      return transaction;
    }

    const updateData: {
      status: PaymentStatus;
      payphoneData?: runtime.InputJsonValue;
    } = {
      status,
      ...(payphoneData !== undefined
        ? { payphoneData: payphoneData as runtime.InputJsonValue }
        : transaction.payphoneData !== null
          ? { payphoneData: transaction.payphoneData as runtime.InputJsonValue }
          : {}),
    };

    const updatedTransaction = await this.prisma.paymentTransaction.update({
      where: { clientTransactionId },
      data: updateData,
      include: {
        order: {
          include: {
            user: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (status === PaymentStatus.completed) {
      await this.handlePaymentCompleted(transaction);
    }

    return updatedTransaction;
  }

  /**
   * Maneja las acciones cuando un pago se completa.
   */
  private async handlePaymentCompleted(transaction: {
    orderId: string | null;
    paymentProvider: PaymentProvider;
    amount: number | { toNumber(): number };
  }) {
    if (!transaction.orderId) {
      throw new BadRequestException(
        'La transacción no tiene una orden asociada. Por favor, contacta al soporte.',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: transaction.orderId },
      include: {
        user: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        `La orden asociada a esta transacción no fue encontrada`,
      );
    }

    const newOrderStatus = this.determineOrderStatus(
      transaction.paymentProvider,
    );

    // Actualizar estado de la orden (esto también enviará el email de notificación)
    await this.ordersService.updateStatus(order.id, newOrderStatus);

    // Enviar email de confirmación de orden (adicional al de estado)
    await this.orderNotificationService.sendOrderConfirmationEmail({
      ...order,
      total: transaction.amount,
    });
  }

  /**
   * Determina el estado de la orden basado en el proveedor de pago.
   */
  private determineOrderStatus(paymentProvider: PaymentProvider): OrderStatus {
    switch (paymentProvider) {
      case PaymentProvider.PAYPHONE:
      case PaymentProvider.MERCADOPAGO:
        return OrderStatus.processing;
      case PaymentProvider.CASH_DEPOSIT:
      default:
        return OrderStatus.paid_pending_review;
    }
  }
}
