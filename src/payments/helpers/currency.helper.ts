/**
 * Helper para conversión de moneda.
 * Centraliza la lógica de obtención de tasas y conversión USD -> ARS.
 */

interface DolarApiResponse {
  compra: number;
  venta: number;
  casa: string;
  nombre: string;
  moneda: string;
  fechaActualizacion: string;
}

interface CachedRate {
  rate: number;
  timestamp: number;
}

// Cache en memoria (1 hora de duración)
let cachedRate: CachedRate | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora en milisegundos
const FALLBACK_RATE = 1200; // Tasa aproximada de dólar blue como fallback

/**
 * Obtiene la tasa de dólar blue desde la API pública.
 * Usa dolarapi.com como fuente principal con cache de 1 hora.
 */
export async function getUsdToArsRate(): Promise<number> {
  // Verificar cache primero
  if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_DURATION) {
    return cachedRate.rate;
  }

  try {
    const response = await fetch('https://dolarapi.com/v1/dolares/blue');

    if (!response.ok) {
      throw new Error(
        `Error al obtener tasa de dólar blue: ${response.status}`,
      );
    }

    const data: DolarApiResponse = await response.json();
    const rate = data.venta || data.compra || 0;

    if (rate > 0) {
      // Guardar en cache
      cachedRate = {
        rate,
        timestamp: Date.now(),
      };
      console.log(`[CurrencyHelper] Tasa dólar blue obtenida: ${rate}`);
      return rate;
    }

    throw new Error('Tasa inválida recibida de la API');
  } catch (error) {
    console.error('[CurrencyHelper] Error obteniendo dólar blue:', error);

    // Si hay cache aunque esté expirado, usarlo antes del fallback
    if (cachedRate) {
      console.warn(
        `[CurrencyHelper] Usando cache expirado: ${cachedRate.rate}`,
      );
      return cachedRate.rate;
    }

    // Fallback: usar tasa estática si la API falla
    console.warn(
      `[CurrencyHelper] Usando tasa de fallback para dólar blue: ${FALLBACK_RATE}`,
    );

    cachedRate = {
      rate: FALLBACK_RATE,
      timestamp: Date.now(),
    };

    return FALLBACK_RATE;
  }
}

/**
 * Convierte un monto de USD a ARS usando la tasa de dólar blue.
 * Redondea al entero más cercano ya que Mercado Pago no acepta decimales en ARS.
 *
 * @param amountUsd Monto en dólares
 * @returns Monto en pesos argentinos (entero)
 */
export async function convertUsdToArs(amountUsd: number): Promise<number> {
  const rate = await getUsdToArsRate();
  const amountArs = amountUsd * rate;
  // Mercado Pago no acepta decimales en ARS para montos
  return Math.round(amountArs);
}

/**
 * Tipo de moneda soportada por país.
 * Preparado para expansión futura a otros países.
 */
export type SupportedCurrency = 'USD' | 'ARS';

/**
 * Configuración de moneda por país.
 * Facilita la expansión a nuevos países en el futuro.
 */
export const COUNTRY_CURRENCY_MAP: Record<string, SupportedCurrency> = {
  Argentina: 'ARS',
  Ecuador: 'USD',
  // Agregar más países según se expanda el sistema
};

/**
 * Obtiene la moneda correspondiente a un país.
 * @param country Nombre del país
 * @returns Código de moneda ('USD' por defecto)
 */
export function getCurrencyForCountry(country: string): SupportedCurrency {
  return COUNTRY_CURRENCY_MAP[country] || 'USD';
}
