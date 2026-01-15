import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { OrderStatus } from '../generated/enums.js';

@Injectable()
export class OrdersSchedulerService {
  private readonly logger = new Logger(OrdersSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  /**
   * Ejecuta cada hora para verificar órdenes pendientes y enviar recordatorios
   * DESHABILITADO: Las órdenes ahora solo se crean después del pago confirmado,
   * por lo que no hay órdenes pendientes que requieran recordatorios.
   */
  // @Cron(CronExpression.EVERY_HOUR)
  async handlePendingOrdersReminders() {
    this.logger.log('Iniciando verificación de órdenes pendientes...');

    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      // Primero, eliminar órdenes pendientes con más de 5 días
      const ordersToDelete = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.pending,
          createdAt: {
            lte: fiveDaysAgo, // Más de 5 días de antigüedad
          },
        },
        select: {
          id: true,
        },
      });

      this.logger.log(
        `Encontradas ${ordersToDelete.length} órdenes pendientes con más de 5 días para eliminar`,
      );

      for (const order of ordersToDelete) {
        await this.deletePendingOrder(order.id);
      }

      // Luego, buscar órdenes pendientes que tienen entre 1 y 5 días para enviar recordatorios
      const pendingOrders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.pending,
          createdAt: {
            lte: oneDayAgo, // Más de 1 día
            gt: fiveDaysAgo, // Pero menos de 5 días
          },
        },
        include: {
          user: true,
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

      this.logger.log(
        `Encontradas ${pendingOrders.length} órdenes pendientes para enviar recordatorios`,
      );

      for (const order of pendingOrders) {
        const daysSinceCreation = Math.floor(
          (now.getTime() - order.createdAt.getTime()) / (24 * 60 * 60 * 1000),
        );

        // Enviar recordatorio según los días transcurridos (1-5 días)
        if (daysSinceCreation >= 1 && daysSinceCreation <= 5) {
          await this.sendPaymentReminder(order, daysSinceCreation);
        }
      }

      this.logger.log('Proceso de recordatorios completado');
    } catch (error) {
      this.logger.error(
        `Error al procesar recordatorios de órdenes pendientes: ${error}`,
      );
    }
  }

  /**
   * Envía un recordatorio de pago al usuario
   */
  private async sendPaymentReminder(
    order: {
      id: string;
      total: number | { toString: () => string };
      createdAt: Date;
      user: {
        email: string;
        firstName: string;
      };
      payments: Array<{
        payphoneData: unknown;
      }>;
    },
    dayNumber: number,
  ) {
    try {
      // Obtener el link de pago de la transacción
      let paymentLink = '';
      if (order.payments && order.payments.length > 0) {
        const paymentData = order.payments[0].payphoneData as {
          payWithCard?: string;
        } | null;
        if (paymentData?.payWithCard) {
          paymentLink = paymentData.payWithCard;
        }
      }

      // Si no hay link de pago, no enviar recordatorio
      if (!paymentLink) {
        this.logger.warn(
          `No se encontró link de pago para la orden ${order.id}`,
        );
        return;
      }

      const totalUSD =
        typeof order.total === 'number'
          ? order.total.toFixed(2)
          : Number(order.total.toString()).toFixed(2);

      await this.emailService.sendPaymentReminderEmail({
        to: order.user.email,
        firstName: order.user.firstName,
        orderId: order.id,
        total: totalUSD,
        paymentLink,
        dayNumber,
      });

      this.logger.log(
        `Recordatorio ${dayNumber} enviado para la orden ${order.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Error al enviar recordatorio para la orden ${order.id}: ${error}`,
      );
    }
  }

  /**
   * Elimina una orden pendiente y su transacción relacionada
   */
  private async deletePendingOrder(orderId: string) {
    try {
      // Eliminar la transacción de pago relacionada primero
      await this.prisma.paymentTransaction.deleteMany({
        where: {
          orderId,
        },
      });

      // Eliminar los items de la orden
      await this.prisma.orderItem.deleteMany({
        where: {
          orderId,
        },
      });

      // Eliminar la orden
      await this.prisma.order.delete({
        where: {
          id: orderId,
        },
      });

      this.logger.log(`Orden ${orderId} eliminada exitosamente`);
    } catch (error) {
      this.logger.error(`Error al eliminar la orden ${orderId}: ${error}`);
    }
  }
}
