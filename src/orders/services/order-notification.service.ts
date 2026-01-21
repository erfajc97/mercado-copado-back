import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../email/email.service.js';
import { OrderStatus } from '../../generated/enums.js';

/**
 * Información de la orden necesaria para enviar notificaciones.
 */
export interface OrderNotificationData {
  id: string;
  total: number | { toNumber(): number };
  user: {
    email: string;
    firstName: string;
  };
  items: Array<{
    product: { name: string };
    quantity: number;
    price: number | { toNumber(): number };
  }>;
}

/**
 * Mapeo de estados de orden a configuración de email.
 */
interface StatusEmailConfig {
  templateName: string;
  subject: string;
}

/**
 * Servicio especializado en notificaciones por email de órdenes.
 * Responsabilidad única: enviar emails según el estado de la orden.
 */
@Injectable()
export class OrderNotificationService {
  private readonly frontendUrl: string;

  constructor(
    private emailService: EmailService,
    private configService: ConfigService,
  ) {
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  /**
   * Configuración de email por estado de orden.
   */
  private getEmailConfigForStatus(
    status: OrderStatus,
  ): StatusEmailConfig | null {
    const configs: Record<string, StatusEmailConfig> = {
      [OrderStatus.processing]: {
        templateName: 'order-processing',
        subject: '¡Tu orden está siendo preparada! - Mercado Copado',
      },
      [OrderStatus.paid_pending_review]: {
        templateName: 'order-pending-review',
        subject: 'Tu depósito está siendo revisado - Mercado Copado',
      },
      [OrderStatus.shipping]: {
        templateName: 'order-shipping',
        subject: '¡Tu orden está en camino! - Mercado Copado',
      },
      [OrderStatus.delivered]: {
        templateName: 'order-delivered',
        subject: '¡Tu orden fue entregada! - Mercado Copado',
      },
      [OrderStatus.cancelled]: {
        templateName: 'order-cancelled',
        subject: 'Tu orden fue cancelada - Mercado Copado',
      },
    };

    return configs[status] || null;
  }

  /**
   * Formatea los items de la orden para mostrar en el email.
   */
  private formatOrderItems(items: OrderNotificationData['items']): string {
    return items
      .map((item) => {
        const price =
          typeof item.price === 'number' ? item.price : Number(item.price);
        return `• ${item.product.name} x${item.quantity} - $${price.toFixed(2)}`;
      })
      .join('\n');
  }

  /**
   * Envía email de notificación basado en el cambio de estado de la orden.
   *
   * @param order Datos de la orden
   * @param newStatus Nuevo estado de la orden
   * @param previousStatus Estado anterior (opcional)
   */
  async sendOrderStatusEmail(
    order: OrderNotificationData,
    newStatus: OrderStatus,
    previousStatus?: OrderStatus,
  ): Promise<void> {
    // Evitar enviar email si el estado no cambió
    if (previousStatus === newStatus) {
      return;
    }

    const emailConfig = this.getEmailConfigForStatus(newStatus);

    // Si no hay configuración para este estado, no enviar email
    if (!emailConfig) {
      console.log(
        `[OrderNotificationService] No hay email configurado para estado: ${newStatus}`,
      );
      return;
    }

    const totalNum =
      typeof order.total === 'number' ? order.total : Number(order.total);
    const orderId = order.id.slice(0, 8).toUpperCase();

    const replacements: Record<string, string> = {
      name: order.user.firstName,
      orderId,
      total: totalNum.toFixed(2),
      items: this.formatOrderItems(order.items),
      orderUrl: `${this.frontendUrl}/orders/${order.id}`,
      frontendUrl: this.frontendUrl,
    };

    try {
      await this.emailService.sendEmail({
        to: order.user.email,
        subject: emailConfig.subject,
        templateName: emailConfig.templateName,
        replacements,
      });

      console.log(
        `[OrderNotificationService] Email enviado para orden ${orderId}, estado: ${newStatus}`,
      );
    } catch (error) {
      // Log del error pero no fallar la operación de actualización
      console.error(
        `[OrderNotificationService] Error enviando email para orden ${orderId}:`,
        error,
      );
    }
  }

  /**
   * Envía email de confirmación de orden (cuando el pago se completa).
   * Este método es un alias para mantener compatibilidad.
   */
  async sendOrderConfirmationEmail(
    order: OrderNotificationData,
  ): Promise<void> {
    const totalNum =
      typeof order.total === 'number' ? order.total : Number(order.total);
    const orderId = order.id.slice(0, 8).toUpperCase();

    try {
      await this.emailService.sendEmail({
        to: order.user.email,
        subject: '¡Orden Confirmada! - Mercado Copado',
        templateName: 'order-confirmation',
        replacements: {
          name: order.user.firstName,
          orderId,
          total: totalNum.toFixed(2),
          items: this.formatOrderItems(order.items),
          orderUrl: `${this.frontendUrl}/orders/${order.id}`,
          frontendUrl: this.frontendUrl,
        },
      });

      console.log(
        `[OrderNotificationService] Email de confirmación enviado para orden ${orderId}`,
      );
    } catch (error) {
      console.error(
        `[OrderNotificationService] Error enviando email de confirmación para orden ${orderId}:`,
        error,
      );
    }
  }
}
