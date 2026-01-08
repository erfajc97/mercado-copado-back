import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  Res,
  Req,
  Get,
} from '@nestjs/common';
import { LoginDto } from './dto/login.dto.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public.decorator.js';
import { RegisterUserDto } from './dto/register.dto.js';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import type {
  AuthenticatedRequest,
  AuthenticatedRequestWithRefreshToken,
  GoogleAuthRequest,
} from '../interfaces/authenticated-user.interface.js';
import geoip from 'geoip-lite';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() data: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(data);
    response.cookie('refreshToken', result.data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    });
    return result;
  }

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() data: RegisterUserDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(data);
    response.cookie('refreshToken', result.data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'strict',
    });
    return result;
  }

  @Get('google')
  @Public()
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Inicia el flujo de OAuth
  }

  @Get('google/callback')
  @Public()
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(
    @Req()
    req: GoogleAuthRequest & {
      ip?: string;
      connection?: any;
      headers?: any;
      socket?: any;
    },
    @Res({ passthrough: true }) response: Response,
  ) {
    // Detectar país por IP
    let country = 'Argentina'; // Default a Argentina
    try {
      // Obtener IP del request
      const ip =
        req.ip ||
        req.connection?.remoteAddress ||
        req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress;

      if (ip && typeof ip === 'string') {
        // Limpiar IP (remover ::ffff: si está presente)
        const cleanIp = ip.replace('::ffff:', '').trim();
        const geo = geoip.lookup(cleanIp);

        if (geo && geo.country) {
          // Convertir código de país a nombre completo
          const countryNames: Record<string, string> = {
            AR: 'Argentina',
            EC: 'Ecuador',
            SV: 'El Salvador',
            GT: 'Guatemala',
            HN: 'Honduras',
            NI: 'Nicaragua',
            CR: 'Costa Rica',
            PA: 'Panamá',
            MX: 'México',
            US: 'Estados Unidos',
            CA: 'Canadá',
            CO: 'Colombia',
            VE: 'Venezuela',
            PE: 'Perú',
            BO: 'Bolivia',
            CL: 'Chile',
            UY: 'Uruguay',
            PY: 'Paraguay',
            BR: 'Brasil',
            DO: 'República Dominicana',
            CU: 'Cuba',
            PR: 'Puerto Rico',
            ES: 'España',
          };
          country = countryNames[geo.country] || 'Argentina';
        }
      }
    } catch (error) {
      console.error('Error detectando país por IP:', error);
      // Mantener default Argentina
    }

    // Agregar país detectado al googleUser
    const googleUser = { ...req.user, country };
    const result = await this.authService.googleLogin(googleUser);
    response.cookie('refreshToken', result.data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    // Redirigir al frontend con el token y refreshToken
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    response.redirect(
      `${frontendUrl}/auth/callback?token=${result.data.accessToken}&refreshToken=${result.data.refreshToken}`,
    );
  }

  @Post('verify-email/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Param('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  async resendVerificationEmail(
    @Body() resendVerificationDto: ResendVerificationDto,
  ) {
    return this.authService.resendVerificationEmail(
      resendVerificationDto.email,
    );
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Param('token') token: string,
    @Body() resetPasswordDto: Omit<ResetPasswordDto, 'token'>,
  ) {
    return this.authService.resetPassword({ ...resetPasswordDto, token });
  }

  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const userId = req.user.id;
    return this.authService.changePassword(userId, changePasswordDto);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logout(req.user.id);
    response.clearCookie('refreshToken');
    return result;
  }

  @Post('refresh-token')
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: AuthenticatedRequestWithRefreshToken,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { id, refreshToken } = req.user;
    const result = await this.authService.refresh(id, refreshToken);
    response.cookie('refreshToken', result.data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'strict',
    });
    return result;
  }
}
