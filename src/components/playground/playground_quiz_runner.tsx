"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Circle, Loader2 } from "lucide-react";
import { LoadingLinkButton } from "@/components/playground/loading-link-button";
import { apiPost } from "@/lib/api-client";
import DOMPurify from "dompurify";

type PlaygroundQuestion = {
  questionId: number;
  question: string;
  options: Record<string, string>;
  correctOption: string;
  explanation: string;
  difficulty: string;
  topicName: string;
};

type PlaygroundQuizRunnerProps = {
  sessionId: string;
  subject: string;
  questions: PlaygroundQuestion[];
  summary?: {
    isComplete: boolean;
    correctCount: number;
    review: ReviewEntry[];
    currentIndex: number;
  };
};

type ReviewEntry = {
  key: string;
  questionText: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
};

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "strong",
    "em",
    "b",
    "i",
    "sup",
    "sub",
    "pre",
    "code",
    "br",
    "p",
    "table",
    "tr",
    "td",
    "th",
    "tbody",
    "thead",
    "tfoot",
    "ul",
    "ol",
    "li",
  ],
  ALLOWED_ATTR: [],
};

const CODE_BLOCK_REGEX = /```([\w+-]+)?[\r\n]?([\s\S]*?)```/g;
const ADAPTIVE_TABLE_CLASS =
  "aq-table w-full border border-slate-200 border-collapse rounded-lg my-4 text-sm text-slate-800";
const ADAPTIVE_TABLE_HEADER_CLASS =
  "aq-table-header border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold";
const ADAPTIVE_TABLE_CELL_CLASS =
  "aq-table-cell border border-slate-200 px-3 py-2";

const escapeQuestionHtml = (value: string): string => {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

const formatQuestionHtml = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return typeof value === "string" ? value : "";
  }

  const normalized = value.replace(/\\n/g, "\n");

  return normalized.replace(CODE_BLOCK_REGEX, (_match, _language, codeBlock = "") => {
    const normalizedCode = String(codeBlock)
      .replace(/^\s*\r?\n/, "")
      .replace(/\r?\n\s*$/, "");
    const escapedCode = escapeQuestionHtml(normalizedCode);
    return `<pre><code>${escapedCode}</code></pre>`;
  });
};

const appendClassToTag = (html: string, tagName: string, className: string) => {
  const regex = new RegExp(`<${tagName}([^>]*)>`, "gi");
  return html.replace(regex, (match, attrs) => {
    const classRegex = /class\s*=\s*(['"])(.*?)\1/i;
    if (classRegex.test(attrs)) {
      return match.replace(classRegex, (_full, quote, existing) => {
        if (existing.includes(className)) {
          return `class=${quote}${existing}${quote}`;
        }
        return `class=${quote}${existing} ${className}${quote}`;
      });
    }
    return `<${tagName}${attrs} class="${className}">`;
  });
};

const enhanceAdaptiveTables = (html: string) => {
  if (!html || !/<table/i.test(html)) {
    return html;
  }

  const withTableClass = appendClassToTag(html, "table", ADAPTIVE_TABLE_CLASS);
  const withHeaderClass = appendClassToTag(withTableClass, "th", ADAPTIVE_TABLE_HEADER_CLASS);
  return appendClassToTag(withHeaderClass, "td", ADAPTIVE_TABLE_CELL_CLASS);
};

const sanitizeQuestionHTML = (html: unknown): string => {
  if (typeof html !== "string" || html.trim().length === 0) {
    return "";
  }

  const formatted = formatQuestionHtml(html);
  const sanitized = DOMPurify.sanitize(formatted, SANITIZE_CONFIG);
  return enhanceAdaptiveTables(sanitized);
};

export function PlaygroundQuizRunner({ sessionId, subject, questions, summary }: PlaygroundQuizRunnerProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(() => {
    const initialIndex = summary?.currentIndex ?? 0;
    if (!Number.isFinite(initialIndex)) return 0;
    return Math.max(0, Math.min(initialIndex, Math.max(questions.length - 1, 0)));
  });
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(summary?.correctCount ?? 0);
  const [review, setReview] = useState<ReviewEntry[]>(summary?.review ?? []);
  const [isComplete, setIsComplete] = useState(summary?.isComplete ?? false);
  const [skipPassCheck, setSkipPassCheck] = useState(false);
  const [passPrompt, setPassPrompt] = useState<{ scorePercent: number } | null>(null);
  const [isStopping, setIsStopping] = useState(false);

  const currentQuestion = questions[currentIndex];

  const renderHtml = (value: string, className?: string) => {
    const sanitized = sanitizeQuestionHTML(value);
    if (!sanitized) return null;
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  };
  const progress = useMemo(() => {
    if (!questions.length) return 0;
    return Math.round(((currentIndex + 1) / questions.length) * 100);
  }, [currentIndex, questions.length]);

  const resetForNext = () => {
    setSelectedOption(null);
    setIsSubmitted(false);
    setError(null);
  };

  const recordAnswer = async (isCorrect: boolean) => {
    const selectedOptionText = selectedOption
      ? currentQuestion.options?.[selectedOption] ?? selectedOption
      : null;
    return apiPost(`/v1/playground/sessions/${sessionId}/answer`, {
      questionId: currentQuestion.questionId,
      selectedOption,
      selectedOptionText,
      isCorrect,
      explanationShown: true,
      skipPassCheck,
    });
  };

  const completeSession = async () => {
    await apiPost(`/v1/playground/sessions/${sessionId}/complete`, {});
  };

  const handleSubmit = async () => {
    if (!selectedOption || isSubmitted || isSaving || !currentQuestion) return;
    setIsSaving(true);
    setError(null);
    const isCorrect = selectedOption === currentQuestion.correctOption;
    try {
      const result = await recordAnswer(isCorrect);
      const userAnswerText = selectedOption
        ? currentQuestion.options?.[selectedOption] ?? selectedOption
        : "No answer";
      const correctAnswerText =
        currentQuestion.options?.[currentQuestion.correctOption] ?? currentQuestion.correctOption;
      setReview((prev) => [
        ...prev,
        {
          key: `${currentQuestion.questionId}-${currentIndex}`,
          questionText: currentQuestion.question,
          userAnswer: userAnswerText,
          correctAnswer: correctAnswerText,
          isCorrect,
        },
      ]);
      setIsSubmitted(true);
      if (isCorrect) {
        setCorrectCount((prev) => prev + 1);
      }
      if (result?.passAchieved) {
        const score =
          typeof result.averageScorePercent === "number"
            ? result.averageScorePercent
            : 80;
        setPassPrompt({ scorePercent: score });
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save answer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = async () => {
    if (!isSubmitted || passPrompt) return;
    if (currentIndex + 1 >= questions.length) {
      try {
        setIsCompleting(true);
        await completeSession();
      } catch (err: any) {
        setError(err?.message || "Failed to complete session.");
        setIsCompleting(false);
        return;
      }
      setIsComplete(true);
      return;
    }
    setCurrentIndex((prev) => prev + 1);
    resetForNext();
  };

  if (questions.length < 3) {
    return null;
  }

  if (isComplete) {
    const scorePercent = questions.length
      ? Math.round((correctCount / questions.length) * 100)
      : 0;
    return (
      <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-lg backdrop-blur-xl">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {subject} Playground Summary
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            You answered {correctCount} of {questions.length} correctly ({scorePercent}%).
          </p>
        </div>
        <div className="mt-6 space-y-4">
          {review.map((item, index) => (
            <div
              key={item.key || index}
              className={`rounded-lg border p-4 ${
                item.isCorrect
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <div className="flex items-start justify-between">
                <p className="font-medium text-gray-900">Question {index + 1}</p>
              </div>
              <div className="mt-2 text-sm text-gray-700 prose prose-sm prose-slate max-w-none">
                {renderHtml(item.questionText)}
              </div>
              <div className="mt-3 text-sm">
                <span className="font-medium text-gray-700">Your answer: </span>
                <span
                  className={item.isCorrect ? "text-green-700 font-medium" : "text-red-700 font-medium"}
                  dangerouslySetInnerHTML={{
                    __html: item.userAnswer ? sanitizeQuestionHTML(item.userAnswer) : "No answer",
                  }}
                />
              </div>
              {!item.isCorrect && (
                <div className="mt-1 text-sm text-gray-700">
                  <span className="font-medium">Correct answer: </span>
                  <span
                    className="text-green-700 font-medium"
                    dangerouslySetInnerHTML={{
                      __html: item.correctAnswer
                        ? sanitizeQuestionHTML(item.correctAnswer)
                        : "Not provided",
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-center">
          <LoadingLinkButton
            href="/playground"
            label="Back to Playground"
            loadingLabel="Loading..."
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden p-6">
      {passPrompt && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/80 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white p-6 text-center shadow-xl">
            <div className="text-lg font-semibold text-emerald-700">Passed!</div>
            <p className="mt-2 text-sm text-gray-600">
              You’ve reached {Math.round(passPrompt.scorePercent)}% average score for this section.
              You can stop here or continue practicing.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => {
                  setPassPrompt(null);
                  setSkipPassCheck(true);
                }}
                className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isStopping) return;
                  setIsStopping(true);
                  router.push("/playground");
                }}
                disabled={isStopping}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isStopping ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Stopping...
                  </>
                ) : (
                  "Stop"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="text-sm text-gray-500">{subject} Playground</div>
          <div className="text-lg font-semibold text-gray-900 break-words">
            {currentQuestion.topicName}
          </div>
        </div>
        <div className="text-sm text-gray-600 shrink-0 whitespace-nowrap">
          {currentIndex + 1} / {questions.length}
        </div>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${progress}%` }}></div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            currentQuestion.difficulty === "easy"
              ? "bg-green-100 text-green-700"
              : currentQuestion.difficulty === "medium"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-red-100 text-red-700"
          }`}
        >
          {currentQuestion.difficulty || "N/A"}
        </span>
      </div>
      <div
        className="mb-6 text-lg font-medium text-gray-900 whitespace-pre-wrap prose prose-slate max-w-none"
        dangerouslySetInnerHTML={{
          __html: sanitizeQuestionHTML(currentQuestion.question),
        }}
      />

      <div className="space-y-3">
        {(["A", "B", "C", "D"] as const).map((key) => {
          const optionText = currentQuestion.options?.[key] ?? "";
          const isSelected = selectedOption === key;
          const isCorrect = isSubmitted && currentQuestion.correctOption === key;
          const isIncorrect = isSubmitted && isSelected && !isCorrect;
          const shouldHighlightCorrect = isSubmitted && isCorrect;
          const shouldHighlightIncorrectSelection = isSubmitted && isIncorrect;

          let optionStateClass =
            "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50";
          if (shouldHighlightCorrect) {
            optionStateClass = "border-green-500 bg-green-50";
          } else if (shouldHighlightIncorrectSelection) {
            optionStateClass = "border-red-400 bg-red-50";
          } else if (isSelected) {
            optionStateClass = "border-indigo-500 bg-indigo-50";
          }

          let indicatorClass = "border-gray-300";
          if (shouldHighlightCorrect) {
            indicatorClass = "border-green-500 bg-green-500";
          } else if (shouldHighlightIncorrectSelection) {
            indicatorClass = "border-red-500 bg-red-500";
          } else if (isSelected) {
            indicatorClass = "border-indigo-500 bg-indigo-500";
          }

          const showIndicatorDot = isSelected || shouldHighlightCorrect;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedOption(key)}
              disabled={isSubmitted}
              className={`w-full text-left p-4 rounded-lg border-2 transition ${optionStateClass} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${indicatorClass}`}
                >
                  {showIndicatorDot && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </div>
                <span
                  className="text-gray-900 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: sanitizeQuestionHTML(optionText) }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

      {isSubmitted && (
        <div
          className={`mt-6 p-4 rounded-lg border ${
            selectedOption === currentQuestion.correctOption
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {selectedOption === currentQuestion.correctOption ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <Circle className="h-5 w-5 text-red-600" />
            )}
            <span
              className={`font-semibold ${
                selectedOption === currentQuestion.correctOption ? "text-green-900" : "text-red-900"
              }`}
            >
              {selectedOption === currentQuestion.correctOption ? "Correct!" : "Incorrect"}
            </span>
          </div>
          <div
            className="text-sm text-gray-700 prose prose-sm prose-slate max-w-none"
            dangerouslySetInnerHTML={{
              __html: sanitizeQuestionHTML(currentQuestion.explanation),
            }}
          />
          {selectedOption !== currentQuestion.correctOption && (
            <p className="text-sm text-gray-700 mt-2">
              Correct answer:{" "}
              <span className="font-medium">
                {currentQuestion.options?.[currentQuestion.correctOption] ??
                  currentQuestion.correctOption}
              </span>
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        {!isSubmitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedOption || isSaving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? "Submit" : "Submit"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={isCompleting}
            className="px-6 py-2.5 bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {currentIndex + 1 >= questions.length ? (
              isCompleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Finishing...
                </>
              ) : (
                "Finish"
              )
            ) : (
              "Next"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
