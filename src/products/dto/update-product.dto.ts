import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { CreateProductDto } from './create-product.dto.js';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    // Si viene como string desde FormData
    if (typeof value === 'string') {
      // Convertir string a boolean
      const lowerValue = value.toLowerCase().trim();
      return lowerValue === 'true' || lowerValue === '1';
    }
    // Si ya es boolean, retornarlo tal cual
    if (typeof value === 'boolean') {
      return value;
    }
    // Para otros tipos, convertir a boolean
    return Boolean(value);
  })
  isActive?: boolean;
}
