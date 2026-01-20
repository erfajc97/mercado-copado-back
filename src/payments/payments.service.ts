import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePaymentTransactionDto } from './dto/create-payment-transaction.dto.js';
import {
  PaymentStatus,
  OrderStatus,
  PaymentProvider,
} from '../generated/enums.js';
import { OrdersService } from '../orders/orders.service.js';
import { EmailService } from '../email/email.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { PayphoneProvider } from './providers/payphone.provider.js';
import type * as runtime from '@prisma/client/runtime/client';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => OrdersService))
    private ordersService: OrdersService,
    private emailService: EmailService,
    private configService: ConfigService,
    private httpService: HttpService,
    private cloudinaryService: CloudinaryService,
    private payphoneProvider: PayphoneProvider,
  ) {}

  async createPaymentTransaction(
    userId: string,
    createPaymentTransactionDto: CreatePaymentTransactionDto,
  ) {
    // Si tiene orderId, usar el flujo antiguo
    if (createPaymentTransactionDto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: {
          id: createPaymentTransactionDto.orderId,
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
          orderId: createPaymentTransactionDto.orderId,
          userId,
          clientTransactionId: createPaymentTransactionDto.clientTransactionId,
          amount: order.total,
          status: PaymentStatus.pending,
          paymentProvider: (createPaymentTransactionDto.paymentProvider ||
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

    // Si no tiene orderId, usar el nuevo flujo
    return this.createPaymentTransactionWithoutOrder(
      userId,
      createPaymentTransactionDto,
    );
  }

  async createPaymentTransactionWithoutOrder(
    userId: string,
    createPaymentTransactionDto: CreatePaymentTransactionDto,
  ) {
    // Validar que tenga addressId
    if (!createPaymentTransactionDto.addressId) {
      throw new BadRequestException('addressId es requerido');
    }

    // Para proveedores que no son Payphone, paymentMethodId es requerido
    if (
      createPaymentTransactionDto.paymentProvider !==
        PaymentProvider.PAYPHONE &&
      !createPaymentTransactionDto.paymentMethodId
    ) {
      throw new BadRequestException(
        'paymentMethodId es requerido para este proveedor de pago',
      );
    }

    // Verificar que la dirección existe y pertenece al usuario
    const address = await this.prisma.address.findFirst({
      where: {
        id: createPaymentTransactionDto.addressId,
        userId,
      },
    });

    if (!address) {
      throw new NotFoundException('Dirección no encontrada');
    }

    // Calcular el total del carrito
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: true },
    });

    if (cartItems.length === 0) {
      throw new BadRequestException('El carrito está vacío');
    }

    let total = 0;
    cartItems.forEach((item) => {
      const price = Number(item.product.price);
      const discount = Number(item.product.discount || 0);
      const finalPrice = price * (1 - discount / 100);
      total += finalPrice * item.quantity;
    });

    // Crear la transacción sin orden
    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        userId,
        clientTransactionId: createPaymentTransactionDto.clientTransactionId,
        amount: total,
        status: PaymentStatus.pending,
        paymentProvider: (createPaymentTransactionDto.paymentProvider ||
          PaymentProvider.PAYPHONE) as any,
        addressId: createPaymentTransactionDto.addressId || null,
        paymentMethodId: createPaymentTransactionDto.paymentMethodId || null,
      },
      include: {
        user: true,
      },
    });

    return transaction;
  }

  /**
   * Crea una transacción y una orden juntas (para pagos por link)
   * La orden se crea en estado 'pending' y el carrito se limpia
   */
  async createTransactionAndOrder(
    userId: string,
    createPaymentTransactionDto: CreatePaymentTransactionDto,
  ) {
    // Validar que tenga addressId
    if (!createPaymentTransactionDto.addressId) {
      throw new BadRequestException('addressId es requerido');
    }

    // Verificar que la dirección existe y pertenece al usuario
    const address = await this.prisma.address.findFirst({
      where: {
        id: createPaymentTransactionDto.addressId,
        userId,
      },
    });

    if (!address) {
      throw new NotFoundException('Dirección no encontrada');
    }

    // Calcular el total del carrito
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: true },
    });

    if (cartItems.length === 0) {
      throw new BadRequestException('El carrito está vacío');
    }

    let total = 0;
    const orderItems = cartItems.map((item) => {
      const price = Number(item.product.price);
      const discount = Number(item.product.discount || 0);
      const finalPrice = price * (1 - discount / 100);
      const itemTotal = finalPrice * item.quantity;
      total += itemTotal;

      return {
        productId: item.productId,
        quantity: item.quantity,
        price: finalPrice,
      };
    });

    // Crear la orden en estado 'pending'
    const order = await this.prisma.order.create({
      data: {
        userId,
        addressId: createPaymentTransactionDto.addressId,
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

    // Crear la transacción asociada a la orden
    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        userId,
        orderId: order.id,
        clientTransactionId: createPaymentTransactionDto.clientTransactionId,
        amount: total,
        status: PaymentStatus.pending,
        paymentProvider: (createPaymentTransactionDto.paymentProvider ||
          PaymentProvider.PAYPHONE) as any,
        addressId: createPaymentTransactionDto.addressId || null,
        paymentMethodId: createPaymentTransactionDto.paymentMethodId || null,
        ...(createPaymentTransactionDto.payphoneData
          ? {
              payphoneData:
                createPaymentTransactionDto.payphoneData as runtime.InputJsonValue,
            }
          : {}),
      },
      include: {
        order: true,
        user: true,
      },
    });

    // Limpiar el carrito después de crear la orden (solo si no es retry)
    // Si orderId viene en el DTO, no limpiar el carrito porque es una orden existente
    if (!createPaymentTransactionDto.orderId) {
      await this.prisma.cartItem.deleteMany({
        where: { userId },
      });
    }

    return {
      transaction,
      order,
    };
  }

  async createOrderFromPaymentTransaction(
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
      // Ya tiene orden, retornar la orden existente
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

    // Crear la orden usando el método del OrdersService
    // transaction.addressId ya fue validado arriba, así que es string
    const addressId: string = transaction.addressId;
    const order = await this.ordersService.createFromPaymentTransaction(
      transaction.userId,
      addressId,
      initialStatus, // Estado inicial especificado (pending para links, processing para teléfono)
    );

    // Actualizar la transacción con el orderId
    await this.prisma.paymentTransaction.update({
      where: { clientTransactionId },
      data: { orderId: order.id },
    });

    return order;
  }

  async getPaymentTransaction(clientTransactionId: string) {
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
        `Transacci?n con clientTransactionId "${clientTransactionId}" no encontrada`,
      );
    }
    return transaction;
  }

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
        `Transacci?n con clientTransactionId "${clientTransactionId}" no encontrada`,
      );
    }

    // Si el status ya est? actualizado, no hacer nada
    if (transaction.status === status) {
      return transaction;
    }

    // Actualizar el status
    // Construir el objeto de actualizaci?n condicionalmente para evitar problemas de tipos con JSON
    // Usar una construcci?n m?s expl?cita para que TypeScript pueda inferir los tipos correctamente
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

    // Si el pago se completó, actualizar el estado de la orden a 'paid_pending_review'
    if (status === PaymentStatus.completed) {
      let order;

      try {
        // La orden ya debería existir (se creó cuando se inició el pago)
        // Solo actualizar su estado a paid_pending_review
        if (!transaction.orderId) {
          throw new BadRequestException(
            'La transacción no tiene una orden asociada. Por favor, contacta al soporte.',
          );
        }

        // Obtener la orden existente
        order = await this.prisma.order.findUnique({
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

        // Actualizar el estado de la orden según el método de pago
        const orderId: string = String(order.id);
        let newOrderStatus: OrderStatus;

        // Determinar el status según el método de pago
        if (transaction.paymentProvider === PaymentProvider.PAYPHONE) {
          // Tanto link como teléfono deben resultar en processing
          newOrderStatus = OrderStatus.processing;
          newOrderStatus = OrderStatus.processing;
        } else if (
          transaction.paymentProvider === PaymentProvider.CASH_DEPOSIT
        ) {
          // Depósitos en efectivo se marcan como paid_pending_review para revisión manual
          newOrderStatus = OrderStatus.paid_pending_review;
        } else {
          // Para otros métodos de pago, usar paid_pending_review
          newOrderStatus = OrderStatus.paid_pending_review;
        }

        await this.ordersService.updateStatus(orderId, newOrderStatus);

        // Enviar email de confirmación
        try {
          const user = order.user;
          const orderItems = order.items;

          await this.emailService.sendEmail({
            to: user.email,
            subject: '¡Orden Confirmada! - Mercado Copado',
            templateName: 'order-confirmation',
            replacements: {
              name: user.firstName,
              orderId: order.id,
              total: transaction.amount.toString(),
              items: orderItems
                .map(
                  (item) =>
                    `${item.product.name} x${item.quantity} - $${Number(item.price).toFixed(2)}`,
                )
                .join('\n'),
            },
          });
        } catch (error) {
          // Error al enviar email, pero no fallar la actualización de estado
        }
      } catch (error) {
        // Re-lanzar el error para que el frontend pueda manejarlo
        throw error;
      }
    }

    return updatedTransaction;
  }

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
        `Transacci?n pendiente con ID "${transactionId}" no encontrada o no pertenece al usuario`,
      );
    }

    await this.prisma.paymentTransaction.delete({
      where: { id: transactionId },
    });

    return {
      message: 'Transacci?n pendiente eliminada exitosamente',
    };
  }

  async processPhonePayment(
    userId: string,
    addressId: string,
    paymentMethodId: string | undefined, // Opcional para PAYPHONE
    phoneNumber: string,
    clientTransactionId: string,
    payphoneResponse?: Record<string, unknown>, // Respuesta de Payphone desde el frontend
  ) {
    // Verificar que la transacción existe y pertenece al usuario
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: {
        clientTransactionId,
        userId,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada');
    }

    // Si ya tenemos la respuesta de Payphone desde el frontend, actualizar la transacción
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

      // Verificar si la transacción tiene una orden asociada
      // Si no tiene orden, crearla usando createOrderFromPaymentTransaction
      if (!updatedTransaction.orderId) {
        try {
          await this.createOrderFromPaymentTransaction(
            clientTransactionId,
            OrderStatus.pending,
          );
        } catch (error) {
          // No lanzar el error aquí, porque el pago ya fue enviado a Payphone
          // La orden se puede crear más tarde cuando se confirme el pago
        }
      }

      return {
        transaction: updatedTransaction,
        payphoneResponse,
      };
    }

    // Si no hay respuesta de Payphone, usar PayphoneProvider (fallback, pero no debería usarse)
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

      // Verificar si la transacción tiene una orden asociada
      // Si no tiene orden, crearla usando createOrderFromPaymentTransaction
      if (!updatedTransaction.orderId) {
        try {
          await this.createOrderFromPaymentTransaction(
            clientTransactionId,
            OrderStatus.pending,
          );
        } catch (error) {
          // No lanzar el error aquí, porque el pago ya fue enviado a Payphone
          // La orden se puede crear más tarde cuando se confirme el pago
        }
      }

      return {
        transaction: updatedTransaction,
        payphoneResponse: payphoneResponseData,
      };
    } catch (error: unknown) {
      // Si falla la llamada a Payphone, marcar la transacción como fallida
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

  async processCashDeposit(
    userId: string,
    addressId: string,
    clientTransactionId: string,
    depositImageFile: Express.Multer.File,
    existingOrderId?: string, // Para retry de pagos en órdenes existentes
  ) {
    // Verificar que la dirección existe y pertenece al usuario
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Dirección no encontrada');
    }

    let order;
    let transaction;

    // Si hay orderId, actualizar la orden existente (retry de pago)
    if (existingOrderId) {
      // Verificar que la orden existe y pertenece al usuario
      order = await this.prisma.order.findFirst({
        where: {
          id: existingOrderId,
          userId,
          status: OrderStatus.pending, // Solo permitir para órdenes pendientes
        },
      });

      if (!order) {
        throw new NotFoundException(
          'Orden no encontrada o no está en estado pendiente',
        );
      }

      // Buscar y eliminar transacciones pendientes anteriores para esta orden
      const pendingTransactions = await this.prisma.paymentTransaction.findMany(
        {
          where: {
            orderId: existingOrderId,
            userId,
            status: PaymentStatus.pending,
          },
        },
      );

      if (pendingTransactions.length > 0) {
        await this.prisma.paymentTransaction.deleteMany({
          where: {
            orderId: existingOrderId,
            userId,
            status: PaymentStatus.pending,
          },
        });
      }

      // Crear nueva transacción para esta orden
      transaction = await this.prisma.paymentTransaction.create({
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
    } else {
      // Si no hay orderId, crear nueva orden (flujo normal desde checkout)
      // Calcular el total del carrito
      const cartItems = await this.prisma.cartItem.findMany({
        where: { userId },
        include: { product: true },
      });

      if (cartItems.length === 0) {
        throw new BadRequestException('El carrito está vacío');
      }

      let total = 0;
      cartItems.forEach((item) => {
        const price = Number(item.product.price);
        const discount = Number(item.product.discount || 0);
        const finalPrice = price * (1 - discount / 100);
        total += finalPrice * item.quantity;
      });

      // Crear la transacción de pago
      transaction = await this.prisma.paymentTransaction.create({
        data: {
          userId,
          clientTransactionId,
          amount: total,
          status: PaymentStatus.pending,
          paymentProvider: PaymentProvider.CASH_DEPOSIT as any,
          addressId,
        },
      });

      // Crear la orden primero en estado pending
      order = await this.ordersService.createFromPaymentTransaction(
        userId,
        addressId,
        OrderStatus.pending,
      );

      // Actualizar la transacción con el orderId
      await this.prisma.paymentTransaction.update({
        where: { clientTransactionId },
        data: { orderId: order.id },
      });
    }

    // Subir la imagen del depósito a Cloudinary
    const depositImageUrl =
      await this.cloudinaryService.uploadImage(depositImageFile);

    // Actualizar la orden con la URL de la imagen del depósito y cambiar estado a paid_pending_review
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
   * Genera un link de pago usando PayphoneProvider
   * Este método puede ser usado por OrdersService para generar links de pago
   */
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

  /**
   * Regenera una transacción para una orden existente
   * Elimina las transacciones pendientes anteriores y crea una nueva
   */
  async regenerateTransactionForOrder(
    orderId: string,
    userId: string,
    paymentProvider: PaymentProvider = PaymentProvider.PAYPHONE,
    paymentMethodId?: string,
    payphoneData?: Record<string, unknown>,
  ) {
    // Verificar que la orden existe y pertenece al usuario
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
        status: OrderStatus.pending, // Solo permitir para órdenes pendientes
      },
    });

    if (!order) {
      throw new NotFoundException(
        'Orden no encontrada o no está en estado pendiente',
      );
    }

    // Buscar y eliminar transacciones pendientes anteriores para esta orden
    const pendingTransactions = await this.prisma.paymentTransaction.findMany({
      where: {
        orderId,
        userId,
        status: PaymentStatus.pending,
      },
    });

    if (pendingTransactions.length > 0) {
      await this.prisma.paymentTransaction.deleteMany({
        where: {
          orderId,
          userId,
          status: PaymentStatus.pending,
        },
      });
    }

    // Crear nueva transacción con nuevo clientTransactionId
    const newClientTransactionId = Math.random().toString(36).substring(2, 15);

    // Validar y preparar payphoneData
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

    return transaction;
  }

  /**
   * Verifica múltiples transacciones
   */
  async verifyMultipleTransactions(
    clientTransactionIds: string[],
    userId: string,
  ) {
    const transactions = await this.prisma.paymentTransaction.findMany({
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

    return transactions;
  }
}
