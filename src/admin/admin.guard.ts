import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AdminPayload {
  sub: 'admin';
  username: string;
  typ: 'admin';
}

/**
 * Admin routes are @Public() (so the user JwtAuthGuard skips them) and use this
 * guard instead. Admin tokens have typ 'admin', so the user guard rejects them
 * everywhere else, and user tokens (typ 'access') are rejected here.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync<AdminPayload>(token, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      });
      if (payload.typ !== 'admin') throw new Error('not an admin token');
      // A changed ADMIN_USERNAME invalidates tokens issued for the old one.
      if (payload.username !== this.config.get<string>('admin.username'))
        throw new Error('stale admin token');
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
