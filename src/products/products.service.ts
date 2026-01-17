import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { createPaginationResponse } from '../common/helpers/pagination.helper.js';

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
    return product;
  }

  async findAll(
    categoryId?: string,
    subcategoryId?: string,
    search?: string,
    includeInactive?: boolean,
    page?: number,
    limit?: number,
  ) {
    const where: {
      categoryId?: string;
      subcategoryId?: string;
      isActive?: boolean;
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

    // Filtrar productos inactivos por defecto (solo mostrar activos)
    if (!includeInactive) {
      where.isActive = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Construir el objeto where solo si tiene propiedades
    const whereClause = Object.keys(where).length > 0 ? where : undefined;

    // Si no se especifica paginación, retornar todos los productos (comportamiento anterior)
    if (page === undefined || limit === undefined) {
      return this.prisma.product.findMany({
        ...(whereClause && { where: whereClause }),
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

    // Con paginación
    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        ...(whereClause && { where: whereClause }),
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
        skip,
        take: limitNumber,
      }),
      this.prisma.product.count({
        ...(whereClause && { where: whereClause }),
      }),
    ]);

    return createPaginationResponse(products, total, pageNumber, limitNumber);
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

    return product;
  }

  async findRelated(id: string, limit: number = 4) {
    const product = await this.findOne(id);

    return this.prisma.product.findMany({
      where: {
        AND: [
          { id: { not: id } },
          { isActive: true },
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

    // Preparar los datos de actualización
    const updateData: any = {};

    if (updateProductDto.name) {
      updateData.name = updateProductDto.name;
    }
    if (updateProductDto.description) {
      updateData.description = updateProductDto.description;
    }
    if (updateProductDto.price !== undefined) {
      updateData.price = updateProductDto.price;
    }
    if (updateProductDto.discount !== undefined) {
      updateData.discount = updateProductDto.discount;
    }
    if (updateProductDto.categoryId) {
      updateData.categoryId = updateProductDto.categoryId;
    }
    if (updateProductDto.subcategoryId) {
      updateData.subcategoryId = updateProductDto.subcategoryId;
    }
    // Manejar isActive explícitamente - permitir false
    if (updateProductDto.isActive !== undefined) {
      // Convertir explícitamente a boolean
      const isActiveValue: any = updateProductDto.isActive;
      // Asegurar que false se convierta correctamente
      if (isActiveValue === false) {
        updateData.isActive = false;
      } else if (typeof isActiveValue === 'string') {
        const lowerValue = isActiveValue.toLowerCase().trim();
        updateData.isActive = lowerValue === 'true' || lowerValue === '1';
      } else if (typeof isActiveValue === 'number') {
        updateData.isActive = isActiveValue !== 0;
      } else {
        updateData.isActive = Boolean(isActiveValue);
      }
    }

    // Agregar imágenes si hay nuevas
    if (newImageUrls.length > 0) {
      updateData.images = {
        create: newImageUrls.map((url, index) => ({
          url,
          order: product.images.length + index,
        })),
      };
    }

    // Actualizar el producto
    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: updateData,
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
    const product = await this.findOne(id);

    // Verificar si el producto tiene órdenes relacionadas
    const orderItemsCount = await this.prisma.orderItem.count({
      where: { productId: id },
    });

    if (orderItemsCount > 0) {
      throw new BadRequestException(
        `No se puede eliminar el producto porque tiene ${orderItemsCount} ${orderItemsCount === 1 ? 'orden relacionada' : 'órdenes relacionadas'}. En su lugar, puedes desactivarlo usando el switch de estado.`,
      );
    }

    return this.prisma.product.delete({
      where: { id },
    });
  }
}
