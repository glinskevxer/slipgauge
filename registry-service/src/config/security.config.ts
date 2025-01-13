import { registerAs } from '@nestjs/config';

export interface SecurityConfig {
  /**
   * Signing key. There is no default on purpose: a service that boots with a
   * shipped key is a service somebody will deploy with a shipped key.
   */
  readonly jwtSecret: string;
  readonly jwtIssuer: string;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  /** Work factor for password hashing. */
  readonly bcryptRounds: number;
  /** Origins the console may be served from. Never a wildcard with credentials. */
  readonly allowedOrigins: string[];
}

export const securityConfig = registerAs('security', (): SecurityConfig => {
  const secret = process.env['REGISTRY_JWT_SECRET'] ?? '';

  if (secret.length < 32) {
    throw new Error(
      'REGISTRY_JWT_SECRET must be set and at least 32 characters. ' +
        'There is deliberately no default.',
    );
  }

  return {
    jwtSecret: secret,
    jwtIssuer: process.env['REGISTRY_JWT_ISSUER'] ?? 'slipgauge-registry',
    accessTokenTtlSeconds: Number(process.env['REGISTRY_ACCESS_TTL'] ?? 1800),
    refreshTokenTtlSeconds: Number(process.env['REGISTRY_REFRESH_TTL'] ?? 43200),
    bcryptRounds: Number(process.env['REGISTRY_BCRYPT_ROUNDS'] ?? 10),
    allowedOrigins: (process.env['REGISTRY_ALLOWED_ORIGINS'] ?? 'http://localhost:4200')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
});
