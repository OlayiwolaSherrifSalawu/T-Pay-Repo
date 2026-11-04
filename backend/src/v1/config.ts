export interface Config {
  port: number;
  appUrl: string;
  databasePath: string;
  fxNgnPerUsd: number;
  fxSource: string;
  paypal: { clientId: string; clientSecret: string; webhookId: string } | null;
  gemini: { apiKey: string; model: string } | null;
}

/** V1 moves sandbox money only, so a live configuration is a startup failure. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const paypalEnv = env.PAYPAL_ENV ?? 'sandbox';
  if (paypalEnv !== 'sandbox') {
    throw new Error(`PAYPAL_ENV is "${paypalEnv}", but T-Pay V1 refuses to run outside the sandbox.`);
  }

  const clientId = env.PAYPAL_CLIENT_ID ?? '';
  const clientSecret = env.PAYPAL_CLIENT_SECRET ?? '';
  const fxNgnPerUsd = Number(env.FX_NGN_PER_USD ?? 1500);
  if (!(fxNgnPerUsd > 0)) throw new Error('FX_NGN_PER_USD must be a positive number');

  return {
    port: Number(env.PORT ?? 4000),
    appUrl: (env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    databasePath: env.DATABASE_PATH ?? 'data/tpay.db',
    fxNgnPerUsd,
    fxSource: env.FX_SOURCE ?? 'demo-fixed-rate',
    paypal:
      clientId && clientSecret
        ? { clientId, clientSecret, webhookId: env.PAYPAL_WEBHOOK_ID ?? '' }
        : null,
    gemini: env.GEMINI_API_KEY
      ? { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL ?? 'gemini-2.5-flash' }
      : null,
  };
}
