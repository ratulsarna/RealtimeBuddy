import {
  resolveBackendHttpBaseUrl,
  resolveBackendWebSocketUrl,
} from "@realtimebuddy/shared/backend-connection";

export function resolveBrowserBackendConfig(options: {
  backendAccessToken?: string;
  backendBaseUrl?: string;
  pageUrl: string;
}) {
  const httpBaseUrl = resolveBackendHttpBaseUrl({
    explicitBackendBaseUrl: options.backendBaseUrl,
    pageUrl: options.pageUrl,
  });

  return {
    displayUrl: httpBaseUrl.toString().replace(/\/$/, ""),
    webSocketUrl: resolveBackendWebSocketUrl({
      explicitBackendBaseUrl: options.backendBaseUrl,
      pageUrl: options.pageUrl,
      authToken: options.backendAccessToken,
    }),
  };
}
