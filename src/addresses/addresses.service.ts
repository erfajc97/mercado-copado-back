import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAddressDto } from './dto/create-address.dto.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createAddressDto: CreateAddressDto) {
    // Si se marca como default, desmarcar las demás
    if (createAddressDto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    } else {
      // Si no hay ninguna dirección por defecto, esta será la primera
      const hasDefault = await this.prisma.address.findFirst({
        where: { userId, isDefault: true },
      });
      if (!hasDefault) {
        createAddressDto.isDefault = true;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.address.create({
      data: {
        ...createAddressDto,
        userId,
      },
    });
  }

  findAll(userId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, userId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id, userId },
    });

    if (!address) {
      throw new NotFoundException(`Dirección con id ${id} no encontrada`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return address;
  }

  async update(id: string, userId: string, updateAddressDto: UpdateAddressDto) {
    await this.findOne(id, userId);

    // Si se marca como default, desmarcar las demás
    if (updateAddressDto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.address.update({
      where: { id },
      data: updateAddressDto,
    });
  }

  async setDefault(id: string, userId: string) {
    await this.findOne(id, userId);

    // Desmarcar todas las demás
    await this.prisma.address.updateMany({
      where: { userId, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });

    // Marcar esta como default
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.address.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async remove(id: string, userId: string) {
    const address = await this.findOne(id, userId);

    // Si es la única dirección, no permitir eliminarla
    const addressCount = await this.prisma.address.count({
      where: { userId },
    });

    if (addressCount === 1) {
      throw new BadRequestException(
        'No puedes eliminar tu única dirección. Agrega otra dirección primero.',
      );
    }

    // Si es la dirección por defecto, marcar otra como default
    if (address.isDefault) {
      const otherAddress = await this.prisma.address.findFirst({
        where: { userId, id: { not: id } },
      });
      if (otherAddress) {
        await this.prisma.address.update({
          where: { id: otherAddress.id },
          data: { isDefault: true },
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.address.delete({
      where: { id },
    });
  }
}
