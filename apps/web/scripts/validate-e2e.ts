import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const FAKE_AUDIO_PATH = process.env.FAKE_AUDIO_PATH ?? "/tmp/realtimebuddy-e2e.wav";
const VAULT_PATH =
  process.env.OBSIDIAN_VAULT_PATH ?? "/Users/ratulsarna/Vault/ObsidianVault";
const title = `E2E Validation ${new Date().toISOString().slice(11, 19).replaceAll(":", "-")}`;

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${FAKE_AUDIO_PATH}`,
    ],
  });

  const context = await browser.newContext();
  await context.grantPermissions(["microphone"], {
    origin: APP_URL,
  });

  const page = await context.newPage();

  page.on("console", (message) => {
    const type = message.type();
    if (type === "error") {
      console.log(`[browser:${type}] ${message.text()}`);
    }
  });

  await page.goto(APP_URL, {
    waitUntil: "networkidle",
  });

  await page.getByLabel("Session Title").fill(title);

  const tabAudioCheckbox = page.getByRole("checkbox", { name: "Try tab audio too" });
  if (await tabAudioCheckbox.isChecked()) {
    await tabAudioCheckbox.uncheck();
  }

  await page.getByRole("button", { name: "Start listening" }).click();

  await page.waitForFunction(
    () => document.body.innerText.includes("Listening live on"),
    undefined,
    { timeout: 60_000 }
  );

  await page.waitForFunction(
    () => {
      const text = document.body.innerText.toLowerCase();
      return text.includes("friday") && text.includes("ratul");
    },
    undefined,
    { timeout: 60_000 }
  );

  await page.waitForFunction(
    () => {
      const text = document.body.innerText.toLowerCase();
      return !text.includes("0 commits") && !text.includes("waiting for the first committed transcript");
    },
    undefined,
    { timeout: 60_000 }
  );

  const transcriptCommitsBeforePause = await page.evaluate(() => {
    const match = document.body.innerText.match(/(\d+) commits/);
    return match ? Number(match[1]) : 0;
  });

  await page.getByRole("button", { name: "Pause" }).click();

  await page.waitForFunction(
    () => document.body.innerText.includes("Capture paused. Resume when you are ready."),
    undefined,
    { timeout: 30_000 }
  );

  await page.getByRole("button", { name: "Resume" }).click();

  await page.waitForFunction(
    () => document.body.innerText.includes("Listening live on"),
    undefined,
    { timeout: 60_000 }
  );

  await page.waitForFunction(
    (previousCommitCount) => {
      const match = document.body.innerText.match(/(\d+) commits/);
      return match ? Number(match[1]) > Number(previousCommitCount) : false;
    },
    transcriptCommitsBeforePause,
    { timeout: 60_000 }
  );

  await page
    .getByRole("textbox", { name: "What did we decide about deadlines?" })
    .fill("When is the launch and who owns the demo?");

  await page.getByRole("button", { name: "Ask now" }).click();

  await page.waitForFunction(
    () => {
      const text = document.body.innerText.toLowerCase();
      return text.includes("1 answers") && text.includes("when is the launch and who owns the demo?");
    },
    undefined,
    { timeout: 60_000 }
  );

  await page.waitForFunction(
    () => {
      const text = document.body.innerText.toLowerCase();
      return text.includes("after the pause");
    },
    undefined,
    { timeout: 90_000 }
  );

  await mkdir("output/playwright", { recursive: true });
  await page.screenshot({
    path: "output/playwright/realtimebuddy-e2e.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Stop" }).click();
  await browser.close();

  await waitForExpectedNote();

  console.log("E2E validation passed.");
}

async function readLatestNote() {
  const today = new Date().toISOString().slice(0, 10);
  const noteDir = path.join(VAULT_PATH, "Notes", "Dated", today);
  const entries = await readdir(noteDir, { withFileTypes: true });
  const matching = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(title))
    .map((entry) => entry.name)
    .sort();

  if (matching.length === 0) {
    throw new Error(`Could not find note for session title "${title}" in ${noteDir}`);
  }

  const notePath = path.join(noteDir, matching[matching.length - 1]);
  console.log(`Validated note: ${notePath}`);
  return await readFile(notePath, "utf8");
}

async function waitForExpectedNote() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const note = await readLatestNote();
    if (hasExpectedContent(note)) {
      return note;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Obsidian note did not contain the expected transcript/Q&A content.");
}

function hasExpectedContent(note: string) {
  const normalized = note.toLowerCase();

  return (
    normalized.includes("friday") &&
    normalized.includes("ratul") &&
    normalized.includes("after the pause") &&
    normalized.includes("when is the launch and who owns the demo?") &&
    !note.includes("- Waiting for the first committed transcript.") &&
    !note.includes("- Transcript has not started yet.")
  );
}

void main();
