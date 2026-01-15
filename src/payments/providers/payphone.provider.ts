import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { IPaymentProvider } from '../interfaces/payment-provider.interface.js';

/**
 * Implementación del proveedor de pago Payphone
 *
 * Esta clase implementa la interfaz IPaymentProvider para Payphone.
 * En el futuro, se crearán clases similares para Mercado Pago y Crypto:
 * - MercadoPagoProvider
 * - CryptoProvider
 */
@Injectable()
export class PayphoneProvider implements IPaymentProvider {
  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {}

  async processPayment(
    amount: number,
    clientTransactionId: string,
    metadata?: Record<string, unknown>,
  ): Promise<{
    paymentId?: string;
    redirectUrl?: string;
    paymentData?: Record<string, unknown>;
  }> {
    // Para generar links de pago, usar TOKEN_PAYPHONE_LINK
    const payphoneToken =
      this.configService.get<string>('TOKEN_PAYPHONE_LINK') ||
      this.configService.get<string>('VITE_TOKEN_PAYPHONE_LINK') ||
      this.configService.get<string>('PAYPHONE_TOKEN');

    if (!payphoneToken) {
      throw new Error(
        'TOKEN_PAYPHONE_LINK no está configurado. Por favor, agrega TOKEN_PAYPHONE_LINK en tu archivo .env del backend.',
      );
    }

    const storeId = this.configService.get<string>('STORE_ID');

    if (!storeId) {
      throw new Error(
        'STORE_ID no está configurado. Por favor, agrega STORE_ID en tu archivo .env del backend.',
      );
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const responseUrl = `${frontendUrl}/pay-response?id=${clientTransactionId}&clientTransactionId=${clientTransactionId}`;

    // Convertir el monto a centavos usando Math.round como en el frontend
    const amountInCents = Math.round(amount * 100);

    const payphoneData = {
      clientTransactionId,
      reference: metadata?.reference || 'Compra en Mercado Copado',
      amount: amountInCents,
      responseUrl,
      amountWithoutTax: amountInCents,
      storeId,
    };

    try {
      console.log(
        `[PayphoneProvider.processPayment] Generando link de pago para transacción ${clientTransactionId}`,
      );
      const response = await firstValueFrom(
        this.httpService.post<{
          paymentId: string;
          payWithCard: string;
        }>(
          'https://pay.payphonetodoesposible.com/api/button/Prepare',
          payphoneData,
          {
            headers: {
              Authorization: `Bearer ${payphoneToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      if (!response.data || !response.data.paymentId || !response.data.payWithCard) {
        console.error(
          `[PayphoneProvider.processPayment] Respuesta inválida de Payphone para transacción ${clientTransactionId}:`,
          response.data,
        );
        throw new Error(
          'La respuesta de Payphone no contiene los datos esperados. Por favor, intenta nuevamente.',
        );
      }

      console.log(
        `[PayphoneProvider.processPayment] Link de pago generado exitosamente para transacción ${clientTransactionId}`,
      );
      return {
        paymentId: response.data.paymentId,
        redirectUrl: response.data.payWithCard,
        paymentData: response.data,
      };
    } catch (error: unknown) {
      console.error(
        `[PayphoneProvider.processPayment] Error al generar link de pago para transacción ${clientTransactionId}:`,
        error,
      );
      // Mejorar el manejo de errores para obtener más información de Payphone
      if (error instanceof Error) {
        // Si es un error de Axios, intentar obtener más detalles
        const axiosError = error as {
          response?: {
            status?: number;
            data?: {
              errors?: Array<{
                errorDescriptions?: Array<string>;
              }>;
              message?: string;
            };
          };
        };

        // Detectar errores de autenticación
        if (axiosError.response?.status === 401) {
          console.error(
            '[PayphoneProvider.processPayment] Error de autenticación con Payphone. Verifica que TOKEN_PAYPHONE_LINK esté configurado correctamente.',
          );
          throw new Error(
            'Error de autenticación con Payphone. Por favor, contacta al soporte técnico.',
          );
        }

        if (axiosError.response?.data) {
          const payphoneError = axiosError.response.data;

          // Detectar error de clientTransactionId duplicado
          const errorMessage =
            payphoneError.errors?.[0]?.errorDescriptions?.[0] ||
            payphoneError.message ||
            '';

          if (
            typeof errorMessage === 'string' &&
            (errorMessage.includes(
              'Ya existe una transacción con el ClientTransactionId',
            ) ||
              errorMessage.includes('ClientTransactionId') ||
              errorMessage.includes('duplicado'))
          ) {
            throw new Error('DUPLICATE_CLIENT_TRANSACTION_ID');
          }

          if (typeof errorMessage === 'string' && errorMessage) {
            throw new Error(errorMessage);
          }
        }
        throw new Error(error.message);
      }
      throw new Error('Error al procesar el pago con Payphone');
    }
  }

  async confirmPayment(
    paymentId: string,
    clientTransactionId: string,
  ): Promise<{
    statusCode: number;
    status: 'pending' | 'completed' | 'failed';
    data?: Record<string, unknown>;
  }> {
    // Para confirmar pagos, usar TOKEN_PAYPHONE
    const payphoneToken =
      this.configService.get<string>('TOKEN_PAYPHONE') ||
      this.configService.get<string>('VITE_TOKEN_PAYPHONE') ||
      this.configService.get<string>('PAYPHONE_TOKEN');

    if (!payphoneToken) {
      throw new Error('PAYPHONE_TOKEN no está configurado');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<{
          statusCode: number;
        }>(
          'https://pay.payphonetodoesposible.com/api/button/V2/Confirm',
          {
            id: paymentId,
            clientTxId: clientTransactionId,
          },
          {
            headers: {
              Authorization: `Bearer ${payphoneToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      // statusCode 3 = completado en Payphone
      const status =
        response.data.statusCode === 3
          ? 'completed'
          : response.data.statusCode === 2
            ? 'pending'
            : 'failed';

      return {
        statusCode: response.data.statusCode,
        status,
        data: response.data,
      };
    } catch (error: unknown) {
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Error al confirmar el pago con Payphone',
      );
    }
  }

  async processPhonePayment(
    phoneNumber: string,
    amount: number,
    clientTransactionId: string,
  ): Promise<Record<string, unknown>> {
    // Para pagos por teléfono, usar TOKEN_PAYPHONE
    const payphoneToken =
      this.configService.get<string>('TOKEN_PAYPHONE') ||
      this.configService.get<string>('VITE_TOKEN_PAYPHONE') ||
      this.configService.get<string>('PAYPHONE_TOKEN');

    if (!payphoneToken) {
      throw new Error('TOKEN_PAYPHONE no está configurado');
    }

    const storeId = this.configService.get<string>('STORE_ID');

    if (!storeId) {
      throw new Error('STORE_ID no está configurado');
    }

    const payphoneData = {
      clientTransactionId,
      phoneNumber,
      countryCode: '593', // Código de país para Ecuador
      reference: `Compra en Mercado Copado - Transacción ${clientTransactionId.slice(0, 8)}`,
      amount: amount * 100,
      amountWithoutTax: amount * 100,
      storeId,
    };

    try {
      console.log(
        `[PayphoneProvider.processPhonePayment] Procesando pago por teléfono para transacción ${clientTransactionId}`,
      );
      const response = await firstValueFrom(
        this.httpService.post<unknown>(
          'https://pay.payphonetodoesposible.com/api/Sale',
          payphoneData,
          {
            headers: {
              Authorization: `Bearer ${payphoneToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      if (!response.data) {
        console.error(
          `[PayphoneProvider.processPhonePayment] Respuesta vacía de Payphone para transacción ${clientTransactionId}`,
        );
        throw new Error(
          'La respuesta de Payphone está vacía. Por favor, intenta nuevamente.',
        );
      }

      console.log(
        `[PayphoneProvider.processPhonePayment] Pago por teléfono procesado exitosamente para transacción ${clientTransactionId}`,
      );
      return response.data as Record<string, unknown>;
    } catch (error: unknown) {
      console.error(
        `[PayphoneProvider.processPhonePayment] Error al procesar pago por teléfono para transacción ${clientTransactionId}:`,
        error,
      );
      // Mejorar el manejo de errores para obtener más información de Payphone
      if (error instanceof Error) {
        // Si es un error de Axios, intentar obtener más detalles
        const axiosError = error as {
          response?: {
            status?: number;
            data?: {
              errors?: Array<{
                errorDescriptions?: Array<string>;
              }>;
              message?: string;
            };
          };
        };

        if (axiosError.response?.status === 401) {
          console.error(
            '[PayphoneProvider.processPhonePayment] Error de autenticación con Payphone. Verifica que TOKEN_PAYPHONE esté configurado correctamente.',
          );
          throw new Error(
            'Error de autenticación con Payphone. Verifica que TOKEN_PAYPHONE esté configurado correctamente en el archivo .env del backend.',
          );
        }

        if (axiosError.response?.data) {
          const payphoneError = axiosError.response.data;

          // Detectar mensajes específicos de error
          const errorMessage =
            payphoneError.errors?.[0]?.errorDescriptions?.[0] ||
            payphoneError.message ||
            '';

          if (typeof errorMessage === 'string' && errorMessage) {
            throw new Error(errorMessage);
          }
        }
      }

      throw new Error(
        error instanceof Error
          ? error.message
          : 'Error al procesar el pago por teléfono con Payphone',
      );
    }
  }
}
