import assert from "node:assert/strict";
import { homedir } from "node:os";
import test from "node:test";

import { buildQuestionPrompt, buildThreadStartParams } from "./codex-app-server";
import { resolveConfiguredPath } from "./meeting-session";

test("buildThreadStartParams anchors the Codex thread in the vault cwd", async () => {
  const params = await buildThreadStartParams({
    modelPromise: Promise.resolve("gpt-5.4"),
    workingDirectory: "/Users/ratulsarna/Vault/ObsidianVault",
  });

  assert.equal(params.cwd, "/Users/ratulsarna/Vault/ObsidianVault");
  assert.equal(params.sandbox, "read-only");
});

test("buildQuestionPrompt keeps the live note primary while exposing the vault cwd", () => {
  const prompt = buildQuestionPrompt({
    context: "Current transcript context",
    question: "What does the vault say about the mascot?",
    workingDirectory: "/Users/ratulsarna/Vault/ObsidianVault",
  });

  assert.match(prompt, /Current live note:/);
  assert.match(prompt, /Obsidian vault working directory:/);
  assert.match(prompt, /Answer using the transcript and note context above first/);
});

test("resolveConfiguredPath expands a home-directory shorthand path", () => {
  assert.equal(resolveConfiguredPath("~/ObsidianVault", "/fallback"), `${homedir()}/ObsidianVault`);
  assert.equal(resolveConfiguredPath(undefined, "/fallback"), "/fallback");
});
