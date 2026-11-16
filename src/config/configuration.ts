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
    provider: SummaryProviderName;
    model: string;
    openaiApiKey: string;
    openaiModel: string;
  };
  /** Single admin login for the analytics dashboard. Disabled when the password is empty. */
  admin: { username: string; password: string; tokenTtl: string };
}

export type SummaryProviderName = 'openai' | 'anthropic' | 'local';

/**
 * SUMMARY_PROVIDER wins when set. Otherwise the provider follows whichever API
 * key is configured (OpenAI first), keeping the old Claude default when neither is.
 */
export function pickSummaryProvider(
  env: NodeJS.ProcessEnv,
): SummaryProviderName {
  const explicit = env.SUMMARY_PROVIDER?.trim().toLowerCase();
  if (
    explicit === 'openai' ||
    explicit === 'anthropic' ||
    explicit === 'local'
  ) {
    return explicit;
  }
  if (env.OPENAI_API_KEY) return 'openai';
  return 'anthropic';
  audio: {
    apiKey?: string;
    model: string;
    voice: string;
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
      provider: pickSummaryProvider(process.env),
      model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
      openaiApiKey: process.env.OPENAI_API_KEY ?? '',
      openaiModel: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
    },
    admin: {
      username: process.env.ADMIN_USERNAME?.trim() || 'admin',
      password: process.env.ADMIN_PASSWORD ?? '',
      tokenTtl: process.env.ADMIN_TOKEN_TTL || '8h',
    },
    audio: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts',
      voice: process.env.OPENAI_TTS_VOICE ?? 'coral',
    },
  };
};
