import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto.js';

@Injectable()
export class PaymentMethodsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createDto: CreatePaymentMethodDto) {
    // Si se marca como predeterminada, desmarcar las demás
    if (createDto.isDefault) {
      await this.prisma.paymentMethod.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const paymentMethod = await this.prisma.paymentMethod.create({
      data: {
        userId,
        gatewayToken: createDto.gatewayToken,
        cardBrand: createDto.cardBrand,
        last4Digits: createDto.last4Digits,
        expirationMonth: createDto.expirationMonth,
        expirationYear: createDto.expirationYear,
        isDefault: createDto.isDefault || false,
      },
    });

    return {
      message: 'Método de pago creado exitosamente',
      data: paymentMethod,
    };
  }

  async findAll(userId: string) {
    const paymentMethods = await this.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      message: 'Métodos de pago obtenidos exitosamente',
      data: paymentMethods,
    };
  }

  async setDefault(userId: string, paymentMethodId: string) {
    const paymentMethod = await this.prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId,
      },
    });

    if (!paymentMethod) {
      throw new NotFoundException('Método de pago no encontrado');
    }

    // Desmarcar todos los métodos de pago del usuario
    await this.prisma.paymentMethod.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    // Marcar el seleccionado como predeterminado
    const updated = await this.prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: { isDefault: true },
    });

    return {
      message: 'Método de pago establecido como predeterminado exitosamente',
      data: updated,
    };
  }

  async remove(userId: string, paymentMethodId: string) {
    const paymentMethod = await this.prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId,
      },
    });

    if (!paymentMethod) {
      throw new NotFoundException('Método de pago no encontrado');
    }

    await this.prisma.paymentMethod.delete({
      where: { id: paymentMethodId },
    });

    return {
      message: 'Método de pago eliminado exitosamente',
    };
  }
}
