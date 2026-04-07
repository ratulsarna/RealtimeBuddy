type TranscriptSegment = {
  text: string;
  committedAt: string;
};

type ProvisionalSegment = {
  text: string;
  provisionalAt: string;
};

type QuestionAnswer = {
  question: string;
  answer: string;
  askedAt: string;
};

type NoteContent = {
  title: string;
  startedAt: string;
  includeTabAudio: boolean;
  transcriptSegments: TranscriptSegment[];
  provisionalSegments: ProvisionalSegment[];
  partialTranscript: string;
  questionAnswers: QuestionAnswer[];
};

export function buildMeetingNote(content: NoteContent): string {
  const latestNotes = content.transcriptSegments.slice(-8);
  const provisionalNotes = content.provisionalSegments.slice(-4);
  const questionAnswers = content.questionAnswers.slice(-6);
  const allLiveNotes = [...latestNotes, ...provisionalNotes];

  const liveNotes =
    allLiveNotes.length > 0
      ? allLiveNotes.map((segment) => `- ${segment.text}`).join("\n")
      : "- Waiting for the first committed transcript.";

  const transcript =
    content.transcriptSegments.length > 0 || content.provisionalSegments.length > 0
      ? [
          ...content.transcriptSegments.map(
            (segment) => `- [${segment.committedAt}] ${segment.text}`
          ),
          ...content.provisionalSegments.map(
            (segment) => `- [pending ${segment.provisionalAt}] ${segment.text}`
          ),
        ]
          .filter(Boolean)
          .join("\n")
      : "- Transcript has not started yet.";

  const currentSpeech = content.partialTranscript.trim()
    ? `### Live Speech\n${content.partialTranscript.trim()}\n`
    : "";

  const answers =
    questionAnswers.length > 0
      ? questionAnswers
          .map(
            (entry) =>
              `#### ${entry.askedAt}\nQuestion: ${entry.question}\n\nAnswer:\n${entry.answer.trim()}`
          )
          .join("\n\n")
      : "No questions asked yet.";

  return [
    `### ${content.title}`,
    "",
    "### Session",
    `- Started at ${content.startedAt}`,
    `- Audio sources: microphone${content.includeTabAudio ? " + tab audio" : ""}`,
    "",
    "### Live Notes",
    liveNotes,
    "",
    currentSpeech,
    "### Transcript",
    transcript,
    "",
    "### Buddy Q&A",
    answers,
    "",
  ].join("\n");
}
