import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async generateAccessToken(userId: string, email: string): Promise<string> {
    const payload = { sub: userId, email };
    return this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });
  }

  async generateRefreshToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const family = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        family,
        expiresAt,
      },
    });

    return rawToken;
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    const dbToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!dbToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (new Date() > dbToken.expiresAt) {
      // Clean up expired token
      await this.prisma.refreshToken.delete({ where: { id: dbToken.id } });
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Delete the old token (one-time use)
    await this.prisma.refreshToken.delete({ where: { id: dbToken.id } });

    // Generate new family member token
    const newAccessToken = await this.generateAccessToken(dbToken.userId, dbToken.user.email);
    const newRawToken = crypto.randomBytes(40).toString('hex');
    const newHash = crypto.createHash('sha256').update(newRawToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId: dbToken.userId,
        tokenHash: newHash,
        family: dbToken.family, // keep the same family
        expiresAt,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRawToken,
    };
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    try {
      await this.prisma.refreshToken.delete({ where: { tokenHash } });
    } catch {
      // Ignore if not found or already deleted
    }
  }
}
