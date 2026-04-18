import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type Page } from "playwright";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webAppDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(webAppDir, "..", "..");
const backendAppDir = path.join(repoRoot, "apps", "backend");

type ValidationEnv = {
  appUrl: string;
  fakeAudioPath: string;
  buddyBasePath: string;
  backendOutputPath: string;
};

type ValidationScenario = {
  title: string;
  fixturePath: string;
};

async function main() {
  await loadLocalEnvFiles();

  const env = resolveValidationEnv();
  await ensureFakeAudioFixture(env.fakeAudioPath);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${env.fakeAudioPath}`,
    ],
  });

  try {
    await runSingleClientValidation(browser, env);
    await runDualClientValidation(browser, env);
  } finally {
    await browser.close();
  }

  console.log("E2E validation passed.");
}

async function runSingleClientValidation(browser: Browser, env: ValidationEnv) {
  const scenario = createScenario(env, "Single Client E2E");
  await seedVaultFixture(scenario);

  const context = await browser.newContext();
  await context.grantPermissions(["microphone"], {
    origin: env.appUrl,
  });

  const page = await context.newPage();
  wireBrowserConsole(page);

  await openApp(page, env.appUrl);
  await configureSession(page, scenario.title);

  await page.getByRole("button", { name: "Start meeting" }).click();

  await waitForSessionId(page);
  await waitForBodyText(page, ["1 / 0"], 60_000);
  await waitForBodyText(page, ["friday"], 60_000);
  await waitForBodyText(page, ["transcript has not started yet"], 60_000, true);

  await sessionActionButton(page, "Pause").click();
  await waitForBodyText(page, ["capture paused. resume when you are ready."], 30_000);

  await sessionActionButton(page, "Resume").click();
  await waitForBodyText(page, ["1 / 0"], 60_000);

  await askQuestion(page, "When is the launch and who owns the demo?");
  await waitForAskCycle(page, [], 90_000);

  await askQuestion(
    page,
    `Open the vault file .realtimebuddy-e2e/${scenario.title} Codex Context.md and answer with only the exact mascot.`
  );
  await waitForAskCycle(page, ["lantern", "otter"], 90_000);

  await takeScreenshot(page, "single-client");

  await sessionActionButton(page, "Stop").click();
  await waitForBodyText(page, ["session stopped."], 30_000);
  await context.close();

  await waitForExpectedNote(env, scenario.title, [
    "friday",
    "when is the launch and who owns the demo?",
    "lantern",
    "otter",
  ]);
  await waitForExpectedLog(env, scenario.title);
}

async function runDualClientValidation(browser: Browser, env: ValidationEnv) {
  const scenario = createScenario(env, "Dual Client E2E");
  await seedVaultFixture(scenario);

  const captureContext = await browser.newContext();
  await captureContext.grantPermissions(["microphone"], {
    origin: env.appUrl,
  });
  const capturePage = await captureContext.newPage();
  wireBrowserConsole(capturePage);

  await openApp(capturePage, env.appUrl);
  await configureSession(capturePage, scenario.title);
  await capturePage.getByRole("button", { name: "Start meeting" }).click();

  await waitForSessionId(capturePage);
  await waitForBodyText(capturePage, ["1 / 0"], 60_000);
  await waitForBodyText(capturePage, ["friday"], 60_000);

  const sessionId = await waitForSessionId(capturePage);

  const companionContext = await browser.newContext();
  await companionContext.grantPermissions(["microphone"], {
    origin: env.appUrl,
  });
  const companionPage = await companionContext.newPage();
  wireBrowserConsole(companionPage);

  await openApp(companionPage, `${env.appUrl}/?session=${sessionId}`);
  await waitForBodyText(companionPage, [sessionId.toLowerCase(), "friday", "1 / 1"], 60_000);

  await sessionActionButton(capturePage, "Pause").click();
  await waitForBodyText(companionPage, ["capture paused on the active recording source."], 30_000);

  await sessionActionButton(capturePage, "Resume").click();
  await waitForBodyText(companionPage, ["capture resumed on the active recording source."], 60_000);

  await askQuestion(companionPage, "Who owns the demo and when is the launch?");
  await waitForAskCycle(companionPage, [], 90_000);

  await sessionActionButton(companionPage, "Leave").click();
  await waitForBodyText(companionPage, ["disconnected from the live session."], 30_000);
  await waitForBodyText(capturePage, ["1 / 0"], 60_000);

  await openApp(companionPage, `${env.appUrl}/?session=${sessionId}`);
  await waitForBodyText(companionPage, ["1 / 1"], 60_000);

  await takeScreenshot(companionPage, "dual-client");

  await sessionActionButton(capturePage, "Stop").click();
  await waitForBodyText(companionPage, ["session stopped."], 30_000);

  await companionContext.close();
  await captureContext.close();

  await waitForExpectedNote(env, scenario.title, [
    "friday",
    "who owns the demo and when is the launch?",
  ]);
  await waitForExpectedLog(env, scenario.title);
}

function createScenario(env: ValidationEnv, label: string): ValidationScenario {
  const timeLabel = new Date().toISOString().slice(11, 19).replaceAll(":", "-");
  const title = `${label} ${timeLabel}`;

  return {
    title,
    fixturePath: path.join(
      env.buddyBasePath,
      ".realtimebuddy-e2e",
      `${title} Codex Context.md`
    ),
  };
}

async function configureSession(page: Page, title: string) {
  await page.getByLabel("Session Title").fill(title);
  await page.getByLabel("Language").selectOption("english");
}

async function askQuestion(page: Page, question: string) {
  const input = page.getByLabel("Ask Buddy a question");
  await input.fill(question);
  await page.getByRole("button", { name: "Ask" }).click();
}

function sessionActionButton(page: Page, name: string) {
  return page.locator("header").getByRole("button", { name });
}

async function waitForAskCycle(page: Page, patterns: string[], timeout: number) {
  if (patterns.length > 0) {
    await waitForBodyText(page, patterns, timeout);
  }
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return !buttons.some((button) => button.textContent?.trim() === "Asking...");
  }, undefined, { timeout });
}

async function openApp(page: Page, targetUrl: string) {
  await page.goto(targetUrl, {
    waitUntil: "networkidle",
  });
}

async function waitForSessionId(page: Page) {
  await page.waitForFunction(() => new URL(window.location.href).searchParams.has("session"), undefined, {
    timeout: 60_000,
  });

  const sessionId = new URL(page.url()).searchParams.get("session")?.trim() ?? "";
  if (!sessionId) {
    throw new Error("Could not read the active session ID from the page URL.");
  }

  return sessionId;
}

async function waitForBodyText(
  page: Page,
  patterns: string[],
  timeout: number,
  negate = false
) {
  const normalizedPatterns = patterns.map((pattern) => pattern.toLowerCase());
  await page.waitForFunction(
    ({ expectedPatterns, shouldNegate }: { expectedPatterns: string[]; shouldNegate: boolean }) => {
      const text = document.body.innerText.toLowerCase();
      return shouldNegate
        ? expectedPatterns.every((pattern) => !text.includes(pattern))
        : expectedPatterns.every((pattern) => text.includes(pattern));
    },
    { expectedPatterns: normalizedPatterns, shouldNegate: negate },
    { timeout }
  );
}

function wireBrowserConsole(page: Page) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.log(`[browser:error] ${message.text()}`);
    }
  });
}

async function takeScreenshot(page: Page, slug: string) {
  await mkdir(path.join(repoRoot, "output", "playwright"), { recursive: true });
  await page.screenshot({
    path: path.join(repoRoot, "output", "playwright", `realtimebuddy-${slug}.png`),
    fullPage: true,
  });
}

async function seedVaultFixture(scenario: ValidationScenario) {
  await mkdir(path.dirname(scenario.fixturePath), { recursive: true });
  await writeFile(
    scenario.fixturePath,
    [
      "# RAT-214 Codex Context",
      "",
      "This fixture exists so automated validation can confirm the Codex thread is rooted in the local RealtimeBuddy base path.",
      `The session title for this fixture is ${scenario.title}.`,
      "The exact launch mascot is Lantern Otter.",
      "",
    ].join("\n"),
    "utf8"
  );
}

async function waitForExpectedNote(
  env: ValidationEnv,
  title: string,
  expectedSnippets: string[]
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const note = await readLatestNote(env, title);
    if (hasExpectedContent(note, expectedSnippets)) {
      return note;
    }

    await delay(1_000);
  }

  throw new Error(`Note for "${title}" did not contain the expected content.`);
}

async function readLatestNote(env: ValidationEnv, title: string) {
  const today = new Date().toISOString().slice(0, 10);
  const noteDir = path.join(env.buddyBasePath, "Notes", "Dated", today);
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

async function waitForExpectedLog(env: ValidationEnv, title: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const log = await readLatestLog(env, title);
    if (hasExpectedLanguageConfig(log)) {
      return log;
    }

    await delay(1_000);
  }

  throw new Error(`Session log for "${title}" did not record the expected language configuration.`);
}

async function readLatestLog(env: ValidationEnv, title: string) {
  const today = new Date().toISOString().slice(0, 10);
  const logDir = path.join(env.backendOutputPath, today);
  const entries = await readdir(logDir, { withFileTypes: true });
  const matching = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(title))
    .map((entry) => entry.name)
    .sort();

  if (matching.length === 0) {
    throw new Error(`Could not find log for session title "${title}" in ${logDir}`);
  }

  const logPath = path.join(logDir, matching[matching.length - 1]);
  return await readFile(logPath, "utf8");
}

function hasExpectedContent(note: string, expectedSnippets: string[]) {
  const normalized = note.toLowerCase();
  return expectedSnippets.every((snippet) => normalized.includes(snippet.toLowerCase()));
}

function hasExpectedLanguageConfig(log: string) {
  return log.includes('"languagePreference":"english"') && log.includes('"languageCode":"en"');
}

async function ensureFakeAudioFixture(fakeAudioPath: string) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "realtimebuddy-e2e-audio-"));
  let speechSynthesisMode: "ffmpeg-flite" | "macos-say" | null = null;

  try {
    await mkdir(path.dirname(fakeAudioPath), { recursive: true });

    const segmentSpecs: Array<{ kind: "speech"; text: string } | { kind: "silence"; duration: number }> = [];
    for (let cycle = 0; cycle < 4; cycle += 1) {
      segmentSpecs.push(
        {
          kind: "speech",
          text: "Hello Ratul. The launch review is on Friday. Maya owns the demo.",
        },
        {
          kind: "silence",
          duration: 0.8,
        },
        {
          kind: "speech",
          text: "The launch mascot is Lantern Otter.",
        },
        {
          kind: "silence",
          duration: 1.0,
        },
        {
          kind: "speech",
          text: "After the pause, the launch is still Friday and Maya still owns the demo.",
        },
        {
          kind: "silence",
          duration: 1.2,
        }
      );
    }

    const segmentPaths: string[] = [];
    for (const [index, spec] of segmentSpecs.entries()) {
      const segmentPath = path.join(tempDir, `segment-${index}.wav`);
      segmentPaths.push(segmentPath);

      if (spec.kind === "speech") {
        speechSynthesisMode = await synthesizeSpeechSegment({
          segmentPath,
          tempDir,
          text: spec.text,
          mode: speechSynthesisMode,
        });
      } else {
        await runCommand("ffmpeg", [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=16000:cl=mono",
          "-t",
          String(spec.duration),
          "-ar",
          "16000",
          "-ac",
          "1",
          segmentPath,
        ]);
      }
    }

    const concatListPath = path.join(tempDir, "segments.txt");
    await writeFile(
      concatListPath,
      segmentPaths
        .map((segmentPath) => `file '${segmentPath.replaceAll("'", "'\\''")}'`)
        .join("\n"),
      "utf8"
    );

    await runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      fakeAudioPath,
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function synthesizeSpeechSegment(options: {
  segmentPath: string;
  tempDir: string;
  text: string;
  mode: "ffmpeg-flite" | "macos-say" | null;
}) {
  if (options.mode === "ffmpeg-flite") {
    await synthesizeSpeechWithFlite(options.text, options.segmentPath);
    return "ffmpeg-flite" as const;
  }

  if (options.mode === "macos-say") {
    await synthesizeSpeechWithMacSay(options.text, options.segmentPath, options.tempDir);
    return "macos-say" as const;
  }

  try {
    await synthesizeSpeechWithFlite(options.text, options.segmentPath);
    return "ffmpeg-flite" as const;
  } catch (fliteError) {
    try {
      await synthesizeSpeechWithMacSay(options.text, options.segmentPath, options.tempDir);
      return "macos-say" as const;
    } catch (sayError) {
      throw new Error(
        [
          "Could not synthesize the E2E speech fixture.",
          `ffmpeg/flite failed: ${String(fliteError)}`,
          `macOS say failed: ${String(sayError)}`,
        ].join(" ")
      );
    }
  }
}

async function synthesizeSpeechWithFlite(text: string, outputPath: string) {
  await runCommand("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `flite=text='${escapeFliteText(text)}':voice=slt`,
    "-ar",
    "16000",
    "-ac",
    "1",
    outputPath,
  ]);
}

async function synthesizeSpeechWithMacSay(
  text: string,
  outputPath: string,
  tempDir: string
) {
  const aiffPath = path.join(
    tempDir,
    `${path.basename(outputPath, path.extname(outputPath))}.aiff`
  );

  await runCommand("say", [
    "-v",
    "Samantha",
    "-o",
    aiffPath,
    text,
  ]);

  await runCommand("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    aiffPath,
    "-ar",
    "16000",
    "-ac",
    "1",
    outputPath,
  ]);
}

function escapeFliteText(text: string) {
  return text.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function runCommand(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          stderr.trim()
            ? `${command} exited with code ${code}: ${stderr.trim()}`
            : `${command} exited with code ${code}`
        )
      );
    });
  });
}

async function loadLocalEnvFiles() {
  const envPaths = [
    path.join(backendAppDir, ".env"),
    path.join(backendAppDir, ".env.local"),
    path.join(webAppDir, ".env"),
    path.join(webAppDir, ".env.local"),
  ];

  for (const envPath of envPaths) {
    await applyEnvFileIfPresent(envPath);
  }
}

async function applyEnvFileIfPresent(envPath: string) {
  try {
    await access(envPath);
  } catch {
    return;
  }

  const source = await readFile(envPath, "utf8");
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice(7) : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    const rawValue = normalizedLine.slice(separatorIndex + 1).trim();

    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = stripWrappingQuotes(rawValue);
  }
}

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function resolveValidationEnv(): ValidationEnv {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const fakeAudioPath =
    process.env.FAKE_AUDIO_PATH ?? path.join(os.tmpdir(), "realtimebuddy-e2e.wav");
  const buddyBasePath = expandHome(
    process.env.REALTIMEBUDDY_BASE_PATH ?? path.join(os.homedir(), ".realtimebuddy")
  );
  const backendOutputPath = expandHome(
    process.env.BACKEND_OUTPUT_PATH ?? path.join(backendAppDir, "output", "session-logs")
  );

  return {
    appUrl,
    fakeAudioPath,
    buddyBasePath,
    backendOutputPath,
  };
}

function expandHome(targetPath: string) {
  if (targetPath === "~") {
    return os.homedir();
  }

  if (targetPath.startsWith("~/")) {
    return path.join(os.homedir(), targetPath.slice(2));
  }

  return targetPath;
}

function delay(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

void main();
