import { PartialType } from '@nestjs/mapped-types';
import { CreateSubcategoryDto } from './create-subcategory.dto.js';

export class UpdateSubcategoryDto extends PartialType(CreateSubcategoryDto) {}
