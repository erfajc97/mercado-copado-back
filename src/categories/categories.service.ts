import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

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

  findAll() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.category.findMany({
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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // id is guaranteed to be valid after findOne check
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.category.delete({
      where: { id },
    });
  }
}
