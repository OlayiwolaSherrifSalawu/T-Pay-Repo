/**
 * The only module that talks to PayPal. There is deliberately no mock here: a
 * missing configuration is an error, never a pretend success. Test doubles live
 * under tests/.
 */

/** How a failed call must be treated. Conflating these causes infinite retries and lost money. */
export type FailureClass = 'AMBIGUOUS' | 'RETRYABLE' | 'BLOCKED' | 'DECLINED' | 'REJECTED';

export class PayPalError extends Error {
  public readonly failureClass: FailureClass;
  public readonly issue: string;

  constructor(failureClass: FailureClass, issue: string, message: string) {
    super(message);
    this.failureClass = failureClass;
    this.issue = issue;
  }
}

const BLOCKING_ISSUES = new Set([
  'AUTHORIZATION_EXPIRED',
  'AUTHORIZATION_VOIDED',
  'AUTHORIZATION_ALREADY_CAPTURED',
  'MAX_CAPTURE_AMOUNT_EXCEEDED',
  'PREVIOUSLY_CAPTURED',
]);
const DECLINE_ISSUES = new Set([
  'INSTRUMENT_DECLINED',
  'PAYER_CANNOT_PAY',
  'PAYER_ACCOUNT_RESTRICTED',
  'PAYER_ACCOUNT_LOCKED_OR_CLOSED',
  'TRANSACTION_REFUSED',
  'INSUFFICIENT_FUNDS',
]);

export function classifyFailure(status: number, issue: string): FailureClass {
  if (status === 429 || issue === 'PREVIOUS_REQUEST_IN_PROGRESS') return 'RETRYABLE';
  if (status >= 500) return 'AMBIGUOUS';
  if (BLOCKING_ISSUES.has(issue)) return 'BLOCKED';
  if (DECLINE_ISSUES.has(issue)) return 'DECLINED';
  return 'REJECTED';
}

export interface CaptureResult {
  captureId: string;
  status: 'COMPLETED' | 'PENDING';
}

export interface PayPalGateway {
  createAuthorizeOrder(input: {
    vaultId: string;
    amountUsdMinor: number;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<{ orderId: string; approveUrl: string }>;
  authorizeOrder(orderId: string): Promise<{ authorizationId: string }>;
  captureAuthorization(input: {
    authorizationId: string;
    amountUsdMinor: number;
    voucherId: string;
  }): Promise<CaptureResult>;
  /** Reads an order back, to learn whether an ambiguous capture actually happened. */
  findCapture(orderId: string, voucherId: string): Promise<CaptureResult | null>;
  voidAuthorization(authorizationId: string): Promise<void>;
  verifyWebhook(headers: Record<string, string | undefined>, event: unknown): Promise<boolean>;
  isReachable(): Promise<boolean>;
}

/** PayPal never sees naira: USD is the only currency that leaves this module. */
export function usdValue(amountUsdMinor: number): string {
  if (!Number.isSafeInteger(amountUsdMinor) || amountUsdMinor <= 0) {
    throw new Error(`Invalid USD minor amount: ${amountUsdMinor}`);
  }
  const cents = String(amountUsdMinor % 100).padStart(2, '0');
  return `${Math.floor(amountUsdMinor / 100)}.${cents}`;
}

const SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';
const TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export class RestPayPalGateway implements PayPalGateway {
  private token: { value: string; expiresAt: number } | null = null;
  private pendingToken: Promise<string> | null = null;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly webhookId: string;

  constructor(clientId: string, clientSecret: string, webhookId: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.webhookId = webhookId;
  }

  private async requestToken(): Promise<string> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetch(`${SANDBOX_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new PayPalError('REJECTED', 'OAUTH_FAILED', `PayPal OAuth failed: ${response.status}`);
    }
    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000 - TOKEN_REFRESH_MARGIN_MS,
    };
    return data.access_token;
  }

  /** Concurrent callers share one request, so a batch costs one token. */
  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    this.pendingToken ??= this.requestToken().finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${SANDBOX_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await this.accessToken()}`,
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof PayPalError) throw error;
      throw new PayPalError('AMBIGUOUS', 'NETWORK_ERROR', `PayPal unreachable: ${String(error)}`);
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const issue: string = data.details?.[0]?.issue ?? data.name ?? `HTTP_${response.status}`;
      throw new PayPalError(
        classifyFailure(response.status, issue),
        issue,
        data.details?.[0]?.description ?? data.message ?? `PayPal returned ${response.status}`
      );
    }
    return data as T;
  }

  public async createAuthorizeOrder(input: {
    vaultId: string;
    amountUsdMinor: number;
    returnUrl: string;
    cancelUrl: string;
  }) {
    const order = await this.call<{ id: string; links: { rel: string; href: string }[] }>(
      'POST',
      '/v2/checkout/orders',
      {
        intent: 'AUTHORIZE',
        purchase_units: [
          {
            reference_id: input.vaultId,
            description: 'T-Pay offline vault',
            amount: { currency_code: 'USD', value: usdValue(input.amountUsdMinor) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'T-Pay',
              user_action: 'CONTINUE',
              shipping_preference: 'NO_SHIPPING',
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      },
      { 'PayPal-Request-Id': `vault-${input.vaultId}` }
    );
    const link = order.links.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
    if (!link) throw new PayPalError('REJECTED', 'NO_APPROVAL_LINK', 'Order has no approval link');
    return { orderId: order.id, approveUrl: link.href };
  }

  public async authorizeOrder(orderId: string) {
    const order = await this.call<{
      purchase_units: { payments: { authorizations: { id: string }[] } }[];
    }>('POST', `/v2/checkout/orders/${orderId}/authorize`, {}, {
      'PayPal-Request-Id': `authorize-${orderId}`,
      Prefer: 'return=representation',
    });
    return { authorizationId: order.purchase_units[0].payments.authorizations[0].id };
  }

  public async captureAuthorization(input: {
    authorizationId: string;
    amountUsdMinor: number;
    voucherId: string;
  }): Promise<CaptureResult> {
    const capture = await this.call<{ id: string; status: string }>(
      'POST',
      `/v2/payments/authorizations/${input.authorizationId}/capture`,
      {
        amount: { currency_code: 'USD', value: usdValue(input.amountUsdMinor) },
        invoice_id: input.voucherId,
        final_capture: false,
      },
      { 'PayPal-Request-Id': input.voucherId, Prefer: 'return=representation' }
    );
    return this.toCaptureResult(capture);
  }

  private toCaptureResult(capture: { id: string; status: string }): CaptureResult {
    if (capture.status === 'COMPLETED' || capture.status === 'PENDING') {
      return { captureId: capture.id, status: capture.status };
    }
    throw new PayPalError('DECLINED', capture.status, `Capture ended as ${capture.status}`);
  }

  public async findCapture(orderId: string, voucherId: string) {
    const order = await this.call<{
      purchase_units: {
        payments?: { captures?: { id: string; status: string; invoice_id?: string }[] };
      }[];
    }>('GET', `/v2/checkout/orders/${orderId}`);
    const captures = order.purchase_units.flatMap((unit) => unit.payments?.captures ?? []);
    const match = captures.find((capture) => capture.invoice_id === voucherId);
    return match ? this.toCaptureResult(match) : null;
  }

  public async voidAuthorization(authorizationId: string) {
    await this.call('POST', `/v2/payments/authorizations/${authorizationId}/void`, {});
  }

  public async verifyWebhook(headers: Record<string, string | undefined>, event: unknown) {
    if (!this.webhookId) return false;
    const result = await this.call<{ verification_status: string }>(
      'POST',
      '/v1/notifications/verify-webhook-signature',
      {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: this.webhookId,
        webhook_event: event,
      }
    );
    return result.verification_status === 'SUCCESS';
  }

  public async isReachable() {
    try {
      await this.accessToken();
      return true;
    } catch {
      return false;
    }
  }
}
