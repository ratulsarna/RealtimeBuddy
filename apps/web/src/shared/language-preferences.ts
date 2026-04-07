export type SessionLanguagePreference = "auto" | "hindi" | "english" | "hinglish";

export const sessionLanguageOptions: Array<{
  value: SessionLanguagePreference;
  label: string;
}> = [
  { value: "auto", label: "Auto" },
  { value: "hindi", label: "Hindi" },
  { value: "english", label: "English" },
  { value: "hinglish", label: "Hinglish" },
];

export function getSessionLanguageLabel(languagePreference: SessionLanguagePreference) {
  return sessionLanguageOptions.find((option) => option.value === languagePreference)?.label ?? "Auto";
}

export function resolveRealtimeLanguageCode(languagePreference: SessionLanguagePreference) {
  switch (languagePreference) {
    case "english":
      return "en";
    case "hindi":
      return "hi";
    case "hinglish":
      // ElevenLabs expects ISO language codes, so bias Hinglish toward Hindi
      // rather than auto-detecting into Urdu-script output.
      return "hi";
    case "auto":
    default:
      return undefined;
  }
}
