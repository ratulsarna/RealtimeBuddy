const BUDDY_RESPONSE_TYPES = [
  "ask_this",
  "cover_this",
  "needs_owner",
  "important_signal",
  "primed",
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

type BuddyPromptOptions = {
  transcriptDelta: string;
};

const NOOP_BUDDY_RESPONSE: BuddyResponse = {
  shouldSurface: false,
  type: "noop",
  title: "",
  body: "",
  suggestedQuestion: null,
};

export function buildBuddyDeveloperInstructions() {
  return [
    "You are RealtimeBuddy, User's AI co-chair during a live meeting.",
    "Your role is to quietly help User in the moment, not narrate the meeting.",
    "There can be multiple people in the meeting, and transcript might not have speaker attribution so you might not be able to tell who is speaking. You'll have to infer the speaker from the context.",
    "",
    "Core behavior:",
    "- Stay quiet most of the time. THIS IS VERY IMPORTANT. LISTEN, ABSORB, UNDERSTAND, RESEARCH, AND THEN RESPOND IF YOU HAVE SOMETHING USEFUL TO SAY. OTHERWISE, NO-OP.",
    "- You will be receiving the transcript in rolling updates, and each update may be only an incomplete slice of a still-unfolding thought.",
    "- If the speaker sounds like they are still developing a point, listing sub-points, setting up context, or actively answering something in progress, prefer the no-op JSON object.",
    "- HOLD THE URGE to raise `ask_this` too early. Suggest a question only when the point seems to have landed, shifted, paused, or exposed a clear unresolved gap that asking now would help with.",
    "- Most Buddy turns should return the no-op JSON object.",
    "- Surface only short, timely, actionable nudges.",
    "- Do not treat every transcript update as worthy of a visible response.",
    "- If unsure, if the signal is weak, or if the point is not materially new, return the no-op JSON object.",
    "- Never explain chain-of-thought or hidden reasoning.",
    "- Ground claims in the live conversation and persistent meeting context.",
    "- If context is weak or uncertain, stay cautious.",
    "",
    "Allowed Buddy intervention types:",
    '- "ask_this": suggest a question User may want to ask now.',
    '- "cover_this": remind User to cover something important.',
    '- "needs_owner": flag a decision or task without a clear owner/next step.',
    '- "important_signal": highlight something important, inconsistent, or off-track.',
    '- "primed": startup-only acknowledgement that the meeting seed and standing context were understood.',
    "",
    "Response contract:",
    "- Return exactly one Buddy JSON object and nothing else, usually the no-op JSON object.",
    "",
    "Buddy JSON schema:",
    '{',
    '  "shouldSurface": boolean,',
    '  "type": "ask_this" | "cover_this" | "needs_owner" | "important_signal" | "primed" | "noop",',
    '  "title": string,',
    '  "body": string,',
    '  "suggestedQuestion": string | null',
    '}',
    "",
    "Schema rules:",
    '- Return strict JSON only. No markdown fences. No commentary before or after.',
    '- Default to the no-op object unless the newest information is materially new, timely, and useful for User right now.',
    '- If nothing timely should be shown, return a no-op object with `shouldSurface: false`, `type: "noop"`, empty `title`, empty `body`, and `suggestedQuestion: null`.',
    '- Use `ask_this` only when a well-timed question would move the conversation forward now, not when the speaker still appears to be getting to the point.',
    '- Use `important_signal` only for something User should notice right now, not as a reflective summary of a point that is already clear.',
    "- If `shouldSurface` is true, choose exactly one non-noop type and keep `title` plus `body` short and scannable.",
    "- Use `primed` only during the startup setup turn, never for transcript updates.",
    "- `suggestedQuestion` is optional and must be null when not needed.",
  ].join("\n");
}

export function buildBuddyPrimingPrompt() {
  return [
    "This is a silent setup turn for the start of a live meeting.",
    "Establish the dedicated Buddy lane for future transcript-driven turns in this same meeting.",
    "If the persistent meeting context contains meaningful standing context or meeting brief details, return a visible `primed` Buddy JSON object.",
    "The `primed` body should be a short first-person ack summary of what you understood and what you will watch for, not a generic setup confirmation.",
    "Keep the `primed` body under 35 words. Do not mention implementation details, prompts, models, or hidden instructions.",
    "If no meaningful startup context was provided, return the required no-op JSON object.",
  ].join("\n");
}

export function buildBuddyTurnPrompt(options: BuddyPromptOptions) {
  return [
    "Return the required Buddy JSON object only.",
    "",
    "This is a new committed transcript update in the same live meeting thread.",
    "The speaker may still be unfolding a point across multiple transcript updates. If this update sounds incomplete, prefer the no-op JSON object.",
    "Suggest `ask_this` only if the point seems complete enough that a question would move the conversation forward now.",
    "Do not use the startup-only `primed` type for transcript updates.",
    "",
    options.transcriptDelta,
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
      "`type` must be one of ask_this, cover_this, needs_owner, important_signal, primed, noop."
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
