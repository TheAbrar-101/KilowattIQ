/**
 * KilowattIQ Typed API Client
 * 
 * Typed fetch wrapper for the React frontend with:
 * - Dynamic base URL resolution from `import.meta.env.VITE_API_BASE`
 * - Automatic canonical route mapping (`/api/v1/*`)
 * - Automatic JWT bearer token injection from active session
 * - Automatic single-retry on HTTP 401 after attempting session/token refresh
 * - Strongly-typed `ApiError` throwing with { status, code, message, details }
 */

export interface ApiErrorPayload {
  status: number;
  code?: string;
  message: string;
  details?: unknown;
}

/**
 * Standard typed application API error
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor({ status, code, message, details }: ApiErrorPayload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || `HTTP_${status}`;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
  skipRetry?: boolean;
}

export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  message?: string;
  data: T;
  code?: string;
}

// Configurable base URL with fallback to local proxy root
const ENV_API_BASE = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_API_BASE as string) : '';
export const API_BASE_URL: string = (ENV_API_BASE || '').replace(/\/+$/, '');

// Session Token Storage Key
const AUTH_TOKEN_KEY = 'kilowattiq_auth_token';
const REFRESH_TOKEN_KEY = 'kilowattiq_refresh_token';

/**
 * Retrieve currently active session token
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    localStorage.getItem(AUTH_TOKEN_KEY) ||
    sessionStorage.getItem(AUTH_TOKEN_KEY) ||
    null
  );
}

/**
 * Persist updated auth session token
 */
export function setAuthToken(token: string, refreshToken?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

/**
 * Clear stored credentials on permanent sign-out or expired session
 */
export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Internal single-flight token refresh handler
 */
async function refreshAuthSession(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const currentToken = getAuthToken();
      const refreshToken = typeof window !== 'undefined' ? localStorage.getItem(REFRESH_TOKEN_KEY) : null;

      const refreshUrl = `${API_BASE_URL}/api/v1/auth/refresh`;
      const res = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        clearAuthToken();
        return null;
      }

      const json = await res.json();
      const newToken = json.data?.token;
      if (newToken) {
        setAuthToken(newToken, json.data?.refreshToken);
        return newToken;
      }

      return null;
    } catch (err) {
      console.warn('[apiClient] Session refresh error:', err);
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Construct full URL ensuring canonical /api/v1 mapping and query string serialisation
 */
export function buildCanonicalUrl(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined | null>
): string {
  // If endpoint is already a full absolute URL
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return appendQueryParams(endpoint, params);
  }

  let cleaned = endpoint.trim();

  // Strip redundant leading /api/v1 or /api
  if (cleaned.startsWith('/api/v1')) {
    cleaned = cleaned.substring('/api/v1'.length);
  } else if (cleaned.startsWith('/api')) {
    cleaned = cleaned.substring('/api'.length);
  }

  // Ensure single leading slash
  if (!cleaned.startsWith('/')) {
    cleaned = `/${cleaned}`;
  }

  const fullPath = `${API_BASE_URL}/api/v1${cleaned}`;
  return appendQueryParams(fullPath, params);
}

function appendQueryParams(
  url: string,
  params?: Record<string, string | number | boolean | undefined | null>
): string {
  if (!params) return url;

  const validEntries = Object.entries(params).filter(
    ([, val]) => val !== undefined && val !== null
  );

  if (validEntries.length === 0) return url;

  const searchParams = new URLSearchParams();
  for (const [key, value] of validEntries) {
    searchParams.append(key, String(value));
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${searchParams.toString()}`;
}

/**
 * Universal typed request executor
 */
export async function request<T = unknown>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    body,
    params,
    headers = {},
    skipAuth = false,
    skipRetry = false,
    ...restOptions
  } = options;

  const url = buildCanonicalUrl(endpoint, params);

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  // Auto-inject JWT session token
  if (!skipAuth) {
    const token = getAuthToken();
    if (token && !reqHeaders['Authorization']) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const fetchInit: RequestInit = {
    ...restOptions,
    headers: reqHeaders,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  };

  const response = await fetch(url, fetchInit);

  // Auto-retry once on 401 Unauthorized after token refresh
  if (response.status === 401 && !skipRetry && !skipAuth) {
    const refreshedToken = await refreshAuthSession();
    if (refreshedToken) {
      return request<T>(endpoint, {
        ...options,
        skipRetry: true,
      });
    }
  }

  // Parse response body
  let responseData: any = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
  } else {
    responseData = await response.text();
  }

  if (!response.ok) {
    const message =
      (responseData && typeof responseData === 'object' && (responseData.message || responseData.error)) ||
      `Request failed with status ${response.status}`;
    const code =
      (responseData && typeof responseData === 'object' && responseData.code) ||
      `HTTP_${response.status}`;

    throw new ApiError({
      status: response.status,
      code,
      message,
      details: responseData,
    });
  }

  return responseData as T;
}

/**
 * High-level typed HTTP method helpers
 */
export const apiClient = {
  get: <T = unknown>(endpoint: string, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...options, method: 'PUT', body }),

  patch: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T = unknown>(endpoint: string, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};

export default apiClient;
