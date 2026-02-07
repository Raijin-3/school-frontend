"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { ChevronLeft, Loader2, MessageCircle, Send, Sparkles } from "lucide-react";

/** --- types: kept compatible with your existing component --- */
type MentorChatMessage = { role: "mentor" | "student"; content: string; created_at?: string | null };
type MentorChatSession = {
  question: { id: string; text: string };
  config: {
    context: string; // business context / scenario
    hypothesis: string;
    guidingQuestion: string;
    targetQuestions: string[];
    introMessage?: string | null;
  };
  chat: {
    id: string | null;
    status: "active" | "completed";
    messages: MentorChatMessage[];
    identified_questions: string[];
    final_summary?: string | null;
    completed_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  ai?: { message: string; identified_questions: string[]; status: "coaching" | "completed" };
  exercise?: { id?: string | null; title?: string | null; description?: string | null; content?: string | null };
  section?: { id?: string | null; title?: string | null; overview?: string | null };
  questions?: Array<{ id?: string | null; order?: number | null; text?: string | null }>;
};

interface PracticeMentorChatProps {
  exerciseId?: string;
  exerciseTitle: string;
  exerciseDescription?: string; // short subtitle under title
  sectionTitle?: string;
  questions: any[];
  activeQuestionId: string | null;
  sessions: Record<string, MentorChatSession | undefined>;
  loadingStates: Record<string, boolean>;
  sendingStates: Record<string, boolean>;
  errorStates: Record<string, string>;
  onSelectQuestion: (questionId: string, exerciseId?: string) => void;
  onLoadSession: (questionId: string, exerciseId?: string) => void;
  onSendMessage: (questionId: string, message: string, exerciseId?: string) => Promise<void> | void;
  emptyStateMessage?: string;
}

/* ---------------- helpers ---------------- */

const normalizeIdentifier = (value: unknown): string | null => {
  if (typeof value === "string") {
    const t = value.trim();
    return t ? t : null;
  }
  if (typeof value === "number") return String(value);
  return null;
};

const extractQuestionIdentifier = (candidate: unknown): string | null => {
  if (!candidate || typeof candidate !== "object") return null;
  return (
    normalizeIdentifier((candidate as any).id) ??
    normalizeIdentifier((candidate as any).question_id) ??
    normalizeIdentifier((candidate as any).questionId)
  );
};

/** very small "md-ish" → HTML pass for simple dashes → <ul><li>… */
const mdishLists = (text: string) => {
  const lines = text.split(/\r?\n/);
  let out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (/^\s*-\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${line.replace(/^\s*-\s+/, "")}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(line);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
};

const CHAT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "strong",
    "em",
    "b",
    "i",
    "code",
    "pre",
    "br",
    "p",
    "ul",
    "ol",
    "li",
  ],
  ALLOWED_ATTR: [],
} as const;

/** allow basic inline formatting without mangling stored HTML */
const sanitizeBasic = (html: string) => {
  if (typeof html !== "string" || html.trim().length === 0) {
    return "";
  }
  const normalized = html.replace(/\r\n/g, "\n");
  return DOMPurify.sanitize(normalized, CHAT_SANITIZE_CONFIG);
};

export function PracticeMentorChat(props: PracticeMentorChatProps) {
  const {
    exerciseId,
    exerciseTitle,
    exerciseDescription,
    sectionTitle,
    questions,
    activeQuestionId,
    sessions,
    loadingStates,
    sendingStates,
    errorStates,
    onSelectQuestion,
    onLoadSession,
    onSendMessage,
    emptyStateMessage,
  } = props;

  /* ---------- selection + session bootstrap ---------- */
  const fallbackQuestionId = useMemo(() => {
    if (activeQuestionId) return activeQuestionId;
    if (!questions?.length) return null;
    return extractQuestionIdentifier(questions[0]) ?? normalizeIdentifier((questions[0] as any)?.id);
  }, [activeQuestionId, questions]);

  useEffect(() => {
    if (!activeQuestionId && fallbackQuestionId) onSelectQuestion(fallbackQuestionId, exerciseId);
  }, [activeQuestionId, exerciseId, fallbackQuestionId, onSelectQuestion]);

  useEffect(() => {
    if (
      fallbackQuestionId &&
      !sessions[fallbackQuestionId] &&
      !loadingStates[fallbackQuestionId] &&
      !errorStates[fallbackQuestionId]
    ) {
      onLoadSession(fallbackQuestionId, exerciseId);
    }
  }, [errorStates, exerciseId, fallbackQuestionId, loadingStates, onLoadSession, sessions]);

  const activeQuestion = useMemo(() => {
    if (!fallbackQuestionId) return null;
    return questions.find(
      (q) =>
        (extractQuestionIdentifier(q) ?? normalizeIdentifier((q as { id?: unknown })?.id)) === fallbackQuestionId
    );
  }, [fallbackQuestionId, questions]);

  const session = fallbackQuestionId ? sessions[fallbackQuestionId] : undefined;

  const resolvedExerciseTitle = session?.exercise?.title || exerciseTitle;
  const resolvedExerciseDescription = session?.exercise?.description || exerciseDescription;
  const resolvedSectionTitle = session?.section?.title || sectionTitle;

  const isLoading = fallbackQuestionId ? Boolean(loadingStates[fallbackQuestionId]) : false;
  const isSubmitting = fallbackQuestionId ? Boolean(sendingStates[fallbackQuestionId]) : false;
  const errorMessage = fallbackQuestionId ? errorStates[fallbackQuestionId] : undefined;

  const guidingQuestion =
    session?.config?.guidingQuestion ||
    (typeof (activeQuestion as any)?.text === "string" ? (activeQuestion as any).text : "");
  const scenarioContext = session?.config?.context || "";
  const workingHypothesis = session?.config?.hypothesis || "";
  const questionList = session?.questions?.length ? session.questions : undefined;
  const identifiedQuestions = session?.chat?.identified_questions ?? [];
  const isCompleted = session?.chat?.status === "completed";

  const formRef = useRef<HTMLFormElement | null>(null);

  /* ---------- chat state ---------- */
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(""), [fallbackQuestionId]);

  const handleQuestionSelect = useCallback(
    (questionId: string) => {
      onSelectQuestion(questionId, exerciseId);
      if (!sessions[questionId] || errorStates[questionId]) onLoadSession(questionId, exerciseId);
    },
    [errorStates, exerciseId, onLoadSession, onSelectQuestion, sessions],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text || !fallbackQuestionId || isSubmitting || isCompleted) return;
      await onSendMessage(fallbackQuestionId, text, exerciseId);
      setDraft("");
    },
    [draft, exerciseId, fallbackQuestionId, isCompleted, isSubmitting, onSendMessage],
  );

  const handleComposerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
    },
    [formRef],
  );

  /* ---------- render ---------- */
  const renderHtml = (raw: string) => ({ __html: sanitizeBasic(mdishLists(raw)) });

  return (
    <div className="mx-auto max-w-6xl bg-white p-6 shadow-sm">
      {/* header */}
      {/* <div className="flex items-start justify-between">
        <div>
          {resolvedExerciseDescription ? (
            <p className="mt-2 text-md text-600">{resolvedExerciseDescription}</p>
          ) : null}

          {scenarioContext ? (
            <p className="mt-3 text-sm text-gray-800">
              <span className="font-semibold">Business Context: </span>
              <span dangerouslySetInnerHTML={renderHtml(scenarioContext)} />
            </p>
          ) : null}

        </div>
      </div> */}

      {/* question chip row */}
      {/* {questions?.length ? (
        <div className="mt-5 rounded-2xl border border-gray-200 bg-white/60 p-4">
          <div className="flex flex-wrap gap-3">
            {questions.map((q, i) => {
              const qid =
                extractQuestionIdentifier(q) ?? normalizeIdentifier((q as { id?: unknown })?.id) ?? `q-${i}`;
              const active = qid === fallbackQuestionId;
              return (
                <button
                  key={qid}
                  onClick={() => handleQuestionSelect(qid)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                    active
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:text-indigo-600"
                  }`}
                >
                  <span
                    className={`grid h-4 w-4 place-items-center rounded-full border ${
                      active ? "border-indigo-500" : "border-gray-300"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${active ? "bg-indigo-600" : "bg-transparent"}`} />
                  </span>
                  {`Question ${i + 1}`}
                </button>
              );
            })}
          </div>
        </div>
      ) : null} */}

      {/* question panel */}
      {/* <section className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-5">
        <div className="prose mt-3 max-w-none text-gray-800 prose-p:leading-relaxed">
          {guidingQuestion ? (
            <p
              className="whitespace-pre-wrap text-[15px] leading-7"
              dangerouslySetInnerHTML={renderHtml(guidingQuestion)}
            />
          ) : (
            <p className="text-gray-500">Select a question to begin.</p>
          )}
          
        </div>
      </section> */}

      {/* personalised mentor (stacked below) */}
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-900">Personalised Mentor - Revision Notes </h3>
          </div>
          <div className="flex items-center gap-3">
            {errorMessage ? (
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">
                {errorMessage}
              </span>
            ) : null}
            {isLoading && !errorMessage ? (
              <span className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                Loading…
              </span>
            ) : null}
            {isCompleted ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                Summary Ready
              </span>
            ) : null}
          </div>
        </div>

        {/* chat feed */}
        <div className="h-[40vh] min-h-[280px] overflow-y-auto px-6 py-4">
          {(session?.chat?.messages ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">
              {emptyStateMessage ||
                "Start the conversation by describing how you understand these revision notes. The mentor will help you refine your hypotheses and surface stronger analysis questions."}
            </p>
          ) : (
            <ul className="space-y-3">
              {session?.chat?.messages?.map((m, i) => {
                const mine = m.role === "student";
                return (
                  <li key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                        mine
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                      dangerouslySetInnerHTML={renderHtml(m.content)}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {identifiedQuestions.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Discovered Questions
              </p>
              <ul className="space-y-2">
                {identifiedQuestions.map((q, i) => (
                  <li key={`${q}-${i}`} className="flex items-start gap-2 text-sm text-emerald-800">
                    <Sparkles className="mt-0.5 h-4 w-4" />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {isCompleted && session?.chat?.final_summary ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Mentor Summary</p>
              <p className="mt-1 text-sm text-emerald-900" dangerouslySetInnerHTML={renderHtml(session.chat.final_summary)} />
            </div>
          ) : null}
        </div>

        {/* composer */}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex items-end gap-2 border-t border-gray-200 px-6 py-4"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Share your approach or ask for guidance…"
            className="min-h-[48px] flex-1 resize-y rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50"
            disabled={isSubmitting || isCompleted}
            onKeyDown={handleComposerKeyDown}
          />
          <button
            type="submit"
            disabled={!draft.trim() || isSubmitting || isCompleted}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send
              </>
            )}
          </button>
        </form>
      </section>
    </div>
  );
}

export default PracticeMentorChat;
