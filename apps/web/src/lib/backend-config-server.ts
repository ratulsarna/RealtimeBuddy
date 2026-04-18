import { createBackendAccessToken } from "@realtimebuddy/shared/backend-auth";
import { BACKEND_TOKEN_QUERY_PARAM } from "@realtimebuddy/shared/backend-connection";

export type BuddyConfig = {
  staticUserSeed?: string;
};

const DEFAULT_BACKEND_BASE_URL = "http://localhost:3001";

export async function fetchBuddyConfig() {
  const response = await fetch(createAuthorizedBackendUrl("/config"), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Could not load Buddy config (${response.status}).`);
  }

  return (await response.json()) as BuddyConfig;
}

export async function saveBuddyConfig(config: BuddyConfig) {
  const response = await fetch(createAuthorizedBackendUrl("/config"), {
    body: JSON.stringify(config),
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error(`Could not save Buddy config (${response.status}).`);
  }

  return (await response.json()) as BuddyConfig;
}

function createAuthorizedBackendUrl(pathname: string) {
  const backendBaseUrl = process.env.BACKEND_BASE_URL?.trim() || DEFAULT_BACKEND_BASE_URL;
  const backendAuthToken = process.env.BACKEND_AUTH_TOKEN?.trim();
  if (!backendAuthToken) {
    throw new Error("BACKEND_AUTH_TOKEN is not configured for the web app.");
  }

  const url = new URL(pathname, backendBaseUrl);
  url.searchParams.set(
    BACKEND_TOKEN_QUERY_PARAM,
    createBackendAccessToken(backendAuthToken)
  );

  return url;
}
