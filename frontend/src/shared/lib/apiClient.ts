import { env } from "@/shared/config/environment";
import { APIError } from "@/shared/errors/errors";

const ACCESS_TOKEN_KEY = "samadhan_access_token";
const REFRESH_TOKEN_KEY = "samadhan_refresh_token";

export const tokenStore = {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return null;

  let resp: Response;
  try {
    resp = await fetch(`${env.apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // The network dropped mid-refresh. The refresh token is probably still
    // valid, so keep it — clearing here would sign the user out for what is
    // really a connectivity blip. The caller falls through to the 401 branch.
    return null;
  }
  if (!resp.ok) {
    tokenStore.clear();
    return null;
  }
  const data = await resp.json().catch(() => null);
  if (!data?.accessToken) {
    tokenStore.clear();
    return null;
  }
  tokenStore.setTokens(data.accessToken, refreshToken);
  return data.accessToken as string;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  /** Override the default request timeout. */
  timeoutMs?: number;
}

/** A request that never returns is worse than one that fails — bound the wait. */
const DEFAULT_TIMEOUT_MS = 20000;

/**
 * What the user is told when the server sends no usable message of its own.
 *
 * Every entry names the actual problem and the next step. A bare
 * "Request failed: 409" tells a citizen nothing they can act on.
 */
function fallbackMessageFor(status: number): string {
  switch (status) {
    case 400:
      return "Some of the details in this request weren't valid. Check the form and try again.";
    case 403:
      return "You don't have permission to do that. If you think you should, contact your administrator.";
    case 404:
      return "We couldn't find what you were looking for. It may have been removed.";
    case 409:
      return "This conflicts with something that already exists. Refresh the page to see the latest state.";
    case 413:
      return "That upload is too large. Try a smaller file.";
    case 422:
      return "That action isn't allowed right now — the item may have already moved to another status. Refresh and try again.";
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "The Samadhan server ran into a problem. This is on our side — please try again shortly.";
    default:
      return status >= 500
        ? "The Samadhan server ran into a problem. Please try again shortly."
        : "That request couldn't be completed. Please try again.";
  }
}

/** Thin fetch wrapper: JSON in/out, auto Bearer token, one 401 refresh-and-retry. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) {
      const token = tokenStore.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    // AbortController turns a hung connection into a normal rejection, so the
    // caller gets an error state instead of a spinner that never stops.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${env.apiBaseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  const asNetworkError = (err: unknown): APIError => {
    if (err instanceof DOMException && err.name === "AbortError") {
      return new APIError("The server took too long to respond. Please try again.", 0);
    }
    // fetch() only rejects on network-level failure.
    return new APIError(
      navigator.onLine
        ? "Can't reach the Samadhan server. Please try again in a moment."
        : "You appear to be offline. Reconnect and try again.",
      0
    );
  };

  let response: Response;
  try {
    response = await doFetch();
  } catch (err) {
    throw asNetworkError(err);
  }

  if (response.status === 401 && auth && tokenStore.getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      try {
        response = await doFetch();
      } catch (err) {
        throw asNetworkError(err);
      }
    }
  }

  // A 401 that survives the refresh attempt means the session is genuinely
  // gone. Clear it and announce that, so guards can send the user to sign in
  // instead of leaving a signed-in shell that fails every request.
  if (response.status === 401 && auth) {
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent("samadhan_session_expired"));
    throw new APIError("Your session has expired. Please sign in again.", 401);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    let message: string = errorBody?.error?.message || fallbackMessageFor(response.status);

    // Rate limiting is the one case where we can tell the user exactly how
    // long to wait, so prefer that over any generic server message.
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        const wait = retryAfter < 60 ? `${retryAfter} seconds` : `${Math.ceil(retryAfter / 60)} minutes`;
        message = `Too many requests. Please wait ${wait} and try again.`;
      }
    }

    throw new APIError(message, response.status, errorBody);
  }

  if (response.status === 204) return undefined as T;

  // A 2xx with an unparseable body is a server bug, but it must not surface as
  // a raw SyntaxError from deep inside the JSON parser.
  try {
    return (await response.json()) as T;
  } catch {
    throw new APIError("The server sent a response we couldn't read. Please try again.", response.status);
  }
}
