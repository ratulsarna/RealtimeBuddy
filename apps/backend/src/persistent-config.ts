import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type PersistentConfig = {
  staticUserSeed?: string;
};

export const DEFAULT_REALTIMEBUDDY_HOME = path.join(homedir(), ".realtimebuddy");
export const REALTIMEBUDDY_BASE_PATH_ENV = "REALTIMEBUDDY_BASE_PATH";

export function resolveConfiguredPath(
  configuredPath: string | undefined,
  fallbackPath: string
) {
  const trimmedPath = configuredPath?.trim();
  if (!trimmedPath) {
    return fallbackPath;
  }

  if (trimmedPath === "~") {
    return homedir();
  }

  if (trimmedPath.startsWith("~/") || trimmedPath.startsWith("~\\")) {
    return path.join(homedir(), trimmedPath.slice(2));
  }

  return trimmedPath;
}

export function resolveRealtimeBuddyBasePath(configuredPath: string | undefined) {
  return resolveConfiguredPath(configuredPath, DEFAULT_REALTIMEBUDDY_HOME);
}

export function readConfiguredBasePathEnv(env = process.env) {
  return env[REALTIMEBUDDY_BASE_PATH_ENV]?.trim();
}

export function resolvePersistentConfigPath(homePath = DEFAULT_REALTIMEBUDDY_HOME) {
  return path.join(homePath, "config.json");
}

export async function readPersistentConfig(
  configPath = resolvePersistentConfigPath()
): Promise<PersistentConfig> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as { staticUserSeed?: unknown };
    const staticUserSeed = normalizeStaticUserSeed(parsed.staticUserSeed);

    return staticUserSeed ? { staticUserSeed } : {};
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return {};
    }

    throw error;
  }
}

export async function writePersistentConfig(
  config: PersistentConfig,
  configPath = resolvePersistentConfigPath()
): Promise<PersistentConfig> {
  await mkdir(path.dirname(configPath), { recursive: true });

  const normalizedConfig = normalizePersistentConfig(config);
  await writeFile(configPath, `${JSON.stringify(normalizedConfig, null, 2)}\n`, "utf8");

  return normalizedConfig;
}

function normalizePersistentConfig(config: PersistentConfig): PersistentConfig {
  const staticUserSeed = normalizeStaticUserSeed(config.staticUserSeed);

  return staticUserSeed ? { staticUserSeed } : {};
}

function normalizeStaticUserSeed(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function isErrorWithCode(error: unknown, code: string) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === code
  );
}
