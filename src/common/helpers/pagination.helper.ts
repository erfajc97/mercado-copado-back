/**
 * Helper común para crear respuestas paginadas consistentes
 * Todas las features deben usar este helper para mantener consistencia
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Crea una respuesta paginada estándar
 * @param items Array de items a retornar
 * @param total Total de items en la base de datos (sin paginación)
 * @param page Página actual (default: 1)
 * @param limit Límite de items por página (default: 10)
 * @returns Objeto con content y pagination
 */
export function createPaginationResponse<T>(
  items: T[],
  total: number,
  page: number = 1,
  limit: number = 10,
) {
  return {
    content: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
