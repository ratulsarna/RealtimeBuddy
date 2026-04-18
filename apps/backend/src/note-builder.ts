type QuestionAnswer = {
  question: string;
  answer: string;
  askedAt: string;
};

type NoteContent = {
  title: string;
  questionAnswers: QuestionAnswer[];
};

export function buildMeetingNote(content: NoteContent): string {
  const questionAnswers = content.questionAnswers.slice(0, 6);

  const answers =
    questionAnswers.length > 0
      ? questionAnswers
          .map(
            (entry) =>
              `### ${entry.askedAt}\nQuestion: ${entry.question}\n\nAnswer:\n${entry.answer.trim()}`
          )
          .join("\n\n")
      : "No Buddy Q&A yet.";

  return [`# ${content.title}`, "", "## Buddy Q&A", answers, ""].join("\n");
}
