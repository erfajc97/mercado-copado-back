import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Representa el resultado del cálculo del total del carrito.
 */
export interface CartTotal {
  total: number;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
}

/**
 * Representa un item del carrito con información del producto.
 */
export interface CartItemWithProduct {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    price: number | { toNumber(): number };
    discount: number | { toNumber(): number } | null;
  };
}

/**
 * Calcula el precio final aplicando el descuento.
 */
export function calculateFinalPrice(
  price: number | { toNumber(): number },
  discount: number | { toNumber(): number } | null,
): number {
  const priceNum = typeof price === 'number' ? price : Number(price);
  const discountNum =
    discount == null
      ? 0
      : typeof discount === 'number'
        ? discount
        : Number(discount);
  return priceNum * (1 - discountNum / 100);
}

/**
 * Calcula el total del carrito para un usuario.
 * Retorna el total y los items con sus precios finales.
 */
export async function calculateCartTotal(
  prisma: PrismaService,
  userId: string,
): Promise<CartTotal> {
  const cartItems = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: true },
  });

  if (cartItems.length === 0) {
    throw new BadRequestException('El carrito está vacío');
  }

  let total = 0;
  const items: CartTotal['items'] = [];

  cartItems.forEach((item) => {
    const finalPrice = calculateFinalPrice(
      item.product.price,
      item.product.discount,
    );
    const itemTotal = finalPrice * item.quantity;
    total += itemTotal;

    items.push({
      productId: item.productId,
      quantity: item.quantity,
      price: finalPrice,
    });
  });

  return { total, items };
}

/**
 * Valida que una dirección exista y pertenezca al usuario.
 * Lanza NotFoundException si no existe.
 */
export async function validateAddress(
  prisma: PrismaService,
  addressId: string,
  userId: string,
): Promise<{ id: string; userId: string }> {
  const address = await prisma.address.findFirst({
    where: {
      id: addressId,
      userId,
    },
  });

  if (!address) {
    throw new NotFoundException('Dirección no encontrada');
  }

  return address;
}

/**
 * Limpia el carrito de un usuario eliminando todos los items.
 */
export async function clearCart(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  await prisma.cartItem.deleteMany({
    where: { userId },
  });
}
