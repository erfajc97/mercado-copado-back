import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    files: Express.Multer.File[],
  ) {
    // Verificar que la categoría existe
    const category = await this.prisma.category.findUnique({
      where: { id: createProductDto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('La categoría no existe');
    }

    // Verificar que la subcategoría existe y pertenece a la categoría
    const subcategory = await this.prisma.subcategory.findUnique({
      where: { id: createProductDto.subcategoryId },
    });

    if (!subcategory) {
      throw new NotFoundException('La subcategoría no existe');
    }

    if (subcategory.categoryId !== createProductDto.categoryId) {
      throw new BadRequestException(
        'La subcategoría no pertenece a la categoría especificada',
      );
    }

    // Subir imágenes a Cloudinary
    let imageUrls: string[] = [];
    if (files && files.length > 0) {
      imageUrls = await this.cloudinaryService.uploadMultipleImages(files);
    }

    // Crear el producto
    const product = await this.prisma.product.create({
      data: {
        name: createProductDto.name,
        description: createProductDto.description,
        price: createProductDto.price,
        discount: createProductDto.discount || 0,
        country: createProductDto.country,
        categoryId: createProductDto.categoryId,
        subcategoryId: createProductDto.subcategoryId,
        images: {
          create: imageUrls.map((url, index) => ({
            url,
            order: index,
          })),
        },
      },
      include: {
        category: true,
        subcategory: true,
        images: true,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return product;
  }

  findAll(categoryId?: string, subcategoryId?: string, search?: string) {
    const where: {
      categoryId?: string;
      subcategoryId?: string;
      OR?: Array<
        | { name: { contains: string; mode: 'insensitive' } }
        | { description: { contains: string; mode: 'insensitive' } }
      >;
    } = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (subcategoryId) {
      where.subcategoryId = subcategoryId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.product.findMany({
      where,
      include: {
        category: true,
        subcategory: true,
        images: {
          orderBy: {
            order: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        subcategory: true,
        images: {
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Producto con id ${id} no encontrado`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return product;
  }

  async findRelated(id: string, limit: number = 4) {
    const product = await this.findOne(id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.product.findMany({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [
              { categoryId: product.categoryId },
              { subcategoryId: product.subcategoryId },
            ],
          },
        ],
      },
      include: {
        images: {
          orderBy: {
            order: 'asc',
          },
          take: 1,
        },
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    files?: Express.Multer.File[],
  ) {
    const product = await this.findOne(id);

    // Verificar categoría y subcategoría si se actualizan
    if (updateProductDto.categoryId || updateProductDto.subcategoryId) {
      const categoryId = updateProductDto.categoryId || product.categoryId;
      const subcategoryId =
        updateProductDto.subcategoryId || product.subcategoryId;

      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        throw new NotFoundException('La categoría no existe');
      }

      const subcategory = await this.prisma.subcategory.findUnique({
        where: { id: subcategoryId },
      });

      if (!subcategory) {
        throw new NotFoundException('La subcategoría no existe');
      }

      if (subcategory.categoryId !== categoryId) {
        throw new BadRequestException(
          'La subcategoría no pertenece a la categoría especificada',
        );
      }
    }

    // Si hay nuevas imágenes, subirlas
    let newImageUrls: string[] = [];
    if (files && files.length > 0) {
      newImageUrls = await this.cloudinaryService.uploadMultipleImages(files);
    }

    // Actualizar el producto
    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: {
        ...(updateProductDto.name && { name: updateProductDto.name }),
        ...(updateProductDto.description && {
          description: updateProductDto.description,
        }),
        ...(updateProductDto.price !== undefined && {
          price: updateProductDto.price,
        }),
        ...(updateProductDto.discount !== undefined && {
          discount: updateProductDto.discount,
        }),
        ...(updateProductDto.categoryId && {
          categoryId: updateProductDto.categoryId,
        }),
        ...(updateProductDto.subcategoryId && {
          subcategoryId: updateProductDto.subcategoryId,
        }),
        ...(updateProductDto.isActive !== undefined && {
          isActive: updateProductDto.isActive,
        }),
        ...(newImageUrls.length > 0 && {
          images: {
            create: newImageUrls.map((url, index) => ({
              url,
              order: product.images.length + index,
            })),
          },
        }),
      },
      include: {
        category: true,
        subcategory: true,
        images: {
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return updatedProduct;
  }

  async removeImage(productId: string, imageId: string) {
    const product = await this.findOne(productId);

    const image = product.images.find((img) => img.id === imageId);

    if (!image) {
      throw new NotFoundException('Imagen no encontrada');
    }

    // Extraer public_id de la URL de Cloudinary si es posible
    // Por ahora solo eliminamos de la BD
    await this.prisma.productImage.delete({
      where: { id: imageId },
    });

    return { message: 'Imagen eliminada exitosamente' };
  }

  async remove(id: string) {
    await this.findOne(id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.prisma.product.delete({
      where: { id },
    });
  }
}
