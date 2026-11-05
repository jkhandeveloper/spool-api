export interface AppConfig {
  env: string;
  port: number;
  corsOrigins: string[];
  database: { url: string; synchronize: boolean };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  summary: {
    provider: 'anthropic' | 'local';
    model: string;
  };
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes'].includes(value.toLowerCase());
}

export default (): AppConfig => {
  const env = process.env.NODE_ENV ?? 'development';
  const isProd = env === 'production';

  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (isProd && (!accessSecret || !refreshSecret)) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in production',
    );
  }

  return {
    env,
    port: parseInt(process.env.PORT ?? '3000', 10),
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    database: {
      url:
        process.env.DATABASE_URL ??
        'postgres://spool:spool@localhost:5432/spool',
      synchronize: bool(process.env.DB_SYNCHRONIZE, false),
    },
    jwt: {
      accessSecret: accessSecret ?? 'dev-access-secret',
      refreshSecret: refreshSecret ?? 'dev-refresh-secret',
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
    },
    summary: {
      provider:
        process.env.SUMMARY_PROVIDER === 'local' ? 'local' : 'anthropic',
      model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
    },
  };
};
