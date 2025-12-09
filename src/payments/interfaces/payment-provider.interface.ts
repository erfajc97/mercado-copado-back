/**
 * Interfaz base para diferentes proveedores de pago
 *
 * Esta interfaz define el contrato que deben implementar todos los proveedores de pago
 * (Payphone, Mercado Pago, Crypto, etc.) para mantener la arquitectura escalable.
 *
 * En el futuro, cada proveedor implementará esta interfaz con su lógica específica.
 */
export interface IPaymentProvider {
  /**
   * Procesa un pago inicial
   * @param amount - Monto a pagar
   * @param clientTransactionId - ID único de la transacción
   * @param metadata - Datos adicionales específicos del proveedor
   * @returns URL de redirección o datos para procesar el pago
   */
  processPayment(
    amount: number,
    clientTransactionId: string,
    metadata?: Record<string, unknown>,
  ): Promise<{
    paymentId?: string;
    redirectUrl?: string;
    paymentData?: Record<string, unknown>;
  }>;

  /**
   * Confirma el estado de un pago
   * @param paymentId - ID del pago en el proveedor
   * @param clientTransactionId - ID único de la transacción
   * @returns Estado del pago y datos adicionales
   */
  confirmPayment(
    paymentId: string,
    clientTransactionId: string,
  ): Promise<{
    statusCode: number;
    status: 'pending' | 'completed' | 'failed';
    data?: Record<string, unknown>;
  }>;

  /**
   * Procesa un pago por teléfono (si el proveedor lo soporta)
   * @param phoneNumber - Número de teléfono
   * @param amount - Monto a pagar
   * @param clientTransactionId - ID único de la transacción
   * @returns Datos de la transacción
   */
  processPhonePayment?(
    phoneNumber: string,
    amount: number,
    clientTransactionId: string,
  ): Promise<Record<string, unknown>>;
}
