import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
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
import type * as runtime from '@prisma/client/runtime/client';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private emailService: EmailService,
    private configService: ConfigService,
    private httpService: HttpService,
    private cloudinaryService: CloudinaryService,
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

    // Si el pago se completó, crear la orden si no existe y actualizar el estado
    if (status === PaymentStatus.completed) {
      let order;

      // Si no tiene orderId, crear la orden desde la transacción
      if (!transaction.orderId) {
        order =
          await this.createOrderFromPaymentTransaction(clientTransactionId);
      } else {
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
      }

      if (!order || !order.id) {
        return updatedTransaction;
      }

      // Actualizar el estado de la orden
      // Flujo: created -> processing -> shipping -> delivered
      let newStatus: OrderStatus;
      const currentStatus = order.status;
      if (currentStatus === 'created' || currentStatus === 'pending') {
        newStatus = 'processing' as OrderStatus;
      } else if (currentStatus === 'processing') {
        newStatus = 'shipping' as OrderStatus;
      } else if (currentStatus === 'shipping') {
        newStatus = 'delivered' as OrderStatus;
      } else {
        newStatus = 'processing' as OrderStatus; // Default
      }

      const orderId: string = String(order.id);
      await this.ordersService.updateStatus(orderId, newStatus);

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
        console.error('Error sending order confirmation email:', error);
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
    paymentMethodId: string,
    phoneNumber: string,
    clientTransactionId: string,
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

    // Llamar a la API de Payphone para procesar el pago por teléfono
    const payphoneToken = this.configService.get<string>('PAYPHONE_TOKEN');
    if (!payphoneToken) {
      throw new Error('PAYPHONE_TOKEN no está configurado');
    }

    const payphoneUrl = 'https://pay.payphonetodoesposible.com/api/Sale';
    const storeId = this.configService.get<string>('STORE_ID');
    if (!storeId) {
      throw new Error('STORE_ID no está configurado');
    }
    const payphoneData: {
      clientTransactionId: string;
      phoneNumber: string;
      reference: string;
      amount: number;
      amountWithoutTax: number;
      storeId: string;
    } = {
      clientTransactionId,
      phoneNumber,
      reference: `Compra en Mercado Copado - Transacción ${clientTransactionId.slice(0, 8)}`,
      amount: Number(transaction.amount) * 100, // Payphone espera el monto en centavos
      amountWithoutTax: Number(transaction.amount) * 100,
      storeId,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post<{ data: Record<string, unknown> }>(
          payphoneUrl,
          payphoneData,
          {
            headers: {
              Authorization: `Bearer ${payphoneToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      // Actualizar la transacción con los datos de Payphone
      const payphoneResponseData = response.data?.data || response.data || {};
      await this.prisma.paymentTransaction.update({
        where: { clientTransactionId },
        data: {
          payphoneData: payphoneResponseData as runtime.InputJsonValue,
        },
      });

      // Crear la orden en estado processing cuando se procesa el pago por teléfono
      if (!transaction.orderId && transaction.addressId) {
        const order = await this.ordersService.createFromPaymentTransaction(
          transaction.userId,
          transaction.addressId,
          OrderStatus.processing, // Crear directamente en estado processing para pagos por teléfono
        );

        // Actualizar la transacción con el orderId
        // El estado de la transacción permanece en pending hasta que se confirme el pago
        await this.prisma.paymentTransaction.update({
          where: { clientTransactionId },
          data: {
            orderId: order.id,
            // Mantener el estado en pending hasta que Payphone confirme el pago
            // status: PaymentStatus.pending (ya está en pending)
          },
        });

        // Actualizar el estado de la orden a processing
        await this.ordersService.updateStatus(
          order.id,
          OrderStatus.processing,
          transaction.userId,
        );
      }

      return {
        transaction,
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
  ) {
    // Verificar que la dirección existe y pertenece al usuario
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
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

    // Subir la imagen del depósito a Cloudinary
    const depositImageUrl = await this.cloudinaryService.uploadImage(
      depositImageFile,
    );

    // Crear la transacción de pago
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

    // Crear la orden con estado paid_pending_review y la imagen del depósito
    const order = await this.ordersService.createFromPaymentTransaction(
      userId,
      addressId,
      OrderStatus.paid_pending_review,
    );

    // Actualizar la orden con la URL de la imagen del depósito
    await this.prisma.order.update({
      where: { id: order.id },
      data: { depositImageUrl },
    });

    // Actualizar la transacción con el orderId
    await this.prisma.paymentTransaction.update({
      where: { clientTransactionId },
      data: { orderId: order.id },
    });

    return {
      transaction,
      order,
      depositImageUrl,
    };
  }
}
