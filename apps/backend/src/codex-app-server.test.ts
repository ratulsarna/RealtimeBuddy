import assert from "node:assert/strict";
import { homedir } from "node:os";
import test from "node:test";

import {
  buildCodexAppServerArgs,
  buildQuestionPrompt,
  buildThreadStartParams,
  buildTurnStartParams,
} from "./codex-app-server";
import { resolveConfiguredPath } from "./persistent-config";

test("buildThreadStartParams anchors the Codex thread in the vault cwd", async () => {
  const params = await buildThreadStartParams({
    developerInstructions: "You are RealtimeBuddy.",
    modelPromise: Promise.resolve("gpt-5.4"),
    workingDirectory: "/Users/ratulsarna/Vault/ObsidianVault",
  });

  assert.equal(params.cwd, "/Users/ratulsarna/Vault/ObsidianVault");
  assert.equal(params.sandbox, "danger-full-access");
  assert.equal(params.approvalPolicy, "never");
  assert.equal(params.developerInstructions, "You are RealtimeBuddy.");
});

test("buildCodexAppServerArgs starts the app-server in full-access mode", () => {
  assert.deepEqual(buildCodexAppServerArgs(), [
    "app-server",
    "--listen",
    "stdio://",
    "-c",
    'sandbox_mode="danger-full-access"',
    "-c",
    'approval_policy="never"',
    "-c",
    'model_reasoning_effort="high"',
  ]);
});

test("buildTurnStartParams applies the configured reasoning effort to each turn", async () => {
  process.env.CODEX_REASONING_EFFORT = "medium";

  try {
    const params = await buildTurnStartParams({
      inputText: "Summarize the meeting.",
      modelPromise: Promise.resolve("gpt-5.4"),
      threadId: "thread-123",
      workingDirectory: "/Users/ratulsarna/Vault/ObsidianVault",
    });

    assert.equal(params.threadId, "thread-123");
    assert.equal(params.cwd, "/Users/ratulsarna/Vault/ObsidianVault");
    assert.equal(params.model, "gpt-5.4");
    assert.equal(params.effort, "medium");
    assert.deepEqual(params.input, [
      {
        type: "text",
        text: "Summarize the meeting.",
        text_elements: [],
      },
    ]);
  } finally {
    delete process.env.CODEX_REASONING_EFFORT;
  }
});

test("buildQuestionPrompt keeps the meeting snapshot primary while exposing the working directory", () => {
  const prompt = buildQuestionPrompt({
    context: "Current transcript context",
    question: "What does the vault say about the mascot?",
    workingDirectory: "/Users/ratulsarna/Vault/ObsidianVault",
  });

  assert.match(prompt, /Current meeting snapshot:/);
  assert.match(prompt, /Local working directory:/);
  assert.match(prompt, /Answer using the transcript and note context above first/);
  assert.match(prompt, /explicitly asks about the working tree, a file/);
  assert.doesNotMatch(prompt, /RESPONSE_MODE:/);
});

test("resolveConfiguredPath expands a home-directory shorthand path", () => {
  assert.equal(resolveConfiguredPath("~/ObsidianVault", "/fallback"), `${homedir()}/ObsidianVault`);
  assert.equal(resolveConfiguredPath(undefined, "/fallback"), "/fallback");
});
