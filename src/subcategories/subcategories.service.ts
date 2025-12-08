import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto.js';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto.js';

@Injectable()
export class SubcategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createSubcategoryDto: CreateSubcategoryDto) {
    // Verificar que la categoría existe
    const category = await this.prisma.category.findUnique({
      where: { id: createSubcategoryDto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('La categoría no existe');
    }

    // Verificar que no existe otra subcategoría con el mismo nombre en la misma categoría
    const existing = await this.prisma.subcategory.findFirst({
      where: {
        name: createSubcategoryDto.name,
        categoryId: createSubcategoryDto.categoryId,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Ya existe una subcategoría con ese nombre en esta categoría',
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.subcategory.create({
      data: createSubcategoryDto,
      include: {
        category: true,
      },
    });
  }

  findAll(categoryId?: string) {
    const where = categoryId ? { categoryId } : undefined;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.subcategory.findMany({
      where,
      include: {
        category: true,
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

  async findOne(id: string) {
    const subcategory = await this.prisma.subcategory.findUnique({
      where: { id },
      include: {
        category: true,
        products: {
          include: {
            images: true,
          },
        },
      },
    });

    if (!subcategory) {
      throw new NotFoundException(`Subcategoría con id ${id} no encontrada`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return subcategory;
  }

  async update(id: string, updateSubcategoryDto: UpdateSubcategoryDto) {
    const subcategory = await this.findOne(id);

    if (
      updateSubcategoryDto.name &&
      updateSubcategoryDto.name !== subcategory.name
    ) {
      const existing = await this.prisma.subcategory.findFirst({
        where: {
          name: updateSubcategoryDto.name,
          categoryId: updateSubcategoryDto.categoryId || subcategory.categoryId,
        },
      });

      if (existing) {
        throw new ConflictException(
          'Ya existe una subcategoría con ese nombre en esta categoría',
        );
      }
    }

    if (updateSubcategoryDto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: updateSubcategoryDto.categoryId },
      });

      if (!category) {
        throw new NotFoundException('La categoría no existe');
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.subcategory.update({
      where: { id },
      data: updateSubcategoryDto,
      include: {
        category: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.subcategory.delete({
      where: { id },
    });
  }
}
