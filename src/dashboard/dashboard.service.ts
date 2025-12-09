import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    // Obtener estadísticas de órdenes
    const totalOrders = await this.prisma.order.count();
    const completedOrders = await this.prisma.order.findMany({
      where: { status: 'completed' },
    });

    // Calcular ventas totales (suma de todas las órdenes completadas)
    const totalSales = completedOrders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );

    // Calcular ganancias (mismo que ventas por ahora, se puede ajustar)
    const totalRevenue = totalSales;

    // Obtener cantidad de productos
    const totalProducts = await this.prisma.product.count();

    // Obtener cantidad de usuarios
    const totalUsers = await this.prisma.user.count();

    // Obtener órdenes recientes (últimas 5)
    const recentOrders = await this.prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return {
      totalSales,
      totalOrders,
      totalRevenue,
      totalProducts,
      totalUsers,
      recentOrders,
    };
  }
}
