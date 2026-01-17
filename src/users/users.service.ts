import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto.js';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto.js';
import { ChangePasswordDto } from '../auth/dto/change-password.dto.js';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        country: true,
        documentId: true,
        role: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    return {
      message: 'Información del usuario obtenida exitosamente',
      data: user,
    };
  }

  async updateProfile(userId: string, updateDto: UpdateUserProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    // Verificar si el documentId ya existe en otro usuario
    if (updateDto.documentId && updateDto.documentId !== user.documentId) {
      const existingUser = await this.prisma.user.findUnique({
        where: { documentId: updateDto.documentId },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException(
          'El documento de identidad ya está en uso por otro usuario',
        );
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: updateDto.firstName,
        lastName: updateDto.lastName,
        phoneNumber: updateDto.phoneNumber,
        country: updateDto.country,
        documentId: updateDto.documentId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        country: true,
        documentId: true,
        role: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Perfil actualizado exitosamente',
      data: updatedUser,
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    if (!user.password) {
      throw new BadRequestException(
        'Este usuario no tiene una contraseña configurada (probablemente se registró con Google)',
      );
    }

    // Verificar contraseña actual
    const passwordMatches = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!passwordMatches) {
      throw new ForbiddenException('La contraseña actual es incorrecta');
    }

    // Verificar que la nueva contraseña sea diferente
    const isSamePassword = await bcrypt.compare(
      changePasswordDto.newPassword,
      user.password,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la actual',
      );
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);

    // Actualizar contraseña e invalidar refresh token
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        hashedRefreshToken: null,
      },
    });

    return {
      message: 'Contraseña cambiada exitosamente',
    };
  }

  async updateUserByAdmin(userId: string, updateDto: UpdateUserAdminDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }

    // Verificar si el email ya existe en otro usuario
    if (updateDto.email && updateDto.email !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateDto.email },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException(
          'El email ya está en uso por otro usuario',
        );
      }
    }

    // Verificar si el documentId ya existe en otro usuario
    if (updateDto.documentId && updateDto.documentId !== user.documentId) {
      const existingUser = await this.prisma.user.findUnique({
        where: { documentId: updateDto.documentId },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException(
          'El documento de identidad ya está en uso por otro usuario',
        );
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(updateDto.firstName !== undefined && {
          firstName: updateDto.firstName,
        }),
        ...(updateDto.lastName !== undefined && {
          lastName: updateDto.lastName,
        }),
        ...(updateDto.email !== undefined && { email: updateDto.email }),
        ...(updateDto.phoneNumber !== undefined && {
          phoneNumber: updateDto.phoneNumber,
        }),
        ...(updateDto.country !== undefined && { country: updateDto.country }),
        ...(updateDto.documentId !== undefined && {
          documentId: updateDto.documentId,
        }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        country: true,
        documentId: true,
        role: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Usuario actualizado exitosamente',
      data: updatedUser,
    };
  }

  async findAllForAdmin(queryDto: AdminUsersQueryDto) {
    const page = Number(queryDto.page) || 1;
    const limit = Number(queryDto.limit) || 10;
    const skip = (page - 1) * limit;

    // Construir condiciones de búsqueda
    const where: {
      OR?: Array<{
        id?: { contains: string; mode: 'insensitive' };
        email?: { contains: string; mode: 'insensitive' };
        firstName?: { contains: string; mode: 'insensitive' };
        lastName?: { contains: string; mode: 'insensitive' };
        documentId?: { contains: string; mode: 'insensitive' };
      }>;
      country?: string;
    } = {};

    if (queryDto.search) {
      where.OR = [
        { id: { contains: queryDto.search, mode: 'insensitive' } },
        { email: { contains: queryDto.search, mode: 'insensitive' } },
        { firstName: { contains: queryDto.search, mode: 'insensitive' } },
        { lastName: { contains: queryDto.search, mode: 'insensitive' } },
        { documentId: { contains: queryDto.search, mode: 'insensitive' } },
      ];
    }

    if (queryDto.country) {
      where.country = queryDto.country;
    }

    // Construir el objeto where solo si tiene propiedades
    const whereClause = Object.keys(where).length > 0 ? where : undefined;

    // Obtener usuarios con agregaciones
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        ...(whereClause && { where: whereClause }),
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          country: true,
          documentId: true,
          createdAt: true,
          orders: {
            select: {
              id: true,
              total: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.user.count({
        ...(whereClause && { where: whereClause }),
      }),
    ]);

    // Calcular agregaciones para cada usuario
    const usersWithStats = users.map((user) => {
      const totalOrders = user.orders.length;
      const totalSpent = user.orders
        .filter((order) => order.status !== 'cancelled')
        .reduce((sum: number, order) => {
          let orderTotal = 0;
          const totalValue: unknown = order.total;

          if (typeof totalValue === 'string') {
            const parsed = parseFloat(totalValue);
            orderTotal = Number.isNaN(parsed) ? 0 : parsed;
          } else if (typeof totalValue === 'number') {
            orderTotal = totalValue;
          } else if (
            totalValue !== null &&
            totalValue !== undefined &&
            typeof totalValue === 'object' &&
            'toNumber' in totalValue
          ) {
            orderTotal = (totalValue as { toNumber: () => number }).toNumber();
          } else {
            const numValue = Number(totalValue);
            orderTotal = Number.isNaN(numValue) ? 0 : numValue;
          }

          return sum + orderTotal;
        }, 0);

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        country: user.country,
        documentId: user.documentId,
        totalOrders,
        totalSpent,
        createdAt: user.createdAt,
      };
    });

    return {
      message: 'Usuarios obtenidos exitosamente',
      data: {
        content: usersWithStats,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return {
      message: 'Usuario eliminado exitosamente',
    };
  }
}
