export function buildPersistentContext(options: {
  meetingBrief: string;
  standingContext: string;
}) {
  const standingContext = options.standingContext.trim() || "None provided.";
  const meetingBrief = options.meetingBrief.trim() || "None provided.";

  return [
    "Standing context:",
    standingContext,
    "",
    "Meeting brief:",
    meetingBrief,
  ].join("\n");
}

export function appendPersistentContext(baseInstructions: string, persistentContext: string) {
  return [baseInstructions.trim(), "", persistentContext.trim()].join("\n");
}
