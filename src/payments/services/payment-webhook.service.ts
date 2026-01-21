import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PaymentStatus } from '../../generated/enums.js';
import { MercadoPagoProvider } from '../providers/mercadopago.provider.js';
import { PaymentOrderService } from './payment-order.service.js';

/**
 * Resultado de la verificación de un pago de Mercado Pago.
 */
export interface MercadoPagoVerificationResult {
  status: string;
  updated: boolean;
  message?: string;
}

/**
 * Servicio especializado en manejo de webhooks de proveedores de pago.
 * Responsabilidad única: procesar notificaciones de webhooks.
 */
@Injectable()
export class PaymentWebhookService {
  constructor(
    private prisma: PrismaService,
    private mercadopagoProvider: MercadoPagoProvider,
    private paymentOrderService: PaymentOrderService,
  ) {}

  /**
   * Procesa el webhook de Mercado Pago (payment.updated).
   * Obtiene el pago desde MP, busca la transacción por external_reference y,
   * si status===approved, actualiza transacción a completed y orden a processing.
   * Siempre debe responderse 200 para acusar recibo (el controller captura errores).
   */
  async handleMercadoPagoWebhook(dataId: string): Promise<void> {
    // TODO: validar x-signature según doc MP (ts, v1, plantilla id:...;request-id:...;ts:...)
    const { status, external_reference } =
      await this.mercadopagoProvider.getPayment(dataId);

    if (!external_reference) return;

    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { clientTransactionId: external_reference },
    });

    if (!transaction) return;

    if (status === 'approved') {
      await this.paymentOrderService.updatePaymentStatus(
        external_reference,
        PaymentStatus.completed,
      );
    }
  }

  /**
   * Verifica el estado de un pago de Mercado Pago y actualiza la transacción/orden.
   * Se usa cuando el usuario regresa de la redirección de MP (solución alternativa a webhooks
   * para entornos de desarrollo local donde no se puede recibir webhooks).
   *
   * @param paymentId ID del pago en Mercado Pago
   * @param externalReference clientTransactionId de la transacción
   * @returns Estado de la verificación y si se actualizó la orden
   */
  async verifyAndUpdateMercadoPagoPayment(
    paymentId: string,
    externalReference: string,
  ): Promise<MercadoPagoVerificationResult> {
    console.log('[PaymentWebhookService] Verificando pago de MP:', {
      paymentId,
      externalReference,
    });

    try {
      // 1. Obtener estado del pago desde Mercado Pago
      const { status } = await this.mercadopagoProvider.getPayment(paymentId);

      console.log('[PaymentWebhookService] Estado de pago en MP:', status);

      // 2. Buscar la transacción por external_reference (clientTransactionId)
      const transaction = await this.prisma.paymentTransaction.findUnique({
        where: { clientTransactionId: externalReference },
      });

      if (!transaction) {
        console.warn(
          '[PaymentWebhookService] Transacción no encontrada:',
          externalReference,
        );
        return {
          status: 'not_found',
          updated: false,
          message: 'Transacción no encontrada',
        };
      }

      // 3. Si ya está completada, no hacer nada
      if (transaction.status === PaymentStatus.completed) {
        return {
          status: 'already_completed',
          updated: false,
          message: 'El pago ya fue procesado anteriormente',
        };
      }

      // 4. Actualizar según el estado de MP
      if (status === 'approved') {
        await this.paymentOrderService.updatePaymentStatus(
          externalReference,
          PaymentStatus.completed,
        );

        console.log(
          '[PaymentWebhookService] Pago actualizado a completed:',
          externalReference,
        );

        return {
          status: 'approved',
          updated: true,
          message: 'Pago confirmado exitosamente',
        };
      }

      if (status === 'pending' || status === 'in_process') {
        return {
          status: 'pending',
          updated: false,
          message: 'El pago está pendiente de confirmación',
        };
      }

      // Estados de rechazo o fallo
      if (
        status === 'rejected' ||
        status === 'cancelled' ||
        status === 'refunded'
      ) {
        await this.paymentOrderService.updatePaymentStatus(
          externalReference,
          PaymentStatus.failed,
        );

        return {
          status: status || 'rejected',
          updated: true,
          message: 'El pago fue rechazado o cancelado',
        };
      }

      // Estado desconocido
      return {
        status: status || 'unknown',
        updated: false,
        message: 'Estado de pago desconocido',
      };
    } catch (error) {
      console.error(
        '[PaymentWebhookService] Error verificando pago de MP:',
        error,
      );

      return {
        status: 'error',
        updated: false,
        message:
          error instanceof Error ? error.message : 'Error al verificar el pago',
      };
    }
  }
}
