import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import type { IPaymentProvider } from '../interfaces/payment-provider.interface.js';
import {
  convertUsdToArs,
  getUsdToArsRate,
} from '../helpers/currency.helper.js';

/**
 * Implementación del proveedor de pago Mercado Pago.
 * Crea preferencias para Checkout Pro y devuelve el preferenceId e initPoint.
 */
@Injectable()
export class MercadoPagoProvider implements IPaymentProvider {
  constructor(private configService: ConfigService) {}

  /**
   * Valida que una URL de configuración sea válida y no sea un placeholder no resuelto.
   * Retorna la URL válida o el fallback si la URL es inválida.
   */
  private validateAndGetUrl(
    rawUrl: string | undefined,
    envVarName: string,
    fallback: string,
  ): string {
    // Si no hay valor, usar fallback
    if (!rawUrl || rawUrl.trim() === '') {
      return fallback;
    }

    // Detectar placeholders no resueltos (ej: 'BACKEND_URL', 'FRONTEND_URL', '${BACKEND_URL}')
    const isPlaceholder =
      rawUrl === envVarName ||
      rawUrl.includes('${') ||
      !rawUrl.startsWith('http');

    if (isPlaceholder) {
      console.warn(
        `[MercadoPagoProvider] ${envVarName} parece ser un placeholder no resuelto: "${rawUrl}". Usando fallback: ${fallback}`,
      );
      return fallback;
    }

    // Validar que sea una URL válida
    try {
      new URL(rawUrl);
      return rawUrl;
    } catch {
      console.warn(
        `[MercadoPagoProvider] ${envVarName} no es una URL válida: "${rawUrl}". Usando fallback: ${fallback}`,
      );
      return fallback;
    }
  }

  async processPayment(
    amount: number,
    clientTransactionId: string,
    metadata?: Record<string, unknown>,
  ): Promise<{
    paymentId?: string;
    redirectUrl?: string;
    paymentData?: Record<string, unknown>;
  }> {
    const accessToken =
      this.configService.get<string>('MERCADO_PAGO_ACCESS_TOKEN') ||
      this.configService.get<string>('VITE_MERCADO_PAGO_ACCESS_TOKEN');

    if (!accessToken) {
      throw new BadRequestException(
        'MERCADO_PAGO_ACCESS_TOKEN no está configurado. Agrega MERCADO_PAGO_ACCESS_TOKEN en tu archivo .env del backend.',
      );
    }

    // Obtener URLs de configuración con fallbacks
    const rawFrontendUrl = this.configService.get<string>('FRONTEND_URL');
    const rawBackendUrl = this.configService.get<string>('BACKEND_URL');

    // Validar que las URLs no sean placeholders no resueltos
    const frontendUrl = this.validateAndGetUrl(
      rawFrontendUrl,
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const backendUrl = this.validateAndGetUrl(
      rawBackendUrl,
      'BACKEND_URL',
      'http://localhost:4000',
    );

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const title = (metadata?.reference as string) || 'Compra en Mercado Copado';

    // Construir URLs de redirección
    const successUrl = `${frontendUrl}/pay-response?from=mercadopago`;
    const failureUrl = `${frontendUrl}/pay-response?from=mercadopago`;
    const pendingUrl = `${frontendUrl}/pay-response?from=mercadopago`;

    console.log('[MercadoPagoProvider] Configuración:', {
      frontendUrl,
      backendUrl,
      successUrl,
      failureUrl,
      pendingUrl,
    });

    // Convertir monto de USD a ARS para Mercado Pago
    const amountInArs = await convertUsdToArs(amount);
    const exchangeRate = await getUsdToArsRate();

    console.log('[MercadoPagoProvider] Conversión de moneda:', {
      amountUsd: amount,
      amountArs: amountInArs,
      exchangeRate,
    });

    // Construir el body para la preferencia
    // NOTA: Primero intentamos SIN auto_return para evitar el error de validación
    const body = {
      items: [
        {
          id: `item-${clientTransactionId}`,
          title: String(title),
          quantity: 1,
          unit_price: amountInArs, // Monto en pesos argentinos
          currency_id: 'ARS' as const, // Especificar moneda
        },
      ],
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      // NO incluir auto_return inicialmente para evitar errores de validación
      // El usuario será redirigido manualmente después del pago
      notification_url: `${backendUrl}/payments/webhooks/mercadopago`,
      external_reference: clientTransactionId,
    };

    console.log(
      '[MercadoPagoProvider] Creando preferencia:',
      JSON.stringify(body, null, 2),
    );

    let response;
    try {
      response = await preference.create({ body });
      console.log('[MercadoPagoProvider] Preferencia creada exitosamente:', {
        id: response.id,
        init_point: response.init_point,
      });
    } catch (error: any) {
      const errorMessage =
        error?.message ||
        error?.cause?.message ||
        error?.response?.data?.message ||
        'Error desconocido';
      const errorCause = error?.cause || {};

      console.error('[MercadoPagoProvider] Error al crear preferencia:', {
        errorMessage,
        errorCause,
        fullError: error,
        body,
      });

      throw new BadRequestException(
        `Error al crear la preferencia de Mercado Pago: ${errorMessage}`,
      );
    }

    const preferenceId = response.id;
    const initPoint =
      response.init_point || response.sandbox_init_point || undefined;

    if (!preferenceId) {
      throw new BadRequestException(
        'La respuesta de Mercado Pago no contiene el identificador de la preferencia.',
      );
    }

    return {
      paymentId: preferenceId,
      redirectUrl: initPoint,
      paymentData: {
        preferenceId,
        initPoint,
        // Metadata de conversión para referencia
        amountUsd: amount,
        amountArs: amountInArs,
        exchangeRate,
        currency: 'ARS',
      },
    };
  }

  /**
   * Obtiene el estado y external_reference de un pago de Mercado Pago.
   * Usado por el webhook para actualizar la transacción y orden.
   */
  async getPayment(paymentId: string): Promise<{
    status?: string;
    external_reference?: string;
  }> {
    const accessToken =
      this.configService.get<string>('MERCADO_PAGO_ACCESS_TOKEN') ||
      this.configService.get<string>('VITE_MERCADO_PAGO_ACCESS_TOKEN');

    if (!accessToken) {
      throw new BadRequestException(
        'MERCADO_PAGO_ACCESS_TOKEN no está configurado. Agrega MERCADO_PAGO_ACCESS_TOKEN en tu archivo .env del backend.',
      );
    }

    const client = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(client);
    const response = await payment.get({ id: paymentId });

    return {
      status: response.status,
      external_reference: response.external_reference,
    };
  }

  confirmPayment(
    _paymentId: string,
    _clientTransactionId: string,
  ): Promise<{
    statusCode: number;
    status: 'pending' | 'completed' | 'failed';
    data?: Record<string, unknown>;
  }> {
    void _paymentId;
    void _clientTransactionId;
    return Promise.resolve({
      statusCode: 2,
      status: 'pending',
      data: {
        note: 'Mercado Pago: confirmación vía webhook o redirect.',
      },
    });
  }
}
