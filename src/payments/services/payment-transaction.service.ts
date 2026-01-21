import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreatePaymentTransactionDto } from '../dto/create-payment-transaction.dto.js';
import {
  PaymentStatus,
  OrderStatus,
  PaymentProvider,
} from '../../generated/enums.js';
import { MercadoPagoProvider } from '../providers/mercadopago.provider.js';
import {
  calculateCartTotal,
  validateAddress,
  clearCart,
  calculateFinalPrice,
} from '../helpers/cart.helper.js';
import type * as runtime from '@prisma/client/runtime/client';

/**
 * Servicio especializado en CRUD de transacciones de pago.
 * Responsabilidad única: gestionar transacciones de pago.
 */
@Injectable()
export class PaymentTransactionService {
  constructor(
    private prisma: PrismaService,
    private mercadopagoProvider: MercadoPagoProvider,
  ) {}

  /**
   * Crea una transacción de pago.
   * Si tiene orderId, crea para una orden existente.
   * Si no tiene orderId, crea una transacción sin orden.
   */
  async create(userId: string, dto: CreatePaymentTransactionDto) {
    if (dto.orderId) {
      return this.createForExistingOrder(userId, dto);
    }
    return this.createWithoutOrder(userId, dto);
  }

  /**
   * Crea una transacción para una orden existente.
   */
  private async createForExistingOrder(
    userId: string,
    dto: CreatePaymentTransactionDto,
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        userId,
      },
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
      throw new NotFoundException('Orden no encontrada');
    }

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        orderId: dto.orderId,
        userId,
        clientTransactionId: dto.clientTransactionId,
        amount: order.total,
        status: PaymentStatus.pending,
        paymentProvider: (dto.paymentProvider ||
          PaymentProvider.PAYPHONE) as any,
      },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        },
        user: true,
      },
    });

    return transaction;
  }

  /**
   * Crea una transacción sin orden asociada.
   */
  async createWithoutOrder(userId: string, dto: CreatePaymentTransactionDto) {
    if (!dto.addressId) {
      throw new BadRequestException('addressId es requerido');
    }

    const provider = dto.paymentProvider || PaymentProvider.PAYPHONE;
    if (
      provider !== PaymentProvider.PAYPHONE &&
      provider !== PaymentProvider.MERCADOPAGO &&
      !dto.paymentMethodId
    ) {
      throw new BadRequestException(
        'paymentMethodId es requerido para este proveedor de pago',
      );
    }

    await validateAddress(this.prisma, dto.addressId, userId);
    const { total } = await calculateCartTotal(this.prisma, userId);

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        userId,
        clientTransactionId: dto.clientTransactionId,
        amount: total,
        status: PaymentStatus.pending,
        paymentProvider: (dto.paymentProvider ||
          PaymentProvider.PAYPHONE) as any,
        addressId: dto.addressId || null,
        paymentMethodId: dto.paymentMethodId || null,
      },
      include: {
        user: true,
      },
    });

    if (provider === PaymentProvider.MERCADOPAGO) {
      const result = await this.mercadopagoProvider.processPayment(
        total,
        dto.clientTransactionId,
        { reference: 'Compra en Mercado Copado' },
      );
      return { ...transaction, preferenceId: result.paymentId };
    }

    return transaction;
  }

  /**
   * Crea una transacción y una orden juntas (para pagos por link).
   */
  async createWithOrder(userId: string, dto: CreatePaymentTransactionDto) {
    if (!dto.addressId) {
      throw new BadRequestException('addressId es requerido');
    }

    await validateAddress(this.prisma, dto.addressId, userId);

    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: true },
    });

    if (cartItems.length === 0) {
      throw new BadRequestException('El carrito está vacío');
    }

    let total = 0;
    const orderItems = cartItems.map((item) => {
      const finalPrice = calculateFinalPrice(
        item.product.price,
        item.product.discount,
      );
      total += finalPrice * item.quantity;

      return {
        productId: item.productId,
        quantity: item.quantity,
        price: finalPrice,
      };
    });

    const order = await this.prisma.order.create({
      data: {
        userId,
        addressId: dto.addressId,
        total,
        status: OrderStatus.pending,
        items: {
          create: orderItems,
        },
      },
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

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        userId,
        orderId: order.id,
        clientTransactionId: dto.clientTransactionId,
        amount: total,
        status: PaymentStatus.pending,
        paymentProvider: (dto.paymentProvider ||
          PaymentProvider.PAYPHONE) as any,
        addressId: dto.addressId || null,
        paymentMethodId: dto.paymentMethodId || null,
        ...(dto.payphoneData
          ? {
              payphoneData: dto.payphoneData as runtime.InputJsonValue,
            }
          : {}),
      },
      include: {
        order: true,
        user: true,
      },
    });

    const provider = dto.paymentProvider || PaymentProvider.PAYPHONE;

    if (provider === PaymentProvider.MERCADOPAGO) {
      const result = await this.mercadopagoProvider.processPayment(
        total,
        dto.clientTransactionId,
        { reference: 'Compra en Mercado Copado' },
      );

      if (!dto.orderId) {
        await clearCart(this.prisma, userId);
      }

      return {
        transaction,
        order,
        preferenceId: result.paymentId,
        initPoint:
          (result.paymentData?.initPoint as string) || result.redirectUrl,
      };
    }

    if (!dto.orderId) {
      await clearCart(this.prisma, userId);
    }

    return { transaction, order };
  }

  /**
   * Obtiene una transacción por su clientTransactionId.
   */
  async getByClientTransactionId(clientTransactionId: string) {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { clientTransactionId },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        },
        user: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transacción con clientTransactionId "${clientTransactionId}" no encontrada`,
      );
    }
    return transaction;
  }

  /**
   * Obtiene todas las transacciones pendientes de un usuario.
   */
  getUserPendingPayments(userId: string) {
    return this.prisma.paymentTransaction.findMany({
      where: {
        userId,
        status: PaymentStatus.pending,
      },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: {
                  include: {
                    images: {
                      orderBy: {
                        order: 'asc',
                      },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Elimina una transacción pendiente de un usuario.
   */
  async deleteUserPendingPayment(userId: string, transactionId: string) {
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: {
        id: transactionId,
        userId,
        status: PaymentStatus.pending,
      },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transacción pendiente con ID "${transactionId}" no encontrada o no pertenece al usuario`,
      );
    }

    await this.prisma.paymentTransaction.delete({
      where: { id: transactionId },
    });

    return {
      message: 'Transacción pendiente eliminada exitosamente',
    };
  }

  /**
   * Regenera una transacción para una orden existente.
   */
  async regenerateForOrder(
    orderId: string,
    userId: string,
    paymentProvider: PaymentProvider = PaymentProvider.PAYPHONE,
    paymentMethodId?: string,
    payphoneData?: Record<string, unknown>,
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
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
        orderId,
        userId,
        status: PaymentStatus.pending,
      },
    });

    const newClientTransactionId = Math.random().toString(36).substring(2, 15);

    let finalPayphoneData: runtime.InputJsonValue | undefined;
    if (payphoneData) {
      finalPayphoneData = payphoneData as runtime.InputJsonValue;
    }

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        userId,
        orderId,
        clientTransactionId: newClientTransactionId,
        amount: Number(order.total),
        status: PaymentStatus.pending,
        paymentProvider: paymentProvider as any,
        addressId: order.addressId,
        paymentMethodId:
          paymentMethodId &&
          paymentMethodId !== '' &&
          paymentMethodId !== 'payphone-default'
            ? paymentMethodId
            : null,
        ...(finalPayphoneData
          ? {
              payphoneData: finalPayphoneData,
            }
          : {}),
      },
    });

    // Para Mercado Pago, generar la preferencia con el init_point
    if (paymentProvider === PaymentProvider.MERCADOPAGO) {
      const result = await this.mercadopagoProvider.processPayment(
        Number(order.total),
        newClientTransactionId,
        { reference: 'Compra en Mercado Copado' },
      );

      return {
        transaction,
        preferenceId: result.paymentId,
        initPoint:
          (result.paymentData?.initPoint as string) || result.redirectUrl,
      };
    }

    return transaction;
  }

  /**
   * Verifica múltiples transacciones.
   */
  async verifyMultiple(clientTransactionIds: string[], userId: string) {
    return this.prisma.paymentTransaction.findMany({
      where: {
        clientTransactionId: {
          in: clientTransactionIds,
        },
        userId,
      },
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
  }
}
