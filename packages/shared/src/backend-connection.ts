export const DEFAULT_BACKEND_PORT = "3001";
export const BACKEND_TOKEN_QUERY_PARAM = "token";

type ResolveBackendConnectionOptions = {
  explicitBackendBaseUrl?: string;
  pageUrl: string;
  authToken?: string;
};

export function resolveBackendHttpBaseUrl(options: ResolveBackendConnectionOptions) {
  const url = options.explicitBackendBaseUrl
    ? new URL(options.explicitBackendBaseUrl)
    : new URL(options.pageUrl);

  if (!options.explicitBackendBaseUrl) {
    url.port = DEFAULT_BACKEND_PORT;
  }

  url.pathname = "/";
  url.search = "";
  url.hash = "";

  return url;
}

export function resolveBackendWebSocketUrl(options: ResolveBackendConnectionOptions) {
  const url = resolveBackendHttpBaseUrl(options);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";

  if (options.authToken) {
    url.searchParams.set(BACKEND_TOKEN_QUERY_PARAM, options.authToken);
  }

  return url.toString();
}

export function isAuthorizedRequestUrl(requestUrl: string | undefined, expectedToken?: string) {
  if (!requestUrl) {
    return false;
  }

  const url = new URL(requestUrl, "http://localhost");
  const actualToken = url.searchParams.get(BACKEND_TOKEN_QUERY_PARAM);

  if (!expectedToken || !actualToken) {
    return false;
  }

  return actualToken === expectedToken;
}
