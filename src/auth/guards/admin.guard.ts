import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '../../generated/enums.js';
import { UsersService } from '../../users/users.service.js';
import type { AuthenticatedRequest } from '../../interfaces/authenticated-user.interface.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    const foundUser = await this.usersService.findOne(user.id);

    if (!foundUser || foundUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Acceso denegado: solo administradores');
    }

    return true;
  }
}
