import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { createPaginationResponse } from '../common/helpers/pagination.helper.js';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { name: createCategoryDto.name },
    });

    if (existing) {
      throw new ConflictException('La categoría ya existe');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.category.create({
      data: createCategoryDto,
    });
  }

  async findAll(search?: string, page?: number, limit?: number) {
    const where: {
      name?: { contains: string; mode: 'insensitive' };
      OR?: Array<{
        name?: { contains: string; mode: 'insensitive' };
        subcategories?: {
          some: { name: { contains: string; mode: 'insensitive' } };
        };
      }>;
    } = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        {
          subcategories: {
            some: { name: { contains: search, mode: 'insensitive' } },
          },
        },
      ];
    }

    // Construir el objeto where solo si tiene propiedades, o usar undefined
    const whereClause = Object.keys(where).length > 0 ? where : undefined;

    // Si no se especifica paginación, retornar todas las categorías (comportamiento anterior)
    if (page === undefined || limit === undefined) {
      return this.prisma.category.findMany({
        ...(whereClause && { where: whereClause }),
        include: {
          subcategories: true,
          _count: {
            select: {
              products: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }

    // Con paginación
    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        ...(whereClause && { where: whereClause }),
        include: {
          subcategories: true,
          _count: {
            select: {
              products: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitNumber,
      }),
      this.prisma.category.count({
        ...(whereClause && { where: whereClause }),
      }),
    ]);

    return createPaginationResponse(categories, total, pageNumber, limitNumber);
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        subcategories: true,
        products: {
          include: {
            images: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    }

    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.findOne(id);

    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      const existing = await this.prisma.category.findFirst({
        where: { name: updateCategoryDto.name },
      });

      if (existing) {
        throw new ConflictException('Ya existe una categoría con ese nombre');
      }
    }

    // category.id is guaranteed to be non-null after findOne check
    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // id is guaranteed to be valid after findOne check
    return this.prisma.category.delete({
      where: { id },
    });
  }
}
