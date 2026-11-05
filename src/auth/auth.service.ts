import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { User } from '../users/user.entity.js';
import { PasswordReset } from './password-reset.entity.js';
import type { LoginDto, RegisterDto } from './auth.dto.js';
import type { AccessPayload } from './jwt-auth.guard.js';

interface RefreshPayload {
  sub: string;
  ver: number;
  typ: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const BCRYPT_ROUNDS = 12;
const RESET_TTL_MS = 60 * 60 * 1000;

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash?: string;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PasswordReset)
    private readonly resets: Repository<PasswordReset>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const exists = await this.users.exists({ where: { email: dto.email } });
    if (exists)
      throw new ConflictException('An account with this email already exists');

    const user = await this.users.save(
      this.users.create({
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        displayName: dto.displayName?.trim() || null,
      }),
    );
    return this.issueTokens(user.id, user.email, 0);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.users.findOne({
      where: { email: dto.email },
      select: { id: true, email: true, passwordHash: true, tokenVersion: true },
    });
    // Compare even when the user is missing so timing doesn't reveal which emails exist.
    this.dummyHash ??= await bcrypt.hash(
      randomBytes(16).toString('hex'),
      BCRYPT_ROUNDS,
    );
    const ok = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? this.dummyHash,
    );
    if (!user || !ok)
      throw new UnauthorizedException('Email or password is incorrect');
    return this.issueTokens(user.id, user.email, user.tokenVersion);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException();

    const user = await this.users.findOne({
      where: { id: payload.sub },
      select: { id: true, email: true, tokenVersion: true },
    });
    if (!user || user.tokenVersion !== payload.ver)
      throw new UnauthorizedException();
    return this.issueTokens(user.id, user.email, user.tokenVersion);
  }

  /** Signs out everywhere by invalidating every outstanding refresh token. */
  async logout(userId: string): Promise<void> {
    await this.users.increment({ id: userId }, 'tokenVersion', 1);
  }

  /**
   * Creates a single-use reset token. There is no email provider wired up yet,
   * so the token is logged; outside production it is also returned to the
   * caller so the mobile app can complete the flow during development.
   */
  async forgotPassword(email: string): Promise<{ devResetToken?: string }> {
    const user = await this.users.findOne({ where: { email } });
    if (!user) return {};

    const token = randomBytes(32).toString('base64url');
    await this.resets.save(
      this.resets.create({
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      }),
    );

    const isProd = this.config.get<string>('env') === 'production';
    if (isProd) {
      this.logger.log(`Password reset requested for user ${user.id}`);
      return {};
    }
    this.logger.log(`Password reset token for ${email}: ${token}`);
    return { devResetToken: token };
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const reset = await this.resets.findOne({
      where: {
        tokenHash: sha256(token),
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!reset)
      throw new BadRequestException(
        'This reset link is invalid or has expired',
      );

    await this.users.manager.transaction(async (tx) => {
      await tx.update(PasswordReset, reset.id, { usedAt: new Date() });
      await tx.update(User, reset.userId, {
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      });
      await tx.increment(User, { id: reset.userId }, 'tokenVersion', 1);
    });
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    return !!user && bcrypt.compare(password, user.passwordHash);
  }

  private async issueTokens(
    userId: string,
    email: string,
    ver: number,
  ): Promise<TokenPair> {
    const access: AccessPayload = { sub: userId, email, typ: 'access' };
    const refresh: RefreshPayload = { sub: userId, ver, typ: 'refresh' };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(access, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: this.config.getOrThrow('jwt.accessTtl'),
      }),
      this.jwt.signAsync(refresh, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: this.config.getOrThrow('jwt.refreshTtl'),
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
