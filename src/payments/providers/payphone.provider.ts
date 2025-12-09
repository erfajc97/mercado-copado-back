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
    const payphoneToken = this.configService.get<string>('PAYPHONE_TOKEN');
    if (!payphoneToken) {
      throw new Error('PAYPHONE_TOKEN no está configurado');
    }

    const storeId = this.configService.get<string>('STORE_ID');
    if (!storeId) {
      throw new Error('STORE_ID no está configurado');
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const responseUrl = `${frontendUrl}/pay-response?id=${clientTransactionId}&clientTransactionId=${clientTransactionId}`;

    const payphoneData = {
      clientTransactionId,
      reference: metadata?.reference || 'Compra en Mercado Copado',
      amount: amount * 100, // Payphone espera el monto en centavos
      amountWithoutTax: amount * 100,
      storeId,
      responseUrl,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post<{
          paymentId: string;
          payWithCard: string;
        }>(
          'https://pay.payphonetodoesposible.com/api/button/V2/GetButton',
          payphoneData,
          {
            headers: {
              Authorization: `Bearer ${payphoneToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return {
        paymentId: response.data.paymentId,
        redirectUrl: response.data.payWithCard,
        paymentData: response.data,
      };
    } catch (error: unknown) {
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Error al procesar el pago con Payphone',
      );
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
    const payphoneToken = this.configService.get<string>('PAYPHONE_TOKEN');
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
    const payphoneToken = this.configService.get<string>('PAYPHONE_TOKEN');
    if (!payphoneToken) {
      throw new Error('PAYPHONE_TOKEN no está configurado');
    }

    const storeId = this.configService.get<string>('STORE_ID');
    if (!storeId) {
      throw new Error('STORE_ID no está configurado');
    }

    const payphoneData = {
      clientTransactionId,
      phoneNumber,
      reference: `Compra en Mercado Copado - Transacción ${clientTransactionId.slice(0, 8)}`,
      amount: amount * 100,
      amountWithoutTax: amount * 100,
      storeId,
    };

    try {
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

      return response.data as Record<string, unknown>;
    } catch (error: unknown) {
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Error al procesar el pago por teléfono con Payphone',
      );
    }
  }
}
