import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePaymentTransactionDto } from './dto/create-payment-transaction.dto.js';
import { PaymentStatus, OrderStatus } from '../generated/enums.js';
import { OrdersService } from '../orders/orders.service.js';
import { EmailService } from '../email/email.service.js';
import type * as runtime from '@prisma/client/runtime/client';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private emailService: EmailService,
    private configService: ConfigService,
    private httpService: HttpService,
  ) {}

  async createPaymentTransaction(
    userId: string,
    createPaymentTransactionDto: CreatePaymentTransactionDto,
  ) {
    // Verificar que la orden existe y pertenece al usuario
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

    // Crear la transacci?n de pago
    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        orderId: createPaymentTransactionDto.orderId,
        userId,
        clientTransactionId: createPaymentTransactionDto.clientTransactionId,
        amount: order.total,
        status: PaymentStatus.pending,
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

    // Si el pago se completó, actualizar el estado de la orden
    // Flujo: created -> processing -> shipping -> delivered
    if (status === PaymentStatus.completed) {
      // transaction.orderId is guaranteed to be non-null (required field in schema)
      if (!transaction.orderId) {
        return updatedTransaction;
      }
      const currentOrder = await this.prisma.order.findUnique({
        where: { id: transaction.orderId },
      });

      // Si la orden está en "created" o "pending", cambiar a "processing"
      // Si ya está en "processing", cambiar a "shipping"
      // Si ya está en "shipping", cambiar a "delivered"
      let newStatus: OrderStatus;
      const currentStatus = currentOrder?.status;
      if (currentStatus === 'created' || currentStatus === 'pending') {
        newStatus = 'processing' as OrderStatus;
      } else if (currentStatus === 'processing') {
        newStatus = 'shipping' as OrderStatus;
      } else if (currentStatus === 'shipping') {
        newStatus = 'delivered' as OrderStatus;
      } else {
        newStatus = 'processing' as OrderStatus; // Default
      }

      await this.ordersService.updateStatus(transaction.orderId, newStatus);

      // Enviar email de confirmaci?n
      try {
        const user = transaction.order.user;
        const orderItems = transaction.order.items;

        await this.emailService.sendEmail({
          to: user.email,
          subject: '?Orden Confirmada! - Mercado Copado',
          templateName: 'order-confirmation',
          replacements: {
            name: user.firstName,
            orderId: transaction.orderId,
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
    orderId: string,
    phoneNumber: string,
    clientTransactionId: string,
  ) {
    // Verificar que la orden existe y pertenece al usuario
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
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

    // Crear la transacción de pago primero
    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        orderId,
        userId,
        clientTransactionId,
        amount: order.total,
        status: PaymentStatus.pending,
      },
    });

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
      reference: `Compra en Mercado Copado - Orden ${orderId.slice(0, 8)}`,
      amount: Number(order.total) * 100, // Payphone espera el monto en centavos
      amountWithoutTax: Number(order.total) * 100,
      storeId,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post<unknown>(payphoneUrl, payphoneData, {
          headers: {
            Authorization: `Bearer ${payphoneToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      // Actualizar la transacción con los datos de Payphone
      await this.prisma.paymentTransaction.update({
        where: { clientTransactionId },
        data: {
          payphoneData: response.data as Record<
            string,
            unknown
          > as runtime.InputJsonValue,
        },
      });

      return {
        transaction,
        payphoneResponse: response.data,
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
}
