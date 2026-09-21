export type ApiClientOptions = {
  /** Override base URL (tests). Defaults: browser → NEXT_PUBLIC_API_URL, server → API_INTERNAL_URL. */
  baseUrl?: string;
  /** Override bearer token. Defaults to NEXT_PUBLIC_DEMO_ACCESS_TOKEN. */
  token?: string;
  signal?: AbortSignal;
};

function resolveBaseUrl(explicit?: string): string {
  if (explicit) return explicit.replace(/\/$/, '');
  if (typeof window === 'undefined') {
    return (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
      /\/$/,
      '',
    );
  }
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
}

function resolveToken(explicit?: string): string {
  return explicit ?? process.env.NEXT_PUBLIC_DEMO_ACCESS_TOKEN ?? '';
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Fetch helper that always sends Authorization: Bearer <DEMO_ACCESS_TOKEN>.
 * Works for browser and RSC (uses API_INTERNAL_URL on the server).
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & ApiClientOptions = {},
): Promise<T> {
  const { baseUrl, token, signal, headers, ...rest } = init;
  const url = `${resolveBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`;
  const auth = resolveToken(token);

  const res = await fetch(url, {
    ...rest,
    signal,
    headers: {
      Accept: 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    let code = 'HTTP_ERROR';
    let message = res.statusText || `Request failed (${res.status})`;
    let details: unknown;
    try {
      const body = (await res.json()) as {
        error?: { code?: string; message?: string; details?: unknown };
      };
      if (body.error?.code) code = body.error.code;
      if (body.error?.message) message = body.error.message;
      details = body.error?.details;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, code, message, details);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
