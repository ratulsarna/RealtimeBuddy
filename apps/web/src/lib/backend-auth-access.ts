const TAILSCALE_IPV6_PREFIX = "fd7a:115c:a1e0:";

export function isBackendAuthHostAllowed(hostHeader: string | null | undefined) {
  const hostname = normalizeHostHeader(hostHeader);
  if (!hostname) {
    return false;
  }

  return isLocalHostname(hostname) || isTailscaleHostname(hostname);
}

function normalizeHostHeader(hostHeader: string | null | undefined) {
  const rawHost = hostHeader?.trim().toLowerCase();
  if (!rawHost) {
    return undefined;
  }

  try {
    if (rawHost.includes("://")) {
      return stripTrailingDot(new URL(rawHost).hostname);
    }
  } catch {
    return undefined;
  }

  if (rawHost.startsWith("[")) {
    const closingBracketIndex = rawHost.indexOf("]");
    if (closingBracketIndex === -1) {
      return undefined;
    }

    return stripTrailingDot(rawHost.slice(1, closingBracketIndex));
  }

  if (rawHost.includes(":")) {
    const firstColonIndex = rawHost.indexOf(":");
    const lastColonIndex = rawHost.lastIndexOf(":");
    if (firstColonIndex === lastColonIndex) {
      return stripTrailingDot(rawHost.slice(0, firstColonIndex));
    }
  }

  return stripTrailingDot(rawHost);
}

function stripTrailingDot(hostname: string) {
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}

function isLocalHostname(hostname: string) {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    hostname === "::" ||
    hostname === "0.0.0.0"
  ) {
    return true;
  }

  const ipv4 = parseIpv4Address(hostname);
  return Boolean(ipv4 && ipv4[0] === 127);
}

function isTailscaleHostname(hostname: string) {
  if (hostname.endsWith(".ts.net")) {
    return true;
  }

  if (hostname.startsWith(TAILSCALE_IPV6_PREFIX)) {
    return true;
  }

  const ipv4 = parseIpv4Address(hostname);
  if (!ipv4) {
    return false;
  }

  return ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127;
}

function parseIpv4Address(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return undefined;
  }

  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN;
    }

    return Number(part);
  });

  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : undefined;
}
