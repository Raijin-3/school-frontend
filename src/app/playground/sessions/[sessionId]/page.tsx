import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { apiGet } from "@/lib/api";
import { PlaygroundQuizRunner } from "@/components/playground/playground_quiz_runner";

type PlaygroundSession = {
  id: string;
  subject: string;
  status: "pending" | "active" | "completed" | "canceled";
};

type PlaygroundQuizSet = {
  id: string;
  topic_id?: string | null;
  ai_response?: {
    mcq_set?: {
      confidence_rebuild?: Array<any>;
      stretch?: Array<any>;
      real_world_business_mcqs?: Array<any>;
    };
  };
};

type PlaygroundSessionDetail = {
  session: PlaygroundSession;
  topics: Array<{
    topic_id?: string | null;
    topic_name_snapshot: string;
  }>;
  quizSets?: PlaygroundQuizSet[];
  attempts?: Array<{
    question_id: number;
    selected_option?: string | null;
    is_correct?: boolean | null;
  }>;
};

type PlaygroundQuestion = {
  questionId: number;
  question: string;
  options: Record<string, string>;
  correctOption: string;
  explanation: string;
  difficulty: string;
  topicName: string;
};

type PlaygroundSummary = {
  isComplete: boolean;
  correctCount: number;
  currentIndex: number;
  review: Array<{
    key: string;
    questionText: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }>;
};

const flattenQuestions = (detail: PlaygroundSessionDetail): PlaygroundQuestion[] => {
  const topicNameById = new Map(
    detail.topics
      .filter((topic) => topic.topic_id)
      .map((topic) => [String(topic.topic_id), topic.topic_name_snapshot]),
  );

  const output: PlaygroundQuestion[] = [];
  (detail.quizSets || []).forEach((quiz) => {
    const mcqSet = quiz.ai_response?.mcq_set;
    const topicName =
      (quiz.topic_id && topicNameById.get(String(quiz.topic_id))) || "Topic";
    const questions = [
      ...(mcqSet?.confidence_rebuild || []),
      ...(mcqSet?.stretch || []),
      ...(mcqSet?.real_world_business_mcqs || []),
    ];
    questions.forEach((q: any) => {
      const correctOption =
        typeof q.correct_option === "string"
          ? q.correct_option
          : q.correct_option?.label || "";
      output.push({
        questionId: Number(q.question_id),
        question: String(q.question || ""),
        options: q.options || {},
        correctOption,
        explanation: String(q.explanation || ""),
        difficulty: String(q.difficulty || ""),
        topicName,
      });
    });
  });
  return output;
};

const buildSummary = (
  detail: PlaygroundSessionDetail,
  questions: PlaygroundQuestion[],
): PlaygroundSummary => {
  const attemptsByQuestion = new Map<number, { selected?: string | null; isCorrect?: boolean | null }>();
  (detail.attempts || []).forEach((attempt) => {
    attemptsByQuestion.set(Number(attempt.question_id), {
      selected: attempt.selected_option ?? null,
      isCorrect: attempt.is_correct ?? null,
    });
  });

  const firstUnansweredIndex = questions.findIndex(
    (question) => !attemptsByQuestion.has(question.questionId),
  );
  const currentIndex =
    firstUnansweredIndex === -1
      ? Math.max(questions.length - 1, 0)
      : firstUnansweredIndex;

  if (detail.session.status !== "completed") {
    let correctCount = 0;
    const review = questions.flatMap((question, index) => {
      const attempt = attemptsByQuestion.get(question.questionId);
      if (!attempt) {
        return [];
      }
      const selected = attempt.selected ?? null;
      const isCorrect = attempt.isCorrect === true;
      if (isCorrect) {
        correctCount += 1;
      }
      const userAnswer = selected
        ? question.options?.[selected] ?? selected
        : "No answer";
      const correctAnswer = question.options?.[question.correctOption] ?? question.correctOption;
      return [
        {
          key: `${question.questionId}-${index}`,
          questionText: question.question,
          userAnswer,
          correctAnswer,
          isCorrect,
        },
      ];
    });

    return { isComplete: false, correctCount, review, currentIndex };
  }

  let correctCount = 0;
  const review = questions.map((question, index) => {
    const attempt = attemptsByQuestion.get(question.questionId);
    const selected = attempt?.selected ?? null;
    const isCorrect = attempt?.isCorrect === true;
    if (isCorrect) {
      correctCount += 1;
    }
    const userAnswer = selected
      ? question.options?.[selected] ?? selected
      : "No answer";
    const correctAnswer = question.options?.[question.correctOption] ?? question.correctOption;
    return {
      key: `${question.questionId}-${index}`,
      questionText: question.question,
      userAnswer,
      correctAnswer,
      isCorrect,
    };
  });

  return {
    isComplete: true,
    correctCount,
    currentIndex,
    review,
  };
};

export default async function PlaygroundSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { sessionId } = await params;
  const detail = await apiGet<PlaygroundSessionDetail>(
    `/v1/playground/sessions/${sessionId}`,
  );

  const questions = flattenQuestions(detail);
  const summary = buildSummary(detail, questions);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <PlaygroundQuizRunner
          sessionId={detail.session.id}
          subject={detail.session.subject}
          questions={questions}
          summary={summary}
        />
      </div>
    </div>
  );
}
