import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderStatus } from '../generated/enums.js';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    // Obtener estadísticas de órdenes
    const totalOrders = await this.prisma.order.count();
    const completedOrders = await this.prisma.order.findMany({
      where: { status: OrderStatus.completed },
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

    // Órdenes pendientes
    const pendingOrders = await this.prisma.order.count({
      where: { status: OrderStatus.pending },
    });

    // Productos activos
    const activeProducts = await this.prisma.product.count({
      where: { isActive: true },
    });

    // Ingresos por mes (últimos 12 meses)
    // Obtener todas las órdenes completadas de los últimos 12 meses
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const ordersLast12Months = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.completed,
        createdAt: { gte: twelveMonthsAgo },
      },
      select: {
        total: true,
        createdAt: true,
      },
    });

    // Agrupar por mes
    const monthlyRevenueMap = new Map<string, number>();
    ordersLast12Months.forEach((order) => {
      const monthKey = `${order.createdAt.getFullYear()}-${String(order.createdAt.getMonth() + 1).padStart(2, '0')}`;
      const currentTotal = monthlyRevenueMap.get(monthKey) || 0;
      monthlyRevenueMap.set(monthKey, currentTotal + Number(order.total));
    });

    // Convertir a array de objetos
    const monthlyRevenue = Array.from(monthlyRevenueMap.entries()).map(
      ([month, revenue]) => ({
        month,
        revenue,
      }),
    );

    // Órdenes por período
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const ordersToday = await this.prisma.order.count({
      where: { createdAt: { gte: startOfDay } },
    });

    const ordersThisMonth = await this.prisma.order.count({
      where: { createdAt: { gte: startOfMonth } },
    });

    const ordersThisYear = await this.prisma.order.count({
      where: { createdAt: { gte: startOfYear } },
    });

    // Calcular ingresos diarios (solo órdenes completadas de hoy)
    const completedOrdersToday = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.completed,
        createdAt: { gte: startOfDay },
      },
      select: {
        total: true,
      },
    });
    const revenueToday = completedOrdersToday.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );

    // Calcular ingresos mensuales (solo órdenes completadas de este mes)
    const completedOrdersThisMonth = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.completed,
        createdAt: { gte: startOfMonth },
      },
      select: {
        total: true,
      },
    });
    const revenueThisMonth = completedOrdersThisMonth.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );

    // Calcular ingresos anuales (solo órdenes completadas de este año)
    const completedOrdersThisYear = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.completed,
        createdAt: { gte: startOfYear },
      },
      select: {
        total: true,
      },
    });
    const revenueThisYear = completedOrdersThisYear.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );

    // Obtener órdenes recientes (últimas 10)
    const recentOrders = await this.prisma.order.findMany({
      take: 10,
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
      pendingOrders,
      activeProducts,
      monthlyRevenue,
      ordersToday,
      ordersThisMonth,
      ordersThisYear,
      revenueToday,
      revenueThisMonth,
      revenueThisYear,
      recentOrders,
    };
  }
}
