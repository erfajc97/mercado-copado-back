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
} from '@nestjs/common';
import { SubcategoriesService } from './subcategories.service.js';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto.js';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('subcategories')
export class SubcategoriesController {
  constructor(private readonly subcategoriesService: SubcategoriesService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createSubcategoryDto: CreateSubcategoryDto) {
    return this.subcategoriesService.create(createSubcategoryDto);
  }

  @Get()
  @Public()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.subcategoriesService.findAll(categoryId);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.subcategoriesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateSubcategoryDto: UpdateSubcategoryDto,
  ) {
    return this.subcategoriesService.update(id, updateSubcategoryDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.subcategoriesService.remove(id);
  }
}
