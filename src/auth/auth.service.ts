import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterUserDto } from './dto/register.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UserRole } from '../generated/enums.js';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service.js';
import { v4 as uuidv4 } from 'uuid';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import type { StringValue } from 'ms';
import type { GoogleUser } from '../interfaces/authenticated-user.interface.js';

type Tokens = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  private async hashData(data: string): Promise<string> {
    return bcrypt.hash(data, 10);
  }

  private async getTokens(
    userId: string,
    email: string,
    role: UserRole,
  ): Promise<Tokens> {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const refreshSecret = this.configService.get<string>(
      'REFRESH_TOKEN_SECRET',
    );

    if (!jwtSecret || !refreshSecret) {
      throw new Error('JWT secrets are not configured');
    }

    const accessTokenExpiresIn: StringValue | number =
      (this.configService.get<string>('JWT_EXPIRES_IN') ||
        '24h') as StringValue;
    const refreshTokenExpiresIn: StringValue | number =
      (this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') ||
        '7d') as StringValue;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { id: userId, email, type: role },
        {
          secret: jwtSecret,
          expiresIn: accessTokenExpiresIn,
        },
      ),
      this.jwtService.signAsync(
        { id: userId, email, type: role },
        {
          secret: refreshSecret,
          expiresIn: refreshTokenExpiresIn,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const hashedRefreshToken = await this.hashData(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken },
    });
  }

  async login(userDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: userDto.email },
    });

    if (!user) throw new NotFoundException('User not found');

    if (!user.password) {
      throw new ForbiddenException('Please login with Google');
    }

    // TypeScript type narrowing: user.password is not null here
    const passwordMatches = await bcrypt.compare(
      userDto.password,
      user.password,
    );
    if (!passwordMatches) throw new ForbiddenException('Wrong credentials');

    // user.id and user.email are guaranteed to be non-null (required fields in schema)
    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      message: 'Login exitoso',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        userRole: user.role,
      },
    };
  }

  async register(userDto: RegisterUserDto) {
    const { email, password, firstName, lastName, country } = userDto;

    const foundUser = await this.prisma.user.findUnique({ where: { email } });
    if (foundUser) {
      throw new ConflictException(`Email ${email} already exist`);
    }

    const hashedPassword = await this.hashData(password);
    const verificationToken = uuidv4();
    const verificationTokenExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    );

    const newUser = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        country,
        role: UserRole.USER,
        verificationToken,
        verificationTokenExpiresAt,
      },
    });

    // newUser fields are guaranteed to be non-null after creation
    const tokens = await this.getTokens(
      newUser.id,
      newUser.email,
      newUser.role,
    );
    await this.updateRefreshToken(newUser.id, tokens.refreshToken);
    const verificationLink = `${this.configService.get<string>(
      'FRONTEND_URL',
    )}/verify-email/${verificationToken}`;

    try {
      await this.emailService.sendEmail({
        to: newUser.email,
        subject: `¡Bienvenido a Mercado Copado, ${newUser.firstName}!`,
        templateName: 'user-verification',
        replacements: {
          name: newUser.firstName,
          email: newUser.email,
          verificationLink,
        },
      });
    } catch (emailError) {
      console.error(
        `[Registro] No se pudo enviar el correo a ${newUser.email}:`,
        emailError,
      );
    }

    return {
      message:
        'Registro exitoso. Por favor, revisa tu correo para verificar tu cuenta.',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  async googleLogin(googleUser: GoogleUser) {
    const { googleId, email, firstName, lastName, country } = googleUser;

    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { googleId }],
      },
    });

    if (!user) {
      // Crear nuevo usuario
      user = await this.prisma.user.create({
        data: {
          email,
          googleId,
          firstName,
          lastName,
          role: UserRole.USER,
          isVerified: true, // Google ya verifica el email
          country: country || 'Argentina', // Usar país detectado o Argentina por defecto
        },
      });
    } else if (!user.googleId) {
      // Actualizar usuario existente con googleId
      const updateData: {
        googleId: string;
        isVerified: boolean;
        country?: string;
      } = {
        googleId,
        isVerified: true,
      };

      // Solo actualizar país si no tiene uno asignado
      if (country && !user.country) {
        updateData.country = country;
      }

      user = await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }

    // user fields are guaranteed to be non-null after find/create
    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      message: 'Login exitoso con Google',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        userRole: user.role,
      },
    };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationTokenExpiresAt: {
          gte: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException(
        'El token de verificación no es válido o ha expirado.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
      },
    });

    return { message: 'Correo verificado exitosamente.' };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return {
        message:
          'Si el email existe en nuestra base de datos, recibirás un nuevo enlace de verificación.',
      };
    }

    if (user.isVerified) {
      return {
        message: 'Tu cuenta ya está verificada.',
      };
    }

    const verificationToken = uuidv4();
    const verificationTokenExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken,
        verificationTokenExpiresAt,
      },
    });

    const verificationLink = `${this.configService.get<string>(
      'FRONTEND_URL',
    )}/verify-email/${verificationToken}`;

    try {
      await this.emailService.sendEmail({
        to: user.email,
        subject: `¡Bienvenido a Mercado Copado, ${user.firstName}!`,
        templateName: 'user-verification',
        replacements: {
          name: user.firstName,
          email: user.email,
          verificationLink,
        },
      });

      return {
        message:
          'Se ha enviado un nuevo enlace de verificación a tu correo electrónico.',
      };
    } catch (emailError) {
      console.error(
        `[Reenvío de verificación] No se pudo enviar el correo a ${user.email}:`,
        emailError,
      );

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken: null,
          verificationTokenExpiresAt: null,
        },
      });

      throw new BadRequestException(
        'No se pudo enviar el correo de verificación. Por favor, intenta nuevamente.',
      );
    }
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        hashedRefreshToken: {
          not: null,
        },
      },
      data: {
        hashedRefreshToken: null,
      },
    });
    return { message: 'Logout exitoso' };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.hashedRefreshToken)
      throw new ForbiddenException('Access Denied');
    // TypeScript type narrowing: user and user.hashedRefreshToken are not null here
    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.hashedRefreshToken,
    );
    if (!refreshTokenMatches) throw new ForbiddenException('Access Denied');
    // user.id and user.email are guaranteed to be non-null (required fields in schema)
    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return {
      message: 'Tokens refreshed successfully',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return {
        message:
          'Si el email existe en nuestra base de datos, recibirás un enlace para restablecer tu contraseña.',
      };
    }

    const resetToken = uuidv4();
    const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordTokenExpiresAt: resetTokenExpiresAt,
        resetPasswordRequestedAt: new Date(),
      },
    });

    const resetLink = `${this.configService.get<string>(
      'FRONTEND_URL',
    )}/reset-password/${resetToken}`;

    try {
      await this.emailService.sendEmail({
        to: user.email,
        subject: 'Restablecer Contraseña - Mercado Copado',
        templateName: 'password-reset',
        replacements: {
          name: user.firstName,
          resetLink,
        },
      });

      return {
        message:
          'Si el email existe en nuestra base de datos, recibirás un enlace para restablecer tu contraseña.',
      };
    } catch (emailError) {
      console.error(
        `[Olvido de Contraseña] Fallo al intentar enviar correo a ${email}:`,
        emailError,
      );

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: null,
          resetPasswordTokenExpiresAt: null,
          resetPasswordRequestedAt: null,
        },
      });

      throw new BadRequestException(
        'No se pudo enviar el correo de restablecimiento. Por favor, intenta nuevamente.',
      );
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordTokenExpiresAt: {
          gte: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException(
        'El token de restablecimiento no es válido o ha expirado.',
      );
    }

    if (!user.password) {
      throw new BadRequestException(
        'Este usuario no tiene contraseña. Por favor, usa Google para iniciar sesión.',
      );
    }

    // TypeScript type narrowing: user.password is not null here
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la actual.',
      );
    }

    const hashedPassword = await this.hashData(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordTokenExpiresAt: null,
        resetPasswordRequestedAt: null,
        hashedRefreshToken: null,
      },
    });

    return {
      message:
        'Contraseña restablecida exitosamente. Puedes iniciar sesión con tu nueva contraseña.',
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    if (!user.password) {
      throw new ForbiddenException(
        'Este usuario no tiene contraseña. Por favor, usa Google para iniciar sesión.',
      );
    }

    // TypeScript type narrowing: user.password is not null here
    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!passwordMatches) {
      throw new ForbiddenException('La contraseña actual es incorrecta.');
    }

    // user.password is still not null after the check above
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestException(
        'La nueva contraseña no puede ser igual a la actual.',
      );
    }

    const hashedPassword = await this.hashData(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        hashedRefreshToken: null,
      },
    });

    return { message: 'Contraseña actualizada exitosamente.' };
  }
}
