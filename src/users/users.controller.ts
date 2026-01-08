import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { LoggedInUserData } from '../interfaces/authenticated-user.interface.js';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto.js';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto.js';
import { ChangePasswordDto } from '../auth/dto/change-password.dto.js';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto.js';
import { UserRole } from '../generated/enums.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@CurrentUser() user: LoggedInUserData) {
    return this.usersService.getCurrentUser(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @CurrentUser() user: LoggedInUserData,
    @Body() updateDto: UpdateUserProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, updateDto);
  }

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() user: LoggedInUserData,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.id, changePasswordDto);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllForAdmin(@Query() queryDto: AdminUsersQueryDto) {
    return this.usersService.findAllForAdmin(queryDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateUserByAdmin(
    @Param('id') id: string,
    @Body() updateDto: UpdateUserAdminDto,
  ) {
    return this.usersService.updateUserByAdmin(id, updateDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
