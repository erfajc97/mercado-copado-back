import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service.js';
import { AddToCartDto } from './dto/add-to-cart.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { LoggedInUserData } from '../interfaces/authenticated-user.interface.js';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  findAll(@CurrentUser() user: LoggedInUserData) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.cartService.findAll(user.id);
  }

  @Post()
  addToCart(
    @CurrentUser() user: LoggedInUserData,
    @Body() addToCartDto: AddToCartDto,
  ) {
    return this.cartService.addToCart(user.id, addToCartDto);
  }

  @Patch(':id')
  updateItem(
    @Param('id') id: string,
    @CurrentUser() user: LoggedInUserData,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(id, user.id, updateCartItemDto);
  }

  @Delete(':id')
  removeItem(@Param('id') id: string, @CurrentUser() user: LoggedInUserData) {
    return this.cartService.removeItem(id, user.id);
  }

  @Delete()
  clearCart(@CurrentUser() user: LoggedInUserData) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.cartService.clearCart(user.id);
  }
}
