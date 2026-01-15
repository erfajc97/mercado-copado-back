import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddToCartDto } from './dto/add-to-cart.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { Prisma } from '../generated/client.js';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            images: {
              orderBy: {
                order: 'asc',
              },
              take: 1,
            },
            category: true,
            subcategory: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async addToCart(userId: string, addToCartDto: AddToCartDto) {
    // Verificar que el usuario existe
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que el producto existe
    const product = await this.prisma.product.findUnique({
      where: { id: addToCartDto.productId },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    // Usar upsert para evitar condiciones de carrera y errores de restricción única
    // upsert es atómico: crea si no existe, actualiza si existen
    // Si falla por condición de carrera, intentamos actualizar directamente
    try {
      return await this.prisma.cartItem.upsert({
        where: {
          userId_productId: {
            userId,
            productId: addToCartDto.productId,
          },
        },
        update: {
          quantity: {
            increment: addToCartDto.quantity,
          },
        },
        create: {
          userId,
          productId: addToCartDto.productId,
          quantity: addToCartDto.quantity,
        },
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
      });
    } catch (error) {
      // Si hay un error de restricción única (condición de carrera), intentar actualizar
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // El item ya existe, actualizarlo directamente
        return await this.prisma.cartItem.update({
          where: {
            userId_productId: {
              userId,
              productId: addToCartDto.productId,
            },
          },
          data: {
            quantity: {
              increment: addToCartDto.quantity,
            },
          },
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
        });
      }
      // Si hay un error de clave foránea (usuario no existe), lanzar error más claro
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException(
          'Usuario no encontrado. Por favor, inicia sesión nuevamente.',
        );
      }
      // Si es otro tipo de error, relanzarlo
      throw error;
    }
  }

  async updateItem(
    id: string,
    userId: string,
    updateCartItemDto: UpdateCartItemDto,
  ) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id, userId },
    });

    if (!item) {
      throw new NotFoundException('Item del carrito no encontrado');
    }

    // item.id is guaranteed to be non-null after findFirst check
    return this.prisma.cartItem.update({
      where: { id },
      data: updateCartItemDto,
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
    });
  }

  async removeItem(id: string, userId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id, userId },
    });

    if (!item) {
      throw new NotFoundException('Item del carrito no encontrado');
    }

    return this.prisma.cartItem.delete({
      where: { id },
    });
  }

  clearCart(userId: string) {
    return this.prisma.cartItem.deleteMany({
      where: { userId },
    });
  }
}
