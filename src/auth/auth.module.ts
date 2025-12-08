import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { AdminGuard } from './guards/admin.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy.js';
import { EmailModule } from '../email/email.module.js';
import { GoogleStrategy } from './strategies/google.strategy.js';
import type { StringValue } from 'ms';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    ConfigModule,
    EmailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is not configured');
        }
        const expiresIn: StringValue | number = (configService.get<string>(
          'JWT_EXPIRES_IN',
        ) || '24h') as StringValue;
        return {
          secret,
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    GoogleStrategy,
    AdminGuard,
    RolesGuard,
  ],
  exports: [AuthService, AdminGuard, RolesGuard],
})
export class AuthModule {}
