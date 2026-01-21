import {
  Injectable,
  NotFoundException,
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
import { CloudinaryService } from '../../cloudinary/cloudinary.service.js';
import { calculateCartTotal, validateAddress } from '../helpers/cart.helper.js';

/**
 * Servicio especializado en pagos por depósito en efectivo.
 * Responsabilidad única: procesar pagos por depósito bancario.
 */
@Injectable()
export class PaymentCashDepositService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => OrdersService))
    private ordersService: OrdersService,
    private cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Procesa un pago por depósito en efectivo.
   */
  async processCashDeposit(
    userId: string,
    addressId: string,
    clientTransactionId: string,
    depositImageFile: Express.Multer.File,
    existingOrderId?: string,
  ) {
    await validateAddress(this.prisma, addressId, userId);

    let order;
    let transaction;

    if (existingOrderId) {
      const result = await this.processExistingOrderDeposit(
        userId,
        addressId,
        clientTransactionId,
        existingOrderId,
      );
      order = result.order;
      transaction = result.transaction;
    } else {
      const result = await this.processNewOrderDeposit(
        userId,
        addressId,
        clientTransactionId,
      );
      order = result.order;
      transaction = result.transaction;
    }

    const depositImageUrl =
      await this.cloudinaryService.uploadImage(depositImageFile);

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        depositImageUrl,
        status: OrderStatus.paid_pending_review,
      },
    });

    return {
      transaction,
      order,
      depositImageUrl,
    };
  }

  /**
   * Procesa depósito para una orden existente (retry de pago).
   */
  private async processExistingOrderDeposit(
    userId: string,
    addressId: string,
    clientTransactionId: string,
    existingOrderId: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: existingOrderId,
        userId,
        status: OrderStatus.pending,
      },
    });

    if (!order) {
      throw new NotFoundException(
        'Orden no encontrada o no está en estado pendiente',
      );
    }

    await this.prisma.paymentTransaction.deleteMany({
      where: {
        orderId: existingOrderId,
        userId,
        status: PaymentStatus.pending,
      },
    });

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        userId,
        orderId: existingOrderId,
        clientTransactionId,
        amount: Number(order.total),
        status: PaymentStatus.pending,
        paymentProvider: PaymentProvider.CASH_DEPOSIT as any,
        addressId,
      },
    });

    return { order, transaction };
  }

  /**
   * Procesa depósito para una nueva orden (flujo normal desde checkout).
   */
  private async processNewOrderDeposit(
    userId: string,
    addressId: string,
    clientTransactionId: string,
  ) {
    const { total } = await calculateCartTotal(this.prisma, userId);

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        userId,
        clientTransactionId,
        amount: total,
        status: PaymentStatus.pending,
        paymentProvider: PaymentProvider.CASH_DEPOSIT as any,
        addressId,
      },
    });

    const order = await this.ordersService.createFromPaymentTransaction(
      userId,
      addressId,
      OrderStatus.pending,
    );

    await this.prisma.paymentTransaction.update({
      where: { clientTransactionId },
      data: { orderId: order.id },
    });

    return { order, transaction };
  }
}
