import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { LoggedInUserData } from '../interfaces/authenticated-user.interface.js';
import { OrderStatus } from '../generated/enums.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(
    @CurrentUser() user: LoggedInUserData,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.ordersService.create(user.id, createOrderDto);
  }

  @Get('my-orders')
  findMyOrders(
    @CurrentUser() user: LoggedInUserData,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    return this.ordersService.findAll(user.id, pageNumber, limitNumber);
  }

  @Get()
  @UseGuards(AdminGuard)
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    return this.ordersService.findAll(undefined, pageNumber, limitNumber);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: LoggedInUserData,
    @Query('admin') admin?: string,
  ) {
    // Si es admin, puede ver cualquier orden, si no, solo las suyas
    const userId =
      admin === 'true' && user.type === 'ADMIN' ? undefined : user.id;
    return this.ordersService.findOne(id, userId);
  }

  @Patch(':id/status')
  @UseGuards(AdminGuard)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: OrderStatus,
    @CurrentUser() user: LoggedInUserData,
  ) {
    // Validar que solo admins pueden cambiar a cancelled
    if (status === OrderStatus.cancelled && user.type !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo administradores pueden cancelar órdenes',
      );
    }
    return this.ordersService.updateStatus(id, status);
  }

  @Get(':id/payment-link')
  async getPaymentLink(
    @Param('id') id: string,
    @CurrentUser() user: LoggedInUserData,
  ) {
    return this.ordersService.getPaymentLink(
      id,
      user.id,
      user.type === 'ADMIN',
    );
  }
}
