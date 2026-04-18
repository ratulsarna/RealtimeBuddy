import type { SessionLanguagePreference } from "@realtimebuddy/shared/language-preferences";

const BUDDY_RESPONSE_TYPES = [
  "ask_this",
  "cover_this",
  "needs_owner",
  "important_signal",
  "noop",
] as const;

export type BuddyResponseType = (typeof BUDDY_RESPONSE_TYPES)[number];

export type BuddyResponse = {
  shouldSurface: boolean;
  type: BuddyResponseType;
  title: string;
  body: string;
  suggestedQuestion: string | null;
};

export type BuddyParseFailure = {
  error: string;
  stage: "json_parse" | "schema_validation";
};

export type BuddyParseResult =
  | {
      ok: true;
      response: BuddyResponse;
      rawText: string;
    }
  | {
      ok: false;
      response: BuddyResponse;
      rawText: string;
      failure: BuddyParseFailure;
    };

type BuddyDeveloperInstructionsOptions = {
  includeTabAudio: boolean;
  languagePreference: SessionLanguagePreference;
  meetingSeed: string;
  meetingTitle: string;
  staticUserSeed: string;
  workingDirectory: string;
};

type BuddyPromptOptions = {
  context: string;
  trigger: string;
};

const NOOP_BUDDY_RESPONSE: BuddyResponse = {
  shouldSurface: false,
  type: "noop",
  title: "",
  body: "",
  suggestedQuestion: null,
};

export function buildBuddyDeveloperInstructions(
  options: BuddyDeveloperInstructionsOptions
) {
  const staticSeed = options.staticUserSeed || "None provided.";
  const meetingSeed = options.meetingSeed || "None provided.";

  return [
    "You are RealtimeBuddy, Ratul's AI co-chair during a live meeting.",
    "Your role is to quietly help Ratul in the moment, not narrate the meeting.",
    "",
    "Core behavior:",
    "- Stay quiet most of the time.",
    "- Surface only short, timely, actionable nudges.",
    "- Never explain chain-of-thought or hidden reasoning.",
    "- Ground claims in the live conversation or seeded context below.",
    "- If context is weak or uncertain, stay cautious.",
    "",
    "Allowed Buddy intervention types:",
    '- "ask_this": suggest a question Ratul may want to ask now.',
    '- "cover_this": remind Ratul to cover something important.',
    '- "needs_owner": flag a decision or task without a clear owner/next step.',
    '- "important_signal": highlight something important, inconsistent, or off-track.',
    "",
    "Response modes:",
    '- If the prompt says `RESPONSE_MODE: user_question`, answer in concise plain text. Do not use JSON.',
    '- If the prompt says `RESPONSE_MODE: buddy_event`, return exactly one JSON object and nothing else.',
    "",
    "Buddy JSON schema for `RESPONSE_MODE: buddy_event`:",
    '{',
    '  "shouldSurface": boolean,',
    '  "type": "ask_this" | "cover_this" | "needs_owner" | "important_signal" | "noop",',
    '  "title": string,',
    '  "body": string,',
    '  "suggestedQuestion": string | null',
    '}',
    "",
    "Schema rules:",
    '- Return strict JSON only. No markdown fences. No commentary before or after.',
    '- If nothing timely should be shown, return a no-op object with `shouldSurface: false`, `type: "noop"`, empty `title`, empty `body`, and `suggestedQuestion: null`.',
    "- If `shouldSurface` is true, choose exactly one non-noop type and keep `title` plus `body` short and scannable.",
    "- `suggestedQuestion` is optional and must be null when not needed.",
    "",
    "Meeting context:",
    `- Meeting title: ${options.meetingTitle}`,
    `- Audio sources: microphone${options.includeTabAudio ? " + tab audio" : ""}`,
    `- Preferred transcription language: ${options.languagePreference}`,
    `- Working directory: ${options.workingDirectory}`,
    "",
    "Static user seed:",
    staticSeed,
    "",
    "Dynamic meeting seed:",
    meetingSeed,
  ].join("\n");
}

export function buildBuddyTurnPrompt(options: BuddyPromptOptions) {
  return [
    "RESPONSE_MODE: buddy_event",
    "Return the required Buddy JSON object only.",
    "",
    `Trigger: ${options.trigger}`,
    "",
    "Conversation context:",
    options.context,
  ].join("\n");
}

export function parseBuddyResponse(rawText: string): BuddyParseResult {
  const normalized = stripCodeFence(rawText.trim());
  const parsed = parseBuddyJson(normalized);
  if (!parsed.ok) {
    return {
      ok: false,
      response: { ...NOOP_BUDDY_RESPONSE },
      rawText,
      failure: parsed.failure,
    };
  }

  const validated = validateBuddyResponse(parsed.value);
  if (!validated.ok) {
    return {
      ok: false,
      response: { ...NOOP_BUDDY_RESPONSE },
      rawText,
      failure: validated.failure,
    };
  }

  return {
    ok: true,
    response: validated.response,
    rawText,
  };
}

function stripCodeFence(text: string) {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text;
}

function parseBuddyJson(text: string):
  | { ok: true; value: unknown }
  | { ok: false; failure: BuddyParseFailure } {
  try {
    return {
      ok: true,
      value: JSON.parse(text),
    };
  } catch (error) {
    const objectSlice = extractObjectSlice(text);
    if (!objectSlice) {
      return {
        ok: false,
        failure: {
          error: `Could not parse Buddy JSON: ${String(error)}`,
          stage: "json_parse",
        },
      };
    }

    try {
      return {
        ok: true,
        value: JSON.parse(objectSlice),
      };
    } catch (nestedError) {
      return {
        ok: false,
        failure: {
          error: `Could not parse Buddy JSON: ${String(nestedError)}`,
          stage: "json_parse",
        },
      };
    }
  }
}

function extractObjectSlice(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

function validateBuddyResponse(value: unknown):
  | { ok: true; response: BuddyResponse }
  | { ok: false; failure: BuddyParseFailure } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      failure: {
        error: "Buddy response must be a JSON object.",
        stage: "schema_validation",
      },
    };
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.shouldSurface !== "boolean") {
    return invalidSchema("`shouldSurface` must be a boolean.");
  }

  if (typeof candidate.type !== "string" || !isBuddyResponseType(candidate.type)) {
    return invalidSchema(
      "`type` must be one of ask_this, cover_this, needs_owner, important_signal, noop."
    );
  }

  if (typeof candidate.title !== "string") {
    return invalidSchema("`title` must be a string.");
  }

  if (typeof candidate.body !== "string") {
    return invalidSchema("`body` must be a string.");
  }

  if (
    candidate.suggestedQuestion !== null &&
    candidate.suggestedQuestion !== undefined &&
    typeof candidate.suggestedQuestion !== "string"
  ) {
    return invalidSchema("`suggestedQuestion` must be a string or null.");
  }

  const title = candidate.title.trim();
  const body = candidate.body.trim();
  const suggestedQuestion =
    typeof candidate.suggestedQuestion === "string"
      ? candidate.suggestedQuestion.trim() || null
      : null;

  if (!candidate.shouldSurface) {
    return {
      ok: true,
      response: { ...NOOP_BUDDY_RESPONSE },
    };
  }

  if (candidate.type === "noop") {
    return invalidSchema("Visible Buddy responses cannot use the noop type.");
  }

  if (!title) {
    return invalidSchema("Visible Buddy responses must include a non-empty title.");
  }

  if (!body) {
    return invalidSchema("Visible Buddy responses must include a non-empty body.");
  }

  return {
    ok: true,
    response: {
      shouldSurface: true,
      type: candidate.type,
      title,
      body,
      suggestedQuestion,
    },
  };
}

function invalidSchema(error: string) {
  return {
    ok: false as const,
    failure: {
      error,
      stage: "schema_validation" as const,
    },
  };
}

function isBuddyResponseType(value: string): value is BuddyResponseType {
  return BUDDY_RESPONSE_TYPES.includes(value as BuddyResponseType);
}
