export type SessionLanguagePreference = "auto" | "hindi" | "english" | "hinglish";

export const sessionLanguageOptions: Array<{
  value: SessionLanguagePreference;
  label: string;
}> = [
  { value: "auto", label: "Auto detect" },
  { value: "hindi", label: "Hindi" },
  { value: "english", label: "English" },
  { value: "hinglish", label: "Hinglish" },
];

export function getSessionLanguageLabel(preference: SessionLanguagePreference) {
  return sessionLanguageOptions.find((option) => option.value === preference)?.label ?? "Auto detect";
}

export function resolveRealtimeLanguageCode(
  preference: SessionLanguagePreference
) {
  if (preference === "auto") {
    return undefined;
  }

  if (preference === "english") {
    return "en";
  }

  // Hinglish speech still tends to be primarily Hindi in this workflow, and
  // biasing the recognizer that way avoids Urdu-script auto-detection more
  // reliably than leaving the language fully open-ended.
  return "hi";
}
