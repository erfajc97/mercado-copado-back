import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderStatus } from '../generated/enums.js';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

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

  findAll(userId?: string) {
    const where = userId ? { userId } : {};

    return this.prisma.order.findMany({
      where,
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
    });
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

    const order = await this.prisma.order.findFirst({ where });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    // order.id is guaranteed to be non-null after findFirst check
    return this.prisma.order.update({
      where: { id },
      data: { status },
      include: {
        address: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
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
}
