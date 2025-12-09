import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { LoggedInUserData } from '../interfaces/authenticated-user.interface.js';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto.js';

@Controller('payment-methods')
@UseGuards(JwtAuthGuard)
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Post()
  create(
    @CurrentUser() user: LoggedInUserData,
    @Body() createDto: CreatePaymentMethodDto,
  ) {
    return this.paymentMethodsService.create(user.id, createDto);
  }

  @Get()
  findAll(@CurrentUser() user: LoggedInUserData) {
    return this.paymentMethodsService.findAll(user.id);
  }

  @Patch(':id/set-default')
  setDefault(@CurrentUser() user: LoggedInUserData, @Param('id') id: string) {
    return this.paymentMethodsService.setDefault(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: LoggedInUserData, @Param('id') id: string) {
    return this.paymentMethodsService.remove(user.id, id);
  }
}
