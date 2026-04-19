import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_REALTIMEBUDDY_HOME,
  REALTIMEBUDDY_BASE_PATH_ENV,
  readConfiguredBasePathEnv,
  readPersistentConfig,
  resolveRealtimeBuddyBasePath,
  resolvePersistentConfigPath,
  writePersistentConfig,
} from "./persistent-config";

test("resolveRealtimeBuddyBasePath falls back to ~/.realtimebuddy", () => {
  assert.equal(resolveRealtimeBuddyBasePath(undefined), DEFAULT_REALTIMEBUDDY_HOME);
});

test("readConfiguredBasePathEnv prefers REALTIMEBUDDY_BASE_PATH", () => {
  assert.equal(
    readConfiguredBasePathEnv({
      [REALTIMEBUDDY_BASE_PATH_ENV]: "/tmp/new-base",
    }),
    "/tmp/new-base"
  );
});

test("readConfiguredBasePathEnv returns undefined when REALTIMEBUDDY_BASE_PATH is unset", () => {
  assert.equal(readConfiguredBasePathEnv({}), undefined);
});

test("readPersistentConfig returns an empty object when config.json does not exist", async () => {
  const homePath = await mkdtemp(path.join(tmpdir(), "realtimebuddy-config-missing-"));

  assert.deepEqual(await readPersistentConfig(resolvePersistentConfigPath(homePath)), {});
});

test("writePersistentConfig round-trips staticUserSeed", async () => {
  const homePath = await mkdtemp(path.join(tmpdir(), "realtimebuddy-config-roundtrip-"));
  const configPath = resolvePersistentConfigPath(homePath);

  await writePersistentConfig(
    {
      staticUserSeed: "User likes concise prompts.",
    },
    configPath
  );

  assert.deepEqual(await readPersistentConfig(configPath), {
    staticUserSeed: "User likes concise prompts.",
  });

  const raw = await readFile(configPath, "utf8");
  assert.match(raw, /staticUserSeed/);
});

test("writePersistentConfig clears blank standing context", async () => {
  const homePath = await mkdtemp(path.join(tmpdir(), "realtimebuddy-config-clear-"));
  const configPath = resolvePersistentConfigPath(homePath);

  await writePersistentConfig(
    {
      staticUserSeed: "   ",
    },
    configPath
  );

  assert.deepEqual(await readPersistentConfig(configPath), {});
  assert.equal(await readFile(configPath, "utf8"), "{}\n");
});
