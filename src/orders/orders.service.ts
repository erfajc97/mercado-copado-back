import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderStatus } from '../generated/enums.js';
import { PayphoneProvider } from '../payments/providers/payphone.provider.js';
import { createPaginationResponse } from '../common/helpers/pagination.helper.js';
import { OrderNotificationService } from './services/order-notification.service.js';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private payphoneProvider: PayphoneProvider,
    private orderNotificationService: OrderNotificationService,
  ) {}

  async create(userId: string, createOrderDto: CreateOrderDto) {
    // Verificar que la dirección existe y pertenece al usuario
    const address = await this.prisma.address.findFirst({
      where: { id: createOrderDto.addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Dirección no encontrada');
    }

    // Obtener items del carrito
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: true,
      },
    });

    if (cartItems.length === 0) {
      throw new BadRequestException('El carrito está vacío');
    }

    // Calcular el total
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

    // Crear la orden con estado "created" inicialmente
    // Cambiará a "processing" cuando se confirme el pago
    const order = await this.prisma.order.create({
      data: {
        userId,
        addressId: createOrderDto.addressId,
        total,
        status: OrderStatus.created,
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
    });

    // Limpiar el carrito
    await this.prisma.cartItem.deleteMany({
      where: { userId },
    });

    return order;
  }

  async findAll(
    userId?: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: OrderStatus,
  ) {
    const where: {
      userId?: string;
      status?: OrderStatus;
      OR?: Array<{
        id?: { contains: string; mode: 'insensitive' };
        user?: { email?: { contains: string; mode: 'insensitive' } };
      }>;
    } = {};

    if (userId) {
      where.userId = userId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Construir el objeto where solo si tiene propiedades
    const whereClause = Object.keys(where).length > 0 ? where : undefined;

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        ...(whereClause && { where: whereClause }),
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          address: true,
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
          payments: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.order.count({
        ...(whereClause && { where: whereClause }),
      }),
    ]);

    return createPaginationResponse(orders, total, page, limit);
  }

  async findOne(id: string, userId?: string) {
    const where: { id: string; userId?: string } = { id };
    if (userId) {
      where.userId = userId;
    }

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        address: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                images: {
                  orderBy: {
                    order: 'asc',
                  },
                },
                category: true,
                subcategory: true,
              },
            },
          },
        },
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Orden con id ${id} no encontrada`);
    }

    return order;
  }

  async updateStatus(id: string, status: OrderStatus, userId?: string) {
    const where: { id: string; userId?: string } = { id };
    if (userId) {
      where.userId = userId;
    }

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    const previousStatus = order.status;

    // order.id is guaranteed to be non-null after findFirst check
    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: { status },
      include: {
        address: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    // Enviar notificación por email si el estado cambió
    if (previousStatus !== status) {
      await this.orderNotificationService.sendOrderStatusEmail(
        updatedOrder,
        status,
        previousStatus,
      );
    }

    return updatedOrder;
  }

  async createFromPaymentTransaction(
    userId: string,
    addressId: string,
    initialStatus: OrderStatus = OrderStatus.created,
  ) {
    // Verificar que la dirección existe y pertenece al usuario
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Dirección no encontrada');
    }

    // Obtener items del carrito
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: true,
      },
    });

    if (cartItems.length === 0) {
      throw new BadRequestException('El carrito está vacío');
    }

    // Calcular el total
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

    // Crear la orden con el estado inicial especificado
    const order = await this.prisma.order.create({
      data: {
        userId,
        addressId,
        total,
        status: initialStatus,
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
    });

    // Limpiar el carrito
    await this.prisma.cartItem.deleteMany({
      where: { userId },
    });

    return order;
  }

  async getPaymentLink(orderId: string, userId: string, isAdmin: boolean) {
    // Buscar la orden
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        ...(isAdmin ? {} : { userId }), // Si es admin, puede ver cualquier orden
      },
      include: {
        payments: {
          where: {
            paymentProvider: 'PAYPHONE',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    // Verificar que la orden está en estado pending
    if (order.status !== 'pending') {
      throw new BadRequestException(
        'Solo las órdenes pendientes tienen link de pago disponible',
      );
    }

    // Verificar que existe una transacción de pago
    if (!order.payments || order.payments.length === 0) {
      throw new NotFoundException(
        'No se encontró transacción de pago para esta orden',
      );
    }

    const payment = order.payments[0];
    const payphoneData = payment.payphoneData as {
      payWithCard?: string;
    } | null;

    // Si no existe el link o está vacío, generar uno nuevo
    if (!payphoneData || !payphoneData.payWithCard) {
      // Verificar que existe clientTransactionId
      if (!payment.clientTransactionId) {
        throw new BadRequestException(
          'No se encontró clientTransactionId en la transacción de pago',
        );
      }

      // Generar nuevo link de pago usando PayphoneProvider directamente
      const amount = Number(order.total);
      if (!amount || amount <= 0) {
        throw new BadRequestException('El monto de la orden no es válido');
      }

      try {
        const result = await this.payphoneProvider.processPayment(
          amount,
          payment.clientTransactionId,
          {
            reference: `Orden ${order.id}`,
          },
        );

        if (!result || !result.redirectUrl) {
          throw new BadRequestException(
            'No se pudo generar el link de pago. La respuesta del proveedor no contiene redirectUrl',
          );
        }

        // Actualizar el payment con el nuevo link
        await this.prisma.paymentTransaction.update({
          where: { id: payment.id },
          data: {
            payphoneData: {
              ...(payphoneData || {}),
              payWithCard: result.redirectUrl,
              paymentId: result.paymentId,
              ...(result.paymentData || {}),
            },
          },
        });

        return {
          paymentLink: result.redirectUrl,
          orderId: order.id,
          total: order.total,
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Error al generar el link de pago';
        throw new BadRequestException(errorMessage);
      }
    }

    return {
      paymentLink: payphoneData.payWithCard,
      orderId: order.id,
      total: order.total,
    };
  }
}
