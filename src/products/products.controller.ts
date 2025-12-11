import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(AdminGuard)
  @UseInterceptors(FilesInterceptor('images', 10))
  create(
    @Body() createProductDto: CreateProductDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.productsService.create(createProductDto, files);
  }

  @Get()
  @Public()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.productsService.findAll(
      categoryId,
      subcategoryId,
      search,
      includeInactive === 'true',
    );
  }

  @Get('related/:id')
  @Public()
  findRelated(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.productsService.findRelated(
      id,
      limit ? parseInt(limit) : undefined,
    );
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @UseInterceptors(FilesInterceptor('images', 10))
  update(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    // Parsear manualmente el body porque FormData puede no parsear correctamente los booleanos
    const updateProductDto: UpdateProductDto = {
      ...body,
      // Convertir isActive explícitamente
      isActive:
        body.isActive !== undefined
          ? body.isActive === true ||
            body.isActive === 'true' ||
            body.isActive === 1 ||
            body.isActive === '1'
          : undefined,
    };

    return this.productsService.update(id, updateProductDto, files);
  }

  @Delete(':id/image/:imageId')
  @UseGuards(AdminGuard)
  removeImage(
    @Param('id') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productsService.removeImage(productId, imageId);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
