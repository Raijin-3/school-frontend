"use client";
import {
  apiGet,
  apiPost,
  getLatestQuestionRun,
  recordQuestionRun,
} from "@/lib/api-client";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import DOMPurify from "dompurify";
import { VideoPlayer } from "@/components/video-player";
import { ProfessionalCourseTabs } from "@/components/professional-course-tabs";
import { PracticeArea } from "@/components/practice-area";
import { PracticeMentorChat } from "@/components/practice-mentor-chat";
import { useVideoState } from "@/hooks/use-video-state";
import { supabaseBrowser } from '@/lib/supabase-browser';
import {
  recordLectureCompletion,
  recordQuestionAttempt,
  recordIdentifiedQuestionXp,
  GAMIFICATION_PROGRESS_EVENT,
  type GamificationDifficulty,
} from "@/lib/gamification";
import { awardBadge } from "@/lib/badges";
import { useDuckDB } from "@/hooks/use-duckdb";
import { usePyodide } from "@/hooks/use-pyodide";
import type { Schema } from "apache-arrow";
import {
  Activity,
  BookOpen,
  CheckCircle,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Menu,
  Circle,
  Clock,
  Code,
  FileText,
  Download,
  Lightbulb,
  Play,
  Lock,
  Unlock,
  RotateCcw,
  XCircle,
  Maximize2,
  Minimize2,
  Sparkles,
} from "lucide-react";
import { lowercase } from "node_modules/zod/v4/core/regexes.cjs";

// HTML Sanitization for adaptive quiz questions
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'strong',
    'em',
    'b',
    'i',
    'sup',
    'sub',
    'pre',
    'code',
    'br',
    'p',
    'table',
    'tr',
    'td',
    'th',
    'tbody',
    'thead',
    'tfoot',
    'ul',
    'ol',
    'li',
  ],
  ALLOWED_ATTR: [],
};

const CODE_BLOCK_REGEX = /```([\w+-]+)?[\r\n]?([\s\S]*?)```/g;
const ADAPTIVE_TABLE_CLASS =
  'aq-table w-full border border-slate-200 border-collapse rounded-lg my-4 text-sm text-slate-800';
const ADAPTIVE_TABLE_HEADER_CLASS =
  'aq-table-header border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold';
const ADAPTIVE_TABLE_CELL_CLASS = 'aq-table-cell border border-slate-200 px-3 py-2';

const escapeQuestionHtml = (value: string): string => {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const formatQuestionHtml = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return typeof value === 'string' ? value : '';
  }

  const normalized = value.replace(/\\n/g, '\n');

  return normalized.replace(CODE_BLOCK_REGEX, (_match, _language, codeBlock = '') => {
    const normalizedCode = String(codeBlock)
      .replace(/^\s*\r?\n/, '')
      .replace(/\r?\n\s*$/, '');
    const escapedCode = escapeQuestionHtml(normalizedCode);
    return `<pre><code>${escapedCode}</code></pre>`;
  });
};

const appendClassToTag = (html: string, tagName: string, className: string) => {
  const regex = new RegExp(`<${tagName}([^>]*)>`, 'gi');
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

const enhanceAdaptiveTables = (html: string): string => {
  if (!html || !html.toLowerCase().includes('<table')) {
    return html;
  }

  const withTableClass = appendClassToTag(html, 'table', ADAPTIVE_TABLE_CLASS);
  const withHeaderClass = appendClassToTag(withTableClass, 'th', ADAPTIVE_TABLE_HEADER_CLASS);
  return appendClassToTag(withHeaderClass, 'td', ADAPTIVE_TABLE_CELL_CLASS);
};

const sanitizeQuestionHTML = (html: unknown): string => {
  if (typeof html !== 'string' || html.trim().length === 0) {
    return '';
  }

  const formatted = formatQuestionHtml(html);
  const sanitized = DOMPurify.sanitize(formatted, SANITIZE_CONFIG);
  return enhanceAdaptiveTables(sanitized);
};

const normalizeHintMessage = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
};

const normalizeAnswerValue = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
};

const WORKSPACE_RUN_STORAGE_PREFIX = "jarvis.workspace.run";
const getWorkspaceRunStorageKey = (exerciseId: string, questionId: string) =>
  `${WORKSPACE_RUN_STORAGE_PREFIX}:${exerciseId}:${questionId}`;

const ADAPTIVE_QUIZ_PASS_PERCENT = 70;
const ADAPTIVE_QUIZ_SESSION_SIZE = 10;

const readCachedWorkspaceRun = (exerciseId?: string, questionId?: string) => {
  if (!exerciseId || !questionId || typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(
      getWorkspaceRunStorageKey(exerciseId, questionId),
    );
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored);
    const code = typeof parsed?.code === "string" ? parsed.code : "";
    if (!code.trim()) {
      return null;
    }
    const language =
      typeof parsed?.language === "string" ? parsed.language : "sql";
    return {
      code,
      language: language.toLowerCase(),
    };
  } catch (error) {
    console.warn("Failed to read cached workspace run:", error);
    return null;
  }
};


const extractAnswerText = (record: Record<string, unknown>): { text?: string; html?: string } => {
  if (!record) {
    return {};
  }
  const htmlCandidate = typeof record.answer_html === "string" && record.answer_html.trim().length > 0
    ? record.answer_html
    : undefined;
  const textCandidates = [
    record.answer_text,
    record.correct_answer,
    record.text,
    record.answer,
    record.value,
  ];
  let textCandidate = textCandidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  ) as string | undefined;
  if (!textCandidate && htmlCandidate) {
    textCandidate = htmlCandidate.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  return {
    text: textCandidate,
    html: htmlCandidate,
  };
};

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
 

type Lecture = { id?: string; title?: string; content?: string; type?: string; duration?: number };

type PracticeExerciseQuestion = {
  id: string;
  exercise_id: string;
  question_text: string;
  question_type:
    | 'sql'
    | 'python'
    | 'google_sheets'
    | 'statistics'
    | 'reasoning'
    | 'math'
    | 'problem_solving'
    | 'geometry'
    | 'mentor_chat';
  text?: string;
  content?: Record<string, unknown> | string | null;
  options?: any;
  correct_answer?: any;
  solution?: string;
  created_at: string;
  updated_at: string;
  dataset?: string | Record<string, unknown>;
  expected_output_table?: string[] | null;
}

type Exercise = {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  questions: PracticeExerciseQuestion[];
  section_exercise_questions?: PracticeExerciseQuestion[];
  dataset?: string | Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type QuizQuestionOption = { id?: string; text?: string; correct?: boolean };

type QuizQuestion = {
  id?: string;
  type?: string;
  text?: string;
  order_index?: number;
  content?: string;
  quiz_options?: QuizQuestionOption[];
};

type Quiz = {
  id?: string;
  title?: string;
  quiz_questions?: QuizQuestion[];
  type?: string;
};

type QuizReviewResponse = {
  key: string;
  questionHtml: string;
  userAnswer: string;
  userAnswerHtml?: string;
  correctAnswer: string;
  correctAnswerHtml?: string;
  isCorrect: boolean;
};

type QuizSummaryResult = {
  responses: QuizReviewResponse[];
  correctCount: number;
  totalQuestions: number;
  scorePercent: number;
};

type QuizQuestionFeedback = {
  submitted: boolean;
  isCorrect: boolean;
  questionId?: string;
  userAnswer?: string;
  userAnswerHtml?: string;
  correctAnswer?: string;
  correctAnswerHtml?: string;
};

type Dataset = {
  id: string;
  name: string;
  table_name?: string;
  columns?: string[];
  data?: any[];
  description?: string;
  placeholders?: string[];
};

type PracticeSubmissionResponse = {
  submission?: unknown;
  isCorrect?: boolean;
  verdict?: string;
  feedback?: string;
  evaluation?: { verdict?: string; feedback?: string } | null;
  correctAnswer?: string | null;
  executionResult?: unknown;
};

type PracticeHintResponse = {
  verdict?: string;
  message: string;
};

type LatestSubmissionSummary = {
  userAnswer: string;
  isCorrect: boolean;
  score: number;
  feedback: string;
  verdict: string;
  evaluation?: Record<string, unknown> | null;
  executionResult?: Record<string, unknown> | null;
  submittedAt?: string;
  attemptNumber?: number;
};

type MentorChatMessage = {
  role: 'mentor' | 'student';
  content: string;
  created_at?: string | null;
};

type MentorChatSession = {
  question: {
    id: string;
    text: string;
  };
  config: {
    context: string;
    hypothesis: string;
    guidingQuestion: string;
    targetQuestions: string[];
    introMessage?: string | null;
  };
  chat: {
    id: string | null;
    status: 'active' | 'completed';
    messages: MentorChatMessage[];
    identified_questions: string[];
    final_summary?: string | null;
    completed_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  ai?: {
    message: string;
    identified_questions: string[];
    status: 'coaching' | 'completed';
  };
  exercise?: {
    id?: string | null;
    title?: string | null;
    description?: string | null;
    content?: string | null;
  };
  section?: {
    id?: string | null;
    title?: string | null;
    overview?: string | null;
  };
  questions?: Array<{
    id?: string | null;
    order?: number | null;
    text?: string | null;
  }>;
};

interface QuestionDatasetSchemaInfo extends Record<string, unknown> {
  creation_sql?: string;
  create_sql?: string;
  creation_python?: string;
  create_python?: string;
  dataset_rows?: Array<Record<string, unknown>>;
  dataset_columns?: string[];
  dataset_table_name?: string;
  dataset_csv_raw?: string;
  table_name?: string;
}

interface QuestionDatasetRecord extends Record<string, unknown> {
  id?: string;
  name?: string;
  description?: string;
  creation_sql?: string;
  create_sql?: string;
  creation_python?: string;
  create_python?: string;
  dataset?: unknown;
  table_name?: string;
  columns?: string[];
  data?: Array<Record<string, unknown>>;
  schema_info?: QuestionDatasetSchemaInfo;
  dataset_csv_raw?: string;
  placeholders?: string[];
}

type DatasetPreview = {
  columns: string[];
  rows: unknown[][];
  columnTypes?: Record<string, string>;
};

type SqlDerivedTable = {
  tableName: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

type SpreadsheetDatasetDefinition = {
  id: string;
  name: string;
  description?: string;
  preview: DatasetPreview | null;
  tableNames: string[];
  originalName?: string;
};

const DATASET_TIMESTAMP_COLUMN_NAMES = [
  "interactiondate",
  "resolutiondate",
  "createddate",
  "updateddate",
  "created_at",
  "updated_at",
  "submitted_at",
  "resolved_at",
  "closed_at",
  "opened_at",
  "orderdate",
  "shipdate",
  "duedate",
  "dob",
];

const DATASET_TIMESTAMP_KEYWORDS = [
  "date",
  "timestamp",
  "datetime",
  "created",
  "updated",
  "resolved",
  "submitted",
  "closed",
  "opened",
  "reported",
];

const DATASET_TIMESTAMP_COLUMN_SUFFIXES = ["_at", "_ts", "_time"];

const DATASET_TIMESTAMP_COLUMNS = new Set(
  DATASET_TIMESTAMP_COLUMN_NAMES.map((name) => name.toLowerCase())
);

type SqlDatasetDefinition = {
  id: string;
  name: string;
  description?: string;
  placeholders?: string[];
  creation_sql?: string;
  create_sql?: string;
  table_name?: string;
  data?: any[];
  columns?: string[];
  cacheKey?: string;
  creationTables?: string[];
  sanitizedCreationSql?: string;
};

type SqlDatasetVariant = SqlDatasetDefinition & {
  baseDatasetId: string;
  displayName: string;
  resolvedTableName?: string;
};

type GeneratedExerciseResponse = {
  exercise: Exercise;
  questions: PracticeExerciseQuestion[];
  context: {
    header_text: string;
    business_context: string;
    dataset_description: string;
    data_dictionary: Record<string, string>;
    questions_raw: Array<{
      id: number;
      business_question: string;
      expected_output_table: string[];
      topics: string[];
      difficulty: string;
      adaptive_note: string;
    }>;
    expected_cols_list: string[][];
    data_creation_sql?: string;
    data_creation_python?: string;
    create_python?: string;
    creation_python?: string;
    answers_sql_map: Record<number, string>;
    verification: Array<{
      question: number;
      columns: string[];
      rows_preview: string[][];
      columns_match_expected: boolean;
      returns_rows: boolean;
      ok: boolean;
      error?: string;
    }>;
  };
};

type Section = {
  id: string;
  title: string;
  order_index?: number;
  overview?: string;
  lecture?: Lecture | null;
  lectures?: Lecture[];
  exercises?: Exercise[];
  quizzes?: Quiz[];
  futureTopics?: string[];
};

const LEARNING_PATH_REFRESH_KEY = "jarvis-learning-path-refresh";

type Module = {
  id?: string;
  slug?: string;
  title: string;
  subjectId?: string;
  sections?: Section[];
  status?: string;
  is_mandatory?: boolean;
  active?: "active" | "inactive";
  is_active?: boolean;
  completed?: boolean;
  correctness_percentage?: number;
  order_index?: number;
  moduleStatus?: {
    totalLectures?: number;
    watchedLectures?: number;
    hasQuizAttempt?: boolean;
    hasExerciseAttempt?: boolean;
    completed?: boolean;
    progress?: number | null;
  };
  requirementSummary?: ModuleRequirementSummary;
};

const parseOrderIndexValue = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const getOrderIndexValue = (source: unknown): number | undefined => {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  const record = source as Record<string, unknown>;
  const candidates = [
    record["order_index"]
  ];
  for (const candidate of candidates) {
    const parsed = parseOrderIndexValue(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
};

const sortEntitiesByOrderIndex = <T>(items: T[] | undefined | null): T[] => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  return items
    .map((item, index) => ({
      item,
      index,
      order: getOrderIndexValue(item),
    }))
    .sort((a, b) => {
      const orderA = a.order ?? a.index;
      const orderB = b.order ?? b.index;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
};

type ModuleRequirementSummary = {
  lecturesSatisfied: boolean;
  adaptiveSatisfied: boolean;
  exerciseSatisfied: boolean;
  completed: boolean;
  metCount: number;
  totalCount: number;
  progressPercent: number;
  totalExercises?: number;
  completedExercises?: number;
  exerciseStatuses?: Record<string, boolean>;
  lecturesApplicable?: boolean;
  quizApplicable?: boolean;
  exerciseApplicable?: boolean;
  lectureCount?: number;
};

type RequirementApplicabilities = {
  lectures?: boolean;
  quiz?: boolean;
  exercise?: boolean;
};

type BuildRequirementSummaryOptions = {
  lecturesSatisfied: boolean;
  adaptiveSatisfied: boolean;
  exerciseSatisfied: boolean;
  totalExercises?: number;
  completedExercises?: number;
  exerciseStatuses?: Record<string, boolean>;
  requirementApplicabilities?: RequirementApplicabilities;
  totalCount?: number;
  metCount?: number;
  progressPercent?: number;
  completed?: boolean;
  lectureCount?: number;
};

const buildRequirementSummary = ({
  lecturesSatisfied,
  adaptiveSatisfied,
  exerciseSatisfied,
  totalExercises = 0,
  completedExercises = 0,
  exerciseStatuses = {},
  requirementApplicabilities,
  totalCount,
  metCount,
  progressPercent,
  completed,
  lectureCount,
}: BuildRequirementSummaryOptions): ModuleRequirementSummary => {
  const applicability = {
    lectures: requirementApplicabilities?.lectures ?? true,
    quiz: requirementApplicabilities?.quiz ?? true,
    exercise: requirementApplicabilities?.exercise ?? true,
  };

  const derivedTotalCount =
    typeof totalCount === "number"
      ? totalCount
      : [applicability.lectures, applicability.quiz, applicability.exercise].filter(Boolean)
          .length;

  const derivedMetCount =
    typeof metCount === "number"
      ? metCount
      : [
          applicability.lectures && lecturesSatisfied ? 1 : 0,
          applicability.quiz && adaptiveSatisfied ? 1 : 0,
          applicability.exercise && exerciseSatisfied ? 1 : 0,
        ].reduce((sum, value) => sum + value, 0);

  const derivedProgressPercent =
    typeof progressPercent === "number"
      ? progressPercent
      : derivedTotalCount === 0
      ? 100
      : Math.round((derivedMetCount / derivedTotalCount) * 100);

  const derivedCompleted =
    typeof completed === "boolean"
      ? completed
      : derivedTotalCount === 0
      ? true
      : derivedMetCount === derivedTotalCount;

  return {
    lecturesSatisfied,
    adaptiveSatisfied,
    exerciseSatisfied,
    completed: derivedCompleted,
    metCount: derivedMetCount,
    totalCount: derivedTotalCount,
    progressPercent: derivedProgressPercent,
    totalExercises,
    completedExercises,
    exerciseStatuses,
    lecturesApplicable: applicability.lectures,
    quizApplicable: applicability.quiz,
    exerciseApplicable: applicability.exercise,
    lectureCount,
  };
};

const EMPTY_REQUIREMENT_SUMMARY = buildRequirementSummary({
  lecturesSatisfied: false,
  adaptiveSatisfied: false,
  exerciseSatisfied: false,
});

const AUTO_COMPLETED_SECTION_SUMMARY = buildRequirementSummary({
  lecturesSatisfied: true,
  adaptiveSatisfied: true,
  exerciseSatisfied: true,
});

const SECTION_STATUS_STORAGE_PREFIX = 'jarvis.section-status.v1';
const MODULE_BADGE_STORAGE_PREFIX = 'jarvis.badges.modules';
const FIRST_MODULE_BADGE_CODE = 'MODULE_FIRST_WIN';
const FIVE_MODULE_BADGE_CODE = 'MODULE_FIVE_FINISHER';

type ResourceKind = "lecture" | "exercise" | "quiz" | "adaptive_quiz";

type SelectedResource = { sectionId: string; kind: ResourceKind; resourceId?: string };

type AdaptiveQuizSectionStatus = {
  hasActiveQuiz: boolean;
  sessionId?: string;
  sessionCount?: number;
  sectionStatus?: string | null;
};

type AdaptiveSessionSummaryInfo = {
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  score: number;
};

type AdaptiveQuizResponse = {
  id?: string;
  session_id?: string;
  question_number?: number;
  question_text?: string;
  difficulty?: string;
  options?: unknown;
  correct_option?: { label?: string; text?: string };
  correct_answer?: string;
  user_answer?: string | null;
  is_correct?: boolean;
  explanation?: string | null;
  created_at?: string;
  updated_at?: string;
};

type AdaptiveSessionReview = {
  sectionId: string;
  sessionId: string;
  label: string;
  dateLabel: string;
  summary: AdaptiveSessionSummaryInfo;
  responses: AdaptiveQuizResponse[];
  questionOffset?: number;
};

type AdaptiveSessionHistoryEntry = {
  sessionId: string;
  status: string | null;
  currentQuestionNumber: number;
  createdAt: string | null;
  updatedAt: string | null;
  conversationHistory: string[];
  summary: AdaptiveSessionSummaryInfo;
};

const getAdaptiveEntryQuestionCount = (entry: AdaptiveSessionHistoryEntry | null | undefined): number => {
  if (!entry) {
    return 0;
  }
  const summaryCount = Number.isFinite(entry.summary?.totalQuestions ?? 0)
    ? entry.summary.totalQuestions
    : 0;
  const currentNumber =
    typeof entry.currentQuestionNumber === "number" && Number.isFinite(entry.currentQuestionNumber)
      ? entry.currentQuestionNumber
      : 0;
  return Math.max(summaryCount, currentNumber);
};

const resourceLabels: Record<ResourceKind, string> = {
  lecture: "Lecture Video",
  quiz: "Section Quiz",
  adaptive_quiz: "AI Adaptive Quiz",
  exercise: "Practice Exercise",
};

const RequirementChip = ({
  completed,
  completedLabel = "Completed",
  pendingLabel = "Pending",
}: {
  completed: boolean;
  completedLabel?: string;
  pendingLabel?: string;
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
      completed ? "text-emerald-600 bg-emerald-50" : "text-slate-500 bg-slate-100"
    }`}
  >
    {/* {completed ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />} */}
    {completed ? completedLabel : pendingLabel}
  </span>
);

type GenerateSectionExercisesPayload = {
  sectionId: string;
  courseId: string;
  subjectId: string;
  sectionTitle: string;
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  exerciseType?: "sql" | "python" | "google_sheets" | "statistics" | "reasoning" | "math" | "geometry";
  questionCount?: number;
  userId?: string;
  futureTopics?: string[];
  datasetCreationCodingLanguage: string;
  solutionCodingLanguage: string;
};

type GenerateSectionQuizPayload = {
  sectionId: string;
  courseId: string;
  subjectId: string;
  sectionTitle: string;
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  questionCount?: number;
  questionTypes?: string[];
  prevQuizResult?: {
    score: number;
    answers: Record<string, any>;
    feedback?: string;
    stop?: boolean;
  };
};

type AdaptiveQuizStartPayload = {
  courseId: string;
  subjectId: string;
  sectionId: string;
  sectionTitle: string;
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  targetLength?: number;
};

type AdaptiveQuizResumePayload = {
  sectionId?: string;
};

type AdaptiveQuizNextQuestionPayload = {
  sessionId: string;
  previousAnswer?: {
    questionId: string;
    selectedOption: string;
    isCorrect: boolean;
  };
};

type AdaptiveQuizSectionStatusPayload = {
  sectionId: string;
  sessionId?: string;
};

const getQuizAction = (quizId: string) => apiGet<Quiz>(`v1/quizzes/${quizId}`);

const generateSectionExercisesAction = (payload: GenerateSectionExercisesPayload) =>
  apiPost<GeneratedExerciseResponse>(`/v1/sections/${payload.sectionId}/generate-exercises`, {
    courseId: payload.courseId,
    subjectId: payload.subjectId,
    sectionTitle: payload.sectionTitle,
    difficulty: payload.difficulty,
    exerciseType: payload.exerciseType,
    questionCount: payload.questionCount,
    userId: payload.userId,
    futureTopics: payload.futureTopics,
    datasetCreationCodingLanguage: payload.datasetCreationCodingLanguage,
    solutionCodingLanguage: payload.solutionCodingLanguage,
  });

const generateSectionQuizAction = (payload: GenerateSectionQuizPayload) =>
  apiPost(`/v1/sections/${payload.sectionId}/generate-quiz`, {
    courseId: payload.courseId,
    subjectId: payload.subjectId,
    sectionTitle: payload.sectionTitle,
    difficulty: payload.difficulty,
    questionCount: payload.questionCount,
    questionTypes: payload.questionTypes,
    ...(payload.prevQuizResult ? { prevQuizResult: payload.prevQuizResult } : {}),
  });

const getSectionExercisesAction = (sectionId: string) =>
  apiGet(`/v1/sections/${sectionId}/exercises`);

const getSectionQuizzesAction = (sectionId: string) =>
  apiGet(`/v1/sections/${sectionId}/quizzes`);

const getExerciseDatasetsAction = (exerciseId: string) =>
  apiGet(`/v1/practice-exercises/${exerciseId}/datasets`);

const getExerciseProgressAction = (exerciseId: string) =>
  apiGet(`/v1/sections/exercises/${exerciseId}/progress`);

const startAdaptiveQuizAction = (payload: AdaptiveQuizStartPayload) =>
  apiPost(`/v1/adaptive-quiz/start`, payload);

const resumeAdaptiveQuizAction = (payload: AdaptiveQuizResumePayload = {}) =>
  apiPost(`/v1/adaptive-quiz/resume`, payload);

const checkAdaptiveQuizStatusAction = (sectionId: string) =>
  apiPost(`/v1/adaptive-quiz/check-status`, { sectionId });

const getNextQuestionAction = (payload: AdaptiveQuizNextQuestionPayload) =>
  apiPost(`/v1/adaptive-quiz/next-question`, payload);

  const getAdaptiveQuizSummaryAction = (sessionId: string) =>
    apiPost(`/v1/adaptive-quiz/summary`, { sessionId });
  const getAdaptiveQuizResponsesAction = (sessionId: string) =>
    apiPost(`/v1/adaptive-quiz/responses`, { sessionId });
const markAdaptiveQuizSectionPassedAction = (payload: AdaptiveQuizSectionStatusPayload) =>
  apiPost(`/v1/adaptive-quiz/section-status`, payload);

const unpackApiArray = <T,>(payload: unknown): T[] | null => {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data?: unknown }).data as T[];
  }
  return null;
};

const getExerciseQuestionKey = (question: any, fallbackIndex: number): string => {
  const normalizedIndex = fallbackIndex >= 0 ? fallbackIndex : 0;
  if (!question) {
    return `question-${normalizedIndex}`;
  }

  if (question.id !== undefined && question.id !== null) {
    return String(question.id);
  }

  if ((question as any).question_id !== undefined && (question as any).question_id !== null) {
    return String((question as any).question_id);
  }

  if (
    (question as any).exercise_id !== undefined &&
    (question as any).exercise_id !== null &&
    (question as any).order_index !== undefined
  ) {
    return `${(question as any).exercise_id}-${(question as any).order_index}`;
  }

  if ((question as any).order_index !== undefined && (question as any).order_index !== null) {
    return `order-${(question as any).order_index}`;
  }

  const textSource =
    typeof question.question_text === "string"
      ? question.question_text
      : typeof question.text === "string"
      ? question.text
      : "";

  if (textSource) {
    return `${normalizedIndex}-${textSource.slice(0, 20)}`;
  }

  return `question-${normalizedIndex}`;
};

type NormalizeCreationSqlOptions = {
  datasetType?: string | null;
  preserveFormatting?: boolean;
};

const resolveDatasetLanguage = (...values: Array<unknown>): string | undefined => {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed.toLowerCase();
      }
    }
  }
  return undefined;
};

const coalesceString = (...values: Array<unknown>): string | undefined => {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
};

const normalizeIdentifier = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
};

const capitalizeString = (value?: string | null) => {
  if (!value || typeof value !== "string") {
    return "";
  }
  if (value.length === 0) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatAdaptiveSessionTimestamp = (value?: string | null) => {
  if (!value || typeof value !== "string") {
    return "";
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const parseAdaptiveSessionHistoryEntry = (value: unknown): AdaptiveSessionHistoryEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const sessionId =
    normalizeIdentifier(raw.sessionId ?? raw.session_id) ?? "";
  if (!sessionId) {
    return null;
  }
  const statusValue = typeof raw.status === "string" ? raw.status.trim() : null;
  const currentQuestionNumberRaw =
    raw.currentQuestionNumber ?? raw.current_question_number;
  const currentQuestionNumber =
    typeof currentQuestionNumberRaw === "number"
      ? currentQuestionNumberRaw
      : typeof currentQuestionNumberRaw === "string"
      ? Number(currentQuestionNumberRaw)
      : 0;
  const createdAt =
    typeof raw.createdAt === "string"
      ? raw.createdAt
      : typeof raw.created_at === "string"
      ? raw.created_at
      : null;
  const updatedAt =
    typeof raw.updatedAt === "string"
      ? raw.updatedAt
      : typeof raw.updated_at === "string"
      ? raw.updated_at
      : null;
  const rawConversationHistory =
    Array.isArray(raw.conversationHistory) && raw.conversationHistory.length > 0
      ? raw.conversationHistory
      : Array.isArray(raw.conversation_history)
      ? raw.conversation_history
      : [];
  const conversationHistory = rawConversationHistory
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item === null || item === undefined) {
        return "";
      }
      return String(item).trim();
    })
    .filter((item) => item.length > 0);

  const toNumberValue = (candidate: unknown): number => {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  };

  const summaryRaw =
    raw.summary ??
    (raw as { summary?: unknown }).summary ??
    (raw as { session_summary?: unknown }).session_summary ??
    null;
  const summarySource =
    summaryRaw && typeof summaryRaw === "object"
      ? (summaryRaw as Record<string, unknown>)
      : {};
  const summary: AdaptiveSessionSummaryInfo = {
    totalQuestions: toNumberValue(
      summarySource.totalQuestions ?? summarySource.total_questions ?? 0,
    ),
    answeredQuestions: toNumberValue(
      summarySource.answeredQuestions ?? summarySource.answered_questions ?? 0,
    ),
    correctAnswers: toNumberValue(
      summarySource.correctAnswers ?? summarySource.correct_answers ?? 0,
    ),
    score: toNumberValue(summarySource.score ?? 0),
  };

  return {
    sessionId,
    status: statusValue || null,
    currentQuestionNumber: Number.isFinite(currentQuestionNumber)
      ? currentQuestionNumber
      : 0,
    createdAt,
    updatedAt,
    conversationHistory,
    summary,
  };
};

const normalizeQuestionTypeValue = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return normalized.length > 0 ? normalized : undefined;
};

const pickNormalizedQuestionType = (...candidates: Array<unknown>): string | undefined => {
  for (const candidate of candidates) {
    const normalized = normalizeQuestionTypeValue(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
};

const extractQuestionIdentifier = (candidate: unknown): string | undefined => {
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }
  return (
    normalizeIdentifier((candidate as { id?: unknown }).id) ??
    normalizeIdentifier((candidate as { question_id?: unknown }).question_id) ??
    normalizeIdentifier((candidate as { questionId?: unknown }).questionId)
  );
};

const extractExerciseIdentifier = (candidate: unknown): string | undefined => {
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }
  return (
    normalizeIdentifier((candidate as { id?: unknown }).id) ??
    normalizeIdentifier((candidate as { exercise_id?: unknown }).exercise_id) ??
    normalizeIdentifier((candidate as { exerciseId?: unknown }).exerciseId)
  );
};

const stripCodeFence = (value: string, { trimResult = true }: { trimResult?: boolean } = {}) => {
  const fullFenceMatch = value.match(/^```[\w+-]*\n([\s\S]*?)\n```$/i);
  if (fullFenceMatch) {
    const inner = fullFenceMatch[1];
    return trimResult ? inner.trim() : inner;
  }

  let stripped = value;
  stripped = stripped.replace(/^```[\w+-]*\s*\r?\n?/, "");
  stripped = stripped.replace(/\r?\n?```[\w+-]*\s*$/, "");
  return trimResult ? stripped.trim() : stripped;
};

const normalizeCreationSql = (
  value?: string | null,
  options: NormalizeCreationSqlOptions = {},
): string | undefined => {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const datasetType = resolveDatasetLanguage(options.datasetType);
  const preserveFormatting = options.preserveFormatting ?? datasetType === "python";

  let normalized = value.replace(/\r\n/g, "\n");
  if (!preserveFormatting) {
    normalized = normalized.trim();
    if (!normalized) {
      return undefined;
    }

    normalized = stripCodeFence(normalized, { trimResult: true });

    normalized = normalized.replace(/\s*```[\w+-]*\s*$/gi, "").trim();
    normalized = normalized.replace(/\s+```[\w+-]*\s*/gi, " ").trim();

    return normalized || undefined;
  }

  normalized = stripCodeFence(normalized, { trimResult: false });

  // Preserve formatting but remove non-printable BOM if present
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }

  return normalized || undefined;
};

const normalizeQuestionDataset = (
  rawDataset: unknown,
  context?: { questionId?: string; questionTitle?: string; subjectType?: string | null }
): QuestionDatasetRecord | null => {
  if (!rawDataset) {
    return null;
  }

  const contextSubjectType = resolveDatasetLanguage(context?.subjectType);

  if (typeof rawDataset === "string") {
    const creationSql = normalizeCreationSql(rawDataset, {
      datasetType: contextSubjectType,
    });
    if (!creationSql) {
      return null;
    }

    const datasetCsv = extractCsvFromSource(creationSql);

    return {
      id: context?.questionId,
      name: context?.questionTitle ?? "Question Dataset",
      creation_sql: creationSql,
      dataset_csv_raw: datasetCsv,
      subject_type: contextSubjectType,
    };
  }

  if (typeof rawDataset !== "object" || Array.isArray(rawDataset)) {
    return null;
  }

  const base = rawDataset as Record<string, unknown>;
  const schemaInfoRaw = base.schema_info;
  const datasetSubjectType = resolveDatasetLanguage(
    base.subject_type,
    base.type,
    base.question_type,
    contextSubjectType,
  );

  const schemaInfo =
    schemaInfoRaw && typeof schemaInfoRaw === "object" && !Array.isArray(schemaInfoRaw)
      ? (() => {
          const schemaCreationSqlRaw = coalesceString(
            (schemaInfoRaw as QuestionDatasetSchemaInfo).create_sql,
            (schemaInfoRaw as QuestionDatasetSchemaInfo).creation_sql,
            (schemaInfoRaw as Record<string, unknown>)?.data_creation_sql,
          );
          const normalizedSchemaCreationSql = normalizeCreationSql(schemaCreationSqlRaw, {
            datasetType: datasetSubjectType,
          });
          const existingSchemaCsv = (schemaInfoRaw as QuestionDatasetSchemaInfo).dataset_csv_raw;
          const normalizedSchemaCsv =
            typeof existingSchemaCsv === "string" && existingSchemaCsv.trim().length > 0
              ? extractCsvFromSource(existingSchemaCsv) ?? existingSchemaCsv
              : extractCsvFromSource(normalizedSchemaCreationSql);
          const schemaCreationPythonRaw = coalesceString(
            (schemaInfoRaw as QuestionDatasetSchemaInfo).create_python,
            (schemaInfoRaw as QuestionDatasetSchemaInfo).creation_python,
            (schemaInfoRaw as Record<string, unknown>)?.data_creation_python,
          );

          return {
            ...(schemaInfoRaw as QuestionDatasetSchemaInfo),
            creation_sql: normalizedSchemaCreationSql,
            create_sql: normalizedSchemaCreationSql ?? undefined,
            creation_python: schemaCreationPythonRaw ?? undefined,
            create_python: schemaCreationPythonRaw ?? undefined,
            dataset_csv_raw: normalizedSchemaCsv,
          };
        })()
      : undefined;

  const schemaRows =
    schemaInfo && Array.isArray(schemaInfo.dataset_rows) && schemaInfo.dataset_rows.length > 0
      ? schemaInfo.dataset_rows
      : undefined;

  const schemaColumns =
    schemaInfo && Array.isArray(schemaInfo.dataset_columns) && schemaInfo.dataset_columns.length > 0
      ? schemaInfo.dataset_columns
      : undefined;

  const baseCreationSqlRaw = coalesceString(
    base.create_sql,
    base.creation_sql,
    base.sql,
    base.dataset,
    schemaInfo?.create_sql,
    schemaInfo?.creation_sql,
    (base as Record<string, unknown>)["data_creation_sql"],
  );
  const normalizedCreationSql = normalizeCreationSql(baseCreationSqlRaw, {
    datasetType: datasetSubjectType,
  });
  const baseCreationPythonRaw = coalesceString(
    base.create_python,
    base.creation_python,
    schemaInfo?.create_python,
    schemaInfo?.creation_python,
    (base as Record<string, unknown>)["data_creation_python"],
  );

  let datasetCsvRaw: string | undefined;
  if (typeof base.dataset_csv_raw === "string" && base.dataset_csv_raw.trim().length > 0) {
    datasetCsvRaw = extractCsvFromSource(base.dataset_csv_raw) ?? base.dataset_csv_raw;
  } else if (
    typeof schemaInfo?.dataset_csv_raw === "string" &&
    schemaInfo.dataset_csv_raw.trim().length > 0
  ) {
    datasetCsvRaw = extractCsvFromSource(schemaInfo.dataset_csv_raw) ?? schemaInfo.dataset_csv_raw;
  } else {
    datasetCsvRaw = extractCsvFromSource(normalizedCreationSql);
  }

  const parsedCsvRows = datasetCsvRaw ? parseCsvToObjects(datasetCsvRaw) : [];

  let dataArray =
    Array.isArray(base.data) && base.data.length > 0
      ? (base.data as Array<Record<string, unknown>>)
      : schemaRows;

  if ((!dataArray || dataArray.length === 0) && parsedCsvRows.length > 0) {
    dataArray = parsedCsvRows;
  }

  let columnsArray =
    Array.isArray(base.columns) && base.columns.length > 0
      ? (base.columns as string[])
      : schemaColumns ?? (dataArray && dataArray.length > 0 ? Object.keys(dataArray[0]) : undefined);

  if ((!columnsArray || columnsArray.length === 0) && parsedCsvRows.length > 0) {
    columnsArray = Object.keys(parsedCsvRows[0]);
  }

  const tableName =
    (base.table_name as string | undefined) ??
    schemaInfo?.table_name ??
    schemaInfo?.dataset_table_name;

  return {
    ...base,
    id: (base.id as string | undefined) ?? context?.questionId,
    name:
      (base.name as string | undefined) ?? context?.questionTitle ?? "Question Dataset",
    description: (base.description as string | undefined) ?? undefined,
    creation_sql: normalizedCreationSql,
    create_sql: normalizedCreationSql ?? undefined,
    creation_python: baseCreationPythonRaw ?? undefined,
    create_python: baseCreationPythonRaw ?? undefined,
    table_name: tableName,
    columns: columnsArray,
    data: dataArray,
    schema_info: schemaInfo,
    dataset_csv_raw: datasetCsvRaw,
    placeholders: Array.isArray(base.placeholders) ? (base.placeholders as string[]) : undefined,
    subject_type:
      datasetSubjectType ??                             
      (typeof base.subject_type === "string" ? base.subject_type : undefined),
  };
};

const deriveExerciseDatasets = (
  exercise: any,
  options: { datasetType?: string } = {},
): QuestionDatasetRecord[] => {
  if (!exercise) {
    return [];
  }

  const exerciseId =
    typeof exercise?.id === "string"
      ? exercise.id
      : typeof exercise?.id === "number"
      ? String(exercise.id)
      : undefined;

  const datasetType = resolveDatasetLanguage(
    options.datasetType,
    exercise?.subject_type,
    exercise?.exercise_type,
    exercise?.practice_type,
    exercise?.type,
  );

  const datasets: QuestionDatasetRecord[] = [];

  const contextCandidate =
    exercise?.context && typeof exercise.context === "object"
      ? normalizeQuestionDataset(
          {
            ...exercise.context,
            id:
              (exercise.context as Record<string, unknown>)?.id ??
              (exercise.context as Record<string, unknown>)?.dataset_id ??
              exerciseId,
            name: resolveDatasetLabel(
              coalesceString(
                (exercise.context as Record<string, unknown>)?.dataset_name as string | undefined,
                exercise?.dataset_name,
              ),
              exercise?.title ?? "Exercise Dataset",
            ),
            description: coalesceString(
              (exercise.context as Record<string, unknown>)?.dataset_description as string | undefined,
              exercise?.dataset_description,
            ),
            dataset: coalesceString(
              (exercise.context as Record<string, unknown>)?.dataset as string | undefined,
              (exercise.context as Record<string, unknown>)?.data_creation_sql as string | undefined,
              exercise?.dataset,
              exercise?.data,
            ),
            create_sql: coalesceString(
              (exercise.context as Record<string, unknown>)?.create_sql as string | undefined,
              (exercise.context as Record<string, unknown>)?.data_creation_sql as string | undefined,
              exercise?.dataset,
            ),
            creation_sql: coalesceString(
              (exercise.context as Record<string, unknown>)?.creation_sql as string | undefined,
              (exercise.context as Record<string, unknown>)?.data_creation_sql as string | undefined,
              exercise?.dataset,
            ),
            dataset_csv_raw: coalesceString(
              (exercise.context as Record<string, unknown>)?.dataset_csv_raw as string | undefined,
              exercise?.dataset_csv_raw,
            ),
          },
          {
            questionId: exerciseId,
            questionTitle: exercise?.title,
            subjectType: datasetType,
          },
        )
      : null;

  if (
    contextCandidate &&
    (contextCandidate.creation_sql || contextCandidate.dataset_csv_raw || contextCandidate.data)
  ) {
    datasets.push({
      ...contextCandidate,
      id: contextCandidate.id ?? exerciseId,
      name:
        contextCandidate.name ??
        resolveDatasetLabel(
          coalesceString(
            (exercise.context as Record<string, unknown>)?.dataset_name as string | undefined,
            exercise?.dataset_name,
          ),
          exercise?.title ?? "Exercise Dataset",
        ),
    });
  }

  if (!datasets.length) {
    const directCandidate = normalizeQuestionDataset(
      {
        id: exerciseId,
        name: resolveDatasetLabel(
          coalesceString(exercise?.dataset_name, exercise?.title),
          exercise?.title ?? "Exercise Dataset",
        ),
        description: coalesceString(exercise?.dataset_description, exercise?.description),
        dataset: coalesceString(exercise?.dataset, exercise?.data),
        dataset_csv_raw: exercise?.dataset_csv_raw,
        columns: Array.isArray(exercise?.dataset_columns) ? exercise.dataset_columns : undefined,
        data: Array.isArray(exercise?.dataset_rows) ? exercise.dataset_rows : undefined,
        subject_type: datasetType,
      },
      {
        questionId: exerciseId,
        questionTitle: exercise?.title,
        subjectType: datasetType,
      },
    );

    if (
      directCandidate &&
      (directCandidate.creation_sql || directCandidate.dataset_csv_raw || directCandidate.data)
    ) {
      datasets.push({
        ...directCandidate,
        id: directCandidate.id ?? exerciseId,
      });
    }
  }

  return datasets.map((dataset) => {
    const rows =
      Array.isArray(dataset.data) && dataset.data.length > 0
        ? (dataset.data as Array<Record<string, unknown>>)
        : dataset.dataset_csv_raw
        ? parseCsvToObjects(dataset.dataset_csv_raw)
        : [];
    const columns =
      Array.isArray(dataset.columns) && dataset.columns.length > 0
        ? (dataset.columns as string[])
        : rows.length > 0
        ? Object.keys(rows[0])
        : (dataset.columns as string[] | undefined);

    return {
      ...dataset,
      data: rows,
      data_preview: rows,
      columns,
      data_dictionary:
        (dataset as Record<string, unknown>).data_dictionary ??
        (exercise?.context as Record<string, unknown>)?.data_dictionary ??
        (exercise as Record<string, unknown>)?.data_dictionary,
    };
  });
};

type PythonDatasetDefinition = {
  id: string;
  name: string;
  description?: string;
  data?: unknown[];
  columns?: string[];
  dataset_csv_raw?: string;
  schema_info?: QuestionDatasetSchemaInfo;
  table_name?: string;
  source?: string;
  creation_sql?: string;
  create_sql?: string;
  creation_python?: string;
  create_python?: string;
  cacheKey?: string;
};

type PythonDatasetDetail = {
  id: string;
  name: string;
  displayName: string;
  originalName?: string;
  description?: string;
  columns: string[];
  objectRows: Record<string, unknown>[];
  previewRows: unknown[][];
  pythonVariable: string;
  rowCount: number;
  datasetCsv?: string;
  loadError?: string;
  tableNames: string[];
  creation_python?: string;
  columnTypes?: Record<string, string>;
};

type PythonDatasetLoadState = {
  state: "idle" | "loading" | "loaded" | "failed";
  message?: string;
  variable?: string;
};

const sanitizePythonIdentifier = (value?: string | null, fallback = "dataset") => {
  if (!value || typeof value !== "string") {
    return fallback;
  }
  const normalized = value
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return /^[a-z_]/.test(normalized) ? normalized : `data_${normalized}`;
};

const splitCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values.map((value) => value.replace(/^"(.*)"$/, "$1"));
};

const extractCsvFromSource = (source?: string | null): string | undefined => {
  if (!source || typeof source !== "string") {
    return undefined;
  }

  let normalized = source.replace(/\r\n/g, "\n");

  const markerPatterns = [
    /(?:\/\/|--)\s*@DATA_CREATION_SHEETS[^\n]*\n/i,
    /(?:\/\/|--)\s*@DATA_CREATION[^\n]*\n/i,
  ];
  for (const pattern of markerPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      normalized = normalized.slice(match.index + match[0].length);
      break;
    }
  }

  const lines = normalized.split("\n");
  const commentPattern = /^\s*(\/\/|--|#)/;
  const headerSqlPattern =
    /\b(select|create|insert|update|delete|merge|with|drop|alter|table|into|values)\b/i;

  const csvLines: string[] = [];
  let headerDetected = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!headerDetected) {
      if (!trimmed) {
        continue;
      }
      if (commentPattern.test(trimmed)) {
        continue;
      }
      if (headerSqlPattern.test(trimmed)) {
        return undefined;
      }

      const cells = splitCsvLine(rawLine);
      if (cells.length <= 1) {
        continue;
      }

      csvLines.push(rawLine.replace(/\s+$/, ""));
      headerDetected = true;
    } else {
      if (!trimmed) {
        continue;
      }
      if (commentPattern.test(trimmed)) {
        continue;
      }
      csvLines.push(rawLine.replace(/\s+$/, ""));
    }
  }

  if (!headerDetected || csvLines.length < 2) {
    return undefined;
  }

  return csvLines.join("\n");
};

const parseCsvToObjects = (csv?: string | null): Record<string, unknown>[] => {
  const sanitized = extractCsvFromSource(csv);
  if (!sanitized) return [];

  const lines = sanitized.split("\n");
  const meaningfulLines = lines.filter((line) => line.trim().length > 0);
  if (meaningfulLines.length < 2) return [];

  const closingTriplePattern = /^['"]{3}\s*;?$/;

  const headers = splitCsvLine(meaningfulLines[0]).map((header, idx) => {
    let cleaned = header.trim();

    if (idx === 0) {
      const assignmentMatch = cleaned.match(
        /^[A-Za-z_][\w]*\s*=\s*(?:[frbuFRBU]{0,3})?\s*(?:['"]{3}|['"])?\s*(.*)$/
      );
      if (assignmentMatch && assignmentMatch[1]) {
        cleaned = assignmentMatch[1].trim();
      }
      cleaned = cleaned.replace(/['"]{3}\s*$/g, "").replace(/['"]\s*$/g, "").trim();
    }

    if (!cleaned) {
      cleaned = `column_${idx + 1}`;
    }

    return cleaned;
  });

  const rows: Record<string, unknown>[] = [];

  for (const rawLine of meaningfulLines.slice(1)) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || closingTriplePattern.test(trimmedLine)) {
      continue;
    }

    const cells = splitCsvLine(rawLine);
    if (cells.length === 1 && closingTriplePattern.test(cells[0].trim())) {
      continue;
    }

    const entry: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      if (!header) {
        return;
      }
      entry[header] = cells[idx] ?? "";
    });

    rows.push(entry);
  }

  return rows;
};

type ParsedTableColumnSchema = {
  readonly tableName: string;
  readonly columnTypes: Record<string, string>;
};

const normalizeSqlIdentifier = (value?: string | null): string | null => {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/[`"'[\]]/g, "").trim();
};

const readSqlIdentifier = (
  text: string,
  startIndex: number,
): { identifier: string | null; end: number } => {
  let index = startIndex;
  while (index < text.length && /\s/.test(text[index])) {
    index++;
  }
  if (index >= text.length) {
    return { identifier: null, end: index };
  }

  const quoteChar = text[index];
  if (quoteChar === '"' || quoteChar === "'" || quoteChar === "`") {
    let buffer = "";
    index++;
    while (index < text.length && text[index] !== quoteChar) {
      buffer += text[index];
      index++;
    }
    if (text[index] === quoteChar) {
      index++;
    }
    return { identifier: buffer, end: index };
  }

  if (quoteChar === "[") {
    let buffer = "";
    index++;
    while (index < text.length && text[index] !== "]") {
      buffer += text[index];
      index++;
    }
    if (text[index] === "]") {
      index++;
    }
    return { identifier: buffer, end: index };
  }

  const regex = /[^\s,(]+/g;
  regex.lastIndex = index;
  const match = regex.exec(text);
  if (!match) {
    return { identifier: null, end: index };
  }
  return { identifier: match[0], end: regex.lastIndex };
};

const splitColumnDefinitions = (input: string): string[] => {
  const entries: string[] = [];
  let buffer = "";
  let depth = 0;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth = Math.max(depth - 1, 0);
    }

    if (char === "," && depth === 0) {
      if (buffer.trim().length > 0) {
        entries.push(buffer);
      }
      buffer = "";
      continue;
    }

    buffer += char;
  }

  if (buffer.trim().length > 0) {
    entries.push(buffer);
  }

  return entries;
};

const CONSTRAINT_KEYWORDS = new Set([
  "PRIMARY",
  "KEY",
  "FOREIGN",
  "UNIQUE",
  "CONSTRAINT",
  "CHECK",
  "REFERENCES",
  "NOT",
  "NULL",
  "DEFAULT",
  "COLLATE",
  "AUTOINCREMENT",
  "AUTO_INCREMENT",
  "IDENTITY",
  "INDEX",
]);

const parseCreateTableSchemas = (sql?: string | null): ParsedTableColumnSchema[] => {
  if (!sql || typeof sql !== "string") {
    return [];
  }

  const normalizedSql = sql.replace(/\r\n?/g, "\n");
  const regex = /create\s+table\s+/gi;
  const schemas: ParsedTableColumnSchema[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalizedSql)) !== null) {
    let cursor = match.index + match[0].length;
    const rest = normalizedSql.slice(cursor);
    const ifNotExistsMatch = rest.match(/^\s*if\s+not\s+exists\s+/i);
    if (ifNotExistsMatch) {
      cursor += ifNotExistsMatch[0].length;
    }

    const tableIdentifier = readSqlIdentifier(normalizedSql, cursor);
    if (!tableIdentifier.identifier) {
      continue;
    }
    const tableName = tableIdentifier.identifier;
    cursor = tableIdentifier.end;

    const parenIndex = normalizedSql.indexOf("(", cursor);
    if (parenIndex === -1) {
      continue;
    }
    let depth = 0;
    let endIndex = parenIndex;
    for (; endIndex < normalizedSql.length; endIndex++) {
      const char = normalizedSql[endIndex];
      if (char === "(") {
        depth++;
      } else if (char === ")") {
        depth--;
        if (depth === 0) {
          break;
        }
      }
    }
    if (depth !== 0) {
      continue;
    }

    const columnsText = normalizedSql.slice(parenIndex + 1, endIndex);
    const columnEntries = splitColumnDefinitions(columnsText);
    const columnTypes: Record<string, string> = {};

    columnEntries.forEach((entry) => {
      const trimmedEntry = entry.trim().replace(/,$/, "");
      if (!trimmedEntry) {
        return;
      }
      if (/^(primary|foreign|unique|constraint|check|index)\b/i.test(trimmedEntry)) {
        return;
      }

      const columnNameToken = readSqlIdentifier(trimmedEntry, 0);
      if (!columnNameToken.identifier) {
        return;
      }
      const columnName = columnNameToken.identifier;
      const remainder = trimmedEntry.slice(columnNameToken.end).trim();
      if (!remainder) {
        return;
      }

      const tokens = remainder.split(/\s+/);
      const typeTokens: string[] = [];
      for (const token of tokens) {
        if (!token) {
          continue;
        }
        const sanitized = token.replace(/[,;]+$/, "");
        if (!sanitized) {
          continue;
        }
        if (CONSTRAINT_KEYWORDS.has(sanitized.toUpperCase())) {
          break;
        }
        typeTokens.push(token);
      }

      const typeDefinition = typeTokens.join(" ").trim().replace(/[,;]+$/, "");
      if (!typeDefinition) {
        return;
      }

      const normalizedColumn = columnName.trim().toLowerCase();
      columnTypes[normalizedColumn] = typeDefinition;
    });

    schemas.push({
      tableName,
      columnTypes,
    });

    regex.lastIndex = endIndex + 1;
  }

  return schemas;
};

const resolveColumnTypesFromSchema = ({
  columns,
  creationSql,
  preferredTableNames,
}: {
  columns: string[];
  creationSql?: string | null;
  preferredTableNames?: (string | null)[];
}): Record<string, string> | undefined => {
  if (!columns.length || !creationSql) {
    return undefined;
  }

  // console.log("Before parsing SQL schema:", creationSql);
  const parsedSchemas = parseCreateTableSchemas(creationSql);
  if (!parsedSchemas.length) {
    return undefined;
  }
  // console.log("Parsed table schemas:", parsedSchemas);

  const normalizedColumns = columns
    .map((column) => (typeof column === "string" ? column.trim().toLowerCase() : ""))
    .filter((value) => value.length > 0);
  if (!normalizedColumns.length) {
    return undefined;
  }

  const preferredSet = new Set(
    (preferredTableNames ?? [])
      .map(normalizeSqlIdentifier)
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  );

  let bestSchema: ParsedTableColumnSchema | null = null;
  let bestScore = -1;

  for (const schema of parsedSchemas) {
    const tableNormalized = normalizeSqlIdentifier(schema.tableName)?.toLowerCase() ?? "";
    let score = 0;
    normalizedColumns.forEach((columnName) => {
      if (schema.columnTypes[columnName]) {
        score++;
      }
    });

    if (tableNormalized && preferredSet.has(tableNormalized)) {
      score += 100;
    }

    if (!bestSchema || score > bestScore) {
      bestSchema = schema;
      bestScore = score;
    }
  }

  if (!bestSchema || !Object.keys(bestSchema.columnTypes).length) {
    return undefined;
  }

  const resolved: Record<string, string> = {};
  columns.forEach((columnName) => {
    if (typeof columnName !== "string") {
      return;
    }
    const normalized = columnName.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    const typeValue = bestSchema!.columnTypes[normalized];
    if (typeValue) {
      resolved[columnName] = typeValue;
    }
  });

  if (!Object.keys(resolved).length) {
    return undefined;
  }

  return resolved;
};

const deriveSqlColumnTypes = (schema?: Schema | null): Record<string, string> | undefined => {
  if (!schema || !schema.fields.length) {
    return undefined;
  }

  const columnTypes: Record<string, string> = {};
  for (const field of schema.fields) {
    if (!field || typeof field.name !== "string" || field.name.trim().length === 0) {
      continue;
    }

    const typeReference =
      typeof field.type?.toString === "function" ? field.type.toString().trim() : "";
    if (!typeReference) {
      continue;
    }

    columnTypes[field.name] = typeReference;
  }

  return Object.keys(columnTypes).length ? columnTypes : undefined;
};

const buildDatasetPreviewFromRecord = (dataset: any): DatasetPreview | null => {
  if (!dataset) {
    return null;
  }

  let workingDataset = dataset;

  if (typeof workingDataset === "string") {
    const csvContent = extractCsvFromSource(workingDataset);
    if (!csvContent) {
      return null;
    }
    const parsed = parseCsvToObjects(csvContent);
    if (!parsed.length) {
      return null;
    }
    workingDataset = {
      data: parsed,
      columns: Object.keys(parsed[0]),
      dataset_csv_raw: csvContent,
    };
  }

  const schemaInfo =
    workingDataset && typeof workingDataset === "object" && !Array.isArray(workingDataset)
      ? (workingDataset as { schema_info?: QuestionDatasetSchemaInfo }).schema_info
      : undefined;

  let csvRaw: string | undefined;

  const inlineCsv =
    typeof (workingDataset as { dataset_csv_raw?: unknown })?.dataset_csv_raw === "string"
      ? (workingDataset as { dataset_csv_raw?: string }).dataset_csv_raw
      : undefined;
  const schemaCsv =
    typeof schemaInfo?.dataset_csv_raw === "string"
      ? schemaInfo.dataset_csv_raw
      : undefined;

  if (inlineCsv && inlineCsv.trim().length > 0) {
    csvRaw = extractCsvFromSource(inlineCsv) ?? inlineCsv;
  } else if (schemaCsv && schemaCsv.trim().length > 0) {
    csvRaw = extractCsvFromSource(schemaCsv) ?? schemaCsv;
  }

  const creationCandidate = coalesceString(
    (workingDataset as { creation_sql?: string })?.creation_sql,
    (workingDataset as { create_sql?: string })?.create_sql,
    schemaInfo?.creation_sql,
    schemaInfo?.create_sql,
  );
  if (!csvRaw && creationCandidate) {
    csvRaw = extractCsvFromSource(creationCandidate);
  }

  let rows: any[] = Array.isArray((workingDataset as { data?: unknown[] })?.data)
    ? ((workingDataset as { data?: unknown[] }).data as any[])
    : [];

  if ((!rows || rows.length === 0) && Array.isArray(schemaInfo?.dataset_rows)) {
    rows = schemaInfo.dataset_rows;
  }

  if ((!rows || rows.length === 0) && csvRaw) {
    const parsedRows = parseCsvToObjects(csvRaw);
    if (parsedRows.length) {
      rows = parsedRows;
    }
  }

  if (!rows || rows.length === 0) {
    return null;
  }

  let columns: string[] = Array.isArray((workingDataset as { columns?: unknown[] })?.columns)
    ? ((workingDataset as { columns?: unknown[] }).columns as unknown[])
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  if ((!columns || columns.length === 0) && Array.isArray(schemaInfo?.dataset_columns)) {
    columns = schemaInfo.dataset_columns.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
  }

  const firstRow = rows[0];

  if (!columns || columns.length === 0) {
    if (firstRow && typeof firstRow === "object" && !Array.isArray(firstRow)) {
      columns = Object.keys(firstRow as Record<string, unknown>);
    } else if (Array.isArray(firstRow)) {
      const maxLength = rows.reduce(
        (max, row) => (Array.isArray(row) ? Math.max(max, row.length) : max),
        0,
      );
      columns = Array.from({ length: maxLength }, (_, index) => `column_${index + 1}`);
    } else {
      columns = ["value"];
    }
  } else if (Array.isArray(firstRow) && columns.length < firstRow.length) {
    const maxLength = rows.reduce(
      (max, row) => (Array.isArray(row) ? Math.max(max, row.length) : max),
      columns.length,
    );
    const nextColumns = columns.slice();
    for (let idx = nextColumns.length; idx < maxLength; idx++) {
      nextColumns.push(`column_${idx + 1}`);
    }
    columns = nextColumns;
  }

  if (!columns || columns.length === 0) {
    return null;
  }

  const tableNameCandidates = [
    typeof (workingDataset as { table_name?: unknown })?.table_name === "string"
      ? (workingDataset as { table_name?: string }).table_name
      : null,
    schemaInfo?.dataset_table_name ?? null,
    schemaInfo?.table_name ?? null,
  ];
  const columnTypesFromSql = resolveColumnTypesFromSchema({
    columns,
    creationSql: creationCandidate,
    preferredTableNames: tableNameCandidates,
  });

  const previewRows = rows.map((row) => {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      const typedRow = row as Record<string, unknown>;
      return columns.map((column) => (column in typedRow ? typedRow[column] ?? null : null));
    }
    if (Array.isArray(row)) {
      return columns.map((_, index) => row[index] ?? null);
    }
    return columns.map(() => row ?? null);
  });

  return {
    columns,
    rows: previewRows,
    columnTypes: columnTypesFromSql,
  };
};

const hydrateSpreadsheetDatasetRows = (
  datasets: QuestionDatasetRecord[],
  datasetType?: string | null,
): QuestionDatasetRecord[] => {
  const resolvedType = resolveDatasetLanguage(datasetType);
  if (resolvedType !== "google_sheets" || !datasets.length) {
    return datasets;
  }

  // console.log(datasets);

  return datasets.map((dataset) => {
    if (!dataset || typeof dataset !== "object") {
      return dataset;
    }

    const schemaInfo =
      dataset.schema_info && typeof dataset.schema_info === "object" && !Array.isArray(dataset.schema_info)
        ? (dataset.schema_info as QuestionDatasetSchemaInfo)
        : undefined;

    const csvSource = coalesceString(
      typeof dataset.dataset_csv_raw === "string" ? dataset.dataset_csv_raw : undefined,
      typeof schemaInfo?.dataset_csv_raw === "string" ? schemaInfo.dataset_csv_raw : undefined,
    );

    let rows =
      Array.isArray(dataset.data) && dataset.data.length > 0
        ? (dataset.data as Array<Record<string, unknown>>)
        : Array.isArray(schemaInfo?.dataset_rows) && schemaInfo.dataset_rows.length > 0
        ? schemaInfo.dataset_rows
        : [];

    if ((!rows || rows.length === 0) && csvSource && csvSource.trim().length > 0) {
      const parsed = parseCsvToObjects(csvSource);
      if (parsed.length > 0) {
        rows = parsed;
      }
    }

    if (!rows || rows.length === 0) {
      return dataset;
    }

    let columns =
      Array.isArray(dataset.columns) && dataset.columns.length > 0
        ? dataset.columns
        : Array.isArray(schemaInfo?.dataset_columns) && schemaInfo.dataset_columns.length > 0
        ? schemaInfo.dataset_columns
        : Object.keys(rows[0] ?? {});

    return {
      ...dataset,
      data: rows,
      columns,
      dataset_csv_raw: csvSource ?? dataset.dataset_csv_raw,
      schema_info: schemaInfo
        ? {
            ...schemaInfo,
            dataset_rows: schemaInfo.dataset_rows ?? rows,
            dataset_columns: schemaInfo.dataset_columns ?? columns,
            dataset_csv_raw: csvSource ?? schemaInfo.dataset_csv_raw,
          }
        : schemaInfo,
    };
  });
};

const buildPythonDatasetDetail = (
  dataset: PythonDatasetDefinition,
  index: number,
): PythonDatasetDetail => {
  const schemaInfo = dataset.schema_info;

  let csvRaw: string | undefined;

  if (typeof dataset.dataset_csv_raw === "string" && dataset.dataset_csv_raw.trim().length > 0) {
    csvRaw = extractCsvFromSource(dataset.dataset_csv_raw) ?? dataset.dataset_csv_raw;
  } else if (
    typeof schemaInfo?.dataset_csv_raw === "string" &&
    schemaInfo.dataset_csv_raw.trim().length > 0
  ) {
    csvRaw = extractCsvFromSource(schemaInfo.dataset_csv_raw) ?? schemaInfo.dataset_csv_raw;
  }

  let rawRows: unknown[] = [];
  if (Array.isArray(dataset.data) && dataset.data.length > 0) {
    rawRows = dataset.data;
  } else if (
    schemaInfo &&
    Array.isArray(schemaInfo.dataset_rows) &&
    schemaInfo.dataset_rows.length > 0
  ) {
    rawRows = schemaInfo.dataset_rows;
  } else if (csvRaw) {
    rawRows = parseCsvToObjects(csvRaw);
  }

  let columns =
    Array.isArray(dataset.columns) && dataset.columns.length > 0
      ? dataset.columns.filter((value): value is string => typeof value === "string")
      : [];

  if (
    columns.length === 0 &&
    schemaInfo &&
    Array.isArray(schemaInfo.dataset_columns) &&
    schemaInfo.dataset_columns.length > 0
  ) {
    columns = schemaInfo.dataset_columns.filter(
      (value): value is string => typeof value === "string",
    );
  }

  let objectRows: Record<string, unknown>[] = [];

  if (rawRows.length > 0) {
    const sample = rawRows[0];
    if (sample && typeof sample === "object" && !Array.isArray(sample)) {
      const typedRows = rawRows as Record<string, unknown>[];
      const columnSet = new Set(columns);
      typedRows.forEach((row) => {
        Object.keys(row).forEach((key) => {
          if (!columnSet.has(key)) {
            columnSet.add(key);
          }
        });
      });
      columns = Array.from(columnSet);
      objectRows = typedRows.map((row) => {
        const normalized: Record<string, unknown> = {};
        columns.forEach((column) => {
          normalized[column] = column in row ? row[column] : null;
        });
        return normalized;
      });
    } else if (Array.isArray(sample)) {
      const arrayRows = rawRows as unknown[][];
      const maxLength = arrayRows.reduce(
        (max, row) => (Array.isArray(row) ? Math.max(max, row.length) : max),
        columns.length,
      );
      for (let idx = 0; idx < maxLength; idx++) {
        if (!columns[idx]) {
          columns[idx] = `column_${idx + 1}`;
        }
      }
      objectRows = arrayRows.map((row) => {
        const normalized: Record<string, unknown> = {};
        columns.forEach((column, idx) => {
          normalized[column] = Array.isArray(row) ? row[idx] ?? null : null;
        });
        return normalized;
      });
    } else {
      const fallbackColumn = columns[0] || "value";
      if (!columns.length) {
        columns = [fallbackColumn];
      }
      objectRows = rawRows.map((value) => ({ [fallbackColumn]: value }));
    }
  }

  const previewRows = objectRows.map((row) => columns.map((column) => row[column] ?? null));

  const creationSqlMeta = coalesceString(
    dataset.creation_sql,
    dataset.create_sql,
    schemaInfo?.creation_sql,
    schemaInfo?.create_sql,
    (schemaInfo as Record<string, unknown> | undefined)?.data_creation_sql,
  );

  const datasetDescriptionMeta =
    (typeof dataset.description === "string" && dataset.description.trim().length > 0
      ? dataset.description
      : undefined) ??
    (typeof (schemaInfo as Record<string, unknown> | undefined)?.dataset_description === "string"
      ? String((schemaInfo as Record<string, unknown>).dataset_description)
      : undefined);

  const rawTableNames = extractDatasetTableNames(dataset, {
    creationSql: creationSqlMeta ?? null,
    description: datasetDescriptionMeta ?? null,
  });
  const tableNames: string[] = [];
  const seenTableNames = new Set<string>();
  rawTableNames.forEach((tableName) => {
    const resolved = resolveDatasetLabel(tableName);
    const key = normalizeDatasetLabel(resolved);
    if (key && !seenTableNames.has(key)) {
      seenTableNames.add(key);
      tableNames.push(resolved);
    }
  });

  const primaryTableName =
    tableNames.length > 0
      ? tableNames[0]
      : dataset.table_name ||
        schemaInfo?.dataset_table_name ||
        schemaInfo?.table_name ||
        undefined;

  const pythonVariable = sanitizePythonIdentifier(
    primaryTableName || dataset.table_name || dataset.name || `dataset_${index + 1}`,
  );

  const originalName =
    dataset.name ||
    schemaInfo?.dataset_table_name ||
    dataset.table_name ||
    `Dataset ${index + 1}`;

  const displayName = primaryTableName || pythonVariable || originalName;

  // Generate basic Python setup code for loading the dataset
  const creation_python = `import pandas as pd

# Dataset is loaded as: ${pythonVariable}`;

  const columnTypesFromSql = resolveColumnTypesFromSchema({
    columns,
    creationSql: creationSqlMeta,
    preferredTableNames: [
      primaryTableName,
      dataset.table_name,
      ...(tableNames || []),
    ],
  });

  return {
    id: dataset.id,
    name: primaryTableName || originalName,
    displayName,
    originalName,
    description: dataset.description,
    columns,
    objectRows,
    previewRows,
    pythonVariable,
    rowCount: objectRows.length,
    datasetCsv: csvRaw,
    tableNames,
    creation_python,
    loadError:
      objectRows.length === 0
        ? csvRaw
          ? "Dataset CSV could not be parsed."
          : "No structured rows available for this dataset."
      : undefined,
    columnTypes: columnTypesFromSql,
  };
};

const extractTableNamesFromSql = (value?: string | null): string[] => {
  const normalized = normalizeCreationSql(value);
  if (!normalized) {
    return [];
  }

  const sanitize = (sql: string) =>
    sql
      .replace(/--.*$/gm, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ");

  const statements = sanitize(normalized)
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  const detectedTables = new Set<string>();

  for (const statement of statements) {
    const patterns = [
      /create\s+(?:or\s+replace\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:(["`])([^"`]+)\1|\[([^\]]+)\]|([a-zA-Z0-9_.]+))/gi,
      /create\s+(?:or\s+replace\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:(["`])([^"`]+)\1|\[([^\]]+)\]|([a-zA-Z0-9_.]+))/gi,
      /insert\s+into\s+(?:(["`])([^"`]+)\1|\[([^\]]+)\]|([a-zA-Z0-9_.]+))/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(statement)) !== null) {
        const tableName = (match[2] ?? match[3] ?? match[4])?.trim();
        if (tableName) {
          detectedTables.add(tableName);
        }
      }
    }
  }

  return Array.from(detectedTables);
};

const extractTableNameFromDescription = (description?: string | null): string | null => {
  if (typeof description !== "string") {
    return null;
  }

  const trimmed = description.trim();
  if (!trimmed) {
    return null;
  }

  const parenMatch = trimmed.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (parenMatch) {
    return parenMatch[1];
  }

  const tableMatch = trimmed.match(/\btable\s+([A-Za-z_][A-Za-z0-9_]*)/i);
  if (tableMatch) {
    return tableMatch[1];
  }

  return null;
};

const extractDatasetTableNames = (
  dataset: unknown,
  meta?: { description?: string | null; creationSql?: string | null },
): string[] => {
  const normalizedNames = new Map<string, string>();
  const addName = (value?: unknown) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (/^(dataset|table)$/i.test(trimmed)) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (!normalizedNames.has(key)) {
      normalizedNames.set(key, trimmed);
    }
  };

  const datasetRecord =
    dataset && typeof dataset === "object" && !Array.isArray(dataset)
      ? (dataset as Record<string, unknown>)
      : null;

  const schemaInfo =
    datasetRecord && typeof datasetRecord["schema_info"] === "object"
      ? (datasetRecord["schema_info"] as QuestionDatasetSchemaInfo)
      : null;

  if (datasetRecord) {
    addName(datasetRecord["table_name"]);
    addName(datasetRecord["dataset_table_name"]);
    addName((datasetRecord["tableName"] as string) ?? undefined);

    const datasetTables = datasetRecord["tables"];
    if (Array.isArray(datasetTables)) {
      datasetTables.forEach(addName);
    }

    const datasetTableNames = datasetRecord["table_names"];
    if (Array.isArray(datasetTableNames)) {
      datasetTableNames.forEach(addName);
    }

    const datasetDatasetTables = datasetRecord["dataset_tables"];
    if (Array.isArray(datasetDatasetTables)) {
      datasetDatasetTables.forEach(addName);
    }
  }

  if (schemaInfo) {
    addName(schemaInfo.table_name as string | undefined);
    addName(schemaInfo.dataset_table_name);

    const schemaTables = (schemaInfo as Record<string, unknown>)?.tables;
    if (Array.isArray(schemaTables)) {
      (schemaTables as unknown[]).forEach(addName);
    }

    const schemaDatasetTables = (schemaInfo as Record<string, unknown>)?.dataset_tables;
    if (Array.isArray(schemaDatasetTables)) {
      (schemaDatasetTables as unknown[]).forEach(addName);
    }
  }

  const collectCreationSql = (value?: unknown) => {
    if (typeof value === "string" && value.trim().length > 0) {
      extractTableNamesFromSql(value).forEach(addName);
    }
  };

  if (datasetRecord) {
    collectCreationSql(datasetRecord["creation_sql"]);
    collectCreationSql(datasetRecord["create_sql"]);
    collectCreationSql(datasetRecord["data_creation_sql"]);
    collectCreationSql(datasetRecord["sql"]);
    collectCreationSql(datasetRecord["dataset_sql"]);
  }

  if (schemaInfo) {
    collectCreationSql(schemaInfo.creation_sql);
    collectCreationSql(schemaInfo.create_sql);
    const schemaDataCreationSql = (schemaInfo as Record<string, unknown>)?.data_creation_sql;
    if (typeof schemaDataCreationSql === "string") {
      collectCreationSql(schemaDataCreationSql);
    }
  }

  if (typeof dataset === "string") {
    collectCreationSql(dataset);
  }

  if (meta?.creationSql) {
    collectCreationSql(meta.creationSql);
  }

  const parseAndAdd = (value?: string | null) => {
    const tableName = extractTableNameFromDescription(value);
    if (tableName) {
      addName(tableName);
    }
  };

  if (datasetRecord) {
    parseAndAdd(datasetRecord["dataset_description"] as string | undefined);
    parseAndAdd(datasetRecord["description"] as string | undefined);
  }

  if (schemaInfo) {
    parseAndAdd((schemaInfo as Record<string, unknown>)?.dataset_description as string | undefined);
  }

  if (meta?.description) {
    parseAndAdd(meta.description);
  }

  return Array.from(normalizedNames.values());
};

const inferTableNameFromSql = (value?: string | null): string | undefined => {
  const tables = extractTableNamesFromSql(value);
  return tables.length > 0 ? tables[0] : undefined;
};

const deriveDatasetKey = (dataset: {
  id?: string | null;
  table_name?: string | null;
  creation_sql?: string | null | undefined;
  create_sql?: string | null | undefined;
}) => {
  const creationSql = coalesceString(dataset.creation_sql, dataset.create_sql);
  if (creationSql && typeof creationSql === "string" && creationSql.trim().length > 0) {
    return `sql:${creationSql.trim()}`;
  }
  if (dataset.table_name && typeof dataset.table_name === "string") {
    return `table:${dataset.table_name}`;
  }
  if (dataset.id && typeof dataset.id === "string") {
    return `id:${dataset.id}`;
  }
  return undefined;
};

const normalizeDatasetLabel = (value?: string | null): string => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : "";
};

const resolveDatasetLabel = (value?: string | null, fallback = "Dataset"): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const dedupeByLabel = <T,>(items: T[], getLabel: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeDatasetLabel(getLabel(item));
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const parseQuestionContentObject = (
  value: unknown,
): Record<string, unknown> | null => {
  if (!value || Array.isArray(value)) {
    return null;
  }
  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (error) {
      return null;
    }
  }
  return null;
};

const normalizeExpectedOutputColumns = (...candidates: Array<unknown>): string[] => {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) {
      continue;
    }

    if (Array.isArray(candidate)) {
      const normalized = candidate
        .map(value => {
          if (typeof value === "string") {
            return value.trim();
          }
          if (value === null || value === undefined) {
            return "";
          }
          return `${value}`.trim();
        })
        .filter(value => value.length > 0);
      if (normalized.length > 0) {
        return normalized;
      }
      continue;
    }

    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (!trimmed) {
        continue;
      }

      if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || trimmed.includes("\"")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            const normalized = parsed
              .map(value => {
                if (typeof value === "string") {
                  return value.trim();
                }
                if (value === null || value === undefined) {
                  return "";
                }
                return `${value}`.trim();
              })
              .filter(value => value.length > 0);
            if (normalized.length > 0) {
              return normalized;
            }
            continue;
          }
        } catch (error) {
          // Fall through to comma-separated parsing
        }
      }

      const parts = trimmed
        .split(',')
        .map(value => value.trim())
        .filter(value => value.length > 0);
      if (parts.length > 0) {
        return parts;
      }
    }
  }

  return [];
};

const exerciseHasSubmissionData = (exercise: any): boolean => {
  if (!exercise || typeof exercise !== "object") {
    return false;
  }
  const questionList = Array.isArray(exercise.section_exercise_questions)
    ? exercise.section_exercise_questions
    : Array.isArray(exercise.questions)
    ? exercise.questions
    : [];
  return questionList.some((question: any) => {
    if (!question || typeof question !== "object") return false;
    const submission =
      (question as any).latestSubmission ||
      (question as any).latest_submission ||
      (question as any).latest_submission_record;
    const completed =
      (question as any).isCompleted === true ||
      (question as any).is_completed === true;
    return Boolean(submission || completed);
  });
};

const normalizeLatestSubmissionRecord = (submission: unknown): LatestSubmissionSummary | null => {
  if (!submission || typeof submission !== "object") {
    return null;
  }
  const record = submission as Record<string, unknown>;
  const userAnswer =
    typeof record.userAnswer === "string"
      ? record.userAnswer
      : typeof record.user_answer === "string"
      ? record.user_answer
      : "";
  const isCorrect =
    record.isCorrect === true ||
    record.is_correct === true ||
    (typeof record.verdict === "string"
      ? record.verdict.toLowerCase() === "correct"
      : false);
  const score =
    typeof record.score === "number"
      ? record.score
      : typeof record.points === "number"
      ? record.points
      : 0;
  const feedback =
    typeof record.feedback === "string" ? record.feedback : "";
  const verdict =
    typeof record.verdict === "string"
      ? record.verdict
      : isCorrect
      ? "Correct"
      : "Incorrect";
  const evaluation =
    record.evaluation && typeof record.evaluation === "object"
      ? (record.evaluation as Record<string, unknown>)
      : null;
  const executionResult =
    record.executionResult && typeof record.executionResult === "object"
      ? (record.executionResult as Record<string, unknown>)
      : record.execution_result && typeof record.execution_result === "object"
      ? (record.execution_result as Record<string, unknown>)
      : null;
  const submittedAt =
    typeof record.submittedAt === "string"
      ? record.submittedAt
      : typeof record.submitted_at === "string"
      ? record.submitted_at
      : undefined;
  const attemptNumber =
    typeof record.attemptNumber === "number"
      ? record.attemptNumber
      : typeof record.attempt_number === "number"
      ? record.attempt_number
      : undefined;

  return {
    userAnswer,
    isCorrect,
    score,
    feedback,
    verdict,
    evaluation,
    executionResult,
    submittedAt,
    attemptNumber,
  };
};

const normalizePracticeDifficulty = (value: unknown): GamificationDifficulty | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["hard", "advanced", "challenging"].includes(normalized)) return "hard";
  if (["medium", "moderate", "intermediate"].includes(normalized)) return "medium";
  if (["easy", "beginner", "simple"].includes(normalized)) return "easy";
  return null;
};

const resolvePracticeQuestionDifficulty = (
  question: any,
  exerciseDifficulty: string | null | undefined,
): GamificationDifficulty => {
  const fallback = normalizePracticeDifficulty(exerciseDifficulty) ?? "medium";
  if (!question || typeof question !== "object") {
    return fallback;
  }
  const candidates: unknown[] = [
    question?.difficulty,
    question?.difficulty_level,
    question?.difficulty_override,
    question?.difficultyLevel,
    question?.metadata?.difficulty,
    question?.content?.difficulty,
  ];
  for (const candidate of candidates) {
    const normalized = normalizePracticeDifficulty(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return fallback;
};

const normalizeQuizDifficultyValue = (
  value: unknown,
): GamificationDifficulty | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["hard", "advanced", "challenging"].includes(normalized)) {
    return "hard";
  }
  if (["medium", "moderate", "intermediate"].includes(normalized)) {
    return "medium";
  }
  if (["easy", "beginner", "simple"].includes(normalized)) {
    return "easy";
  }
  return null;
};

const getQuizQuestionDifficulty = (
  question?: QuizQuestion | null,
): GamificationDifficulty | null => {
  if (!question) {
    return null;
  }
  const record = question as Record<string, any>;
  const contentCandidate =
    record?.content && typeof record.content === "object" && !Array.isArray(record.content)
      ? record.content?.difficulty
      : undefined;
  const candidates = [
    record?.difficulty,
    record?.difficulty_level,
    record?.question_difficulty,
    record?.metadata?.difficulty,
    record?.meta?.difficulty,
    contentCandidate,
    record?.quiz_metadata?.difficulty,
    record?.question_metadata?.difficulty,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeQuizDifficultyValue(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

const resolveQuizQuestionDifficulty = (
  question?: QuizQuestion | null,
  fallback: GamificationDifficulty = "medium",
): GamificationDifficulty => {
  return getQuizQuestionDifficulty(question) ?? fallback;
};

const normalizeSectionExerciseQuestion = (
  question: any,
  options: { exerciseId?: string; fallbackIndex?: number } = {},
) => {
  const { exerciseId, fallbackIndex } = options;

  const normalizedContent =
    parseQuestionContentObject(question?.content) as Record<string, unknown> | null;
  const rawId =
    question?.id ??
    question?.question_id ??
    question?.questionId ??
    (typeof fallbackIndex === "number" && exerciseId
      ? `${exerciseId}-${fallbackIndex}`
      : fallbackIndex ?? null);

  const normalizedId =
    typeof rawId === "number"
      ? String(rawId)
      : typeof rawId === "string" && rawId
      ? rawId
      : `question-${fallbackIndex ?? 0}`;

  const contentText =
    typeof question?.content === "string" && !normalizedContent
      ? question.content
      : normalizedContent && typeof normalizedContent.text === "string"
      ? (normalizedContent.text as string)
      : undefined;

  const normalizedTextCandidate = resolveQuestionTextPreservingFormatting(
    typeof question?.text === "string" ? question.text : undefined,
    typeof question?.question_text === "string" ? question.question_text : undefined,
    typeof question?.business_question === "string" ? question.business_question : undefined,
    typeof question?.prompt === "string" ? question.prompt : undefined,
    typeof question?.description === "string" ? question.description : undefined,
    typeof question?.body === "string" ? question.body : undefined,
    contentText,
  );

  const normalizedText =
    normalizedTextCandidate && normalizedTextCandidate.trim().length > 0
      ? normalizedTextCandidate
      : "";

  const normalizedType =
    pickNormalizedQuestionType(
      question?.question_type,
      question?.type,
      (question as any)?.practice_type,
      (question as any)?.practiceType,
      (question as any)?.question_category,
      (question as any)?.questionCategory,
      (question as any)?.questionType,
      (question as any)?.category,
      (question as any)?.subject_type,
      (question as any)?.subjectType,
      (question as any)?.kind,
    ) ?? "sql";

  const derivedExerciseId =
    question?.exercise_id ??
    question?.exerciseId ??
    (typeof exerciseId === "string" ? exerciseId : undefined);

  const normalizedExerciseId =
    typeof derivedExerciseId === "string" && derivedExerciseId
      ? derivedExerciseId
      : typeof derivedExerciseId === "number"
      ? String(derivedExerciseId)
      : typeof exerciseId === "string"
      ? exerciseId
      : undefined;

  const normalizedOrderIndex =
    typeof question?.order_index === "number"
      ? question.order_index
      : typeof fallbackIndex === "number"
      ? fallbackIndex
      : 0;

  const datasetType = normalizedType;
  const creationSource = coalesceString(
    question?.creation_sql,
    (question as { create_sql?: unknown })?.create_sql,
    question?.dataset,
    question?.sql,
  );
  const normalizedCreationSql = normalizeCreationSql(creationSource, { datasetType });

  const expectedOutputColumns = normalizeExpectedOutputColumns(
    question?.expected_output_table,
    normalizedContent?.expected_output_table,
  );
  const resolvedContent =
    normalizedContent && expectedOutputColumns.length > 0
      ? {
          ...normalizedContent,
          expected_output_table: expectedOutputColumns,
        }
      : normalizedContent ?? question?.content ?? null;

  const normalizedSubmission = normalizeLatestSubmissionRecord(
    (question as { latestSubmission?: unknown })?.latestSubmission,
  );
  const normalizedAttempts =
    typeof (question as { totalAttempts?: unknown })?.totalAttempts === "number"
      ? Number((question as { totalAttempts?: unknown })?.totalAttempts)
      : typeof normalizedSubmission?.attemptNumber === "number"
      ? normalizedSubmission.attemptNumber
      : undefined;
  const normalizedCompletionFlag =
    typeof (question as { isCompleted?: unknown })?.isCompleted === "boolean"
      ? Boolean((question as { isCompleted?: unknown }).isCompleted)
      : Boolean(normalizedSubmission?.isCorrect);

  return {
    ...question,
    content: resolvedContent,
    id: normalizedId,
    dataset: normalizeCreationSql(question?.dataset, { datasetType }),
    creation_sql: normalizedCreationSql,
    create_sql: normalizedCreationSql ?? undefined,
    text: normalizedText,
    question_text: normalizedText,
    question_type: normalizedType,
    type: normalizedType,
    exercise_id: normalizedExerciseId,
    order_index: normalizedOrderIndex,
    expected_output_table:
      expectedOutputColumns.length > 0
        ? expectedOutputColumns
        : Array.isArray(question?.expected_output_table)
        ? question.expected_output_table
        : undefined,
    latestSubmission: normalizedSubmission,
    isCompleted: normalizedCompletionFlag,
    totalAttempts: normalizedAttempts,
  };
};

const mergeExerciseProgress = (exercise: any, progressExercise: any) => {
  if (!progressExercise || typeof progressExercise !== "object") {
    return exercise;
  }
  const questionSource = Array.isArray(progressExercise.section_exercise_questions)
    ? progressExercise.section_exercise_questions
    : Array.isArray(progressExercise.questions)
    ? progressExercise.questions
    : [];
  const normalizedQuestions = questionSource.map((question: any, index: number) =>
    normalizeSectionExerciseQuestion(question, {
      exerciseId: progressExercise?.id ? String(progressExercise.id) : undefined,
      fallbackIndex: index,
    }),
  );
  const exerciseDatasetType = resolveDatasetLanguage(
    progressExercise?.subject_type ?? exercise?.subject_type,
    progressExercise?.exercise_type ?? exercise?.exercise_type,
    progressExercise?.practice_type ?? exercise?.practice_type,
    progressExercise?.type ?? exercise?.type,
  );
  return {
    ...exercise,
    ...progressExercise,
    dataset: normalizeCreationSql(
      progressExercise?.data ?? progressExercise?.dataset ?? exercise?.dataset,
      { datasetType: exerciseDatasetType },
    ),
    section_exercise_questions: normalizedQuestions,
  };
};


const resolveQuestionTextPreservingFormatting = (...sources: Array<unknown>): string => {
  for (const source of sources) {
    if (typeof source === "string" && source.trim().length > 0) {
      return source;
    }
  }

  for (const source of sources) {
    if (typeof source === "string") {
      return source;
    }
  }

  return "";
};

const normalizeAdaptiveQuestion = <T extends Record<string, unknown> | null | undefined>(
  question: T,
): T => {
  if (!question || typeof question !== "object") {
    return question;
  }

  const normalizedText = resolveQuestionTextPreservingFormatting(
    (question as Record<string, unknown>).text,
    (question as Record<string, unknown>).question_text,
    (question as Record<string, unknown>).prompt,
    (question as Record<string, unknown>).content,
  );

  const result = {
    ...question,
  } as Record<string, unknown>;

  if (typeof (question as Record<string, unknown>).text === "string") {
    const textValue = (question as Record<string, unknown>).text as string;
    result.text = textValue.trim().length > 0 ? textValue : normalizedText;
  } else if (normalizedText) {
    result.text = normalizedText;
  }

  result.question_text = normalizedText;

  return result as T;
};

const normalizeAdaptiveSummary = (summary: any) => {
  if (!summary || typeof summary !== "object") {
    return summary;
  }

  const normalizedResponses = Array.isArray(summary.responses)
    ? summary.responses.map((response: any) => normalizeAdaptiveQuestion(response))
    : summary.responses;

  return {
    ...summary,
    current_question: normalizeAdaptiveQuestion(summary.current_question),
    next_question: normalizeAdaptiveQuestion(summary.next_question),
    responses: normalizedResponses,
  };
};

const FALLBACK_SOURCES: string[] = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://iframe.mediadelivery.net/play/243528/c28b69a3-5301-455f-ab5a-9d24c4fef2da",
  "https://iframe.mediadelivery.net/play/243528/da4481d9-69c5-4fc4-aa1f-54f84c83a85f",
  "https://iframe.mediadelivery.net/play/243528/ff8d7d62-bdb8-46f2-ae92-ae12e6ad77bf",
  "https://iframe.mediadelivery.net/play/243528/3f874639-8a68-47b9-aabb-9e28af35120b",

  `# Introduction to Data Analysis

## Overview

This comprehensive lesson covers the fundamentals of data analysis, including:

- Data collection and preparation methods

- Statistical analysis techniques

- Data visualization best practices

- Common pitfalls and how to avoid them

## Learning Objectives

By the end of this lesson, you will be able to:

1. Understand different types of data and their characteristics

2. Apply appropriate analytical techniques for your dataset

3. Create meaningful visualizations to communicate insights

4. Validate your findings and ensure accuracy`,

  `# Advanced SQL Techniques

## Window Functions

Window functions allow you to perform calculations across a set of table rows related to the current row:

\`\`\`sql

SELECT 

  employee_name,

  salary,

  AVG(salary) OVER (PARTITION BY department) as dept_avg_salary

FROM employees;

\`\`\`

## Key Concepts

- OVER clause defines the window

- PARTITION BY groups rows

- ORDER BY defines sequence within partition

## Practice Exercises

Complete the following exercises to reinforce your understanding.`,

  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",

  "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80",

];

const getLectures = (section?: Section | null): Lecture[] => {
  // console.log("section:", section);
  if (!section) return [];
  const lectureList = Array.isArray(section.lectures)
    ? section.lectures.filter((lecture): lecture is Lecture => Boolean(lecture))
    : [];
  const fallbackLecture = section.lecture;
  const mergedLectures = fallbackLecture
    ? (() => {
        if (fallbackLecture.id) {
          const hasSameId = lectureList.some((lecture) => lecture.id === fallbackLecture.id);
          if (hasSameId) {
            return lectureList;
          }
        }
        return [fallbackLecture, ...lectureList];
      })()
    : lectureList;
  return sortEntitiesByOrderIndex<Lecture>(mergedLectures);
};

const DEFAULT_LECTURE_DURATION_MINUTES = 6;
const LECTURE_COMPLETION_RETRY_INTERVAL_MS = 5 * 1000;
const LECTURE_TRACKER_INITIAL_SETTLE_SECONDS = 1;

const clampUnitValue = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

const parseDurationCandidate = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const extractDurationFromContent = (content: unknown): number | null => {
  if (!content) {
    return null;
  }
  if (typeof content === "object") {
    const duration = parseDurationCandidate((content as Record<string, unknown>).duration);
    if (duration !== null) {
      return duration;
    }
    const nested = (content as Record<string, unknown>).content;
    if (nested && typeof nested === "object") {
      return parseDurationCandidate((nested as Record<string, unknown>).duration);
    }
    return null;
  }
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        return extractDurationFromContent(parsed);
      } catch {
        return null;
      }
    }
  }
  return null;
};

const resolveLectureDurationMinutes = (lecture?: Lecture | null): number | null => {
  if (!lecture) {
    return null;
  }
  const direct = parseDurationCandidate((lecture as Record<string, unknown>).duration);
  if (direct !== null) {
    return direct;
  }
  return extractDurationFromContent(lecture.content);
};

const getLectureKey = (lecture: Lecture, sectionId: string | null, index: number) =>
  lecture.id ?? `${sectionId ?? 'section'}-lecture-${index}`;

const getExercises = (section?: Section | null): Exercise[] => {

  if (!section || !Array.isArray(section.exercises)) return [];

  return section.exercises.filter(Boolean);

};

const getQuizzes = (section?: Section | null): Quiz[] => {

  if (!section || !Array.isArray(section.quizzes)) return [];

  return section.quizzes.filter(Boolean);

};

const getAdaptiveQuizzes = (section?: Section | null): Array<{ id: string; title: string }> => {
  if (!section) return [];
  return [{ id: `adaptive-${section.id}`, title: "AI Adaptive Quiz" }];
};

const deriveSectionRequirementApplicability = (section?: Section | null): RequirementApplicabilities => {
  const lectures = getLectures(section);
  const exercises = getExercises(section);
  const quizzes = getQuizzes(section);
  return {
    lectures: lectures.length > 0,
    quiz: quizzes.length > 0,
    exercise: exercises.length > 0,
  };
};

const applySectionRequirementApplicability = (
  summary: ModuleRequirementSummary,
  section?: Section | null,
): ModuleRequirementSummary => {
  const applicability = deriveSectionRequirementApplicability(section);
  const hasLectures = applicability.lectures;
  const hasQuiz = applicability.quiz;
  const hasExercise = applicability.exercise;
  return {
    ...summary,
    lecturesApplicable: hasLectures ? summary.lecturesApplicable ?? true : false,
    // Preserve backend-calculated quiz applicability; fall back to local quiz availability when backend is silent.
    quizApplicable:
      summary.quizApplicable !== undefined
        ? summary.quizApplicable
        : hasQuiz
        ? true
        : false,
    exerciseApplicable: hasExercise ? summary.exerciseApplicable ?? true : false,
  };
};

const quizHasQuestions = (quiz?: Quiz | null): boolean => {
  if (!quiz) return false;
  const relationalQuestions = Array.isArray(quiz.quiz_questions)
    ? quiz.quiz_questions.filter(Boolean)
    : [];
  if (relationalQuestions.length > 0) {
    return true;
  }

  const rawQuestions = (quiz as any)?.questions;
  if (Array.isArray(rawQuestions)) {
    return rawQuestions.filter(Boolean).length > 0;
  }
  if (typeof rawQuestions === "number") {
    return rawQuestions > 0;
  }

  const questionCount = (quiz as any)?.questionCount;
  if (typeof questionCount === "number") {
    return questionCount > 0;
  }

  return false;
};

const getDefaultResource = (section?: Section | null): SelectedResource | null => {

  if (!section) return null;

  const lectures = getLectures(section);

  if (lectures.length) {

      return {

        sectionId: section.id,

        kind: "lecture",

        resourceId: getLectureKey(lectures[0], section.id ?? null, 0),

      };

  }

  const quizzes = getQuizzes(section);

  if (quizzes.length) {

    return { sectionId: section.id, kind: "quiz", resourceId: quizzes[0]?.id };

  }

  const adaptiveQuizzes = getAdaptiveQuizzes(section);

  if (adaptiveQuizzes.length) {

    return { sectionId: section.id, kind: "adaptive_quiz", resourceId: adaptiveQuizzes[0]?.id };

  }

  const exercises = getExercises(section);

  if (exercises.length) {

    return { sectionId: section.id, kind: "exercise", resourceId: exercises[0]?.id };

  }

  return null;

};

type LessonToolConfig = {
  aiHint?: boolean;
  aiExercise?: boolean;
  playground?: boolean;
  aiSubmission?: boolean;
  aiAdaptiveQuiz?: boolean;
};

export function SubjectLearningInterface({
  trackTitle,
  subjectTitle,
  subjectModules,
  completedSections,
  totalSections,
  courseId,
  subjectId,
  initialModuleSlug,
  courseSlugForUrl,
  subjectSlugForUrl,
  allowedModuleIds,
  moduleStatusOverrides,
  lessonToolConfigBySection,
  showRequirements = true,
  lockModules = true,
}: {
  trackTitle: string;
  subjectTitle?: string | null;
  subjectModules: Module[];
  completedSections: number;
  totalSections: number;
  courseId: string;
  subjectId: string;
  initialModuleSlug?: string;
  courseSlugForUrl?: string;
  subjectSlugForUrl?: string;
  allowedModuleIds?: string[];
  moduleStatusOverrides?: Record<string, string | null | undefined>;
  lessonToolConfigBySection?: Record<string, LessonToolConfig>;
  showRequirements?: boolean;
  lockModules?: boolean;
}) {
  // Authentication state
  const [userId, setUserId] = useState<string | null>(null);
  const isAuthenticated = useMemo(() => Boolean(userId), [userId]);

  const [debugUiEnabled, setDebugUiEnabled] = useState(false);
  useEffect(() => {
    setDebugUiEnabled(true);
  }, []);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let isMounted = true;

    const syncSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;
        setUserId(session?.user?.id ?? null);
      } catch (error) {
        console.error("Failed to get session:", error);
      }
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    syncSession();

    return () => {
      isMounted = false;
      subscription?.subscription.unsubscribe();
    };
  }, []);

  const [watchedLectureIds, setWatchedLectureIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated) {
      setWatchedLectureIds(new Set());
      return;
    }
    let cancelled = false;
    const fetchWatchedLectures = async () => {
      try {
        const params = new URLSearchParams();
        if (courseId) params.set("courseId", courseId);
        if (subjectId) params.set("subjectId", subjectId);
        const queryString = params.toString();
        const endpoint = queryString
          ? `/api/learning-paths/user/progress/lectures?${queryString}`
          : `/api/learning-paths/user/progress/lectures`;
        const response = await fetch(endpoint);
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        if (!payload || cancelled) return;
        const ids = Array.isArray(payload.watchedLectureIds)
          ? payload.watchedLectureIds
              .map((id: unknown) => (typeof id === "string" ? id : undefined))
              .filter((value): value is string => Boolean(value))
          : [];
        setWatchedLectureIds(new Set(ids));
      } catch (error) {
        console.warn("Failed to fetch watched lectures", error);
      }
    };
    fetchWatchedLectures();
    return () => {
      cancelled = true;
    };
  }, [courseId, subjectId, isAuthenticated]);

  const allowedModulesStorageKey = useMemo(() => {
    if (!courseId || !subjectId || !userId) return null;
    return `jarvis-allowed-modules:${userId}:${courseId}:${subjectId}`;
  }, [courseId, subjectId, userId]);

  const getStoredAllowedModuleIds = useCallback((): string[] | undefined => {
    if (typeof window === "undefined" || !allowedModulesStorageKey) return undefined;
    try {
      const raw = window.localStorage.getItem(allowedModulesStorageKey);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return undefined;
      const normalized = parsed
        .map((value) => (typeof value === "string" ? value : undefined))
        .filter((value): value is string => Boolean(value));
      return normalized.length ? normalized : undefined;
    } catch {
      return undefined;
    }
  }, [allowedModulesStorageKey]);

  const [dynamicAllowedModuleIds, setDynamicAllowedModuleIds] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    if (!allowedModulesStorageKey) return;
    const stored = getStoredAllowedModuleIds();
    if (stored && stored.length) {
      const unique = Array.from(new Set(stored));
      setDynamicAllowedModuleIds(unique.length ? unique : undefined);
    }
  }, [allowedModulesStorageKey, getStoredAllowedModuleIds]);

  useEffect(() => {
    if (!allowedModulesStorageKey) return;
    try {
      if (!dynamicAllowedModuleIds || dynamicAllowedModuleIds.length === 0) {
        window.localStorage.removeItem(allowedModulesStorageKey);
      } else {
        const payload = JSON.stringify(dynamicAllowedModuleIds);
        window.localStorage.setItem(allowedModulesStorageKey, payload);
      }
    } catch {
      // ignore storage write errors
    }
  }, [allowedModulesStorageKey, dynamicAllowedModuleIds]);

  const [moduleStatusMap, setModuleStatusMap] = useState<Map<string, Module["moduleStatus"]>>(new Map());
  const [hasHydrated, setHasHydrated] = useState(false);
  const awardedBadgesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const badgeStorageKey = useMemo(() => {
    if (!userId) return null;
    return `${MODULE_BADGE_STORAGE_PREFIX}:${userId}`;
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!badgeStorageKey) {
      awardedBadgesRef.current = new Set();
      return;
    }
    try {
      const stored = window.localStorage.getItem(badgeStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          awardedBadgesRef.current = new Set(parsed.map((code) => String(code)));
          return;
        }
      }
    } catch {
      // ignore hydration errors
    }
    awardedBadgesRef.current = new Set();
  }, [badgeStorageKey]);

  const persistAwardedBadges = useCallback(() => {
    if (typeof window === "undefined" || !badgeStorageKey) return;
    try {
      window.localStorage.setItem(
        badgeStorageKey,
        JSON.stringify(Array.from(awardedBadgesRef.current)),
      );
    } catch {
      // ignore storage write errors
    }
  }, [badgeStorageKey]);

  const maybeAwardModuleBadge = useCallback(
    async (badgeCode: string, reason: string, referenceId?: string) => {
      if (!userId) return;
      if (awardedBadgesRef.current.has(badgeCode)) return;
      try {
        const result = await awardBadge({
          userId,
          badgeCode,
          reason,
          referenceId,
        });
        if (result?.success || result?.duplicate) {
          awardedBadgesRef.current.add(badgeCode);
          persistAwardedBadges();
        }
      } catch (error) {
        console.error("Failed to award badge:", error);
      }
    },
    [userId, persistAwardedBadges],
  );
  const [sectionRequirementStatuses, setSectionRequirementStatuses] = useState<
    Record<string, ModuleRequirementSummary>
  >({});
  const completedSectionIdsRef = useRef<Set<string>>(new Set());

  const sectionStatusStorageKey = useMemo(() => {
    if (!userId || !subjectId) {
      return null;
    }
    return `${SECTION_STATUS_STORAGE_PREFIX}:${userId}:${subjectId}`;
  }, [userId, subjectId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!sectionStatusStorageKey) {
      return;
    }
    try {
      const stored = window.localStorage.getItem(sectionStatusStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, ModuleRequirementSummary>;
        if (parsed && typeof parsed === 'object') {
          setSectionRequirementStatuses(parsed);
          const completedIds = Object.entries(parsed)
            .filter(([, summary]) => summary?.completed)
            .map(([id]) => id);
          completedSectionIdsRef.current = new Set(completedIds);
        }
      }
    } catch (error) {
      console.warn('Failed to hydrate section requirement statuses from storage:', error);
    }
  }, [sectionStatusStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!userId) {
      return;
    }
    try {
      if (!sectionStatusStorageKey) {
        return;
      }
      window.localStorage.setItem(sectionStatusStorageKey, JSON.stringify(sectionRequirementStatuses));
    } catch (error) {
      console.warn('Failed to persist section requirement statuses:', error);
    }
  }, [sectionStatusStorageKey, sectionRequirementStatuses]);

  const orderedSubjectModules = useMemo(() => {
    const modules = Array.isArray(subjectModules) ? subjectModules : [];
    if (!modules.length) {
      return [];
    }
    return sortEntitiesByOrderIndex<Module>(modules).map((module) => ({
      ...module,
      sections: sortEntitiesByOrderIndex<Section>(module?.sections),
    }));
  }, [subjectModules]);

  const getSectionRequirementSummary = useCallback(
    (section?: Section | null): ModuleRequirementSummary => {
      if (!section) {
        return EMPTY_REQUIREMENT_SUMMARY;
      }
      if (section.id && sectionRequirementStatuses[section.id]) {
        return applySectionRequirementApplicability(
          sectionRequirementStatuses[section.id],
          section,
        );
      }
      if (section.requirementSummary) {
        return applySectionRequirementApplicability(
          section.requirementSummary,
          section,
        );
      }
      return applySectionRequirementApplicability(EMPTY_REQUIREMENT_SUMMARY, section);
    },
    [sectionRequirementStatuses],
  );

  const moduleIdentifierList = useMemo(
    () =>
      Array.from(
        new Set(
          (orderedSubjectModules || [])
            .map((module) => module?.id || module?.slug)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [orderedSubjectModules],
  );


  const fetchModuleStatuses = useCallback(async () => {
    if (!moduleIdentifierList.length) {
      setModuleStatusMap(new Map());
      return;
    }
    try {
      const response = await fetch("/api/learning-paths/user/module-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleIds: moduleIdentifierList }),
      });
      if (!response.ok) {
        console.warn("Failed to load module completion statuses:", response.status);
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object") return;
      const statuses = (payload.statuses ?? {}) as Record<string, Module["moduleStatus"] | undefined>;
      const nextMap = new Map<string, Module["moduleStatus"]>();
      moduleIdentifierList.forEach((id) => {
        if (statuses[id]) {
          nextMap.set(id, statuses[id]);
        }
      });
      setModuleStatusMap(nextMap);
    } catch (error) {
      console.warn("Failed to fetch module completion statuses:", (error as any)?.message || error);
    }
  }, [moduleIdentifierList]);

  useEffect(() => {
    fetchModuleStatuses();
  }, [fetchModuleStatuses]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSectionRequirementStatuses({});
      completedSectionIdsRef.current.clear();
      setSectionQuizSummaries({});
      setCompletedSectionQuizzes({});
      setQuizSummarySectionId(null);
      setQuizSummarySnapshot(null);
      setQuizSummaryOpen(false);
      setQuizSubmitted(false);
    }
  }, [isAuthenticated]);

  const getModuleRequirementSummary = useCallback(
    (module?: Module): ModuleRequirementSummary => {
      if (!module) {
        return EMPTY_REQUIREMENT_SUMMARY;
      }
      const moduleSections = (module.sections || []).filter(
        (section): section is Section => Boolean(section?.id),
      );
      if (!moduleSections.length) {
        return module.requirementSummary ?? EMPTY_REQUIREMENT_SUMMARY;
      }
      const sectionSummaries = moduleSections.map((section) =>
        getSectionRequirementSummary(section),
      );
      const lecturesSatisfied = sectionSummaries.every((summary) => summary.lecturesSatisfied);
      const adaptiveSatisfied = sectionSummaries.every((summary) => summary.adaptiveSatisfied);
      const exerciseSatisfied = sectionSummaries.every((summary) => summary.exerciseSatisfied);
      const lecturesApplicable = sectionSummaries.some(
        (summary) => summary.lecturesApplicable ?? true,
      );
      const quizApplicable = sectionSummaries.some(
        (summary) => summary.quizApplicable ?? true,
      );
      const exerciseApplicable = sectionSummaries.some(
        (summary) => summary.exerciseApplicable ?? true,
      );
      const totalSections = moduleSections.length;
      const completedSections = sectionSummaries.filter((summary) => summary.completed).length;
      const progressPercent =
        totalSections === 0 ? 0 : Math.round((completedSections / totalSections) * 100);
      const completed = completedSections >= totalSections;
      return buildRequirementSummary({
        lecturesSatisfied,
        adaptiveSatisfied,
        exerciseSatisfied,
        requirementApplicabilities: {
          lectures: lecturesApplicable,
          quiz: quizApplicable,
          exercise: exerciseApplicable,
        },
        totalCount: totalSections,
        metCount: completedSections,
        progressPercent,
        completed,
      });
    },
    [sectionRequirementStatuses, getSectionRequirementSummary],
  );

  const isModuleProgressComplete = useCallback((module?: Module) => {
    const progress = module?.moduleStatus?.progress;
    return typeof progress === "number" && Number.isFinite(progress) && progress >= 100;
  }, []);

  const isModuleConsideredComplete = useCallback(
    (module?: Module, summary?: ModuleRequirementSummary) => {
      return Boolean(summary?.completed) || isModuleProgressComplete(module);
    },
    [isModuleProgressComplete],
  );

  const enhancedModules = useMemo(() => {
    if (!orderedSubjectModules || orderedSubjectModules.length === 0) return [];
    return orderedSubjectModules.map((module) => {
      const key = module?.id || module?.slug;
      const status = key ? moduleStatusMap.get(String(key)) : undefined;
      const mergedModule: Module = {
        ...module,
        moduleStatus: status
          ? {
              ...module.moduleStatus,
              ...status,
            }
          : module.moduleStatus,
      };
      const summary = getModuleRequirementSummary(mergedModule);
      return {
        ...mergedModule,
        requirementSummary: summary,
        completed: summary.completed,
      };
    });
  }, [orderedSubjectModules, moduleStatusMap, getModuleRequirementSummary]);

  const allModules = useMemo(() => enhancedModules, [enhancedModules]);


  const moduleStatusOverrideMap = useMemo(() => {
    if (!moduleStatusOverrides) {
      return new Map<string, string>();
    }
    const map = new Map<string, string>();
    Object.entries(moduleStatusOverrides).forEach(([key, value]) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
          map.set(String(key), trimmed);
        }
      }
    });
    return map;
  }, [moduleStatusOverrides]);


  const moduleMetaLookup = useMemo(() => {
    const map = new Map<
      string,
      { status?: string; is_mandatory?: boolean; is_active?: boolean; active?: string }
    >();
    (allModules || []).forEach((module) => {
      const key = module?.slug || module?.id;
      if (!key) return;
      const normalizedKey = String(key);
      const overrideStatus = moduleStatusOverrideMap.get(normalizedKey);
      map.set(normalizedKey, {
        status: overrideStatus ?? module?.status,
        is_mandatory: module?.is_mandatory,
        is_active: module?.is_active,
        active: module?.active,
      });
    });
    return map;
  }, [allModules, moduleStatusOverrideMap]);

  const getModuleStatusValue = useCallback(
    (module?: Module) => {
      if (!module) return undefined;
      const key = module?.slug || module?.id;
      if (key) {
        const normalizedKey = String(key);
        if (moduleStatusOverrideMap.has(normalizedKey)) {
          return moduleStatusOverrideMap.get(normalizedKey);
        }
        if (moduleMetaLookup.has(normalizedKey)) {
          const lookupStatus = moduleMetaLookup.get(normalizedKey)?.status;
          if (lookupStatus) return lookupStatus;
        }
      }
      return typeof module?.status === "string" ? module.status : undefined;
    },
    [moduleMetaLookup, moduleStatusOverrideMap],
  );

  const isMandatoryModule = useCallback(
    (module?: Module) => {
      const statusValue = getModuleStatusValue(module);
      const normalizedStatus = typeof statusValue === "string" ? statusValue.toLowerCase() : "";
      if (normalizedStatus === "optional") return false;
      if (typeof module?.is_mandatory === "boolean") {
        return module.is_mandatory;
      }
      const lookupKey = module?.slug || module?.id;
      if (lookupKey && moduleMetaLookup.has(String(lookupKey))) {
        const lookup = moduleMetaLookup.get(String(lookupKey))!;
        const lookupStatus =
          typeof lookup.status === "string" ? lookup.status.toLowerCase() : "";
        if (lookupStatus === "optional") return false;
        if (typeof lookup.is_mandatory === "boolean") return lookup.is_mandatory;
      }
      return true;
    },
    [getModuleStatusValue, moduleMetaLookup],
  );

  const getModuleActivationState = useCallback(
    (module?: Module) => {

      if (typeof module?.is_active === "boolean") return module.is_active;
      const activeValue =
        typeof module?.active === "string" ? module.active.toLowerCase() : "";
      if (activeValue === "active") return true;
      if (activeValue === "inactive") return false;
      const lookupKey = module?.slug || module?.id;
      if (lookupKey && moduleMetaLookup.has(String(lookupKey))) {
        const lookup = moduleMetaLookup.get(String(lookupKey))!;
        if (typeof lookup.is_active === "boolean") return lookup.is_active;
        const lookupActive =
          typeof lookup.active === "string" ? lookup.active.toLowerCase() : "";
        if (lookupActive === "active") return true;
        if (lookupActive === "inactive") return false;
      }
      return undefined;
    },
    [moduleMetaLookup],
  );

  const optionalModuleIds = useMemo(() => {
    return (allModules || [])
      .filter((module) => !isMandatoryModule(module))
      .map((module) => module?.slug || module?.id)
      .filter((value): value is string => Boolean(value))
      .map((value) => String(value));
  }, [allModules, isMandatoryModule]);

  const deriveAllowedModuleIds = useCallback(
    (modulesWithStatus: any[]) => {
      const ids: string[] = [];
      let previousMandatoryCompleted = true;
      modulesWithStatus.forEach((module) => {
        const mandatory = isMandatoryModule(module as Module | undefined);
        const activationState = getModuleActivationState(module as Module | undefined);
        const unlocked =
          typeof activationState === "boolean"
            ? mandatory
              ? activationState
              : activationState !== false
            : mandatory
            ? previousMandatoryCompleted
            : true;
        if (unlocked) {
          const modId = module?.slug || module?.id;
          if (modId) ids.push(String(modId));
        }
        if (mandatory) {
          const moduleCandidate = module as Module | undefined;
          const summary = getModuleRequirementSummary(moduleCandidate);
          const { lecturesSatisfied, adaptiveSatisfied, exerciseSatisfied, completed } = summary;
          const moduleCompleted = isModuleConsideredComplete(moduleCandidate, summary);
          if (!moduleCompleted) {
            // console.log("[Subject Interface] Module requirements incomplete", {
            //   moduleId: module?.id ?? module?.slug,
            //   title: module?.title,
            //   lecturesSatisfied,
            //   adaptiveSatisfied,
            //   exerciseSatisfied,
            // });
          }
          if (typeof activationState === "boolean") {
            previousMandatoryCompleted = activationState && moduleCompleted;
          } else {
            previousMandatoryCompleted = previousMandatoryCompleted && moduleCompleted;
          }
        }
      });
      return ids;
    },
    [isMandatoryModule, getModuleActivationState, getModuleRequirementSummary, isModuleConsideredComplete],
  );

  const manualUnlockedModuleIds = useMemo(() => {
    const serverAllowed = new Set(
      Array.isArray(allowedModuleIds)
        ? allowedModuleIds.map((id) => String(id))
        : [],
    );
    const manualSet = new Set<string>();
    if (Array.isArray(dynamicAllowedModuleIds)) {
      dynamicAllowedModuleIds.forEach((id) => {
        const key = String(id);
        if (!serverAllowed.has(key)) {
          manualSet.add(key);
        }
      });
    }
    return manualSet;
  }, [allowedModuleIds, dynamicAllowedModuleIds]);

  const manualUnlockedModuleList = useMemo(
    () => Array.from(manualUnlockedModuleIds),
    [manualUnlockedModuleIds],
  );

  const visibleModules = allModules;

  const completedModuleEntries = useMemo(() => {
    if (!visibleModules?.length) {
      return [];
    }
    return visibleModules
      .map((module) => {
        const summary = getModuleRequirementSummary(module as Module | undefined);
        if (!summary.completed) {
          return null;
        }
        const moduleKey = module?.id || module?.slug;
        if (!moduleKey) {
          return null;
        }
        return {
          id: String(moduleKey),
          title: module?.title,
        };
      })
      .filter((entry): entry is { id: string; title?: string } => Boolean(entry));
  }, [visibleModules, getModuleRequirementSummary]);

  const derivedAllowedModuleIds = useMemo(() => {
    if (!visibleModules?.length) {
      return [];
    }
    return deriveAllowedModuleIds(visibleModules);
  }, [visibleModules, deriveAllowedModuleIds]);

  const allowedModuleIdSet = useMemo(() => {
    const serverIds = Array.isArray(allowedModuleIds) ? allowedModuleIds : [];
    const combined = [
      ...serverIds,
      ...manualUnlockedModuleList,
      ...optionalModuleIds,
      ...derivedAllowedModuleIds,
    ].filter((value): value is string => Boolean(value));
    if (!combined.length) {
      return null;
    }
    return new Set(combined.map((id) => String(id)));
  }, [allowedModuleIds, manualUnlockedModuleList, optionalModuleIds, derivedAllowedModuleIds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!userId || !completedModuleEntries.length) {
      return;
    }

    const firstCompleted = completedModuleEntries[0];
    if (firstCompleted) {
      void maybeAwardModuleBadge(
        FIRST_MODULE_BADGE_CODE,
        "Completed first module",
        firstCompleted.id,
      );
    }

    if (completedModuleEntries.length >= 5) {
      const latestEntry =
        completedModuleEntries[completedModuleEntries.length - 1];
      void maybeAwardModuleBadge(
        FIVE_MODULE_BADGE_CODE,
        `Completed ${completedModuleEntries.length} modules`,
        latestEntry?.id,
      );
    }
  }, [completedModuleEntries, userId, maybeAwardModuleBadge]);

  const getModuleIdentifier = useCallback((module: Module | undefined) => {
    if (!module) return undefined;
    if (typeof module.slug === "string" && module.slug) return module.slug;
    if (typeof module.id === "string" && module.id) return module.id;
    return undefined;
  }, []);

  const firstModuleRef = useMemo(() => {
    return (visibleModules || [])[0];
  }, [visibleModules]);

  const firstModuleIdentifier = useMemo(() => {
    if (!firstModuleRef) return undefined;
    const identifier = getModuleIdentifier(firstModuleRef);
    return identifier ? String(identifier) : undefined;
  }, [firstModuleRef, getModuleIdentifier]);

  const hasPreviousMandatoryCompleted = useCallback(
    (module?: Module) => {
      if (!module) return false;
      const modules = visibleModules || [];
      const identifier = getModuleIdentifier(module);
      const targetIndex = identifier
        ? modules.findIndex((candidate) => getModuleIdentifier(candidate) === identifier)
        : modules.indexOf(module);
      if (targetIndex <= 0) {
        return true;
      }
      for (let index = targetIndex - 1; index >= 0; index--) {
        const candidate = modules[index];
        if (!candidate) continue;
        if (!isMandatoryModule(candidate)) {
          continue;
        }
        const summary = getModuleRequirementSummary(candidate);
        return isModuleConsideredComplete(candidate, summary);
      }
      return true;
    },
    [
      visibleModules,
      getModuleIdentifier,
      isMandatoryModule,
      getModuleRequirementSummary,
      isModuleConsideredComplete,
    ],
  );

  const isModuleAccessible = useCallback(
    (module?: Module) => {
      if (!lockModules) {
        return true;
      }
      const rawKey = module?.slug ?? module?.id;
      const normalizedKey = rawKey ? String(rawKey) : undefined;

      if (firstModuleRef && module && module === firstModuleRef) {
        return true;
      }

      if (normalizedKey && firstModuleIdentifier && normalizedKey === firstModuleIdentifier) {
        return true;
      }

      if (normalizedKey && manualUnlockedModuleIds.has(normalizedKey)) {
        return true;
      }

      if (!normalizedKey) {
        return true;
      }
      if (allowedModuleIdSet && allowedModuleIdSet.has(normalizedKey)) {
        return true;
      }

      const previousMandatoryCompleted = hasPreviousMandatoryCompleted(module);
      if (previousMandatoryCompleted) {
        return true;
      }

      const activationState = getModuleActivationState(module);
      if (typeof activationState === "boolean") {
        if (activationState === false) {
          return false;
        }
        // Explicit active modules can stay accessible even if previous mandatory not complete.
        return true;
      }

      return false;
    },
    [
      allowedModuleIdSet,
      firstModuleIdentifier,
      firstModuleRef,
      getModuleActivationState,
      manualUnlockedModuleIds,
      hasPreviousMandatoryCompleted,
      lockModules,
    ],
  );

  const accessibleModules = useMemo(
    () => visibleModules.filter((module) => isModuleAccessible(module)),
    [visibleModules, isModuleAccessible],
  );

  const allSections = useMemo(
    () => (visibleModules || []).flatMap((module) => module.sections || []),
    [visibleModules],
  );

  // console.log(allSections);

  const moduleRequirementSummaries = useMemo(() => {
    const map = new Map<string, ModuleRequirementSummary>();
    (visibleModules || []).forEach((module) => {
      const moduleKey = module?.id || module?.slug;
      if (!moduleKey) return;
      map.set(String(moduleKey), getModuleRequirementSummary(module));
    });
    return map;
  }, [visibleModules, getModuleRequirementSummary]);

  const allowedSectionIds = useMemo(
    () => (accessibleModules || []).flatMap((module) => module.sections || []).map((section) => section.id).filter(Boolean),
    [accessibleModules],
  );

  const sectionToModuleSlug = useMemo(() => {
    const mapping = new Map<string, string>();
    (visibleModules || []).forEach((module) => {
      const moduleSlug = getModuleIdentifier(module);
      if (!moduleSlug) return;

      (module.sections || []).forEach((section) => {
        if (section?.id) {
          mapping.set(section.id, moduleSlug);
        }
      });
    });
    return mapping;
  }, [visibleModules, getModuleIdentifier]);

  const moduleLectureIdsMap = useMemo(() => {
    const mapping = new Map<string, string[]>();
    (visibleModules || []).forEach((module) => {
      const moduleSlug = getModuleIdentifier(module);
      if (!moduleSlug) return;
      const lectureIds: string[] = [];
      (module.sections || []).forEach((section) => {
        const lectures = getLectures(section);
        lectures.forEach((lecture, lectureIndex) => {
          const identifier = getLectureKey(lecture, section.id ?? null, lectureIndex);
          if (identifier) {
            lectureIds.push(String(identifier));
          }
        });
      });
      if (lectureIds.length > 0) {
        mapping.set(moduleSlug, Array.from(new Set(lectureIds)));
      }
    });
    return mapping;
  }, [visibleModules, getModuleIdentifier]);

  const refreshModuleProgressForSections = useCallback(
    (sectionIds: string[]) => {
      if (!sectionIds.length) {
        return;
      }
      const moduleIds = new Set<string>();
      sectionIds.forEach((sectionId) => {
        const moduleSlug = sectionToModuleSlug.get(sectionId);
        if (moduleSlug) {
          moduleIds.add(moduleSlug);
        }
      });
      if (!moduleIds.size) {
        return;
      }
      moduleIds.forEach((moduleId) => {
        void fetch("/api/learning-paths/user/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moduleId,
            courseId,
            subjectId,
            activity: "section",
          }),
        }).catch((error) => {
          console.warn("Failed to refresh module progress:", error);
        });
      });
    },
    [sectionToModuleSlug, courseId, subjectId],
  );

  const lectureWatchTrackerRef = useRef<{
    lectureKey: string | null;
    accumulated: number;
    lastTime: number;
    lastTimestamp: number;
    awaitingReset: boolean;
    awaitingResetSince: number | null;
  }>({
    lectureKey: null,
    accumulated: 0,
    lastTime: 0,
    lastTimestamp: 0,
    awaitingReset: false,
    awaitingResetSince: null,
  });

  const slugify = useCallback((text?: string | null) => {
    if (!text) return "";
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }, []);

  const notifyLearningPathUpdate = useCallback(() => {
    if (typeof window === "undefined") return;
    const timestamp = Date.now().toString();
    try {
      window.localStorage?.setItem(LEARNING_PATH_REFRESH_KEY, timestamp);
    } catch {
      // ignore storage errors
    }
    try {
      window.dispatchEvent(new CustomEvent("learning-path-refresh", { detail: timestamp }));
    } catch {
      // ignore dispatch errors
    }
  }, []);

  const handleUnlockModule = useCallback(
    (moduleKey?: string) => {
      if (!moduleKey) return;
      setDynamicAllowedModuleIds((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        if (base.includes(moduleKey)) {
          return base;
        }
        return [...base, moduleKey];
      });
      notifyLearningPathUpdate();
    },
    [notifyLearningPathUpdate],
  );

  const handleClearManualUnlocks = useCallback(() => {
    setDynamicAllowedModuleIds(undefined);
    if (typeof window !== "undefined" && allowedModulesStorageKey) {
      try {
        window.localStorage.removeItem(allowedModulesStorageKey);
      } catch {
        // ignore storage errors
      }
    }
    notifyLearningPathUpdate();
  }, [allowedModulesStorageKey, notifyLearningPathUpdate]);

  const debugModuleUnlocks = useCallback(() => {
    // console.group("[Subject Interface] Module Unlock Debug");
    // console.log(
    //   "[Subject Interface] Module status map",
    //   Array.from(moduleStatusMap.entries()),
    // );
    // console.log("[Subject Interface] Section requirement statuses", sectionRequirementStatuses);
    // console.log(
    //   "[Subject Interface] Allowed module IDs",
    //   allowedModuleIdSet ? Array.from(allowedModuleIdSet.values()) : null,
    // );
    let previousMandatoryCompleted = true;
    (visibleModules || []).forEach((module, index) => {
      const mandatory = isMandatoryModule(module);
      const moduleId = module?.id ?? module?.slug ?? `module-${index + 1}`;
      // if (!mandatory) {
      //   console.log("Optional module unlocked by default", { moduleId, title: module?.title });
      //   return;
      // }
      const activationState = getModuleActivationState(module);
      const summary = getModuleRequirementSummary(module);
      const { lecturesSatisfied, adaptiveSatisfied, exerciseSatisfied, completed: completedFlag } = summary;
      const unlocked =
        typeof activationState === "boolean"
          ? activationState
          : previousMandatoryCompleted;
      // console.log("Module status", {
      //   moduleId,
      //   title: module?.title,
      //   mandatory,
      //   activationState,
      //   unlocked,
      //   lecturesSatisfied,
      //   adaptiveSatisfied,
      //   exerciseSatisfied,
      //   completedFlag,
      // });
      if (mandatory) {
        if (typeof activationState === "boolean") {
          previousMandatoryCompleted = activationState && completedFlag;
        } else {
          previousMandatoryCompleted = previousMandatoryCompleted && completedFlag;
        }
      }
    });
    console.groupEnd();
  }, [
    visibleModules,
    isMandatoryModule,
    getModuleActivationState,
    getModuleRequirementSummary,
    moduleStatusMap,
    sectionRequirementStatuses,
    allowedModuleIdSet,
  ]);

  const refreshAllowedModules = useCallback(async () => {
    try {
      const res = await fetch("/api/learning-paths/user/me");
      if (!res.ok) return;
      const data = await res.json();
      const courses = Array.isArray(data) ? data : [];
      const courseMatch = courses.find((c) => {
        const cId = c?.id ? String(c.id) : "";
        const cSlug = typeof c?.slug === "string" ? c.slug : slugify(c?.title);
        return cId === courseId || cSlug === courseSlugForUrl || cSlug === slugify(courseSlugForUrl);
      });
      const subjects = Array.isArray(courseMatch?.subjects) ? courseMatch.subjects : [];
      const subjectMatch = subjects.find((s: any) => {
        const sId = s?.id ? String(s.id) : "";
        const sSlug = typeof s?.slug === "string" ? s.slug : slugify(s?.title);
        return sId === subjectId || sSlug === subjectSlugForUrl || sSlug === slugify(subjectSlugForUrl);
      });
      const modules = Array.isArray(subjectMatch?.modules) ? subjectMatch.modules : [];
      const nextAllowlist = deriveAllowedModuleIds(modules);
      if (nextAllowlist && nextAllowlist.length > 0) {
        setDynamicAllowedModuleIds(nextAllowlist);
        notifyLearningPathUpdate();
      }
    } catch (error) {
      console.warn("Failed to refresh allowed modules:", error);
    }
  }, [courseId, subjectId, courseSlugForUrl, subjectSlugForUrl, deriveAllowedModuleIds, slugify, notifyLearningPathUpdate]);

    const findFirstSectionIdForModule = useCallback(
    (moduleSlug?: string) => {
      if (!moduleSlug) return undefined;
      const targetModule = (accessibleModules || []).find(
        (module) => getModuleIdentifier(module) === moduleSlug
      );
      if (!targetModule) return undefined;
      const sections = Array.isArray(targetModule.sections) ? targetModule.sections : [];
      const firstSection = sections.find((section) => Boolean(section?.id));
      return firstSection?.id;
    },
    [accessibleModules, getModuleIdentifier]
  );

  const deriveInitialSectionId = useCallback(() => {
    const preferredSectionId = findFirstSectionIdForModule(initialModuleSlug);
    if (preferredSectionId) return preferredSectionId;
    const accessibleFirst = (allowedSectionIds || [])[0];
    if (accessibleFirst) return accessibleFirst;
    return allSections[0]?.id;
  }, [findFirstSectionIdForModule, initialModuleSlug, allowedSectionIds, allSections]);

  const [selectedSectionId, setSelectedSectionId] = useState<string | undefined>(() => deriveInitialSectionId());
  const selectedSectionIdRef = useRef<string | undefined>(selectedSectionId);
  useEffect(() => {
    selectedSectionIdRef.current = selectedSectionId;
  }, [selectedSectionId]);

  const selectedSection: Section | undefined = useMemo(
    () => allSections.find((section) => section.id === selectedSectionId),

    [allSections, selectedSectionId]

  );
  const hasLessonToolConfig = lessonToolConfigBySection !== undefined;
  const resolveToolEnabled = (value?: boolean) => (hasLessonToolConfig ? value === true : true);
  const selectedSectionToolConfig =
    selectedSectionId && lessonToolConfigBySection
      ? lessonToolConfigBySection[String(selectedSectionId)]
      : undefined;
  const allowWorkspaceHint = resolveToolEnabled(selectedSectionToolConfig?.aiHint);
  const allowWorkspaceSubmission = resolveToolEnabled(selectedSectionToolConfig?.aiSubmission);

  const defaultSelectedResource = useMemo(() => getDefaultResource(selectedSection), [selectedSection]);

  const [selectedResource, setSelectedResourceState] = useState<SelectedResource | null>(() => defaultSelectedResource);

  // Video state management (placed before effects that depend on it)
  const {
    videoState,
    updateCurrentTime,
    updatePlayState,
    updateDuration,
    setVideoRef,
    syncVideoTime,
    syncPlayState,
  } = useVideoState();
  const [lectureVideoReady, setLectureVideoReady] = useState(true);
  const [lectureAutoPlayPending, setLectureAutoPlayPending] = useState(false);
  const handleLectureReady = useCallback(() => {
    setLectureVideoReady(true);
  }, []);
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const previousSectionIdRef = useRef<string | undefined>(selectedSectionId);

  const sectionRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const allSectionsRef = useRef(allSections);
  useEffect(() => {
    allSectionsRef.current = allSections;
  }, [allSections]);
  const initialModuleHandledRef = useRef(!initialModuleSlug);

  // Quiz state
  const [loadedQuiz, setLoadedQuiz] = useState<Quiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string[]>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number>(0);
  const [quizLoading, setQuizLoading] = useState(false);
  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState(0);
  const [quizSummarySnapshot, setQuizSummarySnapshot] = useState<QuizSummaryResult | null>(null);
  const [quizSummaryOpen, setQuizSummaryOpen] = useState(false);
  const [quizSummarySectionId, setQuizSummarySectionId] = useState<string | null>(null);
  const [sectionQuizSummaries, setSectionQuizSummaries] = useState<Record<string, QuizSummaryResult>>({});
  const [completedSectionQuizzes, setCompletedSectionQuizzes] = useState<Record<string, boolean>>({});
  const [quizStartTimestamp, setQuizStartTimestamp] = useState(() => Date.now());
  const [savingQuizRunnerResult, setSavingQuizRunnerResult] = useState(false);
  const [questionFeedback, setQuestionFeedback] = useState<Record<number, QuizQuestionFeedback>>({});
  const [quizQuestionGamificationLogged, setQuizQuestionGamificationLogged] =
    useState<Record<string, boolean>>({});
  const [quizCorrectAnswers, setQuizCorrectAnswers] = useState<Record<string, { text?: string; html?: string }>>({});

  useEffect(() => {
    if (
      quizSummaryOpen &&
      quizSummarySectionId &&
      selectedSectionId &&
      quizSummarySectionId !== selectedSectionId
    ) {
      setQuizSummaryOpen(false);
    }
  }, [quizSummaryOpen, quizSummarySectionId, selectedSectionId]);
  const openPersistedQuizSummary = useCallback(
    (sectionId: string, summary: QuizSummaryResult) => {
      setSectionQuizSummaries((prev) => ({ ...prev, [sectionId]: summary }));
      setQuizSummarySnapshot(summary);
      setQuizSummarySectionId(sectionId);
      setQuizSummaryOpen(true);
    },
    [],
  );
  const persistQuizSummary = useCallback(
    async (sectionId: string, quiz: Quiz | null, summary: QuizSummaryResult) => {
      if (!sectionId || !quiz?.id) {
        return;
      }
      try {
        await apiPost(`/v1/quizzes/${quiz.id}/summary`, {
          sectionId,
          courseId,
          subjectId,
          summary,
        });
      } catch (error) {
        console.error('Failed to persist quiz summary:', error);
      }
    },
    [courseId, subjectId],
  );
  const isNotFoundError = useCallback((error: unknown): boolean => {
    if (!(error instanceof Error)) {
      return false;
    }
    return error.message.includes(' 404 ') || error.message.includes('404 ');
  }, []);
  const fetchPersistedQuizSummary = useCallback(
    async (sectionId: string, quizId: string) => {
      if (!sectionId || !quizId) {
        return null;
      }
      try {
        const endpoint = `/v1/quizzes/${quizId}/summary?sectionId=${encodeURIComponent(
          sectionId,
        )}`;
        const persisted = await apiGet<QuizSummaryResult | null>(endpoint);
        if (persisted) {
          setSectionQuizSummaries((prev) => ({
            ...prev,
            [sectionId]: persisted,
          }));
          return persisted;
        }
      } catch (error) {
        if (!isNotFoundError(error)) {
          console.error('Failed to load persisted quiz summary:', error);
        }
      }
      return null;
    },
    [],
  );
  const missingSummarySectionsRef = useRef<Set<string>>(new Set());

  const isOptionMarkedCorrect = (option: any): boolean => {
    if (!option) {
      return false;
    }
    const candidate = option.correct ?? option.isCorrect ?? option.is_correct ?? null;
    if (typeof candidate === "boolean") {
      return candidate;
    }
    if (typeof candidate === "number") {
      return candidate === 1;
    }
    if (typeof candidate === "string") {
      const normalized = candidate.trim().toLowerCase();
      return normalized === "true" || normalized === "t" || normalized === "1";
    }
    return false;
  };

  const buildQuizSummarySnapshot = useCallback(
    (quiz: Quiz | null, answers: Record<string, string[]>) => {
      if (!quiz || !Array.isArray(quiz.quiz_questions) || quiz.quiz_questions.length === 0) {
        return null;
      }

      const questions = quiz.quiz_questions.filter(Boolean);
      if (!questions.length) return null;

      const responses: QuizReviewResponse[] = questions.map((question, index) => {
        const key = question.id ?? index.toString();
        const questionId =
          typeof question.id === 'string' || typeof question.id === 'number'
            ? String(question.id)
            : key;
        const userAnswerRaw = answers[key]?.[0] ?? '';
        const userAnswer = typeof userAnswerRaw === 'string' ? userAnswerRaw.trim() : '';
        const normalizedUserAnswer = normalizeAnswerValue(userAnswerRaw);
        const userAnswerHtml =
          userAnswer && userAnswer.length > 0
            ? sanitizeQuestionHTML(userAnswerRaw)
            : undefined;
        const questionOptions = Array.isArray(question.quiz_options) ? question.quiz_options : [];
        const storedAnswer = questionId ? quizCorrectAnswers[questionId] : undefined;
        const fallbackCorrect =
          (questionOptions.find((option) => isOptionMarkedCorrect(option))?.text ??
            (question as any)?.correct_answer ??
            (question as any)?.answer) ??
          '';
        const correctAnswerSource = storedAnswer?.text ?? fallbackCorrect ?? '';
        const normalizedCorrect = normalizeAnswerValue(correctAnswerSource);
        const correctAnswer =
          typeof correctAnswerSource === 'string' ? correctAnswerSource.trim() : '';
        const correctAnswerHtml =
          storedAnswer?.html ??
          (correctAnswer ? sanitizeQuestionHTML(correctAnswer) : undefined);
        const isCorrect =
          normalizedUserAnswer.length > 0 &&
          normalizedCorrect.length > 0 &&
          normalizedUserAnswer === normalizedCorrect;

        const questionSource =
          typeof question.text === 'string' && question.text.trim().length > 0
            ? question.text
            : typeof question.content === 'string'
            ? question.content
            : '';

        return {
          key,
          questionHtml: sanitizeQuestionHTML(questionSource),
          userAnswer,
          userAnswerHtml,
          correctAnswer,
          correctAnswerHtml,
          isCorrect,
        };
      });

      const correctCount = responses.filter((response) => response.isCorrect).length;
      const scorePercent = Math.round((correctCount / questions.length) * 100);

      return {
        responses,
        correctCount,
        totalQuestions: questions.length,
        scorePercent,
      };
    },
    [quizCorrectAnswers],
  );

  const fetchQuizAnswers = useCallback(
    async (questionIds: string[]): Promise<Record<string, { text?: string; html?: string }>> => {
      if (!isAuthenticated || !Array.isArray(questionIds) || questionIds.length === 0) {
        return {};
      }
      const uniqueIds = Array.from(new Set(questionIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
      if (!uniqueIds.length) {
        return {};
      }
      const fetchFromEndpoint = async (endpoint: string) =>
        apiPost(endpoint, { questionIds: uniqueIds });
      let response: any;
      try {
        response = await fetchFromEndpoint('/v1/quiz-answers');
      } catch (primaryError) {
        const is404 =
          primaryError instanceof Error && primaryError.message.includes('404');
        if (is404) {
          try {
            response = await fetchFromEndpoint('/v1/quizzes/answers');
          } catch (legacyError) {
            console.error('Failed to fetch quiz answers (legacy fallback):', legacyError);
            return {};
          }
        } else {
          console.error('Failed to fetch quiz answers:', primaryError);
          return {};
        }
      }
      try {
        const records: Record<string, { text?: string; html?: string }> = {};
        const payloadArray = Array.isArray(response)
          ? response
          : Array.isArray((response as any)?.data)
          ? (response as any).data
          : Array.isArray((response as any)?.answers)
          ? (response as any).answers
          : [];
        payloadArray.forEach((record: any) => {
          const rawQuestionId =
            record?.question_id ??
            record?.questionId ??
            record?.quiz_question_id ??
            record?.quiz_questionId;
          if (!rawQuestionId) {
            return;
          }
          const questionId = String(rawQuestionId);
          const extracted = extractAnswerText(record);
          if (extracted.text || extracted.html) {
            const sanitizedRecord = {
              text: extracted.text,
              html:
                typeof extracted.html === 'string' && extracted.html.trim().length > 0
                  ? sanitizeQuestionHTML(extracted.html)
                  : undefined,
            };
            records[questionId] = sanitizedRecord;
          }
        });
        if (Object.keys(records).length > 0) {
          setQuizCorrectAnswers((prev) => ({
            ...prev,
            ...records,
          }));
        }
        return records;
      } catch (parseError) {
        console.error('Failed to parse quiz answers:', parseError);
        return {};
      }
    },
    [isAuthenticated],
  );
  const resolveCorrectAnswerForQuestion = useCallback(
    async (question: QuizQuestion | undefined): Promise<{ text?: string; html?: string }> => {
    if (!question || question.id === undefined || question.id === null) {
      return {};
    }
    const questionId = String(question.id);
    const questionOptions = Array.isArray(question.quiz_options) ? question.quiz_options : [];
    const liveCorrectOption = questionOptions.find((option) => isOptionMarkedCorrect(option));
    const liveText = typeof liveCorrectOption?.text === "string" ? liveCorrectOption.text.trim() : "";
    if (liveText) {
      const payload = {
        text: liveText,
        html: sanitizeQuestionHTML(liveText),
      };
      setQuizCorrectAnswers((prev) => ({
        ...prev,
        [questionId]: payload,
      }));
      return payload;
    }
    const stored = quizCorrectAnswers[questionId];
    if (stored && (stored.text || stored.html)) {
      return stored;
    }
    const fetched = await fetchQuizAnswers([questionId]);
    if (fetched[questionId]) {
      return fetched[questionId];
    }
    const fallbackSources = [
      (question as any)?.correct_answer,
      (question as any)?.answer,
    ];
    const fallbackText = fallbackSources.find((value): value is string => Boolean(value && typeof value === "string")) ?? "";
    const fallbackPayload = {
      text: fallbackText,
      html: fallbackText ? sanitizeQuestionHTML(fallbackText) : undefined,
    };
    if (fallbackText) {
      setQuizCorrectAnswers((prev) => ({
        ...prev,
        [questionId]: fallbackPayload,
      }));
    }
    return fallbackPayload;
    },
    [fetchQuizAnswers, quizCorrectAnswers],
  );
  const saveQuizRunnerResult = useCallback(
    async (quiz: Quiz, answers: Record<string, string[]>, scorePercentage: number) => {
      if (!quiz?.id || !isAuthenticated || savingQuizRunnerResult) {
        return;
      }
      const questions = Array.isArray(quiz.quiz_questions) ? quiz.quiz_questions : [];
      const responses = questions.map((question, index) => {
        const answerList = answers[question.id || index.toString()] ?? [];
        const selectedValue = answerList[0] ?? '';
        const matchedOption =
          (question.quiz_options || []).find((option) => option?.text === selectedValue) ?? null;
        const selectedOptionId = matchedOption?.id ?? null;
        const isCorrect = matchedOption?.correct === true;
        const fallbackId =
          question.id !== undefined && question.id !== null
            ? String(question.id)
            : `question-${index}`;
        return {
          questionId: fallbackId,
          selectedOptionId,
          isCorrect,
        };
      });
      const timeTakenSeconds = Math.max(
        1,
        Math.floor((Date.now() - quizStartTimestamp) / 1000),
      );
      setSavingQuizRunnerResult(true);
      try {
        await apiPost(`/v1/quizzes/${quiz.id}/submit`, {
          responses,
          score: scorePercentage,
          timeTaken: timeTakenSeconds,
        });
      } catch (error) {
        console.error('Failed to save quiz runner result:', error);
      } finally {
        setSavingQuizRunnerResult(false);
      }
    },
    [isAuthenticated, quizStartTimestamp, savingQuizRunnerResult],
  );

  // Section quizzes state
  const [sectionQuizzes, setSectionQuizzes] = useState<{ [sectionId: string]: Quiz[] }>({});
  const [loadingSectionQuizzes, setLoadingSectionQuizzes] = useState<Record<string, boolean>>({});
  const sectionQuizzesRef = useLatestRef(sectionQuizzes);
  const loadingSectionQuizzesRef = useLatestRef(loadingSectionQuizzes);
  const [quizRunnerLoading, setQuizRunnerLoading] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!selectedSectionId) return;
    if (sectionQuizSummaries[selectedSectionId]) return;
    if (missingSummarySectionsRef.current.has(selectedSectionId)) return;
    const section = allSections.find((sec) => sec.id === selectedSectionId);
    if (!section) return;
    const availableQuizzes = (sectionQuizzes[selectedSectionId] || []).filter(
      (quiz) => Boolean(quiz?.id),
    );
    const fallbackQuiz = getQuizzes(section)[0];
    const selectedQuiz =
      availableQuizzes.length > 0 ? availableQuizzes[0] : fallbackQuiz;
    const quizId = selectedQuiz?.id;
    if (!quizId) {
      missingSummarySectionsRef.current.add(selectedSectionId);
      return;
    }
    let cancelled = false;
    void fetchPersistedQuizSummary(selectedSectionId, quizId).then((summary) => {
      if (!summary && !cancelled) {
        missingSummarySectionsRef.current.add(selectedSectionId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    selectedSectionId,
    allSections,
    sectionQuizSummaries,
    sectionQuizzes,
    fetchPersistedQuizSummary,
  ]);

  // Quiz runner state
  const [isQuizRunnerMode, setIsQuizRunnerMode] = useState(false);
  const [currentSectionQuizIndex, setCurrentSectionQuizIndex] = useState(0);
  const [quizSession, setQuizSession] = useState<{
    sectionId?: string;
    quizzes: Quiz[];
    currentQuizId?: string;
    prevResult: { score: number; answers: Record<string, any>; stop: boolean } | null;
    currentSectionQuizIndex: number;
  } | null>(null);

  // Generation state
  const [generatingExercise, setGeneratingExercise] = useState<Record<string, boolean>>({});
  const [generatingQuiz, setGeneratingQuiz] = useState<Record<string, boolean>>({});
  const [activeSectionQuizzes, setActiveSectionQuizzes] = useState<Record<string, AdaptiveQuizSectionStatus>>({});
  const [sectionAdaptiveHistories, setSectionAdaptiveHistories] = useState<Record<string, AdaptiveSessionHistoryEntry[]>>({});
  const [selectedAdaptiveSessionReview, setSelectedAdaptiveSessionReview] = useState<AdaptiveSessionReview | null>(null);
  const [loadingAdaptiveSessionSummary, setLoadingAdaptiveSessionSummary] = useState<string | null>(null);
  const setSelectedResource = useCallback(
    (value: SelectedResource | null) => {
      if (selectedAdaptiveSessionReview) {
        setSelectedAdaptiveSessionReview(null);
      }
      setSelectedResourceState(value);
    },
    [selectedAdaptiveSessionReview],
  );

  const computeAdaptiveSectionOffset = useCallback(
    (
      sectionId: string,
      options?: { uptoIndex?: number; excludeSessionId?: string },
    ): number => {
      if (!sectionId) {
        return 0;
      }
      const entries = sectionAdaptiveHistories[sectionId] ?? [];
      let offset = 0;
      for (let index = 0; index < entries.length; index += 1) {
        if (typeof options?.uptoIndex === "number" && index >= options.uptoIndex) {
          break;
        }
        const entry = entries[index];
        if (options?.excludeSessionId && options.excludeSessionId === entry.sessionId) {
          continue;
        }
        offset += getAdaptiveEntryQuestionCount(entry);
      }
      return offset;
    },
    [sectionAdaptiveHistories],
  );

  useEffect(() => {
    if (!selectedAdaptiveSessionReview) {
      return;
    }
    if (selectedAdaptiveSessionReview.sectionId !== selectedSectionId) {
      setSelectedAdaptiveSessionReview(null);
      return;
    }
    const entries =
      sectionAdaptiveHistories[selectedAdaptiveSessionReview.sectionId] ?? [];
    if (
      entries.length > 0 &&
      !entries.some((entry) => entry.sessionId === selectedAdaptiveSessionReview.sessionId)
    ) {
      setSelectedAdaptiveSessionReview(null);
    }
  }, [
    selectedAdaptiveSessionReview,
    selectedSectionId,
    sectionAdaptiveHistories,
  ]);

  const buildSummaryFromResponses = (responses: AdaptiveQuizResponse[]): AdaptiveSessionSummaryInfo => {
    const totalQuestions = responses.length;
    const answeredQuestions = responses.filter((response) => {
      const answer = response.user_answer;
      return (
        answer !== null &&
        answer !== undefined &&
        (typeof answer !== "string" || answer.trim().length > 0)
      );
    }).length;
    const correctAnswers = responses.filter((response) => response.is_correct === true).length;
    const score =
      answeredQuestions > 0
        ? Math.round((correctAnswers / answeredQuestions) * 100)
        : 0;
    return {
      totalQuestions,
      answeredQuestions,
      correctAnswers,
      score,
    };
  };

  const renderAdaptiveSessionSummaryPanel = () => {
    if (!selectedAdaptiveSessionReview) {
      return null;
    }
    if (selectedAdaptiveSessionReview.sectionId !== selectedSectionId) {
      return null;
    }
    const { label, dateLabel, summary } = selectedAdaptiveSessionReview;
    const responses = selectedAdaptiveSessionReview.responses ?? [];
    return (
      <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-4 backdrop-blur-xl shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Session summary
            </p>
            <div className="mt-2 text-lg font-semibold text-gray-900">{label}</div>
            <p className="text-sm text-slate-500">{dateLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedAdaptiveSessionReview(null)}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            Close
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Questions</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{summary.totalQuestions}</p>
            <p className="text-xs text-slate-500">{summary.answeredQuestions} answered</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Correct</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{summary.correctAnswers}</p>
            <p className="text-xs text-slate-500">{summary.score}% score</p>
          </div>
        </div>
        {responses.length > 0 ? (
          <div className="mt-4 space-y-4">
          {responses.map((response, index) => {
            const isCorrect = response.is_correct === true;
            const responseKey =
              response.id ??
              `${selectedAdaptiveSessionReview.sessionId}-${response.question_number ?? index}`;
            const correctAnswer =
              response.correct_answer ??
              response.correct_option?.text ??
              response.correct_option?.label ??
              "N/A";
            const userAnswer = response.user_answer ?? "No answer";
            const statusClasses = isCorrect
              ? "border-emerald-200 bg-emerald-50/80 text-emerald-700"
              : "border-red-200 bg-red-50/80 text-red-700";
            const questionOffset = selectedAdaptiveSessionReview.questionOffset ?? 0;
            const baseResponseNumber =
              typeof response.question_number === "number" &&
              Number.isFinite(response.question_number) &&
              response.question_number > 0
                ? response.question_number
                : index + 1;
            const displayResponseNumber = questionOffset + baseResponseNumber;
            return (
              <div
                key={responseKey}
                className={`rounded-2xl border p-4 ${isCorrect ? "border-emerald-200 bg-emerald-50/80" : "border-red-200 bg-red-50/80"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Question {displayResponseNumber}</p>
                      {response.difficulty && (
                        <p className="text-[11px] text-slate-500">
                          {response.difficulty}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 ${statusClasses}`}
                    >
                      {isCorrect ? "Correct" : "Incorrect"}
                    </span>
                  </div>
                  {response.question_text && (
                    <div
                      className="mt-3 text-sm text-gray-700 prose prose-sm prose-slate max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeQuestionHTML(response.question_text),
                      }}
                    />
                  )}
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="text-gray-600">
                      Your answer:
                      <span
                        className={`ml-1 font-semibold ${isCorrect ? "text-emerald-700" : "text-red-700"}`}
                      >
                        {userAnswer}
                      </span>
                    </div>
                    {!isCorrect && (
                      <div className="text-gray-600">
                        Correct answer:
                        <span className="ml-1 font-semibold text-emerald-700">
                          {correctAnswer}
                        </span>
                      </div>
                    )}
                  </div>
                  {response.explanation && (
                    <div
                      className="mt-3 pt-3 border-t border-slate-200 text-sm text-gray-600 prose prose-sm prose-slate max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeQuestionHTML(response.explanation),
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No question data available for this session.</p>
        )}
      </div>
    );
  };

  const fetchAdaptiveQuizStatus = useCallback(
    async (sectionId: string, options?: { suppressUpdate?: boolean }): Promise<AdaptiveQuizSectionStatus> => {
      if (!isAuthenticated) {
        return { hasActiveQuiz: false };
      }
      if (!sectionId) {
        return { hasActiveQuiz: false };
      }

      try {
        const response = (await checkAdaptiveQuizStatusAction(sectionId)) as any;
        const normalized: AdaptiveQuizSectionStatus = {
          hasActiveQuiz: Boolean(response?.hasActiveQuiz),
          sessionId: typeof response?.sessionId === "string" ? response.sessionId : undefined,
          sessionCount:
            typeof response?.sessionCount === "number" && Number.isFinite(response.sessionCount)
              ? response.sessionCount
              : undefined,
          sectionStatus: typeof response?.sectionStatus === "string" ? response.sectionStatus : null,
        };

        if (!options?.suppressUpdate) {
          setActiveSectionQuizzes((prev) => ({
            ...prev,
            [sectionId]: normalized,
          }));
        }

        return normalized;
      } catch (error) {
        console.error(`Failed to check adaptive quiz status for section ${sectionId}:`, error);
        const fallback: AdaptiveQuizSectionStatus = { hasActiveQuiz: false };

        if (!options?.suppressUpdate) {
          setActiveSectionQuizzes((prev) => ({
            ...prev,
            [sectionId]: fallback,
          }));
        }

        return fallback;
      }
    },
    [isAuthenticated],
  );

  // Content generation loading state
  const isGeneratingContentForSection = selectedSectionId
    ? generatingExercise[selectedSectionId] || generatingQuiz[selectedSectionId]
    : false;

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const uniqueSectionIds = Array.from(
      new Set(
        (allSections || [])
          .map((section) => section?.id)
          .filter((sectionId): sectionId is string => Boolean(sectionId)),
      ),
    );

    if (!uniqueSectionIds.length) {
      return;
    }

    let isCancelled = false;

    const loadStatuses = async () => {
      const statuses = await Promise.all(
        uniqueSectionIds.map(async (sectionId) => {
          const status = await fetchAdaptiveQuizStatus(sectionId, { suppressUpdate: true });
          return { sectionId, status };
        }),
      );

      if (isCancelled) {
        return;
      }

      setActiveSectionQuizzes((prev) => {
        const updated = { ...prev };
        statuses.forEach(({ sectionId, status }) => {
          updated[sectionId] = status;
        });
        return updated;
      });
    };

    loadStatuses();

    return () => {
      isCancelled = true;
    };
  }, [allSections, fetchAdaptiveQuizStatus, isAuthenticated]);

  // Progressive generation state
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generationProgress, setGenerationProgress] = useState<number>(0);

  // Exercise data state
  const [currentExerciseData, setCurrentExerciseData] = useState<GeneratedExerciseResponse | null>(null);

  // Section exercises state
  const [sectionExercises, setSectionExercises] = useState<{ [sectionId: string]: any[] }>({});
  const [loadingSectionExercises, setLoadingSectionExercises] = useState<Record<string, boolean>>({});
  const sectionExercisesRef = useLatestRef(sectionExercises);
  const loadingSectionExercisesRef = useLatestRef(loadingSectionExercises);

  // Question popup state
  const [selectedQuestionForPopup, setSelectedQuestionForPopup] = useState<any>(null);
  const activePopupQuestionId = useMemo(
    () => extractQuestionIdentifier(selectedQuestionForPopup) ?? null,
    [selectedQuestionForPopup],
  );
  const [pendingInitialQuestion, setPendingInitialQuestion] = useState<{
    sectionId: string;
    exerciseId: string;
    exercise: any;
    question: any;
    questionIndex: number;
  } | null>(null);

  // Floating video player state
  const [showFloatingPlayer, setShowFloatingPlayer] = useState(false);
  const [isMainVideoFocused, setIsMainVideoFocused] = useState(false);
  const [isFloatingPlayerManuallyClosed, setIsFloatingPlayerManuallyClosed] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const mainVideoElementRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  const [totalXp, setTotalXp] = useState<number | null>(null);
  const [recentXpGain, setRecentXpGain] = useState<number | null>(null);
  const xpGainTimeoutRef = useRef<number | null>(null);
  const xpFormatter = useMemo(() => new Intl.NumberFormat("en-US"), []);
  const videoFocusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const manualCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showFloatingPlayerRef = useRef(false);
  const mentorChatAutoSelectionRef = useRef<{ sectionId: string; completed: boolean } | null>(null);
  showFloatingPlayerRef.current = showFloatingPlayer;

  const getFullscreenElement = useCallback((): Element | null => {
    if (typeof document === "undefined") return null;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      msFullscreenElement?: Element | null;
    };
    return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.msFullscreenElement ?? null;
  }, []);

  const exitFullscreenSafe = useCallback(async () => {
    if (typeof document === "undefined") return;
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      msExitFullscreen?: () => Promise<void> | void;
      mozCancelFullScreen?: () => Promise<void> | void;
    };
    const exit =
      doc.exitFullscreen ??
      doc.webkitExitFullscreen ??
      doc.msExitFullscreen ??
      doc.mozCancelFullScreen;
    if (!exit) return;
    const result = exit.call(doc);
    if (result && typeof (result as Promise<void>).then === "function") {
      await result;
    }
  }, []);

  const requestFullscreenSafe = useCallback(async (element: HTMLElement) => {
    if (!element) return;
    const el = element as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
      mozRequestFullScreen?: () => Promise<void> | void;
    };
    const request =
      el.requestFullscreen ??
      el.webkitRequestFullscreen ??
      el.msRequestFullscreen ??
      el.mozRequestFullScreen;
    if (!request) {
      throw new Error("Fullscreen API is not supported in this browser");
    }
    const result = request.call(el);
    if (result && typeof (result as Promise<void>).then === "function") {
      await result;
    }
  }, []);

  const handleFullscreenToggle = useCallback(async () => {
    const container = videoContainerRef.current;
    if (!container) return;
    try {
      const fullscreenEl = getFullscreenElement();
      if (fullscreenEl === container) {
        await exitFullscreenSafe();
      } else {
        await requestFullscreenSafe(container);
      }
    } catch (error) {
      console.error("Unable to toggle fullscreen", error);
    }
  }, [exitFullscreenSafe, getFullscreenElement, requestFullscreenSafe]);

  // Stabilize floating state to avoid focus flicker
  useEffect(() => {
    if (!showFloatingPlayer) {
      return;
    }
    if (videoFocusTimeoutRef.current) {
      clearTimeout(videoFocusTimeoutRef.current);
      videoFocusTimeoutRef.current = null;
    }
    setIsMainVideoFocused(false);
  }, [showFloatingPlayer]);

  // Handle video focus/blur events
  const handleVideoFocus = useCallback(() => {
    if (showFloatingPlayerRef.current) return;
    // console.log('Video focused - hiding floating player');
    setIsMainVideoFocused(true);
  }, []);

  const handleVideoBlur = useCallback(() => {
    if (showFloatingPlayerRef.current) return;
    // console.log('Video blurred - can show floating player');
    setIsMainVideoFocused(false);
  }, []);

  // Handle video container interactions
  const handleVideoContainerMouseEnter = useCallback(() => {
    if (showFloatingPlayerRef.current) return;
    // console.log('Video container mouse enter - hiding floating player');
    // Clear any pending timeout
    if (videoFocusTimeoutRef.current) {
      clearTimeout(videoFocusTimeoutRef.current);
      videoFocusTimeoutRef.current = null;
    }
    setIsMainVideoFocused(true);
  }, []);

  const handleVideoContainerMouseLeave = useCallback(() => {
    if (showFloatingPlayerRef.current) return;
    // console.log('Video container mouse leave - can show floating player after delay');
    // Set a timeout before allowing floating player to show
    videoFocusTimeoutRef.current = setTimeout(() => {
      // console.log('Video focus timeout - can show floating player');
      setIsMainVideoFocused(false);
      videoFocusTimeoutRef.current = null;
    }, 500); // 500ms delay
  }, []);

  const handleVideoContainerClick = useCallback(() => {
    if (showFloatingPlayerRef.current) return;
    // console.log('Video container clicked - hiding floating player');
    // Clear any pending timeout
    if (videoFocusTimeoutRef.current) {
      clearTimeout(videoFocusTimeoutRef.current);
      videoFocusTimeoutRef.current = null;
    }
    setIsMainVideoFocused(true);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const syncFullscreenState = () => {
      const container = videoContainerRef.current;
      const fullscreenElement = getFullscreenElement();
      if (!container) {
        setIsVideoFullscreen(false);
        return;
      }
      if (
        fullscreenElement &&
        mainVideoElementRef.current &&
        fullscreenElement === mainVideoElementRef.current &&
        fullscreenElement !== container
      ) {
        void exitFullscreenSafe()
          .then(() => requestFullscreenSafe(container).catch(() => {}))
          .catch(() => {});
        return;
      }
      setIsVideoFullscreen(fullscreenElement === container);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState as EventListener);
    document.addEventListener("msfullscreenchange", syncFullscreenState as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState as EventListener);
      document.removeEventListener("msfullscreenchange", syncFullscreenState as EventListener);
    };
  }, [exitFullscreenSafe, getFullscreenElement, requestFullscreenSafe]);

  // Custom video ref callback to add focus listeners
  const handleVideoRef = useCallback((videoElement: HTMLVideoElement | null) => {
    const previousVideo = mainVideoElementRef.current;
    if (previousVideo && previousVideo !== videoElement) {
      previousVideo.removeEventListener('focus', handleVideoFocus);
      previousVideo.removeEventListener('blur', handleVideoBlur);
    }
    setVideoRef(videoElement);
    mainVideoElementRef.current = videoElement;

    if (videoElement) {
      videoElement.addEventListener('focus', handleVideoFocus);
      videoElement.addEventListener('blur', handleVideoBlur);
      videoElement.setAttribute('tabIndex', '-1'); // Make video focusable
    }
  }, [handleVideoFocus, handleVideoBlur, setVideoRef]);
  useEffect(() => {
    let cancelled = false;
    const loadXp = async () => {
      try {
        const res = await fetch("/api/user/summary", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data || cancelled) return;
        if (typeof data.xp === "number") {
          setTotalXp(data.xp);
        }
      } catch {
        // ignore fetch errors
      }
    };
    loadXp();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleProgressEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ totalXp?: number; xpAwarded?: number }>).detail;
      if (!detail) return;
      if (typeof detail.totalXp === "number") {
        setTotalXp(detail.totalXp);
      }
      if (typeof detail.xpAwarded === "number" && detail.xpAwarded > 0) {
        setRecentXpGain(detail.xpAwarded);
        if (xpGainTimeoutRef.current) {
          window.clearTimeout(xpGainTimeoutRef.current);
        }
        xpGainTimeoutRef.current = window.setTimeout(() => {
          setRecentXpGain(null);
          xpGainTimeoutRef.current = null;
        }, 3200);
      }
    };
    window.addEventListener(GAMIFICATION_PROGRESS_EVENT, handleProgressEvent);
    return () => {
      window.removeEventListener(GAMIFICATION_PROGRESS_EVENT, handleProgressEvent);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (xpGainTimeoutRef.current) {
        window.clearTimeout(xpGainTimeoutRef.current);
        xpGainTimeoutRef.current = null;
      }
    };
  }, []);
  const [showQuestionPopup, setShowQuestionPopup] = useState(false);
  // SQL execution state
  const [sqlCode, setSqlCode] = useState<string>('');
  const [pythonCode , setPythonCode] = useState<string>('');
  const [worksheetSolution, setWorksheetSolution] = useState<string>('');
  const [codeLanguage, setCodeLanguage] = useState<string>('sql');
  const [sqlResults, setSqlResults] = useState<any[]>([]);
  const [sqlError, setSqlError] = useState<string>('');
  const [isExecutingSql, setIsExecutingSql] = useState(false);
  const duckdb = useDuckDB({ autoInit: false });
  const {
    isReady: isDuckDbReady,
    isLoading: isDuckDbLoading,
    error: duckDbError,
    executeQuery: executeDuckDbQuery,
    loadDataset: loadDuckDbDataset,
    initialize: initializeDuckDb,
  } = duckdb;
  const [isPreparingDuckDb, setIsPreparingDuckDb] = useState(false);
  const [duckDbSetupError, setDuckDbSetupError] = useState<string | null>(null);
  const [duckDbTables, setDuckDbTables] = useState<string[]>([]);
  const [duckDbDatasetTables, setDuckDbDatasetTables] = useState<Record<string, string[]>>({});
  const [sanitizedCreationSqlByDataset, setSanitizedCreationSqlByDataset] = useState<
    Record<string, string>
  >({});

  // Python execution state
  const pyodide = usePyodide({ autoInit: false });
  const {
    isReady: isPyodideReady,
    isLoading: isPyodideLoading,
    error: pyodideError,
    executeCode: executePythonCode,
    loadDataFrame: loadPyodideDataFrame,
    initialize: initializePyodide,
  } = pyodide;
  const [isExecutingPython, setIsExecutingPython] = useState(false);
  const [pythonOutput, setPythonOutput] = useState<string>('');
  const [pythonError, setPythonError] = useState<string>('');
  const [isRequestingWorkspaceHint, setIsRequestingWorkspaceHint] = useState(false);
  const [isSubmittingWorkspace, setIsSubmittingWorkspace] = useState(false);
  const [cachedWorkspaceRun, setCachedWorkspaceRun] = useState<{
    code: string;
    language: string;
  } | null>(null);
  const workspaceCodeTouchedRef = useRef(false);
  const handleWorkspaceCodeKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") {
      return;
    }
    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const indent = "\t";
    const currentValue = textarea.value;
    const updatedValue =
      currentValue.slice(0, start) + indent + currentValue.slice(end);
    if (codeLanguage === "python" || codeLanguage === "statistics") {
      setPythonCode(updatedValue);
    } else {
      setSqlCode(updatedValue);
    }
    workspaceCodeTouchedRef.current = true;
    const cursorPosition = start + indent.length;
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = cursorPosition;
    }, 0);
  };
  const [sqlDerivedTables, setSqlDerivedTables] = useState<Record<string, SqlDerivedTable[]>>({});
  const sqlDerivedTablesRef = useRef(sqlDerivedTables);
  useEffect(() => {
    sqlDerivedTablesRef.current = sqlDerivedTables;
  }, [sqlDerivedTables]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const isPyodideRelated = (message?: string, filename?: string) => {
      const lower = (value?: string) => (value ?? '').toLowerCase();
      return (
        lower(message).includes('pyodide') ||
        lower(filename).includes('pyodide.js') ||
        lower(filename).includes('/pyodide/')
      );
    };

    const handleGlobalError = (event: ErrorEvent) => {
      if (!isPyodideRelated(event.message, event.filename)) {
        return;
      }
      event.preventDefault();
      setPythonError((prev) => prev || event.message || 'Pyodide failed to initialize.');
      console.warn('Suppressed Pyodide global error from bubbling into Next.js:', event.message || event.filename);
    };

    const handlePromiseRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === 'string'
          ? reason
          : reason instanceof Error
          ? reason.message
          : `${reason}`;
      if (!isPyodideRelated(message)) {
        return;
      }
      event.preventDefault();
      setPythonError((prev) => prev || message || 'Pyodide encountered an error.');
      console.warn('Suppressed Pyodide promise rejection from bubbling into Next.js:', message);
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handlePromiseRejection);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handlePromiseRejection);
    };
  }, []);

  const canClearOutput = useMemo(
    () =>
      sqlResults.length > 0 ||
      !!sqlError ||
      !!pythonOutput ||
      !!pythonError ||
      !!duckDbSetupError,
    [sqlResults, sqlError, pythonOutput, pythonError, duckDbSetupError],
  );

  useEffect(() => {
    const rawQuestionId =
      (selectedQuestionForPopup as any)?.id ??
      (selectedQuestionForPopup as any)?.question_id;
    const rawExerciseId =
      (selectedQuestionForPopup as any)?.exerciseId ??
      (selectedQuestionForPopup as any)?.exercise_id;
    const questionId =
      rawQuestionId !== null && rawQuestionId !== undefined ? String(rawQuestionId) : "";
    const exerciseId =
      rawExerciseId !== null && rawExerciseId !== undefined ? String(rawExerciseId) : "";

    if (!questionId || !exerciseId || cachedWorkspaceRun) {
      return;
    }

    let isMounted = true;

    const resolvedQuestionType =
      pickNormalizedQuestionType(
        selectedQuestionForPopup?.question_type,
        selectedQuestionForPopup?.type,
        selectedQuestionForPopup?.subjectTitle,
        "sql",
      ) ?? "sql";

    const fetchLatestSubmission = async () => {
      try {
        const response = await apiGet<any>(
          `/v1/sections/exercises/${String(exerciseId)}/questions/${String(questionId)}/submissions`,
        );
        const submissions = Array.isArray(response?.submissions) ? response.submissions : [];
        const latestSubmission = submissions[0];
        const latestAnswerCandidate =
          latestSubmission?.user_answer ??
          latestSubmission?.userAnswer ??
          latestSubmission?.userAnswerText ??
          latestSubmission?.userAnswerHTML;

        if (!isMounted) {
          return;
        }

        if (typeof latestAnswerCandidate !== "string") {
          return;
        }

        if (resolvedQuestionType === "python") {
          setPythonCode(latestAnswerCandidate);
        } else if (
          resolvedQuestionType === "google_sheets" ||
          resolvedQuestionType === "statistics"
        ) {
          setWorksheetSolution(latestAnswerCandidate);
        } else {
          setSqlCode(latestAnswerCandidate);
        }
      } catch (error) {
        console.error("Failed to fetch latest submission:", error);
      }
    };

    fetchLatestSubmission();

    return () => {
      isMounted = false;
    };
  }, [
    selectedQuestionForPopup?.exerciseId,
    selectedQuestionForPopup?.exercise_id,
    selectedQuestionForPopup?.id,
    selectedQuestionForPopup?.question_id,
    selectedQuestionForPopup?.question_type,
    selectedQuestionForPopup?.type,
    selectedQuestionForPopup?.subjectTitle,
    cachedWorkspaceRun,
  ]);

  // Dataset state
  const [exerciseDatasets, setExerciseDatasets] = useState<{ [exerciseId: string]: any[] }>({});
  const [loadingExerciseDatasets, setLoadingExerciseDatasets] = useState<Record<string, boolean>>({});
  const exerciseDatasetsRef = useLatestRef(exerciseDatasets);
  const loadingExerciseDatasetsRef = useLatestRef(loadingExerciseDatasets);
  const [questionDataset, setQuestionDataset] = useState<QuestionDatasetRecord | null>(null);
  const [questionDatasetCache, setQuestionDatasetCache] = useState<Record<string, QuestionDatasetRecord | null>>({});
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [questionCompletionStatus, setQuestionCompletionStatus] = useState<
    Record<string, "pending" | "completed" | "incorrect">
  >({});

  const sectionIdsSignature = useMemo(
    () => (allSections || []).map((section) => section?.id ?? '').join('|'),
    [allSections],
  );

  const subjectProgressSnapshot = useMemo(() => {
    const baseSnapshot = {
      averageProgressPercent: 0,
      totalLectureMinutes: 0,
      watchedLectureMinutes: 0,
      hasWeightedProgress: false,
    };
    if (!allSections || allSections.length === 0) {
      return baseSnapshot;
    }

    let weightedProgressSum = 0;
    let totalWeight = 0;
    let totalLectureMinutes = 0;
    let watchedLectureMinutes = 0;

    allSections.forEach((section) => {
      if (!section) {
        return;
      }
      const requirementSummary = getSectionRequirementSummary(section);
      const lectures = getLectures(section);
      const exercises = getExercises(section);
      const quizzes = getQuizzes(section);

      let sectionLectureMinutes = 0;
      let sectionWatchedMinutes = 0;
      lectures.forEach((lecture, lectureIndex) => {
        const resolvedDuration =
          resolveLectureDurationMinutes(lecture) ?? DEFAULT_LECTURE_DURATION_MINUTES;
        const lectureKey = getLectureKey(
          lecture,
          selectedSection?.id ?? null,
          lectureIndex,
        );
        sectionLectureMinutes += resolvedDuration;
        if (lectureKey && watchedLectureIds.has(String(lectureKey))) {
          sectionWatchedMinutes += resolvedDuration;
        }
      });
      if (sectionLectureMinutes === 0 && lectures.length > 0) {
        sectionLectureMinutes = lectures.length * DEFAULT_LECTURE_DURATION_MINUTES;
      }
      totalLectureMinutes += sectionLectureMinutes;
      watchedLectureMinutes += sectionWatchedMinutes;

      const lectureWeight = sectionLectureMinutes > 0 ? sectionLectureMinutes : 0;
      const lectureProgress =
        lectureWeight > 0 ? clampUnitValue(sectionWatchedMinutes / sectionLectureMinutes) : null;

      const totalExerciseCount = Math.max(
        requirementSummary.totalExercises ?? 0,
        exercises.length,
      );
      let exerciseWeight = totalExerciseCount > 0 ? totalExerciseCount : 0;
      let exerciseProgress: number | null = null;
      if (exerciseWeight > 0) {
        if ((requirementSummary.totalExercises ?? 0) > 0) {
          const completedCount = Math.min(
            requirementSummary.completedExercises ?? 0,
            exerciseWeight,
          );
          exerciseProgress = clampUnitValue(completedCount / exerciseWeight);
        } else {
          exerciseProgress = requirementSummary.exerciseSatisfied ? 1 : 0;
        }
      } else if (requirementSummary.exerciseSatisfied) {
        exerciseWeight = 1;
        exerciseProgress = 1;
      }

      const hasQuizRequirement = quizzes.length > 0;
      let quizWeight = hasQuizRequirement ? Math.max(quizzes.length, 1) : 0;
      let quizProgress: number | null = null;
      if (quizWeight > 0) {
        quizProgress = requirementSummary.adaptiveSatisfied ? 1 : 0;
      } else if (requirementSummary.adaptiveSatisfied) {
        quizWeight = 1;
        quizProgress = 1;
      }

      const contributions = [
        { weight: lectureWeight, progress: lectureProgress },
        { weight: exerciseWeight, progress: exerciseProgress },
        { weight: quizWeight, progress: quizProgress },
      ].filter((entry) => entry.weight > 0 && entry.progress !== null);

      let sectionWeight = contributions.reduce((sum, entry) => sum + entry.weight, 0);
      let sectionProgressValue = contributions.reduce(
        (sum, entry) => sum + clampUnitValue(entry.progress as number) * entry.weight,
        0,
      );

      if (sectionWeight === 0) {
        sectionWeight = 1;
        sectionProgressValue = clampUnitValue((requirementSummary.progressPercent ?? 0) / 100);
      }

      weightedProgressSum += sectionProgressValue;
      totalWeight += sectionWeight;
    });

    const averageProgressPercent =
      totalWeight > 0 ? (weightedProgressSum / totalWeight) * 100 : 0;

    return {
      averageProgressPercent: Math.max(
        0,
        Math.min(100, Math.round(averageProgressPercent)),
      ),
      totalLectureMinutes: Math.max(0, Math.round(totalLectureMinutes)),
      watchedLectureMinutes: Math.max(
        0,
        Math.round(Math.min(watchedLectureMinutes, totalLectureMinutes)),
      ),
      hasWeightedProgress: totalWeight > 0,
    };
  }, [allSections, watchedLectureIds, getSectionRequirementSummary]);

  const calculateAverageSubjectProgress = useCallback((): number => {
    return subjectProgressSnapshot.averageProgressPercent;
  }, [subjectProgressSnapshot]);

  const calculateTotalLectureTime = useCallback((): number => {
    return subjectProgressSnapshot.totalLectureMinutes;
  }, [subjectProgressSnapshot]);

  const calculateWatchedLectureTime = useCallback((): number => {
    return subjectProgressSnapshot.watchedLectureMinutes;
  }, [subjectProgressSnapshot]);

  const fetchSectionRequirementStatuses = useCallback(
    async (targetSectionIds?: string[]) => {
      if (!isAuthenticated) {
        return;
      }
      const sourceSections = allSectionsRef.current || [];
      const ids =
        targetSectionIds && targetSectionIds.length
          ? Array.from(new Set(targetSectionIds.filter((value): value is string => Boolean(value))))
          : Array.from(
              new Set(
                sourceSections
                  .map((section) => section.id)
                  .filter((value): value is string => Boolean(value)),
              ),
            );
      if (!ids.length) {
        return;
      }
      try {
        const response = await fetch("/api/learning-paths/user/section-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionIds: ids }),
        });
        if (!response.ok) {
          throw new Error(`Section status request failed: ${response.status}`);
        }
        const payload = await response.json().catch(() => null);
        const statuses = (payload?.statuses ?? {}) as Record<string, ModuleRequirementSummary>;
        if (!statuses || typeof statuses !== "object") {
          return;
        }
        const completedSet = completedSectionIdsRef.current;
        const newlyCompletedSectionIds: string[] = [];
        Object.entries(statuses).forEach(([sectionId, summary]) => {
          if (!sectionId || !summary) {
            return;
          }
          if (summary.completed && !completedSet.has(sectionId)) {
            newlyCompletedSectionIds.push(sectionId);
          }
        });
        if (debugUiEnabled) {
          const debugEntries = ids.map((sectionId) => {
            const summary = statuses[sectionId];
            return {
              sectionId,
              completed: summary?.completed,
              lecturesSatisfied: summary?.lecturesSatisfied,
              adaptiveSatisfied: summary?.adaptiveSatisfied,
              exerciseSatisfied: summary?.exerciseSatisfied,
            };
          });
          // console.log("[SectionStatus] fetched summaries", debugEntries);
        }
        setSectionRequirementStatuses((prev) => ({
          ...prev,
          ...statuses,
        }));
        if (newlyCompletedSectionIds.length > 0) {
          const nextCompleted = new Set(completedSectionIdsRef.current);
          newlyCompletedSectionIds.forEach((sectionId) => nextCompleted.add(sectionId));
          completedSectionIdsRef.current = nextCompleted;
          refreshModuleProgressForSections(newlyCompletedSectionIds);
        }
        const adaptiveHistoryPayload = payload?.adaptiveSessionHistory;
        if (adaptiveHistoryPayload && typeof adaptiveHistoryPayload === "object") {
          const normalizedHistory: Record<string, AdaptiveSessionHistoryEntry[]> = {};
          Object.entries(adaptiveHistoryPayload).forEach(([sectionId, entries]) => {
            if (!sectionId || !Array.isArray(entries)) {
              return;
            }
            const parsedEntries = entries
              .map(parseAdaptiveSessionHistoryEntry)
              .filter((entry): entry is AdaptiveSessionHistoryEntry => entry !== null);
            if (parsedEntries.length > 0) {
              normalizedHistory[sectionId] = parsedEntries;
            }
          });
          if (Object.keys(normalizedHistory).length > 0) {
            setSectionAdaptiveHistories((prev) => ({
              ...prev,
              ...normalizedHistory,
            }));
          }
        }
      } catch (error) {
        console.warn(
          "Failed to load section requirement statuses:",
          (error as any)?.message || error,
        );
      }
    },
    [isAuthenticated, debugUiEnabled],
  );

  const refreshSectionRequirementStatus = useCallback(
    (sectionId?: string | null) => {
      if (!sectionId) {
        return;
      }
      void fetchSectionRequirementStatuses([sectionId]);
    },
    [fetchSectionRequirementStatuses],
  );

  useEffect(() => {
    if (!isAuthenticated || !allSections.length) {
      return;
    }
    fetchSectionRequirementStatuses();
  }, [isAuthenticated, sectionIdsSignature, fetchSectionRequirementStatuses]);
  // Track and log module activity so unlocking can persist in user_learning_path
  const recordedModuleActivitiesRef = useRef<Set<string>>(new Set());

  const markLectureAsWatched = useCallback((lectureKey?: string | null) => {
    if (!lectureKey) return;
    // console.log("[lecture-tracker] Marked lecture as watched in UI", {
    //   lectureKey,
    // });
    setWatchedLectureIds((prev) => {
      if (prev.has(lectureKey)) return prev;
      const next = new Set(prev);
      next.add(lectureKey);
      return next;
    });
  }, []);

  const logModuleActivity = useCallback(
    async (activity: {
      sectionId?: string;
      kind: "lecture" | "quiz" | "exercise";
      lectureId?: string;
      watchedSeconds?: number;
      durationSeconds?: number;
      quizQuestionId?: string;
      exerciseId?: string;
      exerciseQuestionId?: string;
      exerciseIsCorrect?: boolean;
    }) => {
      // console.log(activity);
      const sectionId = activity.sectionId;
      if (!sectionId) return;
      const moduleKey = sectionToModuleSlug.get(sectionId);
      if (!moduleKey) return;
      // console.log("Logging activity for module:", moduleKey);
        const dedupeKey = `${moduleKey}:${activity.kind}:${activity.sectionId || ""}:${activity.lectureId || activity.quizQuestionId || activity.exerciseId || activity.exerciseQuestionId || ""}`;

      if( activity.kind !== "exercise"){
        if (recordedModuleActivitiesRef.current.has(dedupeKey)) return;
        // console.log("Logging module activity:", dedupeKey);
        recordedModuleActivitiesRef.current.add(dedupeKey);
      }
      
      try {
        const res = await fetch("/api/learning-paths/user/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId,
            subjectId,
            moduleId: moduleKey,
            sectionId: activity.sectionId,
            lectureId: activity.lectureId,
            watchedSeconds: activity.watchedSeconds,
            durationSeconds: activity.durationSeconds,
            quizQuestionId: activity.quizQuestionId,
            exerciseId: activity.exerciseId,
            exerciseQuestionId: activity.exerciseQuestionId,
            exerciseIsCorrect: activity.exerciseIsCorrect,
            activity: activity.kind,
            moduleLectureIds: moduleLectureIdsMap.get(moduleKey),
          }),
        });
        if (res.ok) {
          const payload = await res.json().catch(() => null);
          if (payload?.moduleCompletion?.completed) {
            refreshAllowedModules();
          }
          if (activity.kind === "lecture" && activity.lectureId) {
            markLectureAsWatched(String(activity.lectureId));
            refreshSectionRequirementStatus(sectionId);
            void fetchSectionRequirementStatuses([sectionId]);
          }
          fetchModuleStatuses();
          if (payload?.error) {
            console.warn("Module activity logging returned error:", payload.error);
            recordedModuleActivitiesRef.current.delete(dedupeKey);
          }
        } else {
          recordedModuleActivitiesRef.current.delete(dedupeKey);
          console.warn("Module activity logging failed:", res.status);
        }
      } catch (error) {
        console.warn("Failed to log module activity", error);
        recordedModuleActivitiesRef.current.delete(dedupeKey);
      }
    },
    [
      sectionToModuleSlug,
      courseId,
      subjectId,
      refreshAllowedModules,
      moduleLectureIdsMap,
      markLectureAsWatched,
      fetchModuleStatuses,
      refreshSectionRequirementStatus,
      fetchSectionRequirementStatuses,
    ],
  );

  const video95PercentReachedRef = useRef(false);
  const lectureCompletionFailureTimestampRef = useRef<number | null>(null);
  const previousLectureIdRef = useRef<string | null>(null);

  // Reset lecture watch tracker when the active lecture changes
  useEffect(() => {
    const tracker = lectureWatchTrackerRef.current;
    if (!selectedSection || selectedResource?.kind !== "lecture") {
      // console.log("[lecture-tracker] Reset (no active lecture)", {
      //   selectedSectionId: selectedSection?.id,
      //   resourceKind: selectedResource?.kind,
      // });
      tracker.lectureKey = null;
      tracker.accumulated = 0;
      tracker.lastTime = 0;
      tracker.lastTimestamp = Date.now() / 1000;
      video95PercentReachedRef.current = false;
      lectureCompletionFailureTimestampRef.current = null;
      tracker.awaitingReset = true;
      tracker.awaitingResetSince = Date.now() / 1000;
      // console.log("[lecture-tracker] Reset tracker because no lecture is selected");
      return;
    }
    const lectureKey = selectedResource.resourceId ?? null;
    const normalizedLectureKey = lectureKey ? String(lectureKey) : null;
    if (tracker.lectureKey !== normalizedLectureKey) {
      // console.log("[lecture-tracker] Reset (lecture changed)", {
      //   previousLectureKey: tracker.lectureKey,
      //   nextLectureKey: normalizedLectureKey,
      //   currentTime: videoState.currentTime,
      // });
      tracker.lectureKey = normalizedLectureKey;
      tracker.accumulated = 0;
      tracker.lastTime = videoState.currentTime || 0;
      tracker.lastTimestamp = Date.now() / 1000;
      video95PercentReachedRef.current = false;
      lectureCompletionFailureTimestampRef.current = null;
      tracker.awaitingReset = true;
      tracker.awaitingResetSince = Date.now() / 1000;
      // console.log("[lecture-tracker] New lecture selected, tracker initialized", {
      //   lectureKey: normalizedLectureKey,
      //   currentTime: videoState.currentTime,
      // });
      return;
    }
    tracker.lastTimestamp = Date.now() / 1000;
  }, [selectedSection, selectedResource, videoState.currentTime]);

  useEffect(() => {
    if (!selectedSection || selectedResource?.kind !== "lecture") {
      previousLectureIdRef.current = null;
      return;
    }
    const lectures = getLectures(selectedSection);
    const activeLecture = lectures.find((lecture, index) =>
      getLectureKey(lecture, selectedSection?.id ?? null, index) === selectedResource.resourceId,
    );
    const currentLectureId = activeLecture?.id ? String(activeLecture.id) : null;
    const previousLectureId = previousLectureIdRef.current;
    if (previousLectureId !== currentLectureId) {
      // console.log("[lecture-tracker] Lecture id change", {
      //   previousLectureId,
      //   currentLectureId,
      // });
      previousLectureIdRef.current = currentLectureId;
    } 
    // else if (currentLectureId) {
    //   console.log("[lecture-tracker] Lecture id unchanged", {
    //     currentLectureId,
    //   });
    // }
  }, [selectedSection, selectedResource]);

  // Accumulate watch time and log lecture progress once ~95% of the video is reached
  useEffect(() => {
    if (!selectedSection || selectedResource?.kind !== "lecture") return;
    const lectures = getLectures(selectedSection);
    const activeLecture = lectures.find((lecture, index) =>
      getLectureKey(lecture, selectedSection?.id ?? null, index) === selectedResource.resourceId,
    );
    const lectureKey = selectedResource.resourceId;
    if (!lectureKey) return;
    const lectureRecordId = activeLecture?.id ?? null;

    const tracker = lectureWatchTrackerRef.current;
    if (tracker.lectureKey !== String(lectureKey)) {
      // console.log("[lecture-tracker] Skip (key mismatch)", {
      //   trackerLectureKey: tracker.lectureKey,
      //   lectureKey,
      // });
      return;
    }

    const currentTime = videoState.currentTime;
    const duration = videoState.duration;
    const nowMs = Date.now();
    const nowSeconds = nowMs / 1000;
    if (tracker.awaitingReset) {
      const nearStart = currentTime <= 1;
      const nearEnd = typeof duration === "number" && duration > 0 && currentTime >= duration * 0.95;
      const waitingLongEnough =
        typeof tracker.awaitingResetSince === "number"
          ? nowSeconds - tracker.awaitingResetSince >= LECTURE_TRACKER_INITIAL_SETTLE_SECONDS
          : false;
      if (nearStart || nearEnd || waitingLongEnough) {
        // console.log("[lecture-tracker] Ready after settle", {
        //   lectureKey,
        //   currentTime,
        //   duration,
        //   nearStart,
        //   nearEnd,
        //   waitingLongEnough,
        // });
        tracker.awaitingReset = false;
        tracker.awaitingResetSince = null;
        tracker.lastTime = currentTime;
        tracker.lastTimestamp = nowSeconds;
        // console.log("[lecture-tracker] Captured initial playback sample, tracker active", {
        //   lectureKey,
        //   currentTime,
        //   nearStart,
        //   nearEnd,
        //   waitingLongEnough,
        // });
      } else {
        // console.log("[lecture-tracker] Waiting for settle", {
        //   lectureKey,
        //   currentTime,
        //   duration,
        //   waitingLongEnough,
        // });
        tracker.lastTime = currentTime;
        tracker.lastTimestamp = nowSeconds;
        // console.log("[lecture-tracker] Waiting for video to settle before tracking", {
        //   lectureKey,
        //   currentTime,
        //   duration,
        //   waitingLongEnough,
        // });
        return;
      }
    }

    const fallbackDurationMinutes =
      resolveLectureDurationMinutes(activeLecture) ?? DEFAULT_LECTURE_DURATION_MINUTES;
    const fallbackDurationSeconds = fallbackDurationMinutes * 60;
    const effectiveDuration = duration > 0 ? duration : fallbackDurationSeconds;
    if (!effectiveDuration || effectiveDuration <= 0) {
      // console.log("[lecture-tracker] Skip (no duration)", {
      //   lectureKey,
      //   duration,
      //   fallbackDurationSeconds,
      // });
      tracker.lastTime = currentTime;
      return;
    }
    // console.log("Current Time", currentTime, "Last Time", tracker.lastTime);
    const delta = currentTime - tracker.lastTime;
    if (delta < -1) {
      // console.log("[lecture-tracker] Reset (time moved backwards)", {
      //   lectureKey,
      //   currentTime,
      //   lastTime: tracker.lastTime,
      //   delta,
      // });
      // console.log('[lecture-tracker] Detected time reset, reinitializing tracker', {
      //   lectureKey,
      //   delta,
      //   currentTime,
      //   lastTime: tracker.lastTime,
      // });
      tracker.accumulated = 0;
      tracker.awaitingReset = true;
      tracker.awaitingResetSince = nowSeconds;
      tracker.lastTime = currentTime;
      tracker.lastTimestamp = nowSeconds;
      return;
    }
    const realElapsed = Math.max(nowSeconds - tracker.lastTimestamp, 0);
    const deltaPositive = Math.max(delta, 0);
    const playbackElapsed =
      deltaPositive > 0 ? deltaPositive : videoState.isPlaying ? realElapsed : 0;
    if (playbackElapsed > 0) {
      tracker.accumulated += playbackElapsed;
    }
    // console.log("[lecture-tracker] Tick", {
    //   lectureKey,
    //   currentTime,
    //   duration: effectiveDuration,
    //   delta,
    //   realElapsed,
    //   playbackElapsed,
    //   accumulated: tracker.accumulated,
    //   isPlaying: videoState.isPlaying,
    // });
    tracker.lastTime = currentTime;
    tracker.lastTimestamp = nowSeconds;

    // console.log(tracker);
    // console.log("duration", duration, "effectiveDuration", effectiveDuration);

    if (effectiveDuration > 0) {
      const positionFraction = Math.min(1, currentTime / effectiveDuration);
      // console.log("positionFraction", positionFraction);
      const shouldMarkWatched = positionFraction >= 0.95 && tracker.accumulated > 0;
      // console.log("[lecture-tracker] Progress", {
      //   lectureKey,
      //   positionFraction,
      //   accumulated: tracker.accumulated,
      //   shouldMarkWatched,
      // });
      if (shouldMarkWatched) {
        const lastFailureAt = lectureCompletionFailureTimestampRef.current;
        const cooldownExpired = !lastFailureAt || nowMs - lastFailureAt >= LECTURE_COMPLETION_RETRY_INTERVAL_MS;
        // console.log("[lecture-tracker] Threshold reached", {
        //   lectureKey,
        //   cooldownExpired,
        //   lastFailureAt,
        //   alreadyMarked: video95PercentReachedRef.current,
        // });
        if (!video95PercentReachedRef.current && cooldownExpired) {
          // console.log("[gamification] Lecture watched threshold hit", {
          //   sectionId: selectedSection.id,
          //   lectureKey,
          //   lectureRecordId,
          //   positionFraction,
          //   accumulated: tracker.accumulated,
          //   duration,
          // });
          video95PercentReachedRef.current = true;
          markLectureAsWatched(String(lectureKey));
          refreshSectionRequirementStatus(selectedSection.id);
          void fetchSectionRequirementStatuses([selectedSection.id]);
          const watchedSecondsForLogging = Math.max(
            tracker.accumulated,
            effectiveDuration * positionFraction,
            effectiveDuration * 0.95,
          );
          logModuleActivity({
            sectionId: selectedSection.id,
            kind: "lecture",
            lectureId: lectureRecordId ?? String(lectureKey),
            watchedSeconds: watchedSecondsForLogging,
            durationSeconds: effectiveDuration,
          });

          if (lectureRecordId) {
            void recordLectureCompletion(String(lectureRecordId))
              .then(() => {
                // console.log("[lecture-tracker] Completion recorded", {
                //   lectureKey,
                //   lectureRecordId,
                // });
                lectureCompletionFailureTimestampRef.current = null;
              })
              .catch((error) => {
                console.error("[gamification] Lecture completion failed", {
                  lectureId: lectureRecordId,
                  sectionId: selectedSection.id,
                  error,
                });
                // console.log("[lecture-tracker] Completion failed", {
                //   lectureKey,
                //   lectureRecordId,
                // });
                lectureCompletionFailureTimestampRef.current = Date.now();
                video95PercentReachedRef.current = false;
              });
          } else {
            // console.log('Skipping gamification lecture completion; missing lecture id', {
            //   sectionId: selectedSection.id,
            //   lectureKey,
            // });
          }
        } else if (!video95PercentReachedRef.current && !cooldownExpired) {
          // console.log("[lecture-tracker] Cooldown active", {
          //   lectureKey,
          //   lastFailureAt,
          // });
          // console.log("[gamification] Lecture completion retry cooldown active", {
          //   sectionId: selectedSection.id,
          //   lectureKey,
          //   lectureRecordId,
          //   cooldownRemainingMs:
          //     lastFailureAt !== null
          //       ? Math.max(0, LECTURE_COMPLETION_RETRY_INTERVAL_MS - (nowMs - lastFailureAt))
          //       : 0,
          // });
        }
      } else {
        if (positionFraction >= 0.9) {
          // console.log("[lecture-tracker] Approaching completion threshold but not yet ready", {
          //   lectureKey,
          //   positionFraction,
          //   accumulated: tracker.accumulated,
          // });
        }
        // console.log("[lecture-tracker] Not ready", {
        //   lectureKey,
        //   positionFraction,
        //   accumulated: tracker.accumulated,
        // });
        video95PercentReachedRef.current = false;
        lectureCompletionFailureTimestampRef.current = null;
      }
    }
  }, [
    selectedSection,
    selectedResource,
    videoState.currentTime,
    videoState.duration,
    videoState.isPlaying,
    logModuleActivity,
    markLectureAsWatched,
    refreshSectionRequirementStatus,
    fetchSectionRequirementStatuses,
    recordLectureCompletion,
  ]);


  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [datasetPreview, setDatasetPreview] = useState<DatasetPreview | null>(null);
  const [loadingDatasetPreview, setLoadingDatasetPreview] = useState(false);
  const [datasetPreviewError, setDatasetPreviewError] = useState<string | null>(null);
  const [downloadingDataset, setDownloadingDataset] = useState(false);
  const [datasetSortConfig, setDatasetSortConfig] = useState<
    { column: string; direction: "asc" | "desc" } | null
  >(null);
  const [pythonDatasetStatus, setPythonDatasetStatus] = useState<Record<string, PythonDatasetLoadState>>({});
  const datasetPreviewCacheRef = useRef<Record<string, Record<string, DatasetPreview>>>({});
  const activeDatasetPreviewRequestRef = useRef<string | null>(null);
  const datasetAvailabilitySignatureRef = useRef<string | null>(null);
  const lastHintSignatureRef = useRef<string | null>(null);
  const lastHintQuestionIdRef = useRef<string | null>(null);
  const skipDuckDbRefreshRef = useRef(false);
  const lastPopupQuestionIdRef = useRef<string | null>(null);
  const preparedPopupQuestionRef = useRef<string | null>(null);

  const datasetPreviewColumnsKey = datasetPreview?.columns?.join("|") ?? null;
  useEffect(() => {
    setDatasetSortConfig(null);
  }, [datasetPreviewColumnsKey]);

  useEffect(() => {
    datasetPreviewCacheRef.current = {};
    activeDatasetPreviewRequestRef.current = null;
  }, [courseId, subjectId]);

  const handleClearOutput = useCallback(() => {
    setSqlResults([]);
    setSqlError('');
    setPythonOutput('');
    setPythonError('');
    setDuckDbSetupError(null);
    lastHintSignatureRef.current = null;
  }, []);

  const addHintToOutput = useCallback(
    (hint: { verdict?: string | null; message?: string | null }) => {
      const message = normalizeHintMessage(hint?.message);
      if (!message) {
        return;
      }
      const verdict =
        typeof hint?.verdict === "string" && hint.verdict.trim().length > 0
          ? hint.verdict.trim()
          : "Hint";
      const signature = `${verdict}::${message}`;
      if (lastHintSignatureRef.current === signature) {
        return;
      }
      lastHintSignatureRef.current = signature;
      setSqlResults((prev) => [
        ...prev,
        {
          isHint: true,
          verdict,
          message,
          columns: [],
          values: [],
        },
      ]);
    },
    [setSqlResults],
  );

  const downloadDatasetPreview = useCallback(
    async ({
      fileName,
      worksheetName,
    }: {
      fileName?: string;
      worksheetName?: string;
    }) => {
      if (!datasetPreview || datasetPreview.columns.length === 0) {
        return;
      }

      const sanitizeForFile = (value: string) =>
        value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();

      const safeWorksheetName = sanitizeForFile(worksheetName ?? "Dataset").slice(0, 31) || "Sheet1";
      const safeFileName = (sanitizeForFile(fileName ?? "dataset") || "dataset").slice(0, 120);

      const normalizeCellForExport = (value: unknown) => {
        if (value === null || value === undefined) {
          return "";
        }
        if (typeof value === "bigint") {
          return value.toString();
        }
        if (typeof value === "object") {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        }
        return value;
      };

      try {
        setDownloadingDataset(true);
        const XLSX = await import("xlsx");
        const worksheetData = [
          datasetPreview.columns,
          ...datasetPreview.rows.map((row) => row.map((cell) => normalizeCellForExport(cell))),
        ];
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, safeWorksheetName);
        XLSX.writeFile(workbook, `${safeFileName}.xlsx`);
      } catch (error) {
        console.error("Failed to export dataset preview", error);
      } finally {
        setDownloadingDataset(false);
      }
    },
    [datasetPreview],
  );
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const toggleContentExpanded = useCallback(() => {
    setIsContentExpanded((prev) => !prev);
  }, []);
  const closeNavigation = useCallback(() => {
    setIsContentExpanded(true);
  }, []);
  const openNavigation = useCallback(() => {
    setIsContentExpanded(false);
  }, []);

  const renderContentExpansionToggle = useCallback(
    (variant: "light" | "dark" = "light") => (
      <button
        type="button"
        onClick={toggleContentExpanded}
        className={`group inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-xs font-medium transition ${
          variant === "dark"
            ? "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            : "border-slate-200 bg-slate-100 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
        }`}
        aria-label={isContentExpanded ? "Show course navigation" : "Hide course navigation"}
      >
        {isContentExpanded ? (
          <ChevronLeft className={`h-4 w-4 ${variant === "dark" ? "text-white" : "text-slate-500"}`} />
        ) : (
          <ChevronRight className={`h-4 w-4 ${variant === "dark" ? "text-white" : "text-slate-500"}`} />
        )}
        <span
          className={`ml-2 hidden sm:inline ${
            variant === "dark" ? "text-white/80" : "text-slate-600"
          }`}
        >
          {isContentExpanded ? "Show Outline" : "Hide Outline"}
        </span>
      </button>
    ),
    [isContentExpanded, toggleContentExpanded],
  );

  // Adaptive Quiz state
  const [isAdaptiveQuizMode, setIsAdaptiveQuizMode] = useState(false);
  const [adaptiveQuizSession, setAdaptiveQuizSession] = useState<any>(null);
  const [adaptiveSessionCount, setAdaptiveSessionCount] = useState<number | null>(null);
  const [currentAdaptiveQuestion, setCurrentAdaptiveQuestion] = useState<any>(null);
  const [adaptiveQuizAnswer, setAdaptiveQuizAnswer] = useState<string>('');
  const [adaptiveQuizCompleted, setAdaptiveQuizCompleted] = useState(false);
  const [adaptiveQuizSummary, setAdaptiveQuizSummary] = useState<any>(null);
  const [submittingAdaptiveAnswer, setSubmittingAdaptiveAnswer] = useState(false);
  const [pendingAdaptiveQuestion, setPendingAdaptiveQuestion] = useState<any>(null);
  const [showAdaptiveExplanation, setShowAdaptiveExplanation] = useState(false);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [adaptiveSessionAnsweredCount, setAdaptiveSessionAnsweredCount] = useState(0);
  const [adaptiveSessionCorrectCount, setAdaptiveSessionCorrectCount] = useState(0);

  const liveAdaptiveQuestionOffset = useMemo(() => {
    const sectionId = adaptiveQuizSession?.section_id ?? selectedSectionId;
    if (!sectionId) {
      return 0;
    }
    return computeAdaptiveSectionOffset(sectionId, {
      excludeSessionId: adaptiveQuizSession?.id,
    });
  }, [
    adaptiveQuizSession?.id,
    adaptiveQuizSession?.section_id,
    selectedSectionId,
    computeAdaptiveSectionOffset,
  ]);

  const resolvedAdaptiveSectionId = adaptiveQuizSession?.section_id ?? selectedSectionId ?? null;
  const resolvedAdaptiveSectionStatus =
    resolvedAdaptiveSectionId && activeSectionQuizzes[resolvedAdaptiveSectionId]
      ? activeSectionQuizzes[resolvedAdaptiveSectionId].sectionStatus ?? null
      : null;
  const isAdaptiveSectionPassed = resolvedAdaptiveSectionStatus === "passed";

  // Practice Mode state
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [selectedPracticeExercise, setSelectedPracticeExercise] = useState<any>(null);
  const [practiceQuestions, setPracticeQuestions] = useState<any[]>([]);
  const [practiceDatasets, setPracticeDatasets] = useState<any[]>([]);
  const [isPracticeDatasetLoading, setIsPracticeDatasetLoading] = useState(false);
  const [mentorChatSessions, setMentorChatSessions] = useState<Record<string, MentorChatSession>>({});
  const [mentorChatLoading, setMentorChatLoading] = useState<Record<string, boolean>>({});
  const [mentorChatSending, setMentorChatSending] = useState<Record<string, boolean>>({});
  const [mentorChatErrors, setMentorChatErrors] = useState<Record<string, string>>({});
  const [mentorChatCompletedXpAwarded, setMentorChatCompletedXpAwarded] =
    useState<Record<string, boolean>>({});
  const [activeMentorQuestionId, setActiveMentorQuestionId] = useState<string | null>(null);

  const handleMentorChatCompletion = useCallback(
    (
      session: MentorChatSession | null | undefined,
      {
        questionId,
        exerciseId,
        sectionId,
      }: { questionId?: string; exerciseId?: string; sectionId?: string } = {},
    ) => {
      const chatStatus = session?.chat?.status?.toLowerCase();
      const coachStatus = session?.ai?.status?.toLowerCase();
      const isCompletedFromCoaching =
        coachStatus === "completed" || chatStatus === "completed";

      if (!isCompletedFromCoaching) {
        return;
      }

      const normalizedQuestionId =
        normalizeIdentifier(questionId) ??
        normalizeIdentifier(session.question?.id) ??
        undefined;
      const resolvedExerciseId =
        normalizeIdentifier(exerciseId) ??
        normalizeIdentifier(session.exercise?.id) ??
        normalizeIdentifier((selectedPracticeExercise as { exercise_id?: unknown })?.exercise_id) ??
        normalizeIdentifier((selectedPracticeExercise as { id?: unknown })?.id);
      const resolvedSectionId =
        sectionId ?? selectedSectionId ?? normalizeIdentifier(session.section?.id);

      if (!resolvedExerciseId) {
        return;
      }

      const awardKey = normalizedQuestionId ?? `exercise:${resolvedExerciseId}`;
      const alreadyAwarded = Boolean(mentorChatCompletedXpAwarded[awardKey]);
      if (!alreadyAwarded) {
        recordIdentifiedQuestionXp(resolvedExerciseId).catch((error) => {
          console.error("Failed to award identified question XP:", error);
        });
        setMentorChatCompletedXpAwarded((prev) => ({
          ...prev,
          [awardKey]: true,
        }));
      }

      if (resolvedSectionId) {
        void fetchSectionRequirementStatuses([resolvedSectionId]);
        void logModuleActivity({
          sectionId: resolvedSectionId,
          kind: "exercise",
          exerciseId: resolvedExerciseId,
        });
        // Optimistically mark the exercise as completed for mentor_chat flows
        setSectionRequirementStatuses((prev) => {
          const existing = prev[resolvedSectionId] ?? EMPTY_REQUIREMENT_SUMMARY;
          const updatedExerciseStatuses = {
            ...(existing.exerciseStatuses ?? {}),
            [resolvedExerciseId]: true,
          };
          const completedExerciseCount = Object.values(updatedExerciseStatuses).filter(Boolean)
            .length;
          const totalExercises = existing.totalExercises ?? 0;
          const exerciseSatisfied =
            totalExercises > 0
              ? completedExerciseCount >= 1
              : existing.exerciseSatisfied;
          const updatedSummary = buildRequirementSummary({
            lecturesSatisfied: existing.lecturesSatisfied,
            adaptiveSatisfied: existing.adaptiveSatisfied,
            exerciseSatisfied,
            totalExercises,
            completedExercises: Math.max(
              existing.completedExercises ?? 0,
              completedExerciseCount,
            ),
            exerciseStatuses: updatedExerciseStatuses,
            requirementApplicabilities: {
              lectures: existing.lecturesApplicable ?? true,
              quiz: existing.quizApplicable ?? true,
              exercise: existing.exerciseApplicable ?? true,
            },
            lectureCount: existing.lectureCount,
          });
          return {
            ...prev,
            [resolvedSectionId]: updatedSummary,
          };
        });
      }
    },
    [
      fetchSectionRequirementStatuses,
      recordIdentifiedQuestionXp,
      logModuleActivity,
      mentorChatCompletedXpAwarded,
      selectedPracticeExercise,
      selectedSectionId,
    ],
  );

  const loadMentorChatSession = useCallback(
    async (questionId: string, exerciseIdOverride?: string, sectionId?: string) => {
      if (!isAuthenticated) {
        return;
      }

      const normalizedQuestionId = normalizeIdentifier(questionId) ?? questionId;
      if (!normalizedQuestionId) {
        return;
      }

      const exerciseId =
        exerciseIdOverride ??
        extractExerciseIdentifier(selectedPracticeExercise) ??
        normalizeIdentifier(
          (selectedPracticeExercise as { exercise_id?: unknown })?.exercise_id,
        );

      if (!exerciseId) {
        return;
      }

      if (
        mentorChatLoading[normalizedQuestionId] ||
        (!exerciseIdOverride && mentorChatSessions[normalizedQuestionId])
      ) {
        return;
      }

      setMentorChatErrors(prev => {
        if (!(normalizedQuestionId in prev)) {
          return prev;
        }
        const { [normalizedQuestionId]: _removed, ...rest } = prev;
        return rest;
      });

      setMentorChatLoading((prev) => ({
        ...prev,
        [normalizedQuestionId]: true,
      }));

      try {
        const response = await apiGet(
          `/v1/sections/exercises/${exerciseId}/questions/${normalizedQuestionId}/chat`,
        );
        if (response) {
          setMentorChatSessions((prev) => ({
            ...prev,
            [normalizedQuestionId]: response as MentorChatSession,
          }));
          handleMentorChatCompletion(response as MentorChatSession, {
            questionId: normalizedQuestionId,
            exerciseId,
            sectionId: sectionId ?? selectedSectionId,
          });
          setMentorChatErrors(prev => {
            if (!(normalizedQuestionId in prev)) {
              return prev;
            }
            const { [normalizedQuestionId]: _removed, ...rest } = prev;
            return rest;
          });
        }
      } catch (error) {
        console.error('Failed to load mentor chat session:', error);
        setMentorChatErrors(prev => ({
          ...prev,
          [normalizedQuestionId]: 'Mentor conversation is currently unavailable.',
        }));
      } finally {
        setMentorChatLoading((prev) => ({
          ...prev,
          [normalizedQuestionId]: false,
        }));
      }
    },
    [
      isAuthenticated,
      mentorChatLoading,
      mentorChatSessions,
      selectedPracticeExercise,
      selectedSectionId,
      handleMentorChatCompletion,
    ],
  );

  const sendMentorChatMessage = useCallback(
    async (
      questionId: string,
      message: string,
      exerciseIdOverride?: string,
    ) => {
      if (!isAuthenticated) {
        return;
      }

      const normalizedQuestionId = normalizeIdentifier(questionId) ?? questionId;
      if (!normalizedQuestionId) {
        return;
      }

      const exerciseId =
        exerciseIdOverride ??
        extractExerciseIdentifier(selectedPracticeExercise) ??
        normalizeIdentifier(
          (selectedPracticeExercise as { exercise_id?: unknown })?.exercise_id,
        );

      if (!exerciseId) {
        return;
      }

      if (mentorChatSending[normalizedQuestionId]) {
        return;
      }

      setMentorChatErrors(prev => {
        if (!(normalizedQuestionId in prev)) {
          return prev;
        }
        const { [normalizedQuestionId]: _removed, ...rest } = prev;
        return rest;
      });

      setMentorChatSending((prev) => ({
        ...prev,
        [normalizedQuestionId]: true,
      }));

      try {
        const response = await apiPost(
          `/v1/sections/exercises/${exerciseId}/questions/${normalizedQuestionId}/chat`,
          { message },
        );
        if (response) {
          const updatedSession = response as MentorChatSession;
          handleMentorChatCompletion(updatedSession, {
            questionId: normalizedQuestionId,
            exerciseId,
            sectionId: selectedSectionId,
          });
          setMentorChatSessions((prev) => ({
            ...prev,
            [normalizedQuestionId]: updatedSession,
          }));
          setMentorChatErrors(prev => {
            if (!(normalizedQuestionId in prev)) {
              return prev;
            }
            const { [normalizedQuestionId]: _removed, ...rest } = prev;
            return rest;
          });
        }
      } catch (error) {
        console.error('Failed to send mentor chat message:', error);
        setMentorChatErrors(prev => ({
          ...prev,
          [normalizedQuestionId]: 'We could not send your message. Try again in a moment.',
        }));
      } finally {
        setMentorChatSending((prev) => ({
          ...prev,
          [normalizedQuestionId]: false,
        }));
      }
    },
    [
      isAuthenticated,
      mentorChatSending,
      selectedPracticeExercise,
      mentorChatSessions,
      selectedSection,
      selectedSectionId,
      handleMentorChatCompletion,
    ],
  );

  // console.log('Selected Question for Popup:', selectedQuestionForPopup);
  const selectedQuestionType = useMemo(() => {
    if (!selectedQuestionForPopup) {
      return null;
    }
    const normalized =
      pickNormalizedQuestionType(
        (selectedQuestionForPopup as any)?.subjectTitle
      ) ?? undefined;
    return normalized;
  }, [selectedQuestionForPopup]);

  // console.log('Selected Question Type:', selectedQuestionType);
  const isSpreadsheetQuestion = selectedQuestionType === "google_sheets" || selectedQuestionType === "text";
  const isPythonLikeQuestion = selectedQuestionType === "python";
  const shouldUseDuckDb =
    selectedQuestionType === "sql" ||
    selectedQuestionType === "statistics" ||
    selectedQuestionType === "python" ||
    selectedQuestionType === "google_sheets";
  const practiceExerciseType = useMemo(() => {
    if (!selectedPracticeExercise) {
      return undefined;
    }
    const candidates = [
      (selectedPracticeExercise as any)?.practice_type,
      (selectedPracticeExercise as any)?.exercise_type,
      (selectedPracticeExercise as any)?.type,
      (selectedPracticeExercise as any)?.subject_type,
    ];
    const match = candidates.find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    return match ? match.toLowerCase() : undefined;
  }, [selectedPracticeExercise]);
  const isProblemSolving =
    selectedQuestionType === "problem_solving" ||
    selectedQuestionType === "art_of_problem_solving" ||
    selectedQuestionType === "mentor_chat";
  const practiceNeedsDuckDb = useMemo(() => {
    if (!practiceExerciseType) {
      return false;
    }
    return (
      practiceExerciseType === "sql" ||
      practiceExerciseType === "statistics" ||
      practiceExerciseType === "python" ||
      practiceExerciseType === "google_sheets"
    );
  }, [practiceExerciseType]);
  const practiceNeedsPyodide = practiceExerciseType === "python";

  useEffect(() => {
    if (shouldUseDuckDb || (isPracticeMode && practiceNeedsDuckDb)) {
      initializeDuckDb();
    }
  }, [initializeDuckDb, isPracticeMode, practiceNeedsDuckDb, shouldUseDuckDb]);

  useEffect(() => {
    if (isPythonLikeQuestion || (isPracticeMode && practiceNeedsPyodide)) {
      initializePyodide();
    }
  }, [initializePyodide, isPracticeMode, isPythonLikeQuestion, practiceNeedsPyodide]);
  const worksheetFeedback = useMemo(() => {
    const normalizeId = (value: unknown): string | null => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      if (typeof value === "number") {
        return String(value);
      }
      if (typeof value === "object") {
        const candidate =
          (value as { id?: unknown }).id ??
          (value as { question_id?: unknown }).question_id ??
          (value as { questionId?: unknown }).questionId;
        return normalizeId(candidate ?? null);
      }
      return null;
    };

    const extractSubmission = (source: unknown) => {
      if (!source || typeof source !== "object") {
        return null;
      }
      const submission = (source as { latestSubmission?: unknown }).latestSubmission;
      return submission && typeof submission === "object"
        ? (submission as Record<string, unknown>)
        : null;
    };

    const normalizeSubmission = (submission: Record<string, unknown>) => {
      if (!submission) {
        return null;
      }
      const verdict =
        typeof submission.verdict === "string" && submission.verdict.trim().length > 0
          ? submission.verdict.trim()
          : submission.isCorrect === true
          ? "Correct"
          : "Needs another pass";

      const feedbackSource =
        typeof submission.feedback === "string" && submission.feedback.trim().length > 0
          ? submission.feedback
          : submission.evaluation &&
            typeof submission.evaluation === "object" &&
            typeof (submission.evaluation as { feedback?: unknown }).feedback === "string"
          ? ((submission.evaluation as { feedback?: string }).feedback as string)
          : "";

      const feedback = feedbackSource.trim();

      return {
        verdict,
        feedback: feedback.length > 0 ? feedback : null,
        isCorrect: submission.isCorrect === true,
      };
    };

    const activeQuestionId = normalizeId(selectedQuestionForPopup);
    if (!activeQuestionId) {
      return null;
    }

    let submission = extractSubmission(selectedQuestionForPopup);

    if (!submission) {
      const practiceMatch = practiceQuestions.find(
        (question) => normalizeId(question) === activeQuestionId,
      );
      if (practiceMatch) {
        submission = extractSubmission(practiceMatch);
      }
    }

    if (!submission) {
      if (
        selectedPracticeExercise &&
        Array.isArray(selectedPracticeExercise.section_exercise_questions)
      ) {
        const match = selectedPracticeExercise.section_exercise_questions.find(
          (question: unknown) => normalizeId(question) === activeQuestionId,
        );
        if (match) {
          submission = extractSubmission(match);
        }
      }
    }

    if (!submission && selectedSectionId) {
      const exercisesForSection = sectionExercises[selectedSectionId];
      if (Array.isArray(exercisesForSection)) {
        for (const exercise of exercisesForSection) {
          if (!exercise || typeof exercise !== "object") {
            continue;
          }
          const questionList = (exercise as { section_exercise_questions?: unknown }).section_exercise_questions;
          if (!Array.isArray(questionList)) {
            continue;
          }
          const match = questionList.find(
            (question: unknown) => normalizeId(question) === activeQuestionId,
          );
          if (match) {
            submission = extractSubmission(match);
            if (submission) {
              break;
            }
          }
        }
      }
    }

    return submission ? normalizeSubmission(submission) : null;
  }, [
    practiceQuestions,
    sectionExercises,
    selectedPracticeExercise,
    selectedQuestionForPopup,
    selectedSectionId,
  ]);

  const worksheetHint = useMemo(() => {
    const latestHint = (selectedQuestionForPopup as any)?.latestHint;
    if (
      latestHint &&
      typeof latestHint.message === "string" &&
      latestHint.message.trim().length > 0
    ) {
      return {
        verdict:
          typeof latestHint.verdict === "string" && latestHint.verdict.trim().length > 0
            ? latestHint.verdict
            : "Hint",
        message: latestHint.message.trim(),
      };
    }

    const fallbackHintValue =
      (selectedQuestionForPopup as any)?.hint ??
      (selectedQuestionForPopup as any)?.adaptive_note ??
      (((selectedQuestionForPopup as any)?.content &&
        typeof (selectedQuestionForPopup as any)?.content?.hint === "string")
        ? (selectedQuestionForPopup as any).content.hint
        : undefined);

    const fallbackMessage = normalizeHintMessage(fallbackHintValue);
    if (fallbackMessage) {
      return {
        verdict: "Hint",
        message: fallbackMessage,
      };
    }

    return null;
  }, [selectedQuestionForPopup]);


  // Function to fetch exercise datasets
  const fetchExerciseDatasets = useCallback(async (exerciseId: string) => {
    if (!isAuthenticated) return;
    if (
      loadingExerciseDatasetsRef.current[exerciseId] ||
      exerciseDatasetsRef.current[exerciseId]
    ) {
      return;
    }

    setLoadingExerciseDatasets(prev => ({ ...prev, [exerciseId]: true }));
    try {
      const response = await getExerciseDatasetsAction(exerciseId) as any;
      const datasetsPayload = unpackApiArray<any>(response) ?? [];
      const normalizedDatasets = datasetsPayload.map((dataset: any) => {
        const datasetType = resolveDatasetLanguage(
          dataset?.subject_type,
          dataset?.type,
          dataset?.question_type,
        );
        const normalized = normalizeQuestionDataset(dataset, {
          questionId:
            typeof dataset?.question_id === "string" || typeof dataset?.question_id === "number"
              ? String(dataset.question_id)
              : undefined,
          questionTitle: dataset?.name,
          subjectType: datasetType,
        });
        if (normalized) {
          return normalized;
        }
        const fallbackCreationSource = coalesceString(
          dataset?.creation_sql,
          dataset?.create_sql,
          dataset?.sql,
          dataset?.dataset,
        );
        const fallbackCreationSql = normalizeCreationSql(fallbackCreationSource, {
          datasetType,
        });
        return {
          ...dataset,
          creation_sql: fallbackCreationSql,
          create_sql: fallbackCreationSql ?? undefined,
        };
      });
      setExerciseDatasets(prev => ({
        ...prev,
        [exerciseId]: normalizedDatasets,
      }));
      // console.log('Fetched datasets for exercise:', exerciseId, normalizedDatasets);
    } catch (error) {
      console.error('Failed to fetch exercise datasets:', error);
    } finally {
      setLoadingExerciseDatasets(prev => ({ ...prev, [exerciseId]: false }));
    }
  }, [isAuthenticated]);

  // Function to fetch section quizzes
  const fetchSectionQuizzes = useCallback(async (sectionId: string) => {
    if (!isAuthenticated) return;
    if (
      loadingSectionQuizzesRef.current[sectionId] ||
      sectionQuizzesRef.current[sectionId]
    ) {
      return;
    }

    setLoadingSectionQuizzes(prev => ({ ...prev, [sectionId]: true }));
    try {
      const response = await getSectionQuizzesAction(sectionId) as any;
      const quizzesPayload = unpackApiArray<any>(response) ?? [];
      setSectionQuizzes(prev => ({
        ...prev,
        [sectionId]: quizzesPayload,
      }));
      // console.log('Fetched quizzes for section:', sectionId, quizzesPayload);
    } catch (error) {
      console.error('Failed to fetch section quizzes:', error);
    } finally {
      setLoadingSectionQuizzes(prev => ({ ...prev, [sectionId]: false }));
    }
  }, [isAuthenticated]);

  // SQL execution will be handled by backend API

  // Database initialization is now handled by backend API

  const autoScrollArmedRef = useRef(Boolean(initialModuleSlug));

  // Function to fetch section exercises
  const ensureExerciseHasUserProgress = useCallback(
    async (sectionId: string, exercise: any) => {
      if (!exercise || !exercise.id) {
        return exercise;
      }

      if (exerciseHasSubmissionData(exercise)) {
        return exercise;
      }
      try {
        const progressResponse = await getExerciseProgressAction(String(exercise.id));
        // console.log("progress" ,progressResponse);
        const progressExercise = (progressResponse as any)?.exercise;
        if (!progressExercise) {
          return exercise;
        }
        const mergedExercise = mergeExerciseProgress(exercise, progressExercise);
        setSectionExercises((prev) => {
          const list = prev[sectionId];
          if (!Array.isArray(list) || list.length === 0) {
            return prev;
          }
          const updatedList = list.map((item: any) =>
            String(item?.id ?? "") === String(mergedExercise?.id ?? "") ? mergedExercise : item,
          );
          const changed = updatedList.some((item, index) => item !== list[index]);
          return changed ? { ...prev, [sectionId]: updatedList } : prev;
        });
        return mergedExercise;
      } catch (error) {
        console.warn("Failed to load exercise progress:", error);
        return exercise;
      }
    },
    [setSectionExercises],
  );

  const fetchSectionExercises = useCallback(async (sectionId: string) => {
    if (!isAuthenticated) return;
    // console.log('[FETCH EXERCISES DEBUG] Called for section:', sectionId, {
    //   alreadyLoading: loadingSectionExercises[sectionId],
    //   alreadyLoaded: !!sectionExercises[sectionId],
    //   currentState: sectionExercises
    // });
    
    if (
      loadingSectionExercisesRef.current[sectionId] ||
      sectionExercisesRef.current[sectionId]
    ) {
      // console.log('[FETCH EXERCISES DEBUG] Early return - already loading or loaded');
      return;
    }

    setLoadingSectionExercises(prev => ({ ...prev, [sectionId]: true }));
    try {
      const response = await getSectionExercisesAction(sectionId) as any;
      // console.log('[FETCH EXERCISES DEBUG] API response:', response);
      const exercisesPayload = unpackApiArray<any>(response);
      if (exercisesPayload !== null) {
        const derivedDatasetCache: Record<string, QuestionDatasetRecord[]> = {};
        let normalizedExercises = exercisesPayload.map((exercise: any) => {
              const exerciseDatasetType = resolveDatasetLanguage(
                exercise?.subject_type,
                exercise?.exercise_type,
                exercise?.practice_type,
                exercise?.type,
              );
              const normalizedExerciseDataset = normalizeCreationSql(exercise?.data, {
                datasetType: exerciseDatasetType,
              });
              const normalizedContext = exercise?.context
                ? (() => {
                    const contextCreationSource = coalesceString(
                      exercise.context?.data_creation_sql,
                      exercise.context?.create_sql,
                    );
                    const contextCreationSql = normalizeCreationSql(contextCreationSource, {
                      datasetType: exerciseDatasetType,
                    });
                    const contextCsv =
                      typeof exercise.context.dataset_csv_raw === "string" &&
                      exercise.context.dataset_csv_raw.trim().length > 0
                        ? extractCsvFromSource(exercise.context.dataset_csv_raw) ??
                          exercise.context.dataset_csv_raw
                        : extractCsvFromSource(contextCreationSql);
                    const contextRows =
                      contextCsv && contextCsv.trim().length > 0
                        ? parseCsvToObjects(contextCsv)
                        : [];
                    const contextColumns =
                      Array.isArray(exercise.context.dataset_columns) &&
                      exercise.context.dataset_columns.length > 0
                        ? exercise.context.dataset_columns
                        : contextRows.length > 0
                        ? Object.keys(contextRows[0])
                        : exercise.context.expected_cols_list?.[0] || [];
                    const contextPayload =
                      exerciseDatasetType === "google_sheets"
                        ? contextCsv ?? contextCreationSql ?? ""
                        : contextCreationSql ?? "";
                    return {
                      ...exercise.context,
                      data_creation_sql: contextPayload,
                      create_sql: contextCreationSql ?? undefined,
                      dataset_csv_raw: contextCsv,
                      dataset_columns: contextColumns,
                    };
                  })()
                : exercise?.context;
              const datasetPayload =
                exerciseDatasetType === "google_sheets"
                  ? normalizedContext?.dataset_csv_raw ?? normalizedExerciseDataset ?? ""
                  : normalizedExerciseDataset ?? "";
              const normalizedExercise = {
                ...exercise,
                // Map 'data' field from backend to 'dataset' field expected by frontend
                dataset: datasetPayload,
                section_exercise_questions: Array.isArray(exercise?.section_exercise_questions)
                  ? exercise.section_exercise_questions.map((question: any, index: number) =>
                      normalizeSectionExerciseQuestion(question, {
                        exerciseId: exercise?.id ? String(exercise.id) : undefined,
                        fallbackIndex: index,
                      }),
                    )
                  : exercise?.section_exercise_questions,
                context: normalizedContext,
              };
              const exerciseKey =
                typeof normalizedExercise?.id === "string"
                  ? normalizedExercise.id
                  : typeof normalizedExercise?.id === "number"
                  ? String(normalizedExercise.id)
                  : undefined;
              if (exerciseKey) {
                const derivedDatasets = deriveExerciseDatasets(normalizedExercise, {
                  datasetType: exerciseDatasetType,
                });
                if (derivedDatasets.length) {
                  derivedDatasetCache[exerciseKey] = derivedDatasets;
                }
              }
              return normalizedExercise;
            });

        if (isAuthenticated && normalizedExercises.length) {
          normalizedExercises = await Promise.all(
            normalizedExercises.map(async (exercise: any) => {
              if (!exercise?.id || exerciseHasSubmissionData(exercise)) {
                return exercise;
              }
              try {
                const progressResponse = await getExerciseProgressAction(String(exercise.id));
                // console.log("progerss" ,progressResponse);
                const progressExercise = (progressResponse as any)?.exercise;
                if (!progressExercise) {
                  return exercise;
                }
                return mergeExerciseProgress(exercise, progressExercise);
              } catch (error) {
                console.warn("Failed to hydrate exercise progress:", error);
                return exercise;
              }
            }),
          );
        }

        // console.log('[FETCH EXERCISES DEBUG] Exercises data:', normalizedExercises.map((e: any) => ({
        //   id: e.id,
        //   title: e.title,
        //   questionsCount: e.section_exercise_questions?.length || 0,
        //   questions: e.section_exercise_questions
        // })));
        setSectionExercises(prev => {
          const newState = {
            ...prev,
            [sectionId]: normalizedExercises
          };
          // console.log('[FETCH EXERCISES DEBUG] State updated. New state:', newState);
          return newState;
        });

        if (Object.keys(derivedDatasetCache).length > 0) {
          setExerciseDatasets(prev => {
            let changed = false;
            const next = { ...prev };
            for (const [exerciseId, datasets] of Object.entries(derivedDatasetCache)) {
              if (Array.isArray(next[exerciseId]) && next[exerciseId].length > 0) {
                continue;
              }
              next[exerciseId] = datasets;
              changed = true;
            }
            return changed ? next : prev;
          });
        }
      }
    } catch (error) {
      console.error('[FETCH EXERCISES DEBUG] Failed to fetch section exercises:', error);
    } finally {
      setLoadingSectionExercises(prev => ({ ...prev, [sectionId]: false }));
    }
  }, [isAuthenticated]);

  // Subject-to-exercise-type mapping
  // console.log(subjectTitle);
  const getExerciseTypeBySubject = useCallback((subjectTitle?: string | null) => {
    if (!subjectTitle) return undefined;

    const subject = subjectTitle.toLowerCase();

    if (
      subject.includes("mentor_chat") ||
      (subject.includes("mentor") && subject.includes("chat")) ||
      subject.includes("art of problem solving") ||
      subject.includes("aops")
    ) {
      return "mentor_chat";
    }

    if (
      subject.includes("sheet") ||
      subject.includes("excel") ||
      subject.includes("spreadsheet") ||
      subject.includes("google sheets")
    ) {
      return "google_sheets";
    }

    if (subject.includes("python") || subject.includes("programming") || subject.includes("coding")) {
      return "python";
    }

    if (subject.includes("statistics") || subject.includes("statistical")) {
      return "statistics";
    }

    if (
      subject.includes("sql") ||
      subject.includes("database") ||
      subject.includes("data warehouse") ||
      subject.includes("data engineering")
    ) {
      return "sql";
    }

    if (subject.includes("math") || subject.includes("mathematics") || subject.includes("geometry")) {
      return "math";
    }

    return "sql";
  }, []);

  const determineSolutionCodingLanguage = useCallback(
    (exerciseType?: string | null, subjectTitleParam?: string | null) => {
      const normalizedType =
        exerciseType && exerciseType.length > 0
          ? exerciseType.toLowerCase().trim()
          : undefined;
      if (
        normalizedType === "google_sheets" ||
        normalizedType === "google sheets" ||
        normalizedType === "sheet" ||
        normalizedType === "sheets" ||
        normalizedType === "statistics" ||
        normalizedType === "statistic"
      ) {
        return "Excel Formulae or Pivot Table Steps";
      }

      if (normalizedType === "python") {
        return "python";
      }

      if (normalizedType === "sql") {
        return "sql";
      }

      if (subjectTitleParam && subjectTitleParam.trim().length > 0) {
        return subjectTitleParam.trim();
      }

      if (exerciseType && exerciseType.trim().length > 0) {
        return exerciseType.trim();
      }

      return "sql";
    },
    [],
  );

  const subjectExerciseType = useMemo(
    () => getExerciseTypeBySubject(subjectTitle),
    [getExerciseTypeBySubject, subjectTitle],
  );

  // console.log(getExerciseTypeBySubject(subjectTitle));

  const fetchQuestionDataset = useCallback(
    async (
      questionId: string,
      context?: { questionTitle?: string; questionType?: string | null },
    ) => {
      if (!isAuthenticated) return;
      if (!questionId) return;

      const cached = questionDatasetCache[questionId];
      if (cached !== undefined) {
        setQuestionDataset(cached);
        return;
      }

      setLoadingDataset(true);
      try {
        const result = await apiGet<{ data?: QuestionDatasetRecord | null } | QuestionDatasetRecord | null>(
          `/v1/sections/questions/${questionId}/dataset`,
        );
        const datasetPayload =
          result && typeof result === "object" && "data" in result ? (result as { data?: QuestionDatasetRecord | null }).data : (result as QuestionDatasetRecord | null);
        const normalizedDataset = normalizeQuestionDataset(datasetPayload, {
          questionId,
          questionTitle: context?.questionTitle,
          subjectType: context?.questionType,
        });
        setQuestionDataset(normalizedDataset);
        setQuestionDatasetCache((prev) => ({
          ...prev,
          [questionId]: normalizedDataset,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes(" 404")) {
          setQuestionDataset(null);
          setQuestionDatasetCache((prev) => ({
            ...prev,
            [questionId]: null,
          }));
        } else {
          console.error("Error fetching dataset:", error);
          setQuestionDataset(null);
          setQuestionDatasetCache((prev) => ({
            ...prev,
            [questionId]: null,
          }));
        }
      } finally {
        setLoadingDataset(false);
      }
    },
    [questionDatasetCache, setQuestionDatasetCache, isAuthenticated],
  );

  // Generation functions with progressive loading
  const handleGenerateExercise = useCallback(async (section: Section) => {
    if (!isAuthenticated) {
      console.warn('Attempted to generate exercise without authentication');
      return;
    }
    if (generatingExercise[section.id]) return;

    setGeneratingExercise(prev => ({ ...prev, [section.id]: true }));
    setGenerationStep('Analysing course structure...');
    setGenerationProgress(20);
    // console.log('Practice exercise generation initiated', {
    //   sectionId: section.id,
    //   sectionTitle: section.title,
    //   courseId,
    //   subjectId,
    //   subjectTitle,
    //   timestamp: new Date().toISOString(),
    // });

    try {
      // Step 1: Getting section details
      setGenerationStep('Getting section details...');
      setGenerationProgress(40);

      // Determine exercise type based on subject
      const exerciseType = getExerciseTypeBySubject(subjectTitle);
      const solutionCodingLanguage = determineSolutionCodingLanguage(exerciseType, subjectTitle);
      // console.log(solutionCodingLanguage);
      const datasetCreationCodingLanguage = "sql";
      let difficulty = "Beginner";

      if(userId == "96417bc4-aed4-4452-b537-4fe628f095df"){
        console.log("User ID is 96417bc4-aed4-4452-b537-4fe628f095df, PE, setting up the difficulty to Intermediate");
        difficulty = "Intermediate";
      }
      
      // console.log('Waiting for AI response before processing generation result', {
      //   sectionId: section.id,
      //   exerciseType,
      //   courseId,
      //   subjectId,
      //   timestamp: new Date().toISOString(),
      // });
      const result = await generateSectionExercisesAction({
        sectionId: section.id,
        courseId,
        subjectId,
        sectionTitle: section.title,
        difficulty: difficulty,
        exerciseType: exerciseType as 'sql' | 'python' | 'google_sheets' | 'statistics' | 'powerbi' | 'math' | 'problem_solving' | 'geometry',
        questionCount: 3,
        userId: userId ?? undefined,
        futureTopics:
          Array.isArray(section.futureTopics) && section.futureTopics.length > 0
            ? section.futureTopics
            : undefined,
        datasetCreationCodingLanguage,
        solutionCodingLanguage,
      }) as GeneratedExerciseResponse;
      // Step 2: Generating questions & SQL
      setGenerationStep('Generating questions & SQL...');
      setGenerationProgress(60);
      // console.log('AI generation result received', {
      //   sectionId: section.id,
      //   exerciseId: result?.exercise?.id,
      //   questionsCount: result?.questions?.length ?? 0,
      //   contextPresent: Boolean(result?.context),
      // });

      // Process the generated exercise data
      if (result && result.context) {
        const { context } = result;
        const rawQuestions = context.questions_raw || [];
        const normalizedQuestionType = (exerciseType || 'sql') as
          | 'sql'
          | 'python'
          | 'google_sheets'
          | 'statistics'
          | 'powerbi'
          | 'math'
          | 'problem_solving'
          | 'geometry';

        // Step 3: Dataset is now stored in database during generation
        setGenerationStep('Finalizing exercise...');
        setGenerationProgress(80);

        const apiQuestions = (result.questions || []).map((question, index) => {
          const normalizedContent =
            parseQuestionContentObject((question as any)?.content) as Record<string, unknown> | null;
          const expectedOutputColumns = normalizeExpectedOutputColumns(
            (question as any)?.expected_output_table,
            normalizedContent?.expected_output_table,
            rawQuestions?.[index]?.expected_output_table,
          );

          return {
            ...question,
            content:
              normalizedContent && expectedOutputColumns.length > 0
                ? {
                    ...normalizedContent,
                    expected_output_table: expectedOutputColumns,
                  }
                : normalizedContent ?? (question as any)?.content ?? null,
            text: question.question_text || (rawQuestions?.[index]?.business_question ?? ''),
            expected_output_table:
              expectedOutputColumns.length > 0
                ? expectedOutputColumns
                : Array.isArray((question as any)?.expected_output_table)
                ? (question as any).expected_output_table
                : undefined,
          };
        });

        const creationSqlSource = coalesceString(context.data_creation_sql, (context as any)?.create_sql);
        // console.log('Creation SQL Source:', creationSqlSource);
        const normalizedCreationSql = normalizeCreationSql(creationSqlSource, {
          datasetType: normalizedQuestionType,
        });
        const creationPythonSource = coalesceString(
          context.data_creation_python,
          (context as any)?.create_python,
          (context as any)?.creation_python,
        );
        const normalizedCreationPython = normalizeCreationSql(creationPythonSource, {
          datasetType: "python",
          preserveFormatting: true,
        });

        const normalizedDatasetCsv =
          typeof context.dataset_csv_raw === "string" && context.dataset_csv_raw.trim().length > 0
            ? extractCsvFromSource(context.dataset_csv_raw) ?? context.dataset_csv_raw
            : extractCsvFromSource(normalizedCreationSql);
        const datasetRows =
          normalizedDatasetCsv && normalizedDatasetCsv.trim().length > 0
            ? parseCsvToObjects(normalizedDatasetCsv)
            : [];
        const datasetColumns =
          Array.isArray(context.dataset_columns) && context.dataset_columns.length > 0
            ? context.dataset_columns
            : datasetRows.length > 0
            ? Object.keys(datasetRows[0])
            : context.expected_cols_list?.[0] || [];
        const datasetSqlPayload = normalizedCreationSql ?? "";
        const datasetDisplayPayload =
          normalizedQuestionType === "google_sheets"
            ? datasetSqlPayload
            : datasetSqlPayload;
        const datasetPythonPayload =
          normalizedCreationPython ??
          (normalizedQuestionType === "python" || normalizedQuestionType === "statistics"
            ? normalizedCreationSql
            : undefined);
        // console.log('Derived dataset payload from generation context', {
        //   sectionId: section.id,
        //   exerciseId: result?.exercise?.id,
        //   normalizedQuestionType,
        //   datasetRowsCount: datasetRows.length,
        //   datasetColumns,
        //   datasetSqlPayload,
        //   datasetDisplayPayload,
        //   datasetPythonPayload,
        //   datasetRowsSample: datasetRows.slice(0, 3),
        // });
        const normalizedContext = {
          ...context,
          data_creation_sql: datasetSqlPayload,
          create_sql: normalizedCreationSql ?? undefined,
          dataset_csv_raw: normalizedDatasetCsv,
          dataset_columns: datasetColumns,
          data_creation_python: normalizedCreationPython ?? context.data_creation_python,
          create_python: normalizedCreationPython ?? (context as any)?.create_python ?? (context as any)?.creation_python,
          creation_python: normalizedCreationPython ?? (context as any)?.creation_python ?? (context as any)?.create_python,
        };

        const derivedQuestions =
          apiQuestions.length > 0
            ? apiQuestions
            : rawQuestions.map((question, index) => {
                const normalizedExpectedOutputs = normalizeExpectedOutputColumns(
                  question?.expected_output_table,
                  context?.expected_cols_list?.[index],
                );

                return {
                  id: `${result.exercise.id}-generated-${question.id ?? index}`,
                  exercise_id: result.exercise.id,
                  question_text: question.business_question,
                  question_type: normalizedQuestionType,
                  text: question.business_question,
                  options: [],
                  correct_answer: null,
                  solution: '',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  dataset: datasetDisplayPayload,
                  expected_output_table:
                    normalizedExpectedOutputs.length > 0
                      ? normalizedExpectedOutputs
                      : undefined,
                };
              });

        const updatedExercise = {
          ...result.exercise,
          questions: derivedQuestions,
        };

        const normalizedExerciseEntry = {
          ...updatedExercise,
          section_exercise_questions: derivedQuestions,
          dataset: datasetDisplayPayload,
          context: normalizedContext,
        };

        setCurrentExerciseData({
          ...result,
          context: normalizedContext,
          exercise: updatedExercise,
          questions: derivedQuestions,
        });

        setSectionExercises(prev => ({
          ...prev,
          [section.id]: [
            normalizedExerciseEntry,
            ...(prev[section.id]?.filter((exercise: any) => exercise.id !== updatedExercise.id) ?? []),
          ],
        }));

        setExerciseDatasets(prev => ({
          ...prev,
          [updatedExercise.id]: [
            {
              id: 'generated_dataset',
              name: updatedExercise.title || 'Generated Dataset',
              description: context.dataset_description,
              columns: datasetColumns,
              creation_sql: datasetSqlPayload,
              create_sql: datasetSqlPayload,
              dataset_csv_raw: normalizedDatasetCsv,
              data: datasetRows,
              data_preview: datasetRows,
              data_dictionary: context.data_dictionary,
              creation_python: datasetPythonPayload,
              create_python: datasetPythonPayload,
              data_creation_python: datasetPythonPayload,
            },
          ],
        }));
        // console.log('Generated dataset stored for exercise', {
        //   exerciseId: updatedExercise.id,
        //   datasetRows: datasetRows.slice(0, 5),
        //   datasetRowsCount: datasetRows.length,
        //   datasetColumns,
        //   datasetSqlPayload,
        //   datasetDisplayPayload,
        //   datasetPythonPayload,
        // });

        setSelectedSectionId(section.id);
        setSelectedResource({
          sectionId: section.id,
          kind: "exercise",
          resourceId: updatedExercise.id,
        });

        const firstQuestion = derivedQuestions[0];
        if (firstQuestion) {
          setActiveExerciseQuestion(
            {
              ...firstQuestion,
              exerciseId: updatedExercise.id ? String(updatedExercise.id) : null,
              exerciseTitle: updatedExercise.title,
              exerciseDescription: updatedExercise.description,
              exerciseDataset: datasetDisplayPayload,
              exercisePythonDataset: datasetPythonPayload,
            },
            0,
          );
          setShowQuestionPopup(false);
        } else {
          setSelectedQuestionForPopup(null);
        }
      }

      setGenerationStep('Ready to practice!');
      setGenerationProgress(100);

      // Brief delay to show completion
      await new Promise(resolve => setTimeout(resolve, 1000));

      // console.log('Exercise generated successfully:', result);
    } catch (error) {
      console.error('Failed to generate exercise:', error);
      setGenerationStep('Failed to generate exercise');
      setGenerationProgress(0);
    } finally {
      setGeneratingExercise(prev => ({ ...prev, [section.id]: false }));
      // Reset progress after a short delay
      setTimeout(() => {
        setGenerationStep('');
        setGenerationProgress(0);
      }, 2000);
    }
  }, [
    generatingExercise,
    generateSectionExercisesAction,
    courseId,
    subjectId,
    getExerciseTypeBySubject,
    determineSolutionCodingLanguage,
    subjectTitle,
    isAuthenticated,
    userId,
  ]);

  // Adaptive Quiz Handlers
  const initializeAdaptiveSessionScore = useCallback(async (sessionId?: string | null) => {
    if (!sessionId) {
      return;
    }
    try {
      const summaryResult = await getAdaptiveQuizSummaryAction(sessionId);
      const summary = summaryResult?.summary;
      const answeredQuestions = Number(summary?.answeredQuestions ?? 0);
      const correctAnswers = Number(summary?.correctAnswers ?? 0);
      setAdaptiveSessionAnsweredCount(
        Number.isFinite(answeredQuestions) && answeredQuestions > 0 ? answeredQuestions : 0,
      );
      setAdaptiveSessionCorrectCount(
        Number.isFinite(correctAnswers) && correctAnswers > 0 ? correctAnswers : 0,
      );
    } catch (error) {
      console.error("Failed to initialize adaptive quiz score:", error);
      setAdaptiveSessionAnsweredCount(0);
      setAdaptiveSessionCorrectCount(0);
    }
  }, []);

  const handleStartAdaptiveQuiz = useCallback(async (section: Section) => {
    if (!isAuthenticated) {
      console.warn('Attempted to start adaptive quiz without authentication');
      return;
    }
    if (generatingQuiz[section.id] || isAdaptiveQuizMode) return;

    setGeneratingQuiz(prev => ({ ...prev, [section.id]: true }));
    try {
      const status = await fetchAdaptiveQuizStatus(section.id);
      const shouldResume = status?.hasActiveQuiz;

      let difficulty = 'Beginner';

      if(userId == "96417bc4-aed4-4452-b537-4fe628f095df"){
        console.log("User ID is 96417bc4-aed4-4452-b537-4fe628f095df, Quiz, setting up the difficulty to Intermediate");
        difficulty = "Intermediate";
      }

      const result = shouldResume
        ? ((await resumeAdaptiveQuizAction({ sectionId: section.id })) as any)
        : ((await startAdaptiveQuizAction({
            courseId,
            subjectId,
            sectionId: section.id,
            sectionTitle: section.title || '',
            difficulty: difficulty,
            targetLength: 10,
          })) as any);

      if (!result || !result.session) {
        return;
      }

      const sessionCount =
        typeof result.sessionCount === "number" && Number.isFinite(result.sessionCount)
          ? result.sessionCount
          : null;
      setAdaptiveSessionCount(sessionCount);
      initializeAdaptiveSessionScore(result.session.id);

      const nextQuestion = result.currentQuestion ?? result.firstQuestion;
      logModuleActivity({ sectionId: section.id, kind: "quiz" });

      if (result.stop) {
        setAdaptiveQuizSession(result.session);
        setAdaptiveQuizCompleted(true);
        setIsAdaptiveQuizMode(true);
        setAdaptiveQuizAnswer('');
        setPendingAdaptiveQuestion(null);
        setSubmittingAdaptiveAnswer(false);
        setShowAdaptiveExplanation(false);
        setLastAnswerCorrect(null);

        try {
          const summaryResult = await getAdaptiveQuizSummaryAction(result.session.id);
          if (summaryResult) {
            setAdaptiveQuizSummary(normalizeAdaptiveSummary(summaryResult));
          }
        } catch (summaryError) {
          console.error('Failed to fetch adaptive quiz summary:', summaryError);
        }

        await fetchAdaptiveQuizStatus(section.id);
        return;
      }

      if (!nextQuestion) {
        console.warn('Adaptive quiz response missing next question');
        await fetchAdaptiveQuizStatus(section.id);
        return;
      }

      setAdaptiveQuizSession(result.session);
      setCurrentAdaptiveQuestion(normalizeAdaptiveQuestion(nextQuestion));
      setIsAdaptiveQuizMode(true);
      setAdaptiveQuizCompleted(false);
      setAdaptiveQuizAnswer('');
      setPendingAdaptiveQuestion(null);
      setSubmittingAdaptiveAnswer(false);
      setShowAdaptiveExplanation(false);
      setLastAnswerCorrect(null);
      setAdaptiveQuizSummary(null);

      setActiveSectionQuizzes(prev => ({
        ...prev,
        [section.id]: {
          hasActiveQuiz: true,
          sessionId: result.session.id,
          sectionStatus: typeof result.sectionStatus === "string" ? result.sectionStatus : null,
        },
      }));
    } catch (error) {
      console.error('Failed to start or resume adaptive quiz:', error);
    } finally {
      setGeneratingQuiz(prev => ({ ...prev, [section.id]: false }));
    }
  }, [
    generatingQuiz,
    isAdaptiveQuizMode,
    fetchAdaptiveQuizStatus,
    courseId,
    subjectId,
    isAuthenticated,
    logModuleActivity,
    initializeAdaptiveSessionScore,
  ]);

  const handleViewAdaptiveSessionSummary = useCallback(
    async (sectionId: string, entry: AdaptiveSessionHistoryEntry, entryIndex: number) => {
      if (!entry.sessionId) {
        return;
      }
      setLoadingAdaptiveSessionSummary(entry.sessionId);
      try {
        const label = `AI Quiz Session ${entryIndex + 1}`;
        const result = await getAdaptiveQuizResponsesAction(entry.sessionId);
        const responses = Array.isArray(result?.responses)
          ? result.responses
          : [];
        const computedSummary =
          result?.summary ??
          buildSummaryFromResponses(responses) ??
          entry.summary;
        const dateLabel =
          formatAdaptiveSessionTimestamp(entry.updatedAt) ||
          formatAdaptiveSessionTimestamp(entry.createdAt) ||
          "Recent session";
        const entries = sectionAdaptiveHistories[sectionId] ?? [];
        const matchingIndex =
          entry.sessionId && entries.length
            ? entries.findIndex((historyEntry) => historyEntry.sessionId === entry.sessionId)
            : -1;
        const questionOffset =
          matchingIndex >= 0
            ? computeAdaptiveSectionOffset(sectionId, { uptoIndex: matchingIndex })
            : computeAdaptiveSectionOffset(sectionId);
        setSelectedAdaptiveSessionReview({
          sectionId,
          sessionId: entry.sessionId,
          label,
          dateLabel,
          summary: computedSummary,
          responses,
          questionOffset,
        });
      } catch (error) {
        console.error("Failed to fetch adaptive session responses:", error);
      } finally {
        setLoadingAdaptiveSessionSummary(null);
      }
    },
    [computeAdaptiveSectionOffset, sectionAdaptiveHistories],
  );

  const handleAdaptiveQuizSubmit = useCallback(async () => {
    if (!isAuthenticated) {
      console.warn('Attempted to submit adaptive quiz without authentication');
      return;
    }
    if (
      !currentAdaptiveQuestion ||
      !adaptiveQuizSession ||
      !adaptiveQuizAnswer ||
      submittingAdaptiveAnswer ||
      showAdaptiveExplanation
    ) {
      return;
    }

    setSubmittingAdaptiveAnswer(true);
    setPendingAdaptiveQuestion(null);

    try {
      // Compare labels (A, B, C, D) to determine correctness
      const selectedLabel = adaptiveQuizAnswer;
      const correctLabel = currentAdaptiveQuestion.correct_option?.label;
      const isCorrect = selectedLabel === correctLabel;

      setLastAnswerCorrect(isCorrect);
      setShowAdaptiveExplanation(true);
      const nextAnsweredCount = adaptiveSessionAnsweredCount + 1;
      const nextCorrectCount = adaptiveSessionCorrectCount + (isCorrect ? 1 : 0);
      setAdaptiveSessionAnsweredCount(nextAnsweredCount);
      setAdaptiveSessionCorrectCount(nextCorrectCount);

      const sectionIdForLogging = adaptiveQuizSession?.section_id || selectedSectionId;
      if (sectionIdForLogging) {
        logModuleActivity({
          sectionId: sectionIdForLogging,
          kind: "quiz",
          quizQuestionId: currentAdaptiveQuestion.id,
        });
      }

      const normalizedDifficulty: GamificationDifficulty = (() => {
        const raw =
          typeof currentAdaptiveQuestion.difficulty === "string"
            ? currentAdaptiveQuestion.difficulty.trim().toLowerCase()
            : "";
        if (raw === "easy" || raw === "medium" || raw === "hard") {
          return raw as GamificationDifficulty;
        }
        return "medium";
      })();
      const questionIdForGamification =
        currentAdaptiveQuestion.id ??
        currentAdaptiveQuestion.question_id ??
        (currentAdaptiveQuestion as Record<string, unknown>).exercise_question_id ??
        (currentAdaptiveQuestion as Record<string, unknown>).quiz_question_id;
      if (questionIdForGamification) {
        try {
          await recordQuestionAttempt({
            questionId: String(questionIdForGamification),
            questionType: "quiz",
            difficulty: normalizedDifficulty,
            isCorrect,
          });
        } catch (gamError) {
          console.error(
            "Failed to record adaptive quiz attempt for gamification:",
            gamError,
          );
        }
      }

      const result = await getNextQuestionAction({
        sessionId: adaptiveQuizSession.id,
        previousAnswer: {
          questionId: currentAdaptiveQuestion.id,
          selectedOption: adaptiveQuizAnswer,
          isCorrect,
        },
      }) as any;

      const historyEntries = sectionIdForLogging
        ? sectionAdaptiveHistories[sectionIdForLogging] ?? []
        : [];
      const historyTotals = historyEntries.reduce(
        (acc, entry) => {
          const totalQuestions =
            typeof entry.summary?.totalQuestions === "number" &&
            Number.isFinite(entry.summary.totalQuestions)
              ? entry.summary.totalQuestions
              : 0;
          const correctAnswers =
            typeof entry.summary?.correctAnswers === "number" &&
            Number.isFinite(entry.summary.correctAnswers)
              ? entry.summary.correctAnswers
              : 0;
          return {
            totalQuestions: acc.totalQuestions + totalQuestions,
            totalCorrect: acc.totalCorrect + correctAnswers,
          };
        },
        { totalQuestions: 0, totalCorrect: 0 },
      );
      const resolvedSessionCount =
        typeof adaptiveSessionCount === "number" && Number.isFinite(adaptiveSessionCount)
          ? adaptiveSessionCount
          : typeof adaptiveQuizSession?.sessionCount === "number" &&
              Number.isFinite(adaptiveQuizSession.sessionCount)
            ? adaptiveQuizSession.sessionCount
            : typeof adaptiveQuizSession?.session_count === "number" &&
                Number.isFinite(adaptiveQuizSession.session_count)
              ? adaptiveQuizSession.session_count
              : null;
      const canEvaluatePass =
        typeof resolvedSessionCount === "number" &&
        resolvedSessionCount >= 2 &&
        !isAdaptiveSectionPassed;
      const cumulativeTotalQuestions = historyTotals.totalQuestions + nextAnsweredCount;
      const cumulativeCorrectAnswers = historyTotals.totalCorrect + nextCorrectCount;
      const nextScorePercent =
        cumulativeTotalQuestions > 0
          ? Math.round((cumulativeCorrectAnswers / cumulativeTotalQuestions) * 100)
          : 0;
      // console.log("[adaptive-quiz] cumulative score check", {
      //   sectionId: sectionIdForLogging,
      //   sessionId: adaptiveQuizSession.id,
      //   sessionCount: resolvedSessionCount,
      //   historyQuestions: historyTotals.totalQuestions,
      //   historyCorrect: historyTotals.totalCorrect,
      //   currentAnswered: nextAnsweredCount,
      //   currentCorrect: nextCorrectCount,
      //   cumulativeTotalQuestions,
      //   cumulativeCorrectAnswers,
      //   nextScorePercent,
      // });
      const shouldMarkPassed =
        canEvaluatePass && nextScorePercent >= ADAPTIVE_QUIZ_PASS_PERCENT;

      if (shouldMarkPassed && sectionIdForLogging) {
        await markAdaptiveQuizSectionPassedAction({
          sectionId: sectionIdForLogging,
          sessionId: adaptiveQuizSession.id,
        });
        setAdaptiveQuizCompleted(true);
        setPendingAdaptiveQuestion(null);
        setCurrentAdaptiveQuestion(null);
        setActiveSectionQuizzes((prev) => ({
          ...prev,
          [sectionIdForLogging]: {
            ...(prev[sectionIdForLogging] ?? { hasActiveQuiz: false }),
            hasActiveQuiz: false,
            sectionStatus: "passed",
          },
        }));
        const summaryResult = await getAdaptiveQuizSummaryAction(adaptiveQuizSession.id);
        if (summaryResult) {
          setAdaptiveQuizSummary(normalizeAdaptiveSummary(summaryResult));
        }
        refreshSectionRequirementStatus(sectionIdForLogging);
        void fetchSectionRequirementStatuses([sectionIdForLogging]);
        await fetchAdaptiveQuizStatus(sectionIdForLogging);
        return;
      }

      if (result?.stop) {
        setAdaptiveQuizCompleted(true);
        const sectionIdForStatus = adaptiveQuizSession?.section_id;
        if (sectionIdForStatus) {
          setActiveSectionQuizzes((prev) => ({
            ...prev,
            [sectionIdForStatus]: {
              ...(prev[sectionIdForStatus] ?? { hasActiveQuiz: false }),
              hasActiveQuiz: false,
            },
          }));
        }

        const summaryResult = await getAdaptiveQuizSummaryAction(adaptiveQuizSession.id);
        if (summaryResult) {
          setAdaptiveQuizSummary(normalizeAdaptiveSummary(summaryResult));
          const score = Number(summaryResult?.summary?.score ?? 0);
          if (
            sectionIdForStatus &&
            typeof resolvedSessionCount === "number" &&
            resolvedSessionCount === 1 &&
            Number.isFinite(score) &&
            score >= ADAPTIVE_QUIZ_PASS_PERCENT &&
            !isAdaptiveSectionPassed
          ) {
            await markAdaptiveQuizSectionPassedAction({
              sectionId: sectionIdForStatus,
              sessionId: adaptiveQuizSession.id,
            });
            setActiveSectionQuizzes((prev) => ({
              ...prev,
              [sectionIdForStatus]: {
                ...(prev[sectionIdForStatus] ?? { hasActiveQuiz: false }),
                hasActiveQuiz: false,
                sectionStatus: "passed",
              },
            }));
          }
        }

        if (sectionIdForStatus) {
          refreshSectionRequirementStatus(sectionIdForStatus);
          void fetchSectionRequirementStatuses([sectionIdForStatus]);
          await fetchAdaptiveQuizStatus(sectionIdForStatus);
        }
      } else if (result?.question) {
        setPendingAdaptiveQuestion(normalizeAdaptiveQuestion(result.question));
      }
    } catch (error) {
      console.error('Failed to submit adaptive quiz answer:', error);
    } finally {
      setSubmittingAdaptiveAnswer(false);
    }
  }, [
    currentAdaptiveQuestion,
    adaptiveQuizSession,
    adaptiveQuizAnswer,
    submittingAdaptiveAnswer,
    showAdaptiveExplanation,
    fetchAdaptiveQuizStatus,
    isAuthenticated,
    selectedSectionId,
    logModuleActivity,
    refreshSectionRequirementStatus,
    fetchSectionRequirementStatuses,
    adaptiveSessionAnsweredCount,
    adaptiveSessionCorrectCount,
    adaptiveSessionCount,
    isAdaptiveSectionPassed,
    sectionAdaptiveHistories,
  ]);

  const handleAdaptiveQuizNext = useCallback(() => {
    if (!pendingAdaptiveQuestion) {
      return;
    }

    setCurrentAdaptiveQuestion(normalizeAdaptiveQuestion(pendingAdaptiveQuestion));
    setPendingAdaptiveQuestion(null);
    setAdaptiveQuizAnswer('');
    setShowAdaptiveExplanation(false);
    setLastAnswerCorrect(null);
  }, [pendingAdaptiveQuestion]);

  const handleExitAdaptiveQuiz = useCallback(() => {
    setIsAdaptiveQuizMode(false);
    setAdaptiveQuizSession(null);
    setAdaptiveSessionCount(null);
    setCurrentAdaptiveQuestion(null);
    setAdaptiveQuizAnswer('');
    setPendingAdaptiveQuestion(null);
    setSubmittingAdaptiveAnswer(false);
    setAdaptiveQuizCompleted(false);
    setAdaptiveQuizSummary(null);
    setShowAdaptiveExplanation(false);
    setLastAnswerCorrect(null);
    setAdaptiveSessionAnsweredCount(0);
    setAdaptiveSessionCorrectCount(0);
  }, []);

  // Practice Mode Handlers
  const handleStartPractice = useCallback(
    async (exercise: any) => {
      if (!exercise) {
        return;
      }

      const rawQuestions = Array.isArray(exercise.section_exercise_questions) &&
        exercise.section_exercise_questions.length > 0
          ? exercise.section_exercise_questions
          : Array.isArray(exercise.questions)
          ? exercise.questions
          : [];

      if (!rawQuestions.length) {
        console.warn('No practice questions available for exercise:', exercise?.id);
        return;
      }

      const normalizedQuestions = rawQuestions.map((question: any, index: number) =>
        normalizeSectionExerciseQuestion(question, {
          exerciseId: exercise?.id ? String(exercise.id) : undefined,
          fallbackIndex: index,
        }),
      );

      const exerciseDatasetType = resolveDatasetLanguage(
        exercise?.subject_type,
        exercise?.exercise_type,
        exercise?.practice_type,
        exercise?.type,
      );

      const normalizedExercise = {
        ...exercise,
        dataset: normalizeCreationSql(exercise?.dataset, { datasetType: exerciseDatasetType }),
        section_exercise_questions: normalizedQuestions,
      };
      const normalizedExerciseId =
        extractExerciseIdentifier(normalizedExercise) ??
        normalizeIdentifier(
          (normalizedExercise as { exercise_id?: unknown })?.exercise_id,
        );

      setSelectedPracticeExercise(normalizedExercise);
      setPracticeQuestions(normalizedQuestions);
      setShowQuestionPopup(false);
      setSelectedQuestionForPopup(null);
      setIsPracticeMode(true);
      setPracticeDatasets([]);
      setIsPracticeDatasetLoading(false);
      setMentorChatSessions({});
      setMentorChatLoading({});
      setMentorChatSending({});
      setMentorChatErrors({});
      setActiveMentorQuestionId(null);

      if (exerciseDatasetType === 'mentor_chat') {
        const firstQuestion = normalizedQuestions[0];
        const firstQuestionId =
          extractQuestionIdentifier(firstQuestion) ??
          normalizeIdentifier(firstQuestion?.id);
        if (firstQuestionId) {
          setActiveMentorQuestionId(firstQuestionId);
          await loadMentorChatSession(
            firstQuestionId,
            normalizedExerciseId ?? undefined,
            selectedSectionId,
          );
        }
        setIsPracticeDatasetLoading(false);
        return;
      }

      const exerciseKey =
        typeof normalizedExercise?.id === "string"
          ? normalizedExercise.id
          : typeof normalizedExercise?.id === "number"
          ? String(normalizedExercise.id)
          : null;
      const cachedDatasets =
        exerciseKey &&
        Array.isArray(exerciseDatasets[exerciseKey]) &&
        exerciseDatasets[exerciseKey].length > 0
          ? hydrateSpreadsheetDatasetRows(
              exerciseDatasets[exerciseKey] as QuestionDatasetRecord[],
              exerciseDatasetType,
            )
          : [];
      let practiceDatasetSource = cachedDatasets;

      if (!practiceDatasetSource.length) {
        const derivedDatasets = deriveExerciseDatasets(normalizedExercise, {
          datasetType: exerciseDatasetType,
        });
        if (derivedDatasets.length) {
          const hydratedDerivedDatasets = hydrateSpreadsheetDatasetRows(
            derivedDatasets,
            exerciseDatasetType,
          );
          practiceDatasetSource = hydratedDerivedDatasets;
          if (exerciseKey) {
            setExerciseDatasets(prev => {
              const existing = prev[exerciseKey];
              if (Array.isArray(existing) && existing.length > 0) {
                return prev;
              }
              return {
                ...prev,
                [exerciseKey]: hydratedDerivedDatasets,
              };
            });
          }
        }
      }
      const fallbackDatasets = practiceDatasetSource;

      setIsPracticeDatasetLoading(true);

      try {
        const response = (await getExerciseDatasetsAction(exercise.id)) as any;
        const datasetsPayload = unpackApiArray<any>(response) ?? [];
        if (datasetsPayload.length) {
          const normalizedDatasets = hydrateSpreadsheetDatasetRows(
            datasetsPayload.reduce<QuestionDatasetRecord[]>((acc, dataset: any) => {
              const datasetType = resolveDatasetLanguage(
                dataset?.subject_type,
                dataset?.type,
                dataset?.question_type,
                exerciseDatasetType,
              );
              const normalized = normalizeQuestionDataset(dataset, {
                questionId:
                  typeof dataset?.question_id === "string" || typeof dataset?.question_id === "number"
                    ? String(dataset.question_id)
                    : undefined,
                questionTitle: dataset?.name ?? exercise?.title,
                subjectType: datasetType,
              });
              if (normalized) {
                acc.push(normalized);
                return acc;
              }
              const creationSqlSource = coalesceString(
                dataset?.creation_sql,
                dataset?.create_sql,
                dataset?.sql,
                dataset?.dataset,
              );
              const normalizedCreationSql = normalizeCreationSql(creationSqlSource, {
                datasetType,
              });
              acc.push({
                ...dataset,
                creation_sql: normalizedCreationSql,
                create_sql: normalizedCreationSql ?? undefined,
                subject_type: datasetType,
              });
              return acc;
            }, []),
            exerciseDatasetType,
          );
          setPracticeDatasets(normalizedDatasets);
          if (exerciseKey) {
            setExerciseDatasets(prev => ({
              ...prev,
              [exerciseKey]: normalizedDatasets,
            }));
          }
        } else {
          if (fallbackDatasets.length) {
            setPracticeDatasets(fallbackDatasets);
          } else {
            setPracticeDatasets([]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch practice datasets:', error);
        if (fallbackDatasets.length) {
          setPracticeDatasets(fallbackDatasets);
        } else {
          setPracticeDatasets([]);
        }
      } finally {
        setIsPracticeDatasetLoading(false);
      }

      // Practice mode already enabled above
    },
    [exerciseDatasets, getExerciseDatasetsAction, loadMentorChatSession],
  );

  const handleExitPractice = useCallback(() => {
    setIsPracticeMode(false);
    setSelectedPracticeExercise(null);
    setPracticeQuestions([]);
    setPracticeDatasets([]);
    setIsPracticeDatasetLoading(false);
    setMentorChatSessions({});
    setMentorChatLoading({});
    setMentorChatSending({});
    setMentorChatErrors({});
    setActiveMentorQuestionId(null);
    setSelectedQuestionForPopup(null);
    setShowQuestionPopup(false);
    setSqlCode('');
    setSqlResults([]);
    setSqlError('');
    setPythonCode('');
    setWorksheetSolution('');
    setSelectedResource((prev) => {
      if (!selectedSection) {
        if (prev && prev.kind === "exercise") {
          return null;
        }
        return prev;
      }

      if (!prev || prev.kind !== "exercise" || prev.sectionId !== selectedSection.id) {
        return prev;
      }

      const fallback = getDefaultResource(selectedSection);
      if (!fallback) {
        return null;
      }

      if (fallback.kind === "exercise" && fallback.resourceId === prev.resourceId) {
        return null;
      }

    return fallback;
  });
}, [selectedSection]);

  const resetPracticeState = useCallback(() => {
    setIsPracticeMode(false);
    setSelectedPracticeExercise(null);
    setPracticeQuestions([]);
    setPracticeDatasets([]);
    setIsPracticeDatasetLoading(false);
    setMentorChatSessions({});
    setMentorChatLoading({});
    setMentorChatSending({});
    setMentorChatErrors({});
    setActiveMentorQuestionId(null);
    setSelectedQuestionForPopup(null);
    setShowQuestionPopup(false);
    setSqlCode('');
    setSqlResults([]);
    setSqlError('');
    setPythonCode('');
    setWorksheetSolution('');
  }, []);

  const handleExitEmbeddedExercise = useCallback(() => {
    setSelectedQuestionForPopup(null);
    setShowQuestionPopup(false);
    setSqlCode('');
    setPythonCode('');
    setWorksheetSolution('');
    setSqlResults([]);
    setSqlError('');
    setIsPracticeDatasetLoading(false);
    setSelectedResource((prev) => {
      if (!selectedSection) {
        if (prev && prev.kind === "exercise") {
          return null;
        }
        return prev;
      }

      if (!prev || prev.kind !== "exercise" || prev.sectionId !== selectedSection.id) {
        return prev;
      }

      const fallback = getDefaultResource(selectedSection);
      if (!fallback) {
        return null;
      }

      if (fallback.kind === "exercise" && fallback.resourceId === prev.resourceId) {
        return null;
      }

      return fallback;
    });
  }, [selectedSection]);

  const handlePracticeSubmit = useCallback(
    async (
      questionId: string,
      solution: string,
      options?: { markQuestionStatus?: boolean },
    ) => {
      if (!userId) {
        return {
          success: false,
          feedback: "Authentication required. Please refresh the page.",
          submission: null,
        };
      }

      const normalizeId = (value: unknown): string | undefined => {
        if (typeof value === "string") {
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : undefined;
        }
        if (typeof value === "number") {
          return String(value);
        }
        return undefined;
      };

      const extractQuestionId = (candidate: unknown): string | undefined => {
        if (!candidate || typeof candidate !== "object") {
          return undefined;
        }
        return (
          normalizeId((candidate as { id?: unknown }).id) ??
          normalizeId((candidate as { question_id?: unknown }).question_id) ??
          normalizeId((candidate as { questionId?: unknown }).questionId)
        );
      };

      const normalizedQuestionId = normalizeId(questionId) ?? "";
      if (!normalizedQuestionId) {
        return {
          success: false,
          feedback: "We couldn't identify this question. Please reopen it and try again.",
          submission: null,
        };
      }

      const questionIndex = practiceQuestions.findIndex(
        (item) => extractQuestionId(item) === normalizedQuestionId,
      );

      const practiceMatch =
        questionIndex >= 0 ? practiceQuestions[questionIndex] : undefined;

      const popupMatch = (() => {
        const popupId = extractQuestionId(selectedQuestionForPopup);
        return popupId === normalizedQuestionId
          ? (selectedQuestionForPopup as any)
          : undefined;
      })();

      const question = (practiceMatch ?? popupMatch) as any;
      const practiceDifficulty = resolvePracticeQuestionDifficulty(
        question,
        (selectedPracticeExercise as any)?.difficulty ?? null,
      );

      const normalizedExerciseId =
        normalizeId(question?.exercise_id) ??
        normalizeId(question?.exerciseId) ??
        normalizeId(selectedPracticeExercise?.id) ??
        (popupMatch
          ? normalizeId(popupMatch?.exerciseId ?? popupMatch?.exercise_id)
          : undefined) ??
        (selectedResource?.kind === "exercise"
          ? normalizeId(selectedResource.resourceId)
          : undefined);

      if (!normalizedExerciseId) {
        console.warn("Unable to determine exercise context for practice submission", {
          questionId,
          question,
          selectedPracticeExercise,
          selectedQuestionForPopup,
          selectedResource,
        });
        return {
          success: false,
          feedback: "We couldn't identify this exercise. Please reopen it and try again.",
          submission: null,
        };
      }

      try {
        const response = await apiPost<PracticeSubmissionResponse>(
          `/v1/sections/exercises/${normalizedExerciseId}/questions/${normalizedQuestionId}/submit`,
          {
            userAnswer: solution,
          },
        );

        const isCorrect = Boolean(response?.isCorrect);
        const verdict =
          response?.verdict ||
          response?.evaluation?.verdict ||
          (isCorrect ? "Correct" : "Incorrect");
        const feedback =
          response?.feedback ||
          response?.evaluation?.feedback ||
          (isCorrect
            ? "Great job! Your answer looks correct."
            : "Your answer isn't matching yet. Review the requirements and try again.");

        const submissionRecord =
          response?.submission && typeof response.submission === "object"
            ? (response.submission as Record<string, unknown>)
            : undefined;
        const submissionSnapshot = {
          userAnswer: solution,
          isCorrect,
          score:
            typeof submissionRecord?.score === "number"
              ? (submissionRecord.score as number)
              : isCorrect
              ? (typeof question?.points === "number" ? question.points : 0)
              : 0,
          feedback,
          verdict,
          evaluation: response?.evaluation ?? null,
          submittedAt:
            typeof submissionRecord?.submitted_at === "string"
              ? (submissionRecord.submitted_at as string)
              : new Date().toISOString(),
          attemptNumber:
            typeof submissionRecord?.attempt_number === "number"
              ? (submissionRecord.attempt_number as number)
              : undefined,
        };
        const shouldTrackResult = options?.markQuestionStatus ?? true;

        if (shouldTrackResult) {
          setPracticeQuestions((prev) =>
            prev.map((item, index) =>
              index === questionIndex || String(item?.id) === normalizedQuestionId
                ? {
                    ...item,
                    latestSubmission: submissionSnapshot,
                  }
                : item,
            ),
          );

          setSelectedPracticeExercise((prev) => {
            if (!prev || !Array.isArray(prev.section_exercise_questions)) {
              return prev;
            }
            return {
              ...prev,
              section_exercise_questions: prev.section_exercise_questions.map(
                (item: any) =>
                  String(item?.id) === normalizedQuestionId
                    ? {
                        ...item,
                        latestSubmission: submissionSnapshot,
                      }
                    : item,
              ),
            };
          });

          if (selectedSectionId) {
            setSectionExercises((prev) => {
              const exercisesForSection = prev[selectedSectionId];
              if (!Array.isArray(exercisesForSection)) {
                return prev;
              }
              return {
                ...prev,
                [selectedSectionId]: exercisesForSection.map((exercise: any) => {
                  if (String(exercise?.id) !== normalizedExerciseId) {
                    return exercise;
                  }
                  const questionList = Array.isArray(
                    exercise.section_exercise_questions,
                  )
                    ? exercise.section_exercise_questions.map((item: any) =>
                        String(item?.id) === normalizedQuestionId
                          ? {
                              ...item,
                              latestSubmission: submissionSnapshot,
                            }
                          : item,
                      )
                    : exercise.section_exercise_questions;
                  return {
                    ...exercise,
                    section_exercise_questions: questionList,
                  };
                }),
              };
            });
          }

          setSelectedQuestionForPopup((prev) => {
            if (!prev) {
              return prev;
            }
            const prevId = String(
              ((prev as any)?.id ?? (prev as any)?.question_id) ?? '',
            );
            if (prevId !== normalizedQuestionId) {
              return prev;
            }
            return {
              ...prev,
              latestSubmission: submissionSnapshot,
            };
          });

          logModuleActivity({
            sectionId: selectedSectionId,
            kind: "exercise",
            exerciseId: selectedPracticeExercise?.id ?? selectedResource?.resourceId,
            exerciseQuestionId: normalizedQuestionId,
            exerciseIsCorrect: isCorrect,
          });

          try {
            await recordQuestionAttempt({
              questionId: normalizedQuestionId,
              questionType: "practice",
              difficulty: practiceDifficulty,
              isCorrect,
            });
          } catch (gamError) {
            console.error(
              "Failed to record practice attempt for gamification:",
              gamError,
            );
          }

          setQuestionCompletionStatus((prev) => {
            let completionKey: string | undefined;
            if (questionIndex >= 0) {
              completionKey = getExerciseQuestionKey(
                practiceQuestions[questionIndex],
                questionIndex,
              );
            }
            completionKey = completionKey ?? normalizedQuestionId;
            if (!completionKey) {
              return prev;
            }
            const nextState = isCorrect ? "completed" : "incorrect";
            if (prev[completionKey] === nextState) {
              return prev;
            }
            return {
              ...prev,
              [completionKey]: nextState,
            };
          });

          if (selectedSectionId) {
            refreshSectionRequirementStatus(selectedSectionId);
            void fetchSectionRequirementStatuses([selectedSectionId]);
          }
        }

        return {
          success: true,
          isCorrect,
          verdict,
          feedback,
          evaluation: response?.evaluation ?? null,
          submission: submissionSnapshot,
        };
      } catch (error) {
        console.error("Error submitting practice attempt:", error);
        const message = error instanceof Error ? error.message : "";
        if (message.includes("401")) {
          return {
            success: false,
            feedback: "Authentication required. Please refresh the page.",
            submission: null,
          };
        }
        return {
          success: false,
          feedback: "Failed to submit solution. Please try again.",
          submission: null,
        };
      }
    },
    [
      userId,
      practiceQuestions,
      selectedPracticeExercise,
      selectedQuestionForPopup,
      selectedResource,
      selectedSectionId,
      logModuleActivity,
      setSelectedQuestionForPopup,
      refreshSectionRequirementStatus,
      fetchSectionRequirementStatuses,
      recordQuestionAttempt,
    ],
  );

  const handlePracticeHintRequest = useCallback(
    async (questionId: string, solution: string) => {
      if (!userId) {
        return {
          verdict: "Login required",
          message: "Authentication required. Please refresh the page.",
        };
      }

      const normalizeId = (value: unknown): string | undefined => {
        if (typeof value === "string") {
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : undefined;
        }
        if (typeof value === "number") {
          return String(value);
        }
        return undefined;
      };

      const extractQuestionId = (candidate: unknown): string | undefined => {
        if (!candidate || typeof candidate !== "object") {
          return undefined;
        }
        return (
          normalizeId((candidate as { id?: unknown }).id) ??
          normalizeId((candidate as { question_id?: unknown }).question_id) ??
          normalizeId((candidate as { questionId?: unknown }).questionId)
        );
      };

      const normalizedQuestionId = normalizeId(questionId) ?? "";
      if (!normalizedQuestionId) {
        return {
          verdict: "Try Again",
          message: "We couldn't identify this question. Reopen it and try once more.",
        };
      }

      const practiceMatch = practiceQuestions.find(
        (item) => extractQuestionId(item) === normalizedQuestionId,
      );

      const popupMatch = (() => {
        const popupId = extractQuestionId(selectedQuestionForPopup);
        return popupId === normalizedQuestionId
          ? (selectedQuestionForPopup as any)
          : undefined;
      })();

      const question = (practiceMatch ?? popupMatch) as any;

      const exerciseIdFromQuestion =
        normalizeId(question?.exercise_id) ?? normalizeId(question?.exerciseId);

      const exerciseIdFromSelected = normalizeId(selectedPracticeExercise?.id);

      const exerciseIdFromPopup = popupMatch
        ? normalizeId(popupMatch?.exerciseId ?? popupMatch?.exercise_id)
        : undefined;

      const exerciseIdFromResource =
        selectedResource?.kind === "exercise"
          ? normalizeId(selectedResource.resourceId)
          : undefined;

      const normalizedExerciseId =
        exerciseIdFromQuestion ??
        exerciseIdFromSelected ??
        exerciseIdFromPopup ??
        exerciseIdFromResource;

      if (!normalizedExerciseId) {
        console.warn("Unable to determine exercise context for hint request", {
          questionId,
          question,
          selectedPracticeExercise,
          selectedQuestionForPopup,
          selectedResource,
        });
        return {
          verdict: "Try Again",
          message: "We couldn't locate this exercise. Reopen it and request the hint again.",
        };
      }

      if (shouldUseDuckDb) {
        skipDuckDbRefreshRef.current = true;
      }

      try {
        const response = await apiPost<PracticeHintResponse>(
          `/v1/sections/exercises/${normalizedExerciseId}/questions/${normalizedQuestionId}/hint`,
          {
            userAnswer: solution,
          },
        );

        const normalizedMessage =
          response && typeof response.message === "string" && response.message.trim().length > 0
            ? response.message.trim()
            : "Keep going! Adjust your approach slightly and try again.";

        const hintSnapshot = {
          verdict: response?.verdict,
          message: normalizedMessage,
          userAnswer: solution,
          requestedAt: new Date().toISOString(),
        };

        setPracticeQuestions((prev) =>
          prev.map((item) =>
            String(item?.id) === normalizedQuestionId
              ? {
                  ...item,
                  latestHint: hintSnapshot,
                }
              : item,
          ),
        );

        setSelectedPracticeExercise((prev) => {
          if (!prev || !Array.isArray(prev.section_exercise_questions)) {
            return prev;
          }
          return {
            ...prev,
            section_exercise_questions: prev.section_exercise_questions.map(
              (item: any) =>
                String(item?.id) === normalizedQuestionId
                  ? {
                      ...item,
                      latestHint: hintSnapshot,
                    }
                  : item,
            ),
          };
        });

        if (selectedSectionId) {
          setSectionExercises((prev) => {
            const exercisesForSection = prev[selectedSectionId];
            if (!Array.isArray(exercisesForSection)) {
              return prev;
            }
            return {
              ...prev,
              [selectedSectionId]: exercisesForSection.map((exercise: any) => {
                if (String(exercise?.id) !== normalizedExerciseId) {
                  return exercise;
                }
                const questionList = Array.isArray(
                  exercise.section_exercise_questions,
                )
                  ? exercise.section_exercise_questions.map((item: any) =>
                      String(item?.id) === normalizedQuestionId
                        ? {
                            ...item,
                            latestHint: hintSnapshot,
                          }
                        : item,
                    )
                  : exercise.section_exercise_questions;
                return {
                  ...exercise,
                  section_exercise_questions: questionList,
                };
              }),
            };
          });
        }

        return hintSnapshot;
      } catch (error) {
        console.error("Error fetching practice hint:", error);
        return {
          verdict: "Try Again",
          message: "I couldn't fetch a hint right now. Please try once more.",
        };
      } finally {
        // if (shouldUseDuckDb) {
        //   setTimeout(() => {
        //     skipDuckDbRefreshRef.current = false;
        //   }, 0);
        // }
        // console.log("Hints loaded sucessfully.");
      }
    },
    [
      userId,
      practiceQuestions,
      selectedPracticeExercise,
      selectedQuestionForPopup,
      selectedResource,
      selectedSectionId,
      shouldUseDuckDb,
    ],
  );

  const registerSectionRef = useCallback(

    (sectionId: string) => (element: HTMLButtonElement | null) => {

      if (!sectionId) return;

      if (element) {

        sectionRefs.current.set(sectionId, element);

      } else {

        sectionRefs.current.delete(sectionId);

      }

    },

    []

  );

  useEffect(() => {
    if (initialModuleSlug) {
      autoScrollArmedRef.current = true;
      initialModuleHandledRef.current = false;
    } else {
      initialModuleHandledRef.current = true;
    }
  }, [initialModuleSlug]);

  useEffect(() => {
    if (!allSections.length) {
      if (selectedSectionIdRef.current !== undefined) {
        setSelectedSectionId(undefined);
      }
      return;
    }

    const preferredSectionId = deriveInitialSectionId();
    const prevSectionId = selectedSectionIdRef.current;
    const prevStillAvailable = Boolean(
      prevSectionId && allSections.some((section) => section.id === prevSectionId),
    );

    if (prevStillAvailable) {
      if (initialModuleSlug && !initialModuleHandledRef.current) {
        const moduleSlug = sectionToModuleSlug.get(prevSectionId);
        if (moduleSlug !== initialModuleSlug && preferredSectionId && preferredSectionId !== prevSectionId) {
          initialModuleHandledRef.current = true;
          setSelectedSectionId(preferredSectionId);
        } else {
          initialModuleHandledRef.current = true;
        }
      }
      return;
    }

    if (preferredSectionId && preferredSectionId !== prevSectionId) {
      if (initialModuleSlug && !initialModuleHandledRef.current) {
        initialModuleHandledRef.current = true;
      }
      setSelectedSectionId(preferredSectionId);
    }
  }, [allSections, deriveInitialSectionId, initialModuleSlug, sectionToModuleSlug]);

  useEffect(() => {

    if (!selectedSectionId) return;

    if (!autoScrollArmedRef.current) return;

    const targetSection = sectionRefs.current.get(selectedSectionId);

    if (targetSection) {

      targetSection.scrollIntoView({ behavior: "smooth", block: "center" });

    }

    if (mainContentRef.current) {

      mainContentRef.current.scrollIntoView({ behavior: "smooth", block: "start" });

    }

    autoScrollArmedRef.current = false;

  }, [selectedSectionId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!selectedSection) {

      setSelectedResource((prev) => (prev ? null : prev));

      return;

    }

    // Fetch section exercises and quizzes when a section is selected
    // console.log('[useEffect] Calling fetchSectionExercises for section:', selectedSection.id);
    fetchSectionExercises(selectedSection.id);
    // console.log('[useEffect] Calling fetchSectionQuizzes for section:', selectedSection.id);
    fetchSectionQuizzes(selectedSection.id);

    const fallbackResource = getDefaultResource(selectedSection);

    setSelectedResource((prev) => {

      if (prev && prev.sectionId === selectedSection.id) {

        if (prev.kind === "lecture") {

          const lectures = getLectures(selectedSection);

          if (!lectures.length) return fallbackResource;

          const defaultLecture = {

            sectionId: selectedSection.id,

            kind: "lecture" as const,

            resourceId: getLectureKey(lectures[0], selectedSection.id ?? null, 0),

          };

          if (!prev.resourceId) return defaultLecture;

          const hasLecture = lectures.some((lecture, index) =>
            getLectureKey(lecture, selectedSection.id ?? null, index) === prev.resourceId,
          );

          if (hasLecture) return prev;

          return defaultLecture;

        }

        if (prev.kind === "exercise") {
          const sectionId = selectedSection.id;
          const prevResourceId = prev.resourceId != null ? String(prev.resourceId) : null;
          const dynamicExercises =
            sectionId && Array.isArray(sectionExercises[sectionId])
              ? sectionExercises[sectionId].filter(Boolean)
              : [];
          const staticExercises = getExercises(selectedSection);

          const matchesDynamic =
            prevResourceId !== null &&
            dynamicExercises.some(
              (exercise: any) => exercise?.id != null && String(exercise.id) === prevResourceId,
            );
          const matchesStatic =
            prevResourceId !== null &&
            staticExercises.some(
              (exercise) => exercise?.id != null && String(exercise.id) === prevResourceId,
            );

          if (matchesDynamic || matchesStatic) {
            return prev;
          }

          const fallbackList = dynamicExercises.length ? dynamicExercises : staticExercises;
          const fallbackExercise = fallbackList.find((exercise: any) => exercise?.id != null);

          if (fallbackExercise) {
            return {
              sectionId,
              kind: "exercise",
              resourceId:
                fallbackExercise.id != null ? String(fallbackExercise.id) : undefined,
            };
          }
        }

        if (prev.kind === "quiz") {

          const quizzes = getQuizzes(selectedSection);

          if (quizzes.some((quiz) => quiz.id === prev.resourceId)) return prev;

          if (quizzes.length) {

            return { sectionId: selectedSection.id, kind: "quiz", resourceId: quizzes[0]?.id };

          }

        }

      }

      return fallbackResource;

    });

  }, [selectedSection, fetchSectionExercises, fetchSectionQuizzes, sectionExercises, isAuthenticated]);

  // Reset quiz state when changing quizzes
  useEffect(() => {
    if (selectedResource?.kind === "quiz" && selectedResource.resourceId) {
      setQuizAnswers({});
      setQuizSubmitted(false);
      setQuizScore(0);
      setCurrentQuizQuestionIndex(0);
      setLoadedQuiz(null); // Reset to trigger reload
      if (!quizSummaryOpen) {
        setQuizSummarySnapshot(null);
      }
      setQuizStartTimestamp(Date.now());
      setQuestionFeedback({});
      setQuizQuestionGamificationLogged({});
      setQuizCorrectAnswers({});
    } else {
      setQuizSummarySnapshot(null);
      setQuizSummaryOpen(false);
      setQuestionFeedback({});
      setQuizQuestionGamificationLogged({});
      setQuizCorrectAnswers({});
    }
  }, [selectedResource?.resourceId, selectedResource?.kind, quizSummaryOpen]);

  // Load quiz data when quiz is selected
  useEffect(() => {
    if (!isAuthenticated) return;
    if (
      selectedResource?.kind === "quiz" &&
      selectedResource.resourceId &&
      !loadedQuiz &&
      !quizLoading
    ) {
      const loadQuiz = async () => {
        try {
          setQuizLoading(true);
          const quizData = await getQuizAction(selectedResource.resourceId as string);
          setLoadedQuiz(quizData as Quiz);
        } catch (error) {
          console.error('Failed to load quiz:', error);
        } finally {
          setQuizLoading(false);
        }
      };
      loadQuiz();
    }
  }, [selectedResource, loadedQuiz, quizLoading, isAuthenticated]);

  const handleStartQuizRunner = useCallback(
    async (section: Section, options?: { force?: boolean }) => {
      if (!isAuthenticated) {
        console.warn('Attempted to start quiz runner without authentication');
        return;
      }
    if (!section || !section.id) {
      console.warn('Cannot start quiz runner without a valid section');
      return;
    }

    const sectionId = String(section.id);
    if (!options?.force && completedSectionQuizzes[sectionId]) {
      const storedSummary = sectionQuizSummaries[sectionId];
      if (storedSummary) {
        setQuizSummarySnapshot(storedSummary);
      }
      setQuizSummarySectionId(sectionId);
      setQuizSummaryOpen(true);
      return;
    }

    handleExitPractice();
    handleExitAdaptiveQuiz();
    openNavigation();
    setQuizSummarySnapshot(null);
    setQuizSummaryOpen(false);
    setQuizSummarySectionId(null);
    setQuestionFeedback({});
    setQuizQuestionGamificationLogged({});
    setQuizCorrectAnswers({});
    setQuizStartTimestamp(Date.now());
    setSelectedSectionId(sectionId);
    setQuizRunnerLoading((prev) => ({ ...prev, [sectionId]: true }));

    try {
      let availableQuizzes: Quiz[] =
        Array.isArray(sectionQuizzes[sectionId]) && sectionQuizzes[sectionId].length > 0
          ? sectionQuizzes[sectionId].filter(Boolean)
          : getQuizzes(section);

      if (!availableQuizzes.length) {
        try {
          const response = await getSectionQuizzesAction(sectionId);
          const quizzesPayload = unpackApiArray<Quiz>(response) ?? [];
          if (quizzesPayload.length) {
            availableQuizzes = quizzesPayload;
            setSectionQuizzes((prev) => ({
              ...prev,
              [sectionId]: quizzesPayload,
            }));
          }
        } catch (fetchError) {
          console.error('Failed to fetch section quizzes for quiz runner:', fetchError);
        }
      }

      if (!availableQuizzes.length) {
        try {
          const generated = (await generateSectionQuizAction({
            sectionId,
            courseId,
            subjectId,
            sectionTitle: section.title,
            difficulty: 'Intermediate',
            questionCount: 10,
            questionTypes: ['multiple_choice', 'text'],
          })) as any;
          const generatedQuiz = generated?.quiz as Quiz | undefined;
          if (generatedQuiz) {
            availableQuizzes = [generatedQuiz];
            setSectionQuizzes((prev) => ({
              ...prev,
              [sectionId]: [...(prev[sectionId] ?? []), generatedQuiz],
            }));
          }
        } catch (generationError) {
          console.error('Failed to generate quiz for quiz runner:', generationError);
        }
      }

      if (!availableQuizzes.length) {
        console.warn('No quizzes available to start quiz runner.');
        setIsQuizRunnerMode(false);
        return;
      }

      const firstQuiz = availableQuizzes[0];
      const resourceId =
        typeof firstQuiz?.id === "string"
          ? firstQuiz.id
          : typeof firstQuiz?.id === "number"
          ? String(firstQuiz.id)
          : undefined;

      setSelectedResource({
        sectionId,
        kind: "quiz",
        resourceId,
      });
      setQuizSession({
        sectionId,
        quizzes: availableQuizzes,
        currentQuizId: resourceId,
        prevResult: null,
        currentSectionQuizIndex: 0,
      });
      setQuizAnswers({});
      setQuizScore(0);
      setQuizSubmitted(false);
      setCurrentQuizQuestionIndex(0);
      setLoadedQuiz(firstQuiz?.quiz_questions?.length ? firstQuiz : null);
      setIsQuizRunnerMode(true);
    } catch (error) {
      console.error('Failed to start quiz runner:', error);
      setIsQuizRunnerMode(false);
    } finally {
      setQuizRunnerLoading((prev) => ({
        ...prev,
        [sectionId]: false,
      }));
    }
  }, [
    courseId,
    subjectId,
    isAuthenticated,
    sectionQuizzes,
    handleExitPractice,
    handleExitAdaptiveQuiz,
    openNavigation,
    setSectionQuizzes,
    completedSectionQuizzes,
    sectionQuizSummaries,
  ]);

  // Handle quiz completion in runner mode
  const handleQuizComplete = useCallback(
    async (sectionId: string, scorePercentage: number, answers: Record<string, string[]>) => {
    const stopThreshold = 80; // Stop if score >= 80%

    const sectionQuizList = sectionQuizzes[sectionId] || [];
    const candidateQuizzes: Quiz[] = [];

    if (loadedQuiz && (!selectedResource || selectedResource.sectionId === sectionId)) {
      candidateQuizzes.push(loadedQuiz);
    }

    if (quizSession?.quizzes?.length) {
      candidateQuizzes.push(...quizSession.quizzes);
    }

    if (sectionQuizList.length) {
      candidateQuizzes.push(...sectionQuizList);
    }

    const preferredQuizIds = [
      quizSession?.currentQuizId,
      selectedResource?.kind === "quiz" && selectedResource.sectionId === sectionId ? selectedResource.resourceId : undefined,
    ].filter((value): value is string => Boolean(value));

    let quizQuestions: QuizQuestion[] = [];

    for (const quizId of preferredQuizIds) {
      const matchedQuiz = candidateQuizzes.find((quiz) => quiz.id === quizId);
      if (matchedQuiz?.quiz_questions?.length) {
        quizQuestions = matchedQuiz.quiz_questions;
        break;
      }
    }

    if (!quizQuestions.length) {
      const fallbackQuiz = candidateQuizzes.find((quiz) => quiz.quiz_questions && quiz.quiz_questions.length);
      if (fallbackQuiz?.quiz_questions) {
        quizQuestions = fallbackQuiz.quiz_questions;
      }
    }

    const normalizeAnswer = (value: unknown): string => (typeof value === "string" ? value.trim().toLowerCase() : "");

    let hardCorrectCount = 0;
    let mediumCorrectCount = 0;

    quizQuestions.forEach((question, index) => {
      const answerKey = question.id ?? index.toString();
      const userAnswer = answers[answerKey];
      if (!userAnswer || userAnswer.length === 0) {
        return;
      }

      const normalizedUserAnswer = normalizeAnswer(userAnswer[0]);
      if (!normalizedUserAnswer) {
        return;
      }

      const correctOptions = (question.quiz_options || []).filter((option) => isOptionMarkedCorrect(option));
      if (correctOptions.length === 0) {
        return;
      }

      const isCorrect = correctOptions.some(
        (option) => normalizeAnswer(option?.text) === normalizedUserAnswer,
      );

      if (!isCorrect) {
        return;
      }

      const difficulty = getQuizQuestionDifficulty(question);
      if (difficulty === "hard") {
        hardCorrectCount += 1;
      } else if (difficulty === "medium") {
        mediumCorrectCount += 1;
      }
    });

    const stop =
      scorePercentage >= stopThreshold ||
      hardCorrectCount >= 5 ||
      mediumCorrectCount >= 6;

    // Update current quiz result locally
    const currentSession = quizSession;
    if (currentSession) {
      setQuizSession({
        ...currentSession,
        currentSectionQuizIndex: currentSession.currentSectionQuizIndex + 1,
        prevResult: {
          score: scorePercentage,
          answers,
          stop,
        }
      });
    }

      if (stop) {
        if (sectionId) {
          const quizForSummary =
            loadedQuiz ??
            quizSession?.quizzes?.find((quiz) => quiz?.id === quizSession.currentQuizId) ??
            (quizSession?.quizzes && quizSession.quizzes.length ? quizSession.quizzes[0] : null);
          const summary = buildQuizSummarySnapshot(quizForSummary ?? null, answers);
          if (summary) {
            setSectionQuizSummaries((prev) => ({
              ...prev,
              [sectionId]: summary,
            }));
            setQuizSummarySnapshot(summary);
            setQuizSummarySectionId(sectionId);
            setQuizSummaryOpen(true);
            void persistQuizSummary(sectionId, quizForSummary, summary);
          }
        }
        setIsQuizRunnerMode(false);
        // console.log(`Quiz session completed with score ${score}%`);
        return;
      }

    // Generate next adaptive quiz
    const section = allSections.find(s => s.id === sectionId);
    if (!section || !currentSession) return;

    try {
      const result = await generateSectionQuizAction({
        sectionId: section.id,
        courseId,
        subjectId,
        sectionTitle: section.title,
        difficulty: scorePercentage < 60 ? 'Beginner' : scorePercentage < 80 ? 'Intermediate' : 'Advanced',
        questionCount: 10,
        questionTypes: ['multiple_choice', 'text'],
        prevQuizResult: {
          score: scorePercentage,
          answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v[0] || ''])),
          stop: false,
        },
      }) as any;

      // Local update with new quiz
      const newQuiz = result.quiz as Quiz;
      const currentQuizzes = sectionQuizzes[sectionId] || [];
      const newList = [...currentQuizzes, newQuiz];
      setSectionQuizzes(prev => ({ ...prev, [sectionId]: newList }));

      const newIndex = currentSession.currentSectionQuizIndex + 1;
      setCurrentSectionQuizIndex(newIndex);
      setSelectedResource({
        sectionId,
        kind: "quiz",
        resourceId: newQuiz.id,
      });
      setQuizSession({
        sectionId: section.id,
        quizzes: newList,
        currentQuizId: newQuiz.id,
        prevResult: {
          score: scorePercentage,
          answers,
          stop: false,
        },
        currentSectionQuizIndex: newIndex,
      });
      setLoadedQuiz(null); // Reload new quiz
      // console.log('Next quiz generated and loaded');
    } catch (error) {
      // console.error('Failed to generate next quiz:', error);
      setIsQuizRunnerMode(false);
    }
  }, [
    allSections,
    buildQuizSummarySnapshot,
    courseId,
    loadedQuiz,
    persistQuizSummary,
    quizSession,
    sectionQuizzes,
    selectedResource,
    subjectId,
  ]);

  const handleCloseQuizSummary = useCallback(() => {
    setQuizSummaryOpen(false);
  }, []);

  const lectureSelection = useMemo(() => {

    if (

      !selectedSection ||

      !selectedResource ||

      selectedResource.kind !== "lecture" ||

      selectedResource.sectionId !== selectedSection.id

    ) {

      return null;

    }

    const lectures = getLectures(selectedSection);

    if (!lectures.length) return null;

    const targetIndex = selectedResource.resourceId

      ? lectures.findIndex((lecture, index) =>
          getLectureKey(lecture, selectedSection?.id ?? null, index) === selectedResource.resourceId,
        )

      : 0;

    const index = targetIndex >= 0 ? targetIndex : 0;

    return { lecture: lectures[index], index };

  }, [selectedSection, selectedResource]);

  const activeLecture = lectureSelection?.lecture ?? null;

  const lectureContent = useMemo(() => {

    if (!selectedSection || !lectureSelection) {

      return null;

    }

    const { lecture, index } = lectureSelection;

    const raw = typeof lecture?.content === "string" ? lecture.content.trim() : "";

    const sectionIndex = Math.max(0, allSections.findIndex((section) => section.id === selectedSection.id));

    const fallbackIndex = (sectionIndex + index) % FALLBACK_SOURCES.length;

    return raw || FALLBACK_SOURCES[fallbackIndex];

  }, [allSections, lectureSelection, selectedSection]);

  const activeExercise = useMemo(() => {
    if (
      !selectedSection ||
      !selectedResource ||
      selectedResource.kind !== "exercise" ||
      selectedResource.sectionId !== selectedSection.id
    ) {
      return null;
    }

    const sectionExercisesForSelectedSection = selectedSection.id
      ? sectionExercises[selectedSection.id]
      : undefined;

    const exercisesSource =
      Array.isArray(sectionExercisesForSelectedSection) && sectionExercisesForSelectedSection.length > 0
        ? sectionExercisesForSelectedSection
        : getExercises(selectedSection);

    // console.log('[ACTIVE EXERCISE DEBUG]', {
    //   sectionId: selectedSection.id,
    //   resourceId: selectedResource.resourceId,
    //   fromAPI: Array.isArray(sectionExercisesForSelectedSection) && sectionExercisesForSelectedSection.length > 0,
    //   exercisesCount: exercisesSource.length,
    //   exercises: exercisesSource.map((e: any) => ({
    //     id: e.id,
    //     title: e.title,
    //     questionsCount: e.section_exercise_questions?.length || e.questions?.length || 0
    //   }))
    // });

    if (!exercisesSource.length) return null;

    if (!selectedResource.resourceId) return exercisesSource[0];

    return (
      exercisesSource.find((exercise: any) => exercise.id === selectedResource.resourceId) ||
      exercisesSource[0]
    );
  }, [selectedResource, selectedSection, sectionExercises]);

  const datasetCacheScopeKey = useMemo(() => {
    const questionExerciseId =
      selectedQuestionForPopup && (selectedQuestionForPopup as any)?.exerciseId
        ? String((selectedQuestionForPopup as any).exerciseId)
        : null;
    if (questionExerciseId) {
      return `exercise:${questionExerciseId}`;
    }
    if (activeExercise?.id) {
      return `exercise:${String(activeExercise.id)}`;
    }
    return `subject:${courseId}:${subjectId}`;
  }, [
    activeExercise?.id,
    courseId,
    subjectId,
    selectedQuestionForPopup ? (selectedQuestionForPopup as any)?.exerciseId : null,
  ]);

  useEffect(() => {
    if (!datasetPreviewCacheRef.current[datasetCacheScopeKey]) {
      datasetPreviewCacheRef.current[datasetCacheScopeKey] = {};
    }
    datasetAvailabilitySignatureRef.current = null;
    activeDatasetPreviewRequestRef.current = null;
  }, [datasetCacheScopeKey]);

  const activeExerciseQuestions = useMemo(() => {
    if (!activeExercise) {
      return [];
    }

    const questions =
      (Array.isArray(activeExercise.section_exercise_questions) && activeExercise.section_exercise_questions.length > 0
        ? activeExercise.section_exercise_questions
        : activeExercise.questions) || [];

    return questions;
  }, [activeExercise]);

  useEffect(() => {
    if (!activeExerciseQuestions.length) {
      setQuestionCompletionStatus({});
      return;
    }

    setQuestionCompletionStatus((prev) => {
      const next: Record<string, "pending" | "completed" | "incorrect"> = {};
      let changed = Object.keys(prev).length !== activeExerciseQuestions.length;

      activeExerciseQuestions.forEach((question, index) => {
        const key = getExerciseQuestionKey(question, index);
        const latestSubmissionRecord =
          (question as { latestSubmission?: { isCorrect?: boolean } | null })?.latestSubmission ??
          ((question as { latest_submission?: { isCorrect?: boolean } | null })?.latest_submission ??
            null);
        const latestSubmissionCorrectValue =
          typeof latestSubmissionRecord?.isCorrect === "boolean"
            ? latestSubmissionRecord.isCorrect
            : typeof (latestSubmissionRecord as any)?.is_correct === "boolean"
            ? (latestSubmissionRecord as any).is_correct
            : undefined;
        const hasCompletedFlag =
          (question as { isCompleted?: unknown })?.isCompleted === true ||
          (question as { is_completed?: unknown })?.is_completed === true ||
          latestSubmissionCorrectValue === true;
        const hasIncorrectFlag = latestSubmissionCorrectValue === false;
        const previousState = prev[key];
        const computedStatus = hasCompletedFlag
          ? "completed"
          : hasIncorrectFlag
          ? "incorrect"
          : previousState ?? "pending";
        next[key] = computedStatus;
        if (!changed && previousState !== computedStatus) {
          changed = true;
        }
        if (!changed && !(key in prev)) {
          changed = true;
        }
      });

      if (!changed) {
        return prev;
      }

      return next;
    });
  }, [activeExercise?.id, activeExerciseQuestions]);

  const setActiveExerciseQuestion = useCallback(
    (question: any, index: number, exerciseOverride?: any, sectionOverride?: Section | null) => {
      const exerciseContext = exerciseOverride ?? activeExercise;
      const sectionContext = sectionOverride ?? selectedSection;
      if (!question || !exerciseContext) {
        return;
      }

      const questionId =
        typeof (question as { id?: unknown })?.id === "string" || typeof (question as { id?: unknown })?.id === "number"
          ? String((question as { id?: string | number }).id)
          : undefined;
      const questionTitle =
        (typeof (question as { question_text?: string })?.question_text === "string" &&
        (question as { question_text?: string }).question_text?.trim())
          ? (question as { question_text?: string }).question_text
          : (typeof (question as { text?: string })?.text === "string" &&
            (question as { text?: string }).text?.trim())
          ? (question as { text?: string }).text
          : exerciseContext?.title;

      const questionType =
        pickNormalizedQuestionType(
          (question as any)?.question_type,
          (question as any)?.type,
          (question as any)?.practice_type,
          (question as any)?.practiceType,
          (question as any)?.question_category,
          (question as any)?.questionCategory,
          (question as any)?.questionType,
          (question as any)?.category,
          (question as any)?.subject_type,
          (question as any)?.subjectType,
          (question as any)?.kind,
          (exerciseContext as any)?.practice_type,
          (exerciseContext as any)?.practiceType,
          (exerciseContext as any)?.exercise_type,
          (exerciseContext as any)?.exerciseType,
          (exerciseContext as any)?.subject_type,
          (exerciseContext as any)?.subjectType,
          (exerciseContext as any)?.category,
        ) ?? "sql";

      const resolvedPracticeType =
        pickNormalizedQuestionType(
          (question as any)?.practice_type,
          (question as any)?.practiceType,
          (exerciseContext as any)?.practice_type,
          (exerciseContext as any)?.practiceType,
          (exerciseContext as any)?.exercise_type,
          (exerciseContext as any)?.exerciseType,
          (exerciseContext as any)?.subject_type,
          (exerciseContext as any)?.subjectType,
        ) ?? questionType;

      const exerciseDatasetType = resolveDatasetLanguage(
        questionType,
        exerciseContext?.practice_type,
        exerciseContext?.exercise_type,
        exerciseContext?.subject_type,
      );
      const rawExerciseDataset = (question as any)?.exerciseDataset ?? exerciseContext.dataset;
      const exerciseDatasetSql = normalizeCreationSql(rawExerciseDataset, {
        datasetType: exerciseDatasetType,
      });
      const rawExercisePythonDataset =
        (question as any)?.exercisePythonDataset ??
        (exerciseContext as any)?.dataset_python ??
        (exerciseContext as any)?.data_creation_python;
      const exercisePythonDataset = normalizeCreationSql(rawExercisePythonDataset, {
        datasetType: "python",
        preserveFormatting: true,
      });

      const sectionIdentifier =
        sectionContext && typeof sectionContext.id !== "undefined"
          ? String(sectionContext.id)
          : null;
      const sectionTitleResolved = coalesceString(sectionContext?.title);
      const sectionOverviewResolved = coalesceString(sectionContext?.overview);
      const existingSubjectName = coalesceString((question as any)?.subject);
      const subjectNameForState =
        coalesceString(
          subjectTitle,
          sectionTitleResolved,
          existingSubjectName,
        ) ??
        existingSubjectName ??
        undefined;

      const normalizedPopupContent = parseQuestionContentObject(
        (question as { content?: unknown })?.content,
      );
      const popupExpectedOutputs = normalizeExpectedOutputColumns(
        (question as any)?.expected_output_table,
        normalizedPopupContent?.expected_output_table,
      );

      const nextQuestionId = questionId ?? null;
      const shouldResetWorkspace =
        (nextQuestionId === null && lastPopupQuestionIdRef.current !== null) ||
        (nextQuestionId !== null && nextQuestionId !== lastPopupQuestionIdRef.current);
      lastPopupQuestionIdRef.current = nextQuestionId;

      setSelectedQuestionForPopup({
        ...question,
        content: normalizedPopupContent ?? (question as any)?.content ?? null,
        exerciseId: exerciseContext.id ? String(exerciseContext.id) : null,
        exerciseTitle: exerciseContext.title,
        exerciseDescription: exerciseContext.description,
        exerciseDataset: exerciseDatasetSql,
        exercisePythonDataset: exercisePythonDataset ?? undefined,
        text:
          typeof (question as any)?.text === "string" && (question as any).text.trim()
            ? (question as any).text
            : typeof (question as any)?.question_text === "string"
            ? (question as any).question_text
            : "",
        question_text:
          typeof (question as any)?.question_text === "string" && (question as any).question_text.trim()
            ? (question as any).question_text
            : typeof (question as any)?.text === "string"
            ? (question as any).text
            : "",
        expected_output_table: popupExpectedOutputs.length > 0 ? popupExpectedOutputs : null,
        question_type: questionType,
        type: questionType,
        practice_type: resolvedPracticeType,
        subjectId: subjectId ?? null,
        subjectTitle: subjectNameForState ?? undefined,
        subject: existingSubjectName ?? undefined,
        sectionId: sectionIdentifier,
        sectionTitle: sectionTitleResolved ?? undefined,
        sectionOverview: sectionOverviewResolved ?? undefined,
      });
      if (shouldResetWorkspace) {
        setSqlCode('');
        setSqlResults([]);
        setSqlError('');
        setPythonCode('');
        setWorksheetSolution('');
      }

      const cachedDataset = questionId ? questionDatasetCache[questionId] : undefined;
      const inlineDataset = normalizeQuestionDataset((question as { dataset?: unknown }).dataset, {
        questionId,
        questionTitle,
        subjectType: questionType,
      });

      if (inlineDataset) {
        setQuestionDataset(inlineDataset);
        if (questionId) {
          setQuestionDatasetCache((prev) => ({
            ...prev,
            [questionId]: inlineDataset,
          }));
        }
        if (
          questionId &&
          cachedDataset === undefined &&
          (!inlineDataset.creation_sql ||
            !Array.isArray(inlineDataset.data) ||
            inlineDataset.data.length === 0) &&
          !inlineDataset.dataset_csv_raw
        ) {
          fetchQuestionDataset(questionId, { questionTitle, questionType });
        }
      } else if (cachedDataset !== undefined) {
        setQuestionDataset(cachedDataset);
      } else {
        setQuestionDataset(null);
        if (questionId) {
          fetchQuestionDataset(questionId, { questionTitle, questionType });
        }
      }
    },
    [
      activeExercise,
      fetchQuestionDataset,
      questionDatasetCache,
      selectedSection,
      setQuestionDatasetCache,
      subjectId,
      subjectTitle,
    ],
  );

  useEffect(() => {
    const isExerciseResource = selectedResource?.kind === "exercise";

    if (!isExerciseResource || selectedQuestionForPopup || pendingInitialQuestion || !allSections.length) {
      return;
    }

    for (const section of allSections) {
      if (!section || section.id === undefined || section.id === null) {
        continue;
      }

      const exercises = getExercises(section);
      if (!exercises.length) {
        continue;
      }

      for (const exercise of exercises) {
        if (!exercise || exercise.id === undefined || exercise.id === null) {
          continue;
        }

        const questionList =
          (Array.isArray(exercise.section_exercise_questions) && exercise.section_exercise_questions.length > 0
            ? exercise.section_exercise_questions
            : exercise.questions) || [];

        if (!questionList.length) {
          continue;
        }

        setPendingInitialQuestion({
          sectionId: String(section.id),
          exerciseId: String(exercise.id),
          exercise,
          question: questionList[0],
          questionIndex: 0,
        });
        return;
      }
    }
  }, [allSections, pendingInitialQuestion, selectedQuestionForPopup, selectedResource]);

  useEffect(() => {
    if (!selectedQuestionForPopup) {
      lastPopupQuestionIdRef.current = null;
    }
  }, [selectedQuestionForPopup]);

  useEffect(() => {
    const isExerciseResource = selectedResource?.kind === "exercise";

    if (!pendingInitialQuestion || selectedQuestionForPopup || !isExerciseResource) {
      if (!isExerciseResource && pendingInitialQuestion) {
        setPendingInitialQuestion(null);
      }
      return;
    }

    const { sectionId, exerciseId, exercise, question, questionIndex } = pendingInitialQuestion;

    if (!sectionId || !exerciseId || !exercise || !question) {
      setPendingInitialQuestion(null);
      return;
    }

    const sectionContext =
      allSections.find((candidate) => String(candidate?.id ?? "") === sectionId) ?? null;

    setActiveExerciseQuestion(
      question,
      questionIndex,
      exercise,
      sectionContext,
    );
    setPendingInitialQuestion(null);
  }, [
    pendingInitialQuestion,
    selectedQuestionForPopup,
    selectedResource,
    allSections,
    setActiveExerciseQuestion,
  ]);

  useEffect(() => {
    if (pendingInitialQuestion && selectedQuestionForPopup) {
      setPendingInitialQuestion(null);
    }
  }, [pendingInitialQuestion, selectedQuestionForPopup]);

  const markQuestionCompleted = useCallback(
    (question: any | null) => {
      if (!question) {
        return;
      }

        if (!activeExerciseQuestions.length) {
          return;
        }

        let index = activeExerciseQuestions.findIndex((candidate, candidateIndex) => {
          const candidateKey = getExerciseQuestionKey(candidate, candidateIndex);
          const targetKey = getExerciseQuestionKey(question, candidateIndex);
          return candidateKey === targetKey;
        });

        if (index < 0 && typeof question?.order_index === "number") {
          index = activeExerciseQuestions.findIndex(
            (candidate: any) => candidate?.order_index === question.order_index,
          );
        }

        const key = getExerciseQuestionKey(question, index);

        setQuestionCompletionStatus((prev) => {
          if (prev[key] === "completed") {
            return prev;
          }
          return {
            ...prev,
            [key]: "completed",
          };
        });

        const sectionId = selectedSection?.id;
        if (!sectionId) {
          return;
        }

        const normalizedExerciseId =
          extractExerciseIdentifier(question) ??
          extractExerciseIdentifier(selectedPracticeExercise) ??
          (selectedResource?.kind === "exercise" ? selectedResource.resourceId : undefined);
        const normalizedQuestionId = extractQuestionIdentifier(question);

        void logModuleActivity({
          sectionId,
          kind: "exercise",
          exerciseId: normalizedExerciseId,
          exerciseQuestionId: normalizedQuestionId,
          exerciseIsCorrect: true,
        }).finally(() => {
          refreshSectionRequirementStatus(sectionId);
        });
    },
    [
      activeExerciseQuestions,
      logModuleActivity,
      refreshSectionRequirementStatus,
      selectedPracticeExercise,
      selectedResource,
      selectedSection,
    ],
  );

  useEffect(() => {
    const sectionId = selectedSection?.id;
    if (!sectionId) {
      mentorChatAutoSelectionRef.current = null;
      return;
    }

    if (!isPracticeMode) {
      mentorChatAutoSelectionRef.current = null;
      return;
    }

    if (subjectExerciseType !== "mentor_chat") {
      mentorChatAutoSelectionRef.current = null;
      return;
    }

    if (selectedResource && selectedResource.kind !== "exercise") {
      mentorChatAutoSelectionRef.current = null;
      return;
    }

    const autoState = mentorChatAutoSelectionRef.current;
    if (!autoState || autoState.sectionId !== sectionId) {
      mentorChatAutoSelectionRef.current = { sectionId, completed: false };
    } else if (autoState.completed) {
      return;
    }

    if (selectedQuestionForPopup) {
      mentorChatAutoSelectionRef.current = { sectionId, completed: true };
      return;
    }

    const exercisesForSection =
      (Array.isArray(sectionExercises[sectionId]) && sectionExercises[sectionId].length > 0
        ? sectionExercises[sectionId]
        : getExercises(selectedSection)) || [];

    if (!exercisesForSection.length) {
      return;
    }

    const targetExercise = exercisesForSection[0];
    if (!targetExercise) {
      mentorChatAutoSelectionRef.current = { sectionId, completed: true };
      return;
    }

    const targetExerciseId =
      targetExercise.id !== null && targetExercise.id !== undefined
        ? String(targetExercise.id)
        : undefined;

    if (!targetExerciseId) {
      mentorChatAutoSelectionRef.current = { sectionId, completed: true };
      return;
    }

    const resourceMatches =
      selectedResource?.kind === "exercise" &&
      selectedResource.sectionId === sectionId &&
      String(selectedResource.resourceId ?? "") === targetExerciseId;

    if (!resourceMatches) {
      setSelectedResource({
        sectionId,
        kind: "exercise",
        resourceId: targetExercise.id,
      });
      return;
    }

    const questionsSource =
      activeExerciseQuestions.length > 0
        ? activeExerciseQuestions
        : Array.isArray(targetExercise.section_exercise_questions) &&
          targetExercise.section_exercise_questions.length > 0
        ? targetExercise.section_exercise_questions
        : Array.isArray(targetExercise.questions)
        ? targetExercise.questions
        : [];

    if (!questionsSource.length) {
      return;
    }

    setActiveExerciseQuestion(questionsSource[0], 0, targetExercise);
    mentorChatAutoSelectionRef.current = { sectionId, completed: true };
  }, [
    activeExerciseQuestions,
    sectionExercises,
    selectedQuestionForPopup,
    selectedResource,
    selectedSection,
    setActiveExerciseQuestion,
    isPracticeMode,
    subjectExerciseType,
  ]);

  useEffect(() => {
    const previousSectionId = previousSectionIdRef.current;
    if (
      isPracticeMode &&
      previousSectionId &&
      selectedSectionId &&
      selectedSectionId !== previousSectionId
    ) {
      handleExitPractice();
    }
    previousSectionIdRef.current = selectedSectionId;
  }, [selectedSectionId, isPracticeMode, handleExitPractice]);

  useEffect(() => {
    const currentQuestionId = selectedQuestionForPopup
      ? String(
          ((selectedQuestionForPopup as any)?.id ??
            (selectedQuestionForPopup as any)?.question_id) ?? '',
        )
      : null;

    if (!currentQuestionId) {
      lastHintQuestionIdRef.current = null;
      lastHintSignatureRef.current = null;
      return;
    }

    if (lastHintQuestionIdRef.current === currentQuestionId) {
      return;
    }

    lastHintQuestionIdRef.current = currentQuestionId;
    lastHintSignatureRef.current = null;

    const latestHint = (selectedQuestionForPopup as any)?.latestHint;
    if (
      latestHint &&
      typeof latestHint.message === "string" &&
      latestHint.message.trim().length > 0
    ) {
      addHintToOutput({
        verdict: (latestHint as any)?.verdict,
        message: latestHint.message,
      });
      return;
    }

    const fallbackHintValue =
      (selectedQuestionForPopup as any)?.hint ??
      (selectedQuestionForPopup as any)?.adaptive_note ??
      (((selectedQuestionForPopup as any)?.content &&
        typeof (selectedQuestionForPopup as any)?.content?.hint === "string")
        ? (selectedQuestionForPopup as any).content.hint
        : undefined);

    const fallbackMessage = normalizeHintMessage(fallbackHintValue);
    if (fallbackMessage) {
      addHintToOutput({ verdict: "Hint", message: fallbackMessage });
    }
  }, [selectedQuestionForPopup, addHintToOutput]);

  const getCurrentWorkspaceSolution = useCallback(() => {
    if (codeLanguage === "python") {
      return pythonCode;
    }
    if (
      codeLanguage === "google_sheets" ||
      codeLanguage === "statistics" ||
      codeLanguage === "math" ||
      codeLanguage === "geometry" ||
      codeLanguage === "reasoning" ||
      codeLanguage === "problem_solving" ||
      codeLanguage === "mentor_chat"
    ) {
      return worksheetSolution;
    }
    return sqlCode;
  }, [codeLanguage, pythonCode, sqlCode, worksheetSolution]);

  const handleWorkspaceHintClick = useCallback(async () => {
    if (!selectedQuestionForPopup) {
      addHintToOutput({
        verdict: "Hint unavailable",
        message: "Select a question first to request a hint.",
      });
      return;
    }

    const normalizedQuestionId = String(
      (selectedQuestionForPopup as any)?.id ??
        (selectedQuestionForPopup as any)?.question_id ??
        "",
    );

    if (!normalizedQuestionId) {
      addHintToOutput({
        verdict: "Hint unavailable",
        message: "Unable to determine which question is active. Reopen it and try again.",
      });
      return;
    }

    const currentSolution = getCurrentWorkspaceSolution();

    try {
      setIsRequestingWorkspaceHint(true);
      const hint = await handlePracticeHintRequest(
        normalizedQuestionId,
        currentSolution,
      );

      if (hint) {
        addHintToOutput({
          verdict: hint.verdict,
          message: hint.message,
        });
        setSelectedQuestionForPopup((prev) =>
          prev
            ? {
                ...prev,
                latestHint: hint,
              }
            : prev,
        );
      }
    } finally {
      setIsRequestingWorkspaceHint(false);
    }
  }, [
    addHintToOutput,
    getCurrentWorkspaceSolution,
    handlePracticeHintRequest,
    selectedQuestionForPopup,
    setSelectedQuestionForPopup,
  ]);

  const activeQuestionRunContext = useMemo(() => {
    if (!selectedQuestionForPopup) {
      return null;
    }
    const questionId = extractQuestionIdentifier(selectedQuestionForPopup);
    if (!questionId) {
      return null;
    }
    const exerciseId =
      extractExerciseIdentifier(selectedQuestionForPopup) ??
      normalizeIdentifier((selectedPracticeExercise as { id?: unknown })?.id) ??
      normalizeIdentifier((selectedResource as { resourceId?: unknown })?.resourceId);
    if (!exerciseId) {
      return null;
    }
    return {
      questionId,
      exerciseId,
      sectionId: selectedSectionId ?? null,
    };
  }, [
    selectedPracticeExercise,
    selectedQuestionForPopup,
    selectedResource,
    selectedSectionId,
  ]);

  const persistWorkspaceRunLocally = useCallback(
    (
      context: { exerciseId: string; questionId: string } | null,
      inputCode: string,
      language?: string | null,
    ) => {
      if (
        !context ||
        !context.exerciseId ||
        !context.questionId ||
        !inputCode ||
        !inputCode.trim()
      ) {
        return;
      }
      if (typeof window === "undefined") {
        return;
      }
      try {
        const payload = {
          code: inputCode,
          language: (language ?? "sql").toLowerCase(),
          updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(
          getWorkspaceRunStorageKey(context.exerciseId, context.questionId),
          JSON.stringify(payload),
        );
        setCachedWorkspaceRun({
          code: inputCode,
          language: payload.language,
        });
      } catch (error) {
        console.warn("Failed to cache workspace run locally:", error);
      }
    },
    [setCachedWorkspaceRun],
  );

  const recordRunForActiveQuestion = useCallback(
    async (inputCode: string, executionResult?: Record<string, unknown>) => {
      persistWorkspaceRunLocally(activeQuestionRunContext, inputCode, codeLanguage);
      if (
        !inputCode ||
        !inputCode.trim() ||
        !activeQuestionRunContext ||
        !activeQuestionRunContext.exerciseId
      ) {
        return;
      }

      const payloadResult =
        executionResult && Object.keys(executionResult).length > 0
          ? executionResult
          : null;

      try {
        await recordQuestionRun({
          sectionId: activeQuestionRunContext.sectionId ?? null,
          exerciseId: activeQuestionRunContext.exerciseId,
          questionId: activeQuestionRunContext.questionId,
          inputCode,
          language: codeLanguage ?? null,
          executionResult: payloadResult,
        });
      } catch (error) {
        console.error("Failed to record question run:", error);
      }
    },
    [activeQuestionRunContext, codeLanguage, persistWorkspaceRunLocally],
  );

  const handleWorkspaceSubmitClick = useCallback(async () => {
    if (isSubmittingWorkspace) {
      return;
    }

    if (!selectedQuestionForPopup) {
      setSqlResults((prev) => [
        ...prev,
        {
          isEvaluation: true,
          verdict: "Submit unavailable",
          feedback: "Select a question before submitting your solution.",
          prompt: "Choose a question from the list on the left to get started.",
          columns: [],
          values: [],
        },
      ]);
      return;
    }

    const normalizedQuestionId = String(
      (selectedQuestionForPopup as any)?.id ??
        (selectedQuestionForPopup as any)?.question_id ??
        "",
    );

    if (!normalizedQuestionId) {
      setSqlResults((prev) => [
        ...prev,
        {
          isEvaluation: true,
          verdict: "Submit unavailable",
          feedback: "Unable to determine which question you are working on. Please re-open it and try again.",
          prompt: "Reopen the question card, then resubmit your attempt.",
          columns: [],
          values: [],
        },
      ]);
      return;
    }

    const currentSolution = getCurrentWorkspaceSolution();

    if (!currentSolution.trim()) {
      setSqlResults((prev) => [
        ...prev,
        {
          isEvaluation: true,
          verdict: "No submission detected",
          feedback: "Enter your solution in the editor before hitting submit.",
          prompt: "Add your query or code, then submit again.",
          columns: [],
          values: [],
        },
      ]);
      return;
    }

    // Cache immediately so the editor retains the latest attempt even if the submit cycle refreshes UI state.
    persistWorkspaceRunLocally(activeQuestionRunContext, currentSolution, codeLanguage);

    // Prevent the DuckDB prepare-effect from clearing the output once
    if (shouldUseDuckDb) {
      skipDuckDbRefreshRef.current = true;
    }

    setIsSubmittingWorkspace(true);
    try {
      const result = await handlePracticeSubmit(
        normalizedQuestionId,
        currentSolution,
      );
      const runSummary: Record<string, unknown> = {};
      if (result?.verdict) {
        runSummary.verdict = result.verdict;
      }
      if (result?.isCorrect !== undefined) {
        runSummary.isCorrect = result.isCorrect;
      }
      if (result?.feedback) {
        runSummary.feedback = result.feedback;
      }
      if (result?.evaluation) {
        runSummary.evaluation = result.evaluation;
      }

      if (!result?.success) {
        setSqlResults((prev) => [
          ...prev,
          {
            isEvaluation: true,
            verdict: "Submission failed",
            feedback:
              result?.feedback ||
              "Something went wrong while grading your answer.",
            prompt:
              "Retry in a moment or refresh the page if the problem persists.",
            columns: [],
            values: [],
          },
        ]);
        void recordRunForActiveQuestion(currentSolution, runSummary);
        return;
      }

      setSqlResults((prev) => [
        ...prev,
        {
          isEvaluation: true,
          isCorrect: result.isCorrect ?? false,
          verdict:
            result.verdict ||
            (result.isCorrect ? "Correct" : "Incorrect"),
          feedback:
            result.feedback ||
            (result.isCorrect
              ? "Nicely done! Your approach meets the requirements."
              : "Review the feedback and adjust your approach for a better match."),
          prompt:
            "Want to compare with the reference solution? Use the hint button or check the solution resources.",
          columns: [],
          values: [],
        },
      ]);
      void recordRunForActiveQuestion(currentSolution, runSummary);

    } catch (error) {
      console.error("Error submitting workspace solution:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error while grading your answer.";
      setSqlResults((prev) => [
        ...prev,
        {
          isEvaluation: true,
          verdict: "Submission error",
          feedback: message,
          prompt: "Please try again in a moment.",
          columns: [],
          values: [],
        },
      ]);
      void recordRunForActiveQuestion(currentSolution, { error: message });
    } finally {
      setIsSubmittingWorkspace(false);
    }
  }, [
    getCurrentWorkspaceSolution,
    handlePracticeSubmit,
    isSubmittingWorkspace,
    markQuestionCompleted,
    selectedQuestionForPopup,
    recordRunForActiveQuestion,
    shouldUseDuckDb,
    persistWorkspaceRunLocally,
    activeQuestionRunContext,
    codeLanguage,
  ]);

  useEffect(() => {
    if (!activeQuestionRunContext || !userId) {
      return;
    }

    let cancelled = false;
    const loadLatestRun = async () => {
      try {
        const run = await getLatestQuestionRun(
          activeQuestionRunContext.exerciseId,
          activeQuestionRunContext.questionId,
        );
        if (cancelled || !run?.input_code) {
          return;
        }
        if (workspaceCodeTouchedRef.current) {
          return;
        }
        const normalizedCode = run.input_code.trim();
        if (!normalizedCode) {
          return;
        }
        const prefLanguage = (run.language ?? "").trim().toLowerCase();
        if (prefLanguage === "python" || prefLanguage === "statistics") {
          setPythonCode(normalizedCode);
        } else {
          setSqlCode(normalizedCode);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Unable to load the latest run.";
        console.error("Failed to load latest question run:", error);
        setSqlResults((prev) => [
          ...prev,
          {
            isEvaluation: true,
            verdict: "Run load failed",
            feedback: errorMessage,
            prompt: "The editor will try again when you navigate back to this question.",
            columns: [],
            values: [],
          },
        ]);
      }
    };

    void loadLatestRun();

    return () => {
      cancelled = true;
    };
  }, [activeQuestionRunContext, codeLanguage, userId]);

  // SQL execution handler
  const handleExecuteSQL = useCallback(
    async (code: string) => {
      if (!code.trim() || isExecutingSql) {
        return;
      }

      if (selectedQuestionType && selectedQuestionType !== "sql") {
        setSqlError("SQL execution is only available for SQL questions.");
        return;
      }

      if (!isDuckDbReady) {
        setSqlError("SQL engine is still initializing. Please wait a moment and try again.");
        return;
      }

      if (isPreparingDuckDb) {
        setSqlError("Datasets are still loading. Please wait for the SQL engine to finish preparing.");
        return;
      }

      setIsExecutingSql(true);
      setSqlError("");
      setSqlResults([]);

      const reportSqlOutputError = (message: string) => {
        if (!message) {
          return;
        }
        setSqlResults((prev) => [
          ...prev,
          {
            isEvaluation: true,
            verdict: "SQL execution failed",
            feedback: message,
            prompt: "Resolve the syntax issue or check the query before running again.",
            columns: [],
            values: [],
          },
        ]);
      };

      const sqlExecutionSummary: Record<string, unknown> = {};
      try {
        const result = await executeDuckDbQuery(code);
        if (!result.success) {
          const errorMessage = result.error ?? "SQL execution failed";
          sqlExecutionSummary.error = errorMessage;
          reportSqlOutputError(errorMessage);
          return;
        }

        const columns = result.result?.columns ?? [];
        const rows = result.result?.rows ?? [];
        const columnTypesFromSchema = deriveSqlColumnTypes(result.schema ?? null);

        if (columns.length === 0 && rows.length === 0) {
          setSqlResults([
            {
              columns: [],
              values: [],
              columnTypes: columnTypesFromSchema,
            },
          ]);
        } else {
          setSqlResults([
            {
              columns,
              values: rows,
              columnTypes: columnTypesFromSchema,
            },
          ]);
        }

        sqlExecutionSummary.columns = columns;
        sqlExecutionSummary.rowCount = rows.length;
        if (result.executionTime !== undefined) {
          sqlExecutionSummary.executionTime = result.executionTime;
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "An error occurred while executing SQL";
        // console.error("SQL execution error:", error);
        setSqlError(message);
        reportSqlOutputError(message);
        sqlExecutionSummary.error = message;
      } finally {
        void recordRunForActiveQuestion(code, sqlExecutionSummary);
        setIsExecutingSql(false);
      }
    },
    [
      executeDuckDbQuery,
      isDuckDbReady,
      isExecutingSql,
      isPreparingDuckDb,
      selectedQuestionType,
      recordRunForActiveQuestion,
    ],
  );

  // Python execution handler
  const handleExecutePython = useCallback(
    async (code: string) => {
      if (!code.trim() || isExecutingPython) {
        return;
      }

      if (selectedQuestionType && !isPythonLikeQuestion) {
        setPythonError("Python execution is only available for Python or Statistics questions.");
        return;
      }

      if (!isPyodideReady) {
        setPythonError("Python runtime is still initializing. Please wait a moment and try again.");
        return;
      }

      setIsExecutingPython(true);
      setPythonError("");
      setPythonOutput("");

      const pythonExecutionSummary: Record<string, unknown> = {};
      try {
        const result = await executePythonCode(code);
        // if (!result.success) {
        //   throw new Error(result.error || "Python execution failed");
        // }

        setPythonOutput(result.output || "Code executed successfully (no output)");
        if (result.output) {
          pythonExecutionSummary.output = result.output;
        }
        if (result.executionTime !== undefined) {
          pythonExecutionSummary.executionTime = result.executionTime;
        }
      } catch (error) {
        console.error("Python execution error:", error);
        const message =
          error instanceof Error
            ? error.message
            : "An error occurred while executing Python";
        setPythonError(message);
        pythonExecutionSummary.error = message;
      } finally {
        void recordRunForActiveQuestion(code, pythonExecutionSummary);
        setIsExecutingPython(false);
      }
    },
    [
      executePythonCode,
      isPyodideReady,
      isExecutingPython,
      isPythonLikeQuestion,
      selectedQuestionType,
      recordRunForActiveQuestion,
    ],
  );

  // Generic code execution handler that routes to the appropriate executor
  const handleExecuteCode = useCallback(
    async (code: string) => {
      if (!code.trim()) {
        return;
      }

      const questionType = selectedQuestionType?.toLowerCase();

      if (questionType === "sql") {
        await handleExecuteSQL(code);
      } else if (questionType === "python" || questionType === "statistics") {
        await handleExecutePython(code);
      } else {
        // For other question types, show an appropriate message
        setSqlError(`Code execution is not yet supported for ${questionType || 'this'} question type.`);
      }
    },
    [selectedQuestionType, handleExecuteSQL, handleExecutePython],
  );

  const handleSelectExercise = useCallback(
    async (sectionId: string, exercise: any) => {
      if (!exercise) return;

      // Ensure we exit practice mode so the embedded exercise view can render
      handleExitPractice();
      handleExitAdaptiveQuiz();

      setSelectedSectionId(sectionId);
      setSelectedResource({
        sectionId,
        kind: "exercise",
        resourceId: exercise.id,
      });
      openNavigation();

      const resolvedExercise = await ensureExerciseHasUserProgress(sectionId, exercise);

      const questionList =
        (Array.isArray(resolvedExercise.section_exercise_questions) &&
        resolvedExercise.section_exercise_questions.length > 0
          ? resolvedExercise.section_exercise_questions
          : resolvedExercise.questions) || [];

      if (questionList.length > 0) {
        const firstQuestion = questionList[0];
        const exerciseDatasetType = resolveDatasetLanguage(
          resolvedExercise?.subject_type,
          resolvedExercise?.exercise_type,
          resolvedExercise?.practice_type,
          resolvedExercise?.type,
        );
        setActiveExerciseQuestion(
          {
            ...firstQuestion,
            exerciseId: resolvedExercise.id ? String(resolvedExercise.id) : null,
            exerciseTitle: resolvedExercise.title,
            exerciseDescription: resolvedExercise.description,
            exerciseDataset: normalizeCreationSql(resolvedExercise.dataset, {
              datasetType: exerciseDatasetType,
            }),
          },
          0,
          resolvedExercise,
        );
        setSelectedPracticeExercise(resolvedExercise);
        setPracticeQuestions(questionList);
      } else {
        setSelectedQuestionForPopup(null);
        setSelectedPracticeExercise(resolvedExercise);
        setPracticeQuestions([]);
      }

      setShowQuestionPopup(false);
    },
    [handleExitPractice, handleExitAdaptiveQuiz, ensureExerciseHasUserProgress, setActiveExerciseQuestion, openNavigation],
  );

  const handleNavigateExerciseQuestion = useCallback(
    (direction: 1 | -1) => {
      if (!activeExercise || !selectedQuestionForPopup || !activeExerciseQuestions.length) {
        return;
      }

      const currentIndex = activeExerciseQuestions.findIndex(
        (question: any) => String(question.id) === String(selectedQuestionForPopup.id),
      );

      if (currentIndex === -1) {
        return;
      }

      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= activeExerciseQuestions.length) {
        return;
      }

      const targetQuestion = activeExerciseQuestions[targetIndex];
      if (!targetQuestion) {
        return;
      }

      setActiveExerciseQuestion(targetQuestion, targetIndex);
    },
    [activeExercise, activeExerciseQuestions, selectedQuestionForPopup, setActiveExerciseQuestion],
  );

  const handleSelectExerciseQuestionTab = useCallback(
    (targetIndex: number) => {
      if (!activeExerciseQuestions.length) {
        return;
      }
      const question = activeExerciseQuestions[targetIndex];
      if (!question) {
        return;
      }

      let currentActiveIndex = -1;
      if (selectedQuestionForPopup) {
        currentActiveIndex = activeExerciseQuestions.findIndex((candidate, candidateIndex) => {
          const candidateKey = getExerciseQuestionKey(candidate, candidateIndex);
          const selectedKey = getExerciseQuestionKey(selectedQuestionForPopup, candidateIndex);
          return candidateKey === selectedKey;
        });
      }

      if (currentActiveIndex === targetIndex) {
        return;
      }

      setActiveExerciseQuestion(question, targetIndex);
    },
    [activeExerciseQuestions, selectedQuestionForPopup, setActiveExerciseQuestion],
  );

  // Fetch exercise datasets when exercise is selected
  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeExercise?.id) {
      fetchExerciseDatasets(activeExercise.id);
    }
  }, [activeExercise?.id, fetchExerciseDatasets, isAuthenticated]);

  const exerciseDatasetList = useMemo(() => {
    if (!activeExercise?.id) {
      return [];
    }
    return exerciseDatasets[activeExercise.id] || [];
  }, [activeExercise?.id, exerciseDatasets]);

  const spreadsheetDatasets = useMemo(
    () =>
          isSpreadsheetQuestion
        ? (() => {
            const datasets: SpreadsheetDatasetDefinition[] = [];
            const seenIds = new Set<string>();
            const seenLabels = new Set<string>();

            const pushDataset = (
              rawDataset: unknown,
              meta: {
                id?: string | null;
                name?: string | null;
                description?: string | null;
              } = {},
            ) => {
              if (!rawDataset) {
                return;
              }
              // console.log("qqq", rawDataset);
              const preview = buildDatasetPreviewFromRecord(rawDataset);
              const isObject =
                rawDataset && typeof rawDataset === "object" && !Array.isArray(rawDataset);
              const datasetRecord = isObject ? (rawDataset as Record<string, unknown>) : null;

              const candidateId =
                (typeof meta.id === "string" && meta.id.trim()) ||
                (isObject &&
                  typeof datasetRecord?.id === "string" &&
                  (datasetRecord.id as string).trim()) ||
                (isObject &&
                  typeof datasetRecord?.table_name === "string" &&
                  (datasetRecord.table_name as string).trim()) ||
                undefined;

              let datasetId = candidateId ?? `dataset-${datasets.length}`;
              while (seenIds.has(datasetId)) {
                datasetId = `${datasetId}-${datasets.length}`;
              }
              seenIds.add(datasetId);

              const originalName =
                (typeof meta.name === "string" && meta.name.trim()) ||
                (isObject &&
                  typeof datasetRecord?.name === "string" &&
                  (datasetRecord.name as string).trim()) ||
                (isObject &&
                  typeof datasetRecord?.table_name === "string" &&
                  (datasetRecord.table_name as string).trim()) ||
                undefined;

              const datasetDescription =
                (typeof meta.description === "string" && meta.description.trim()) ||
                (isObject &&
                  typeof datasetRecord?.description === "string" &&
                  (datasetRecord.description as string).trim()) ||
                undefined;

              const rawTableNames = extractDatasetTableNames(rawDataset, {
                description: datasetDescription ?? null,
              });
              const tableNames: string[] = [];
              const seenTableNames = new Set<string>();
              rawTableNames.forEach((tableName) => {
                const resolved = resolveDatasetLabel(tableName);
                const key = normalizeDatasetLabel(resolved);
                if (key && !seenTableNames.has(key)) {
                  seenTableNames.add(key);
                  tableNames.push(resolved);
                }
              });

              const resolvedName = tableNames[0] ?? resolveDatasetLabel(originalName);
              const normalizedLabel = normalizeDatasetLabel(resolvedName);
              if (normalizedLabel && seenLabels.has(normalizedLabel)) {
                return;
              }
              if (normalizedLabel) {
                seenLabels.add(normalizedLabel);
              }

              datasets.push({
                id: datasetId,
                name: resolvedName,
                description: datasetDescription,
                preview,
                tableNames,
                originalName: originalName ?? undefined,
              });
            };

            if (questionDataset) {
              pushDataset(questionDataset, {
                id: questionDataset.id,
                name: questionDataset.name,
                description: questionDataset.description,
              });
            }

            const inlineDataset =
              selectedQuestionForPopup &&
              typeof (selectedQuestionForPopup as any)?.dataset === "object" &&
              !Array.isArray((selectedQuestionForPopup as any)?.dataset)
                ? (selectedQuestionForPopup as any).dataset
                : null;

            if (inlineDataset) {
              pushDataset(inlineDataset, {
                id: inlineDataset?.id,
                name: inlineDataset?.name ?? selectedQuestionForPopup?.exerciseTitle ?? null,
                description: inlineDataset?.description,
              });
            }

            exerciseDatasetList.forEach((dataset: any, index: number) => {
              pushDataset(dataset, {
                id:
                  typeof dataset?.id === "string" || typeof dataset?.id === "number"
                    ? String(dataset.id)
                    : `exercise-${index}`,
                name: dataset?.name,
                description: dataset?.description,
              });
            });

            return datasets;
          })()
        : [],
    [
      exerciseDatasetList,
      isSpreadsheetQuestion,
      questionDataset,
      selectedQuestionForPopup,
      sanitizedCreationSqlByDataset,
    ],
  );

  const deducePseudoSheetName = (
    dataset: SqlDatasetDefinition | Record<string, unknown>,
    schemaInfo?: QuestionDatasetSchemaInfo,
  ): string | undefined => {
    const description = coalesceString(
      (dataset as Record<string, unknown>)?.dataset_description as string | undefined,
      schemaInfo?.dataset_description,
    );
    const firstLine = description?.split(/[\\r\\n]+/)[0];
    if (firstLine && firstLine.trim().length > 0) {
      return firstLine.trim().replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_");
    }
    return undefined;
  };

  const duckDbDatasets = useMemo(() => {
    if (!shouldUseDuckDb) {
      return [];
    }

    const datasets: SqlDatasetDefinition[] = [];
    const seen = new Set<string>();

    const pushDataset = (dataset: SqlDatasetDefinition) => {
      if (!dataset || typeof dataset !== "object") return;
      const rawSchemaInfo =
        (dataset as Record<string, unknown>)?.schema_info &&
        typeof (dataset as Record<string, unknown>)?.schema_info === "object"
          ? ((dataset as Record<string, unknown>).schema_info as QuestionDatasetSchemaInfo)
          : undefined;

      const rawData =
        Array.isArray(dataset.data) && dataset.data.length > 0
          ? (dataset.data as Array<Record<string, unknown>>)
          : Array.isArray(rawSchemaInfo?.dataset_rows) && rawSchemaInfo.dataset_rows.length > 0
          ? rawSchemaInfo.dataset_rows
          : [];

      const resolvedColumns =
        Array.isArray(dataset.columns) && dataset.columns.length > 0
          ? dataset.columns
          : Array.isArray(rawSchemaInfo?.dataset_columns) && rawSchemaInfo.dataset_columns.length > 0
          ? rawSchemaInfo.dataset_columns
          : rawData.length > 0
          ? Object.keys(rawData[0])
          : undefined;

      const csvFallback = coalesceString(
        typeof dataset.dataset_csv_raw === "string" ? dataset.dataset_csv_raw : undefined,
        typeof rawSchemaInfo?.dataset_csv_raw === "string" ? rawSchemaInfo.dataset_csv_raw : undefined,
      );
      const resolvedRows =
        rawData.length > 0
          ? rawData
          : csvFallback
          ? parseCsvToObjects(csvFallback)
          : [];

      const rawCreationSource = coalesceString(
        dataset.creation_sql,
        dataset.create_sql,
        rawSchemaInfo?.create_sql,
        rawSchemaInfo?.creation_sql,
        (dataset as Record<string, unknown>)["data_creation_sql"],
      );

      let normalizedCreationSql =
        rawCreationSource && rawCreationSource.trim().length > 0
          ? normalizeCreationSql(rawCreationSource)
          : undefined;

      let inferredTableName = dataset.table_name ?? inferTableNameFromSql(normalizedCreationSql);

      const datasetSubjectType = resolveDatasetLanguage(
        dataset.subject_type,
        dataset.type,
        dataset.question_type,
      );

      if (!normalizedCreationSql && datasetSubjectType === "google_sheets" && resolvedRows.length > 0) {
        const pseudoTableName =
          typeof dataset.table_name === "string" && dataset.table_name.trim().length > 0
            ? dataset.table_name.trim()
            : inferTableNameFromSql(dataset.dataset_description) ??
              deducePseudoSheetName(dataset, rawSchemaInfo) ??
              `sheet_dataset_${dataset.id ?? Math.random().toString(36).slice(2)}`;

        const columnsClause =
          resolvedColumns && resolvedColumns.length > 0
            ? `(${resolvedColumns
                .map((column) => `"${String(column).replace(/"/g, '""')}"`)
                .join(", ")})`
            : "";

        const valuesClause = resolvedRows
          .map((row) => {
            const orderedValues = (resolvedColumns ?? Object.keys(row ?? {})).map((column) =>
              row && typeof row === "object" ? (row as Record<string, unknown>)[column] : null,
            );
            const serialized = orderedValues
              .map((value) => {
                if (value === null || value === undefined) {
                  return "NULL";
                }
                if (typeof value === "number" || typeof value === "bigint") {
                  return String(value);
                }
                const stringValue =
                  typeof value === "string" ? value : (() => {
                    try {
                      return JSON.stringify(value);
                    } catch {
                      return String(value);
                    }
                  })();
                return `'${stringValue.replace(/'/g, "''")}'`;
              })
              .join(", ");
            return `INSERT INTO "${pseudoTableName.replace(/"/g, '""')}" ${columnsClause} VALUES (${serialized});`;
          })
          .join("\n");

        const createClause = `CREATE TABLE "${pseudoTableName.replace(/"/g, '""')}" ${
          resolvedColumns && resolvedColumns.length > 0
            ? `(${resolvedColumns
                .map(
                  (column) =>
                    `"${String(column).replace(/"/g, '""')}" TEXT`,
                )
                .join(", ")})`
            : ""
        };`;

        normalizedCreationSql = `${createClause}\n${valuesClause}`;
        inferredTableName = pseudoTableName;
      }

      const creationTables = extractTableNamesFromSql(normalizedCreationSql);
      const combinedCreationTables = Array.from(
        new Set(
          [
            ...(Array.isArray(dataset.creationTables) ? dataset.creationTables : []),
            ...creationTables,
          ].filter(
            (table): table is string =>
              typeof table === "string" && table.trim().length > 0,
          ),
        ),
      );
      const datasetKey = deriveDatasetKey({
        id: dataset.id,
        table_name: inferredTableName,
        creation_sql: normalizedCreationSql,
        create_sql: normalizedCreationSql ?? undefined,
      });
      const normalizedDataset: SqlDatasetDefinition = {
        ...dataset,
        creation_sql: normalizedCreationSql,
        create_sql: normalizedCreationSql ?? undefined,
        table_name: inferredTableName ?? dataset.table_name,
        cacheKey: datasetKey,
        creationTables: combinedCreationTables.length > 0 ? combinedCreationTables : undefined,
        sanitizedCreationSql: datasetKey ? sanitizedCreationSqlByDataset[datasetKey] : undefined,
        data: resolvedRows.length > 0 ? resolvedRows : dataset.data,
        columns: resolvedColumns ?? dataset.columns,
      };
      const key =
        datasetKey ||
        normalizedCreationSql?.trim() ||
        (normalizedDataset.table_name
          ? `${normalizedDataset.table_name}:${Array.isArray(normalizedDataset.data) ? normalizedDataset.data.length : 0}`
          : normalizedDataset.id);
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      datasets.push(normalizedDataset);
    };
    // console.log(exerciseDatasetList);
    exerciseDatasetList.forEach((dataset: any, index: number) => {
      const creationSqlSource = coalesceString(
        dataset?.creation_sql,
        dataset?.create_sql,
        dataset?.sql,
        dataset?.data,
        dataset?.schema_info?.create_sql,
        dataset?.schema_info?.creation_sql,
      );
      pushDataset({
        id: `exercise-${activeExercise?.id ?? "exercise"}-${dataset.id ?? index}`,
        name: dataset.name || `Dataset ${index + 1}`,
        description: dataset.description,
        placeholders: dataset.placeholders || dataset.columns,
        creation_sql: creationSqlSource,
        create_sql: creationSqlSource ?? undefined,
        table_name: dataset.table_name,
        data: dataset.data,
        columns: dataset.columns,
        dataset_csv_raw: dataset.dataset_csv_raw,
        schema_info: dataset.schema_info,
        dataset_description: dataset.description,
        subject_type: dataset.subject_type,
        type: dataset.type,
        question_type: dataset.question_type,
      });
    });

    if (activeExercise?.dataset && typeof activeExercise.dataset === "string") {
      const creationSqlSource = coalesceString(activeExercise.data, activeExercise.dataset);
      pushDataset({
        id: `active-exercise-dataset:${activeExercise.id}`,
        name: activeExercise.title || "Exercise Dataset",
        description: "Dataset provided at exercise level",
        creation_sql: creationSqlSource,
        create_sql: creationSqlSource ?? undefined,
      });
    }

    if (currentExerciseData?.context?.data_creation_sql) {
      const creationSqlSource = coalesceString(currentExerciseData.context?.data_creation_sql);
      pushDataset({
        id: `exercise-context:${currentExerciseData.exercise?.id ?? "context"}`,
        name: currentExerciseData.exercise?.title || "Generated Dataset",
        description: currentExerciseData.context?.dataset_description,
        placeholders: Array.isArray(currentExerciseData.context?.expected_cols_list)
          ? currentExerciseData.context.expected_cols_list.flat()
          : undefined,
        creation_sql: creationSqlSource,
        create_sql: creationSqlSource ?? undefined,
        dataset_csv_raw: currentExerciseData.context?.dataset_csv_raw,
        columns: currentExerciseData.context?.dataset_columns,
        schema_info: currentExerciseData.context as QuestionDatasetSchemaInfo | undefined,
        dataset_description: currentExerciseData.context?.dataset_description,
      });
    }

    const questionExerciseDataset = (selectedQuestionForPopup as any)?.exerciseDataset;
    if (typeof questionExerciseDataset === "string" && questionExerciseDataset.trim()) {
      const normalizedQuestionExerciseDataset = extractCsvFromSource(questionExerciseDataset);
      pushDataset({
        id: `question-exercise:${selectedQuestionForPopup?.id ?? "inline"}`,
        name: selectedQuestionForPopup?.exerciseTitle || "Exercise Dataset",
        description: "Exercise-level dataset",
        creation_sql: questionExerciseDataset,
        create_sql: questionExerciseDataset,
        dataset_csv_raw: normalizedQuestionExerciseDataset,
      });
    }

    const inlineQuestionDataset = (selectedQuestionForPopup as any)?.dataset;
    if (typeof inlineQuestionDataset === "string" && inlineQuestionDataset.trim()) {
      pushDataset({
        id: `question-inline:${selectedQuestionForPopup?.id ?? "inline"}`,
        name: selectedQuestionForPopup?.exerciseTitle || "Question Dataset",
        description: "Dataset attached to question",
        creation_sql: inlineQuestionDataset,
        create_sql: inlineQuestionDataset,
        dataset_csv_raw: extractCsvFromSource(inlineQuestionDataset),
      });
    } else if (inlineQuestionDataset && typeof inlineQuestionDataset === "object") {
      const inlineCreationSource = coalesceString(
        inlineQuestionDataset.creation_sql,
        inlineQuestionDataset.create_sql,
        inlineQuestionDataset.sql,
        inlineQuestionDataset.dataset,
      );
      pushDataset({
        id: `question-inline:${selectedQuestionForPopup?.id ?? "inline"}`,
        name: inlineQuestionDataset.name || selectedQuestionForPopup?.exerciseTitle || "Question Dataset",
        description: inlineQuestionDataset.description,
        creation_sql: inlineCreationSource,
        create_sql: inlineCreationSource ?? undefined,
        table_name: inlineQuestionDataset.table_name,
        data: inlineQuestionDataset.data,
        columns: inlineQuestionDataset.columns,
        dataset_csv_raw:
          typeof inlineQuestionDataset.dataset_csv_raw === "string"
            ? extractCsvFromSource(inlineQuestionDataset.dataset_csv_raw) ??
              inlineQuestionDataset.dataset_csv_raw
            : undefined,
        placeholders: inlineQuestionDataset.placeholders,
        schema_info: inlineQuestionDataset.schema_info,
        dataset_description: inlineQuestionDataset.description,
      });
    }

    if (questionDataset) {
      const questionCreationSource = coalesceString(
        questionDataset?.schema_info?.creation_sql,
        questionDataset?.schema_info?.create_sql,
        questionDataset?.creation_sql,
        questionDataset?.create_sql,
      );
      pushDataset({
        id: `question-dataset:${questionDataset.id ?? "inline"}`,
        name: questionDataset.name || "Question Dataset",
        description: questionDataset.description || "Generated dataset for this question",
        placeholders: questionDataset.columns || questionDataset.placeholders,
        creation_sql: questionCreationSource,
        create_sql: questionCreationSource ?? undefined,
        table_name: questionDataset.table_name,
        data: questionDataset.data,
        columns: questionDataset.columns,
        dataset_csv_raw: questionDataset.dataset_csv_raw,
        schema_info: questionDataset.schema_info,
        dataset_description: questionDataset.description,
      });
    }

    return datasets;
  }, [
    shouldUseDuckDb,
    questionDataset,
    selectedQuestionForPopup,
    currentExerciseData,
    activeExercise,
    exerciseDatasetList,
  ]);


  const activeSpreadsheetDataset =
    isSpreadsheetQuestion && activeDatasetId
      ? spreadsheetDatasets.find((dataset) => dataset.id === activeDatasetId) ?? null
      : null;

  const availablePythonDatasets = useMemo(() => {
    if (!isPythonLikeQuestion && selectedQuestionType !== "statistics") {
      return [] as PythonDatasetDefinition[];
    }

    const datasets: PythonDatasetDefinition[] = [];
    const datasetKeyMap = new Map<string, PythonDatasetDefinition>();
    const seen = new Set<string>();

    const pushDataset = (candidate?: PythonDatasetDefinition | null) => {
      if (!candidate) return;
      const key = [
        typeof candidate.source === "string" ? candidate.source.trim() : undefined,
        typeof candidate.id === "string" ? candidate.id.trim() : candidate.id,
        typeof candidate.table_name === "string" ? candidate.table_name.trim() : undefined,
        typeof candidate.name === "string" ? candidate.name.trim() : undefined,
      ]
        .filter(
          (part): part is string | number =>
            typeof part === "number" ||
            (typeof part === "string" && part.length > 0),
        )
        .join("::");

      if (key && seen.has(key)) {
        return;
      }
      if (key) {
        seen.add(key);
      }

      const cacheKey = deriveDatasetKey({
        id: candidate.id,
        table_name: candidate.table_name,
        creation_sql: candidate.creation_sql,
        create_sql: candidate.create_sql,
      });
      const enriched: PythonDatasetDefinition = cacheKey
        ? { ...candidate, cacheKey }
        : candidate;
      if (cacheKey) {
        datasetKeyMap.set(cacheKey, enriched);
      }

      datasets.push(enriched);
    };

    if (questionDataset) {
      pushDataset({
        id: `question-python:${questionDataset.id ?? "inline"}`,
        name: questionDataset.name || "Question Dataset",
        description: questionDataset.description,
        data: questionDataset.data,
        columns: questionDataset.columns,
        dataset_csv_raw: questionDataset.dataset_csv_raw,
        schema_info: questionDataset.schema_info,
        table_name: questionDataset.table_name,
        source: "question",
        creation_sql:
          typeof questionDataset?.schema_info?.creation_sql === "string"
            ? questionDataset.schema_info.creation_sql
            : typeof questionDataset?.creation_sql === "string"
            ? questionDataset.creation_sql
            : undefined,
        creation_python: coalesceString(
          questionDataset?.schema_info?.creation_python,
          questionDataset?.schema_info?.create_python,
          questionDataset?.creation_python,
          questionDataset?.create_python,
          (questionDataset as Record<string, unknown> | null | undefined)?.data_creation_python,
        ),
        create_python: coalesceString(
          questionDataset?.schema_info?.create_python,
          questionDataset?.schema_info?.creation_python,
          questionDataset?.create_python,
          questionDataset?.creation_python,
          (questionDataset as Record<string, unknown> | null | undefined)?.data_creation_python,
        ),
      });
    }

    const inlineDataset = (selectedQuestionForPopup as any)?.dataset;
    if (inlineDataset && typeof inlineDataset === "object" && !Array.isArray(inlineDataset)) {
      const inlineCreationSource = coalesceString(
        inlineDataset.creation_sql,
        inlineDataset.create_sql,
        inlineDataset.sql,
        inlineDataset.data,
        inlineDataset?.schema_info?.create_sql,
        inlineDataset?.schema_info?.creation_sql,
      );
      const inlineCreationPython = coalesceString(
        inlineDataset.create_python,
        inlineDataset.creation_python,
        inlineDataset?.schema_info?.create_python,
        inlineDataset?.schema_info?.creation_python,
        inlineDataset?.schema_info?.data_creation_python,
        inlineDataset?.data_creation_python,
      );
      pushDataset({
        id: `question-inline-python:${selectedQuestionForPopup?.id ?? "inline"}`,
        name:
          inlineDataset.name ||
          selectedQuestionForPopup?.exerciseTitle ||
          "Question Dataset",
        description: inlineDataset.description,
        data: Array.isArray(inlineDataset.data) ? inlineDataset.data : undefined,
        columns: Array.isArray(inlineDataset.columns)
          ? inlineDataset.columns
          : undefined,
        dataset_csv_raw:
          typeof inlineDataset.dataset_csv_raw === "string"
            ? inlineDataset.dataset_csv_raw
            : undefined,
        schema_info: inlineDataset.schema_info,
        table_name: inlineDataset.table_name,
        source: "question-inline",
        creation_sql: inlineCreationSource,
        create_sql: inlineCreationSource ?? undefined,
        creation_python: inlineCreationPython,
        create_python: inlineCreationPython ?? undefined,
      });
    }

    exerciseDatasetList.forEach((dataset: any, index: number) => {
      const rawSubject =
        typeof dataset?.subject_type === "string"
          ? dataset.subject_type.toLowerCase()
          : undefined;
      if (
        rawSubject &&
        rawSubject !== "python" &&
        rawSubject !== "statistics"
      ) {
        return;
      }
      const datasetCreationPython = coalesceString(
        dataset.create_python,
        dataset.creation_python,
        dataset?.schema_info?.create_python,
        dataset?.schema_info?.creation_python,
        dataset?.schema_info?.data_creation_python,
        dataset?.data_creation_python,
      );
      pushDataset({
        id: `exercise-python:${dataset.id ?? index}`,
        name: dataset.name || `Dataset ${index + 1}`,
        description: dataset.description,
        data: Array.isArray(dataset.data) ? dataset.data : undefined,
        columns: Array.isArray(dataset.columns) ? dataset.columns : undefined,
        dataset_csv_raw:
          typeof dataset.dataset_csv_raw === "string"
            ? dataset.dataset_csv_raw
            : undefined,
        schema_info: dataset.schema_info,
        table_name: dataset.table_name,
        source: "exercise",
        creation_sql: coalesceString(
          dataset.creation_sql,
          dataset.create_sql,
          dataset.sql,
          dataset.data,
          dataset?.schema_info?.create_sql,
          dataset?.schema_info?.creation_sql,
        ),
        create_sql: coalesceString(
          dataset.create_sql,
          dataset.creation_sql,
          dataset?.schema_info?.create_sql,
          dataset?.schema_info?.creation_sql,
        ),
        creation_python: datasetCreationPython,
        create_python: datasetCreationPython ?? undefined,
      });
    });
    const derivedFromSql: PythonDatasetDefinition[] = [];
    Object.entries(sqlDerivedTables).forEach(([cacheKey, tables]) => {
      if (!cacheKey || !tables.length) {
        return;
      }

      const baseDataset = datasetKeyMap.get(cacheKey);
      const existingTableNames = new Set(
        datasets
          .filter((dataset) => dataset.cacheKey === cacheKey && dataset.table_name)
          .map((dataset) => (dataset.table_name?.trim().toLowerCase() ?? "")),
      );

      tables.forEach((table, tableIndex) => {
        const normalizedTableKey = table.tableName?.trim().toLowerCase() ?? "";
        if (normalizedTableKey && existingTableNames.has(normalizedTableKey)) {
          return;
        }

        const baseSegment = sanitizePythonIdentifier(
          String(baseDataset?.id ?? cacheKey ?? `sql_${tableIndex}`),
        );
        const tableSegment = sanitizePythonIdentifier(
          table.tableName ?? `sql_table_${tableIndex + 1}`,
        );
        const derivedId = `${baseSegment}__${tableSegment}`;

        derivedFromSql.push({
          id: derivedId,
          name: table.tableName || `SQL Table ${tableIndex + 1}`,
          description: baseDataset?.description,
          data: table.rows,
          columns: table.columns,
          table_name: table.tableName,
          source: baseDataset?.source ? `${baseDataset.source}-sql` : "sql",
          creation_sql: baseDataset?.creation_sql,
          create_sql: baseDataset?.create_sql,
          cacheKey,
        });
      });
    });

    if (derivedFromSql.length > 0) {
      datasets.push(...derivedFromSql);
    }

    return datasets;
  }, [
    isPythonLikeQuestion,
    questionDataset,
    selectedQuestionForPopup,
    exerciseDatasetList,
    sqlDerivedTables,
  ]);

 

  const duckDbDatasetVariants = useMemo<SqlDatasetVariant[]>(() => {
    if (!shouldUseDuckDb) {
      return [];
    }

    const variants = duckDbDatasets.flatMap((dataset) => {
      const datasetKey =
        dataset.cacheKey ??
        deriveDatasetKey({
          id: dataset.id,
          table_name: dataset.table_name,
          creation_sql: dataset.creation_sql,
        });

      const mappedTables = datasetKey ? duckDbDatasetTables[datasetKey] : undefined;
      const creationTables = Array.isArray(dataset.creationTables) ? dataset.creationTables : [];
      const fallbackTables =
        typeof dataset.table_name === "string" && dataset.table_name.trim().length > 0
          ? [dataset.table_name]
          : [];
      const candidateTables = Array.from(
        new Set(
          [
            ...(Array.isArray(mappedTables) ? mappedTables : []),
            ...fallbackTables,
            ...creationTables,
          ].filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0,
          ),
        ),
      );

      if (candidateTables.length === 0) {
        const displayLabel = resolveDatasetLabel(dataset.name || dataset.table_name || "Dataset");
        return [
          {
            ...dataset,
            id: dataset.id,
            baseDatasetId: dataset.id,
            displayName: displayLabel,
            resolvedTableName: dataset.table_name,
          },
        ];
      }

      const baseName = dataset.name || dataset.table_name || "Dataset";
      const hasMultipleTables = candidateTables.length > 1;

      return candidateTables.map<SqlDatasetVariant>((tableName) => {
        const rawLabel = hasMultipleTables ? tableName : baseName;
        const displayLabel = resolveDatasetLabel(rawLabel);
        return {
          ...dataset,
          id: `${dataset.id}::${tableName}`,
          baseDatasetId: dataset.id,
          displayName: displayLabel,
          resolvedTableName: tableName,
        };
      });
    });

    return dedupeByLabel(variants, (variant) =>
      resolveDatasetLabel(
        variant.displayName ??
          variant.resolvedTableName ??
          variant.table_name ??
          variant.name,
        "Dataset",
      ),
    );
  }, [duckDbDatasets, duckDbDatasetTables, shouldUseDuckDb]);

  const pythonDatasetDetails = useMemo(() => {
    if (!isPythonLikeQuestion && selectedQuestionType !== "statistics") {
      return {} as Record<string, PythonDatasetDetail>;
    }

    const detailMap: Record<string, PythonDatasetDetail> = {};
    availablePythonDatasets.forEach((dataset, index) => {
      detailMap[dataset.id] = buildPythonDatasetDetail(dataset, index);
    });
    return detailMap;
  }, [availablePythonDatasets, isPythonLikeQuestion]);

  useEffect(() => {
    const variantKey =
      shouldUseDuckDb && duckDbDatasetVariants.length > 0
        ? duckDbDatasetVariants.map((dataset) => dataset.id).join("|")
        : "";
    const pythonKey =
      isPythonLikeQuestion && availablePythonDatasets.length > 0
        ? availablePythonDatasets.map((dataset) => dataset.id).join("|")
        : "";
    const signature = [
      datasetCacheScopeKey,
      selectedQuestionType ?? "unknown",
      String(shouldUseDuckDb),
      variantKey,
      pythonKey,
      String(isSpreadsheetQuestion),
      String(isPythonLikeQuestion),
    ].join(";");

    if (datasetAvailabilitySignatureRef.current === signature) {
      return;
    }
    datasetAvailabilitySignatureRef.current = signature;

    let nextActiveId: string | null = activeDatasetId;
    let shouldResetPreview = false;

    if (shouldUseDuckDb) {
      if (duckDbDatasetVariants.length > 0) {
        const currentMatches =
          nextActiveId && duckDbDatasetVariants.some((dataset) => dataset.id === nextActiveId);
        if (!currentMatches) {
          nextActiveId = duckDbDatasetVariants[0]?.id ?? null;
          shouldResetPreview = true;
        }
      } else if (isPythonLikeQuestion && availablePythonDatasets.length > 0) {
        const currentMatches =
          nextActiveId && availablePythonDatasets.some((dataset) => dataset.id === nextActiveId);
        if (!currentMatches) {
          nextActiveId = availablePythonDatasets[0]?.id ?? null;
          shouldResetPreview = true;
        }
      } else {
        if (nextActiveId !== null) {
          shouldResetPreview = true;
        }
        nextActiveId = null;
      }
    } else if (!isSpreadsheetQuestion) {
      if (nextActiveId !== null) {
        shouldResetPreview = true;
      }
      nextActiveId = null;
    }

    if (nextActiveId !== activeDatasetId) {
      setActiveDatasetId(nextActiveId);
    }

    if (shouldResetPreview) {
      setDatasetPreview(null);
      setDatasetPreviewError(null);
    }
  }, [
    activeDatasetId,
    availablePythonDatasets,
    duckDbDatasetVariants,
    isPythonLikeQuestion,
    isSpreadsheetQuestion,
    selectedQuestionType,
    shouldUseDuckDb,
    datasetCacheScopeKey,
  ]);

  const loadDatasetPreview = useCallback(
    async (datasetId: string | null) => {
      if (!shouldUseDuckDb) {
        setLoadingDatasetPreview(false);
        return;
      }

      if (!datasetId) {
        setDatasetPreview(null);
        setDatasetPreviewError(null);
        setLoadingDatasetPreview(false);
        activeDatasetPreviewRequestRef.current = null;
        return;
      }

      const variant = duckDbDatasetVariants.find((dataset) => dataset.id === datasetId);
      const baseDatasetId = variant?.baseDatasetId ?? datasetId;
      const baseDataset =
        duckDbDatasets.find((dataset) => dataset.id === baseDatasetId) ?? variant ?? null;
      const pythonDetail =
        isPythonLikeQuestion && baseDatasetId
          ? pythonDatasetDetails[baseDatasetId]
          : undefined;
      const creationSqlCandidate = coalesceString(
        variant?.sanitizedCreationSql ?? variant?.creation_sql,
        variant?.create_sql,
        baseDataset?.sanitizedCreationSql ?? baseDataset?.creation_sql,
        baseDataset?.create_sql,
      );
      const preferredPreviewTableNames = [
        variant?.resolvedTableName ?? null,
        baseDataset?.table_name ?? null,
        ...(pythonDetail?.tableNames ?? []),
      ];
      const resolvePreviewColumnTypes = (columns: string[]): Record<string, string> | undefined =>
        resolveColumnTypesFromSchema({
          columns,
          creationSql: creationSqlCandidate,
          preferredTableNames: preferredPreviewTableNames,
        });

      const scopeKey = datasetCacheScopeKey;
      if (!datasetPreviewCacheRef.current[scopeKey]) {
        datasetPreviewCacheRef.current[scopeKey] = {};
      }
      const scopeCache = datasetPreviewCacheRef.current[scopeKey];

      const datasetCacheKey =
        variant?.cacheKey ??
        baseDataset?.cacheKey ??
        deriveDatasetKey({
          id: baseDatasetId ?? baseDataset?.id ?? variant?.id ?? datasetId,
          table_name: variant?.resolvedTableName ?? baseDataset?.table_name ?? variant?.table_name,
          creation_sql: baseDataset?.creation_sql ?? variant?.creation_sql,
        });

      const tableKey =
        variant?.resolvedTableName ??
        baseDataset?.table_name ??
        (Array.isArray(pythonDetail?.tableNames) && pythonDetail.tableNames.length > 0
          ? pythonDetail.tableNames[0]
          : null);
      const cacheKeyBase = String(datasetCacheKey ?? baseDatasetId ?? datasetId);
      const cacheKey = tableKey ? `${cacheKeyBase}::${tableKey}` : cacheKeyBase;
      const requestToken = `${scopeKey}::${cacheKey}`;

      const cachedPreview = scopeCache?.[cacheKey];
      if (cachedPreview) {
        activeDatasetPreviewRequestRef.current = requestToken;
        setDatasetPreview(cachedPreview);
        setDatasetPreviewError(null);
        setLoadingDatasetPreview(false);
        return;
      }

      setLoadingDatasetPreview(true);
      activeDatasetPreviewRequestRef.current = requestToken;

      const finalize = (
        preview: DatasetPreview | null,
        error: string | null,
        options: { cache?: boolean } = {},
      ) => {
        if (activeDatasetPreviewRequestRef.current !== requestToken) {
          return;
        }

        setDatasetPreview(preview);
        setDatasetPreviewError(error);
        setLoadingDatasetPreview(false);

        if (preview && options.cache !== false) {
          datasetPreviewCacheRef.current[scopeKey] = {
            ...datasetPreviewCacheRef.current[scopeKey],
            [cacheKey]: preview,
          };
        }
      };

      const normalizeRowValues = (row: unknown, columns: string[]): unknown[] => {
        if (Array.isArray(row)) {
          return columns.map((_, index) => row[index] ?? null);
        }
        if (row && typeof row === "object") {
          return columns.map((columnName) => {
            const typedRow = row as Record<string, unknown>;
            if (columnName in typedRow) {
              return typedRow[columnName];
            }
            return null;
          });
        }
        return columns.map(() => row ?? null);
      };

      const fallbackToPythonDetail = () => {
        if (!isPythonLikeQuestion && selectedQuestionType !== "statistics") {
          finalize(null, "Preview data is not available for this dataset yet.", { cache: false });
          return;
        }

        if (!pythonDetail) {
          finalize(null, "Dataset preview is not available.", { cache: false });
          return;
        }

        if (pythonDetail.previewRows.length > 0 && pythonDetail.columns.length > 0) {
          finalize(
            {
              columns: pythonDetail.columns,
              rows: pythonDetail.previewRows,
              columnTypes: pythonDetail.columnTypes,
            },
            null,
          );
        } else {
          finalize(
            null,
            pythonDetail.loadError ?? "Preview data is not available for this dataset yet.",
            { cache: false },
          );
        }
      };

      if (shouldUseDuckDb && baseDataset) {
        try {
          const datasetKey =
            variant?.cacheKey ??
            baseDataset.cacheKey ??
            deriveDatasetKey({
              id: baseDatasetId ?? baseDataset.id,
              table_name: variant?.resolvedTableName ?? baseDataset.table_name,
              creation_sql: baseDataset.creation_sql,
            });

          const mappedTables = datasetKey ? duckDbDatasetTables[datasetKey] : undefined;
          const preferredTableNames = Array.from(
            new Set(
              [
                variant?.resolvedTableName,
                ...(Array.isArray(mappedTables) ? mappedTables : []),
                baseDataset.table_name,
              ].filter(
                (value): value is string => typeof value === "string" && value.trim().length > 0,
              ),
            ),
          );
          const mappedTableName = preferredTableNames.find((tableName) =>
            duckDbTables.includes(tableName),
          );

          if (
            mappedTableName &&
            duckDbTables.includes(mappedTableName) &&
            isDuckDbReady &&
            !isDuckDbLoading &&
            !isPreparingDuckDb
          ) {
            const escapeIdentifier = (value: string) => value.replace(/"/g, '""');
            const previewQuery = `SELECT * FROM "${escapeIdentifier(String(mappedTableName))}";`;
            const result = await executeDuckDbQuery(previewQuery);
            if (result.success && result.result) {
              const resultColumns = result.result.columns ?? [];
              const columnTypes = resolvePreviewColumnTypes(resultColumns);
              finalize(
                {
                  columns: resultColumns,
                  rows: (result.result.rows ?? []).map((row) =>
                    Array.isArray(row) ? row : [row],
                  ),
                  columnTypes,
                },
                null,
              );
              return;
            }
          }

          const fallbackData = Array.isArray(variant?.data)
            ? variant!.data
            : Array.isArray(baseDataset.data)
            ? baseDataset.data
            : [];

          const shouldSkipFallbackPreview = selectedQuestionType === "google_sheets";
          if (fallbackData.length > 0 && !shouldSkipFallbackPreview) {
            let columns = Array.isArray(variant?.columns)
              ? variant!.columns
              : Array.isArray(baseDataset.columns)
              ? baseDataset.columns
              : [];
            if (!columns.length) {
              const firstRow = fallbackData[0];
              if (firstRow && typeof firstRow === "object" && !Array.isArray(firstRow)) {
                columns = Object.keys(firstRow);
              }
            }

            if (!columns.length && Array.isArray(fallbackData[0])) {
              columns = (fallbackData[0] as unknown[]).map((_, index) => `column_${index + 1}`);
            }

            if (columns.length) {
              const columnTypes = resolvePreviewColumnTypes(columns);
              finalize(
                {
                  columns,
                  rows: fallbackData.map((row) => normalizeRowValues(row, columns)),
                  columnTypes,
                },
                null,
              );
              return;
            }
          }

          if (isPythonLikeQuestion) {
            fallbackToPythonDetail();
            return;
          }

          const message =
            shouldSkipFallbackPreview && fallbackData.length > 0
              ? "Preview data is not available for this Google Sheets dataset yet."
              : "Preview data is not available for this dataset yet.";
          finalize(null, message, { cache: false });
        } catch (error) {
          console.error("Failed to load dataset preview:", error);
          if (isPythonLikeQuestion) {
            fallbackToPythonDetail();
          } else {
            finalize(
              null,
              error instanceof Error ? error.message : "Unable to load dataset preview.",
              { cache: false },
            );
          }
        }
        return;
      }

      if (isPythonLikeQuestion) {
        fallbackToPythonDetail();
        return;
      }

      finalize(null, null, { cache: false });
    },
    [
      duckDbDatasetVariants,
      duckDbDatasets,
      pythonDatasetDetails,
      duckDbDatasetTables,
      duckDbTables,
      executeDuckDbQuery,
      isDuckDbLoading,
      isDuckDbReady,
      isPreparingDuckDb,
      isPythonLikeQuestion,
      selectedQuestionType,
      shouldUseDuckDb,
      datasetCacheScopeKey,
    ],
  );

  useEffect(() => {
    loadDatasetPreview(activeDatasetId);
  }, [activeDatasetId, loadDatasetPreview]);

  useEffect(() => {
    if (!isSpreadsheetQuestion || shouldUseDuckDb) {
      return;
    }

    if (!spreadsheetDatasets.length) {
      if (activeDatasetId !== null) {
        setActiveDatasetId(null);
      }
      setLoadingDatasetPreview(false);
      setDatasetPreview(null);
      setDatasetPreviewError("Dataset preview is not available yet.");
      return;
    }

    let currentDataset =
      activeDatasetId !== null
        ? spreadsheetDatasets.find((dataset) => dataset.id === activeDatasetId)
        : undefined;

    if (!currentDataset) {
      const fallbackDataset = spreadsheetDatasets[0];
      if (activeDatasetId !== fallbackDataset.id) {
        setActiveDatasetId(fallbackDataset.id);
        return;
      }
      currentDataset = fallbackDataset;
    }

    setLoadingDatasetPreview(false);
    setDatasetPreview(currentDataset.preview ?? null);
    setDatasetPreviewError(
      currentDataset.preview ? null : "Dataset preview is not available yet.",
    );
  }, [activeDatasetId, isSpreadsheetQuestion, shouldUseDuckDb, spreadsheetDatasets]);

  useEffect(() => {
    const clearStatusesIfNeeded = () =>
      setPythonDatasetStatus((prev) => (Object.keys(prev).length > 0 ? {} : prev));

    if (!isPythonLikeQuestion && selectedQuestionType !== "statistics") {
      clearStatusesIfNeeded();
      return;
    }

    if (availablePythonDatasets.length === 0) {
      clearStatusesIfNeeded();
      return;
    }
    // console.log("Available Python datasets:", availablePythonDatasets);
    setPythonDatasetStatus((prev) => {
      const allowedIds = new Set(availablePythonDatasets.map((dataset) => dataset.id));
      const next: Record<string, PythonDatasetLoadState> = {};
      let changed = false;

      allowedIds.forEach((id) => {
        if (prev[id]) {
          next[id] = prev[id];
        } else {
          changed = true;
        }
      });

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [availablePythonDatasets, isPythonLikeQuestion, selectedQuestionType]);

  useEffect(() => {
    if (!isPythonLikeQuestion && selectedQuestionType !== "statistics") {
      return;
    }
    if (!isPyodideReady) {
      return;
    }
    if (availablePythonDatasets.length === 0) {
      return;
    }

    let cancelled = false;

    const loadDatasetsIntoPyodide = async () => {
      for (const dataset of availablePythonDatasets) {
        const detail = pythonDatasetDetails[dataset.id];
        if (!detail) {
          continue;
        }

        if (!detail.objectRows.length) {
          setPythonDatasetStatus((prev) => {
            const current = prev[dataset.id];
            const nextState: PythonDatasetLoadState = {
              state: "failed",
              message: detail.loadError ?? "Dataset has no rows available to load.",
              variable: detail.pythonVariable,
            };
            if (
              current &&
              current.state === nextState.state &&
              current.message === nextState.message &&
              current.variable === nextState.variable
            ) {
              return prev;
            }
            return {
              ...prev,
              [dataset.id]: nextState,
            };
          });
          continue;
        }

        setPythonDatasetStatus((prev) => {
          const current = prev[dataset.id];
          if (current?.state === "loaded" || current?.state === "loading") {
            return prev;
          }
          return {
            ...prev,
            [dataset.id]: { state: "loading", variable: detail.pythonVariable },
          };
        });

        try {
          const loaded = await loadPyodideDataFrame(detail.pythonVariable, detail.objectRows);
          if (cancelled) {
            return;
          }
          setPythonDatasetStatus((prev) => ({
            ...prev,
            [dataset.id]: loaded
              ? { state: "loaded", variable: detail.pythonVariable }
              : {
                  state: "failed",
                  variable: detail.pythonVariable,
                  message: "Failed to load dataset into Python runtime.",
                },
          }));
        } catch (error) {
          if (cancelled) {
            return;
          }
          setPythonDatasetStatus((prev) => ({
            ...prev,
            [dataset.id]: {
              state: "failed",
              variable: detail.pythonVariable,
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to load dataset into Python runtime.",
            },
          }));
        }
      }
    };

    loadDatasetsIntoPyodide();

    return () => {
      cancelled = true;
    };
  }, [
    availablePythonDatasets,
    isPyodideReady,
    loadPyodideDataFrame,
    pythonDatasetDetails,
    isPythonLikeQuestion,
  ]);

  const activePythonVariant =
    isPythonLikeQuestion && activeDatasetId  || (selectedQuestionType === "statistics" && activeDatasetId)
      ? duckDbDatasetVariants.find((dataset) => dataset.id === activeDatasetId)
      : undefined;
  const activePythonBaseDatasetId =
    isPythonLikeQuestion && activeDatasetId && activeDatasetId  || (selectedQuestionType === "statistics" && activeDatasetId)
      ? activePythonVariant?.baseDatasetId ?? activeDatasetId
      : null;

   // --- Python starter from datasets (practice_datasets + question + exercise) ---
  const activePythonDatasetDetail =
    isPythonLikeQuestion  && activePythonBaseDatasetId && activePythonBaseDatasetId || (selectedQuestionType === "statistics" && activePythonBaseDatasetId)
      ? pythonDatasetDetails[activePythonBaseDatasetId]
      : undefined;

  const activePythonDatasetStatus =
    isPythonLikeQuestion && activePythonBaseDatasetId && activePythonBaseDatasetId || (selectedQuestionType === "statistics" && activePythonBaseDatasetId)
      ? pythonDatasetStatus[activePythonBaseDatasetId]
      : undefined;

  const pythonDatasetOptions = useMemo(() => {
    if (!isPythonLikeQuestion && selectedQuestionType !== "statistics") {
      return [] as Array<{
        id: string;
        label: string;
        baseDatasetId: string;
        tableName?: string;
        tableNames?: string[];
        originalName?: string;
      }>;
    }

    if (duckDbDatasetVariants.length > 0) {
      const options = duckDbDatasetVariants.map((variant) => {
        const rawLabel =
          variant.resolvedTableName ||
          variant.displayName ||
          variant.table_name ||
          variant.name ||
          "dataset";
        const label = resolveDatasetLabel(rawLabel);
        return {
          id: variant.id,
          label,
          baseDatasetId: variant.baseDatasetId,
          tableName: variant.resolvedTableName ?? variant.table_name,
          tableNames: variant.resolvedTableName
            ? [resolveDatasetLabel(variant.resolvedTableName)]
            : variant.table_name
            ? [resolveDatasetLabel(variant.table_name)]
            : undefined,
          originalName: variant.name,
        };
      });
      return dedupeByLabel(options, (option) => option.label);
    }

    const options = availablePythonDatasets.map((dataset) => {
      const detail = pythonDatasetDetails[dataset.id];
      const rawLabel =
        detail?.tableNames?.[0] ||
        detail?.pythonVariable ||
        detail?.displayName ||
        detail?.name ||
        dataset.table_name ||
        dataset.name ||
        "dataset";
      const label = resolveDatasetLabel(rawLabel);
      return {
        id: dataset.id,
        label,
        baseDatasetId: dataset.id,
        tableName: detail?.tableNames?.[0] ?? dataset.table_name,
        tableNames: detail?.tableNames?.length
          ? detail.tableNames
          : dataset.table_name
          ? [resolveDatasetLabel(dataset.table_name)]
          : undefined,
        originalName: detail?.originalName ?? dataset.name,
      };
    });
    return dedupeByLabel(options, (option) => option.label);
  }, [
    availablePythonDatasets,
    duckDbDatasetVariants,
    isPythonLikeQuestion,
    pythonDatasetDetails,
    selectedQuestionType,
  ]);

  const datasetLoadSignature = useMemo(
    () =>
      JSON.stringify(
        duckDbDatasets.map((dataset) => ({
          id: dataset.id,
          creation: dataset.creation_sql,
          table: dataset.table_name,
          rows: Array.isArray(dataset.data) ? dataset.data.length : 0,
        })),
      ),
    [duckDbDatasets],
  );

  // useEffect(() => {
  //   if (!selectedQuestionForPopup) {
  //     setSqlCode('');
  //     setSqlResults([]);
  //     setDuckDbTables([]);
  //     setDuckDbSetupError(null);
  //   }
  // }, [selectedQuestionForPopup]);

  useEffect(() => {
    if (!selectedQuestionForPopup) {
      workspaceCodeTouchedRef.current = false;
      setSqlCode('');
      setPythonCode('');
      setWorksheetSolution('');
      setSqlResults([]);
      setDuckDbTables([]);
      setDuckDbSetupError(null);
      return;
    }

    const questionType = (selectedQuestionForPopup.question_type || selectedQuestionForPopup.type || "sql").toLowerCase();
    workspaceCodeTouchedRef.current = false;
    setWorksheetSolution('');
    setCodeLanguage(questionType);

  }, [selectedQuestionForPopup?.id, selectedQuestionForPopup?.question_type, selectedQuestionForPopup?.type]);

  useEffect(() => {
    if (!selectedQuestionForPopup) {
      setCachedWorkspaceRun(null);
      return;
    }

    const rawExerciseId =
      (selectedQuestionForPopup as any)?.exerciseId ??
      (selectedQuestionForPopup as any)?.exercise_id;
    const rawQuestionId =
      (selectedQuestionForPopup as any)?.id ??
      (selectedQuestionForPopup as any)?.question_id;
    const exerciseId =
      rawExerciseId !== null && rawExerciseId !== undefined
        ? String(rawExerciseId)
        : "";
    const questionId =
      rawQuestionId !== null && rawQuestionId !== undefined
        ? String(rawQuestionId)
        : "";

    const cachedRun = readCachedWorkspaceRun(exerciseId, questionId);
    setCachedWorkspaceRun(cachedRun);
    if (cachedRun) {
      const language = cachedRun.language;
      if (language === "python") {
        setPythonCode(cachedRun.code);
      } else if (
        language === "statistics" ||
        language === "google_sheets" ||
        language === "math" ||
        language === "geometry" ||
        language === "reasoning" ||
        language === "problem_solving" ||
        language === "mentor_chat"
      ) {
        setWorksheetSolution(cachedRun.code);
      } else {
        setSqlCode(cachedRun.code);
      }
      return;
    }
  }, [
    selectedQuestionForPopup?.exerciseId,
    selectedQuestionForPopup?.exercise_id,
    selectedQuestionForPopup?.id,
    selectedQuestionForPopup?.question_id,
  ]);

  useEffect(() => {
    const hasActivePopupQuestion = Boolean(activePopupQuestionId);
    const questionChanged = preparedPopupQuestionRef.current !== activePopupQuestionId;

    if (!hasActivePopupQuestion || !shouldUseDuckDb) {
      preparedPopupQuestionRef.current = hasActivePopupQuestion ? activePopupQuestionId : null;
      setDuckDbTables([]);
      setDuckDbSetupError(null);
      setIsPreparingDuckDb(false);
      setDuckDbDatasetTables({});
      setSanitizedCreationSqlByDataset({});
      return;
    }

    if (!isDuckDbReady) {
      return;
    }

    if (isRequestingWorkspaceHint) {
      return;
    }

    if (skipDuckDbRefreshRef.current) {
      skipDuckDbRefreshRef.current = false;
      return;
    }

    let cancelled = false;

    const splitSqlStatements = (sql: string) => {
      const statements: string[] = [];
      let current = "";
      let inSingleQuote = false;
      let inDoubleQuote = false;
      let inBacktick = false;

      for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const prevChar = sql[i - 1];

        if (char === "'" && prevChar !== "\\" && !inDoubleQuote && !inBacktick) {
          inSingleQuote = !inSingleQuote;
        } else if (char === '"' && prevChar !== "\\" && !inSingleQuote && !inBacktick) {
          inDoubleQuote = !inDoubleQuote;
        } else if (char === "`" && prevChar !== "\\" && !inSingleQuote && !inDoubleQuote) {
          inBacktick = !inBacktick;
        }

        if (char === ";" && !inSingleQuote && !inDoubleQuote && !inBacktick) {
          if (current.trim().length > 0) {
            statements.push(current.trim());
          }
          current = "";
        } else {
          current += char;
        }
      }

      if (current.trim().length > 0) {
        statements.push(current.trim());
      }

      return statements;
    };

    const sanitizeSql = (sql: string) =>
      sql
        .replace(/--.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");

    const findTopLevelKeywordIndex = (statement: string, keyword: string) => {
      const lower = statement.toLowerCase();
      const target = keyword.toLowerCase();
      let inSingle = false;
      let inDouble = false;
      let inBacktick = false;
      let parenDepth = 0;

      for (let i = 0; i < lower.length; i++) {
        const char = lower[i];
        const next = lower[i + 1];

        if (char === "'" && !inDouble && !inBacktick) {
          if (inSingle && next === "'") {
            i++;
            continue;
          }
          inSingle = !inSingle;
          continue;
        }
        if (char === '"' && !inSingle && !inBacktick) {
          if (inDouble && next === '"') {
            i++;
            continue;
          }
          inDouble = !inDouble;
          continue;
        }
        if (char === "`" && !inSingle && !inDouble) {
          inBacktick = !inBacktick;
          continue;
        }

        if (inSingle || inDouble || inBacktick) {
          continue;
        }

        if (char === "(") {
          parenDepth++;
          continue;
        }
        if (char === ")" && parenDepth > 0) {
          parenDepth--;
          continue;
        }

        if (parenDepth === 0 && lower.startsWith(target, i)) {
          const before = lower[i - 1];
          const after = lower[i + target.length];
          const beforeIsWord = !!before && /[a-z0-9_]/i.test(before);
          const afterIsWord = !!after && /[a-z0-9_]/i.test(after);
          if (!beforeIsWord && !afterIsWord) {
            return i;
          }
        }
      }

      return -1;
    };

    const extractValuesRows = (
      valuesClause: string,
    ): { rows: string[]; suffixStart: number } => {
      const rows: string[] = [];
      let currentRow = "";
      let capturing = false;
      let parenDepth = 0;
      let inSingle = false;
      let inDouble = false;
      let inBacktick = false;
      let lastRowEndIndex = 0;
      let suffixStart = valuesClause.length;

      const flushRow = (endIndex: number) => {
        rows.push(currentRow.trim());
        currentRow = "";
        capturing = false;
        lastRowEndIndex = endIndex + 1;
      };

      for (let i = 0; i < valuesClause.length; i++) {
        const char = valuesClause[i];
        const next = valuesClause[i + 1];

        if (!capturing) {
          if (/\s/.test(char) || char === ",") {
            continue;
          }
          if (char !== "(") {
            suffixStart = lastRowEndIndex;
            break;
          }
          capturing = true;
          parenDepth = 1;
          currentRow = "";
          continue;
        }

        if (char === "'" && !inDouble && !inBacktick) {
          if (inSingle && next === "'") {
            currentRow += "''";
            i++;
            continue;
          }
          inSingle = !inSingle;
          currentRow += char;
          continue;
        }
        if (char === '"' && !inSingle && !inBacktick) {
          if (inDouble && next === '"') {
            currentRow += '""';
            i++;
            continue;
          }
          inDouble = !inDouble;
          currentRow += char;
          continue;
        }
        if (char === "`" && !inSingle && !inDouble) {
          inBacktick = !inBacktick;
          currentRow += char;
          continue;
        }

        if (!inSingle && !inDouble && !inBacktick) {
          if (char === "(") {
            parenDepth++;
            currentRow += char;
            continue;
          }
          if (char === ")") {
            parenDepth--;
            currentRow += char;
            if (parenDepth === 0) {
              flushRow(i);
              continue;
            }
            continue;
          }
          if (char === "," && parenDepth === 0) {
            currentRow += char;
            continue;
          }
        }

        currentRow += char;
      }

      if (rows.length > 0 && suffixStart === valuesClause.length) {
        suffixStart = lastRowEndIndex;
      }

      return { rows, suffixStart };
    };

    const countTopLevelExpressions = (row: string): number => {
      if (!row.length) {
        return 0;
      }

      let count = 0;
      let hasTokenContent = false;
      let parenDepth = 0;
      let inSingle = false;
      let inDouble = false;
      let inBacktick = false;

      const finalizeToken = () => {
        count++;
        hasTokenContent = false;
      };

      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        const next = row[i + 1];

        if (char === "'" && !inDouble && !inBacktick) {
          if (inSingle && next === "'") {
            i++;
            hasTokenContent = true;
            continue;
          }
          inSingle = !inSingle;
          hasTokenContent = true;
          continue;
        }
        if (char === '"' && !inSingle && !inBacktick) {
          if (inDouble && next === '"') {
            i++;
            hasTokenContent = true;
            continue;
          }
          inDouble = !inDouble;
          hasTokenContent = true;
          continue;
        }
        if (char === "`" && !inSingle && !inDouble) {
          inBacktick = !inBacktick;
          hasTokenContent = true;
          continue;
        }

        if (!inSingle && !inDouble && !inBacktick) {
          if (char === "(") {
            parenDepth++;
            hasTokenContent = true;
            continue;
          }
          if (char === ")" && parenDepth > 0) {
            parenDepth--;
            hasTokenContent = true;
            continue;
          }
          if (char === "," && parenDepth === 0) {
            finalizeToken();
            continue;
          }
        }

        if (!/\s/.test(char)) {
          hasTokenContent = true;
        }
      }

      if (hasTokenContent || count === 0) {
        finalizeToken();
      }

      return count;
    };

    const formatSqlPreview = (statement: string, limit = 160) => {
      const singleLine = statement.replace(/\s+/g, " ").trim();
      if (singleLine.length <= limit) {
        return singleLine;
      }
      return `${singleLine.slice(0, limit)}...`;
    };

    const validateInsertValuesClause = (statement: string) => {
      if (!/^\s*insert\b/i.test(statement)) {
        return;
      }

      const valuesIndex = findTopLevelKeywordIndex(statement, "values");
      if (valuesIndex === -1) {
        return;
      }

      const { rows } = extractValuesRows(statement.slice(valuesIndex + "values".length));
      if (rows.length <= 1) {
        return;
      }

      const counts = rows.map((row) => countTopLevelExpressions(row));
      const expected = counts.find((count) => count > 0);
      if (!expected) {
        return;
      }

      const mismatchIndex = counts.findIndex((count) => count !== expected);
      if (mismatchIndex !== -1) {
        throw new Error(
          `INSERT statement has inconsistent VALUES entries (row ${mismatchIndex + 1} has ${counts[mismatchIndex]}, expected ${expected}).\nProblematic SQL: ${formatSqlPreview(statement)}`,
        );
      }
    };

    const validateSqlStatement = (statement: string) => {
      validateInsertValuesClause(statement);

      // Guard against backslash-escaped single quotes which DuckDB doesn't treat as escapes
      // (e.g., "Men\'s" should be written as "Men''s"). Catch early to surface a clearer message.
      if (/'[^']*\\'[^']*/.test(statement)) {
        throw new Error(
          `SQL contains backslash-escaped single quotes. Replace \\\"'\\\" with doubled quotes '' (e.g., Men''s). Problematic SQL: ${formatSqlPreview(statement)}`,
        );
      }
    };

    type InsertSanitizationResult = { statement?: string; skipStatement?: boolean };
    const sanitizeInsertValuesClause = (statement: string): InsertSanitizationResult => {
      if (!/^\s*insert\b/i.test(statement)) {
        return {};
      }

      const valuesIndex = findTopLevelKeywordIndex(statement, "values");
      if (valuesIndex === -1) {
        return {};
      }

      const valuesClause = statement.slice(valuesIndex + "values".length);
      const { rows, suffixStart } = extractValuesRows(valuesClause);
      if (rows.length === 0) {
        return {};
      }

      const counts = rows.map((row) => countTopLevelExpressions(row));
      const expected = counts.find((count) => count > 0);
      if (expected === undefined) {
        return {};
      }

      const validRows = rows.filter((_, index) => counts[index] === expected);
      if (validRows.length === rows.length) {
        return {};
      }

      if (validRows.length === 0) {
        return { skipStatement: true };
      }

      const prefix = statement.slice(0, valuesIndex);
      const valuesKeyword = statement.slice(valuesIndex, valuesIndex + "values".length);
      const suffix = valuesClause.slice(suffixStart);
      const mergedRows = validRows.join(", (");

      return {
        statement: `${prefix}${valuesKeyword} ( ${mergedRows}${suffix}`,
      };
    };

    const escapeIdentifier = (value: string) => value.replace(/"/g, '""');

    const canonicalizeIdentifier = (identifier?: string | null) => {
      if (typeof identifier !== "string") {
        return null;
      }
      const trimmed = identifier.trim();
      if (!trimmed) {
        return null;
      }

      const parts = trimmed
        .split(".")
        .map((part) =>
          part
            .replace(/^[`"\[]/, "")
            .replace(/[`"\]]$/, "")
            .trim(),
        )
        .filter((part) => part.length > 0);

      if (parts.length === 0) {
        return null;
      }

      const formatted = parts.map((part) => `"${escapeIdentifier(part)}"`).join(".");
      const key = parts.join(".").toLowerCase();

      return {
        key,
        formatted,
      };
    };

    const extractCreateTableIdentifier = (statement: string): string | null => {
      if (typeof statement !== "string") {
        return null;
      }
      const match = statement.match(
        /^\s*create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)/i,
      );
      return match ? match[1] : null;
    };

    const fetchCurrentTables = async (): Promise<string[]> => {
      const result = await executeDuckDbQuery("SHOW TABLES;");
      if (!result.success || !result.result) {
        return [];
      }

      return result.result.rows
        .map((row) => {
          if (Array.isArray(row)) {
            const firstValue = row.find((value) => typeof value === "string");
            return firstValue ? String(firstValue) : undefined;
          }
          if (typeof row === "string") {
            return row;
          }
          if (row && typeof row === "object") {
            const values = Object.values(row as Record<string, unknown>);
            const firstValue = values.find((value) => typeof value === "string");
            return firstValue ? String(firstValue) : undefined;
          }
          return undefined;
        })
        .filter((value): value is string => Boolean(value));
    };

    const resetDatabase = async () => {
      const tables = await fetchCurrentTables();
      for (const tableName of tables) {
        await executeDuckDbQuery(
          `DROP TABLE IF EXISTS "${escapeIdentifier(String(tableName))}" CASCADE`,
        );
      }
    };

    const questionChangedForRun = questionChanged;

    const prepareDatasets = async () => {
      // console.log("[DuckDB] Preparing datasets...", {
      //   questionId: selectedQuestionForPopup?.id,
      //   datasets: duckDbDatasets.map((dataset) => ({
      //     id: dataset.id,
      //     hasCreationSql: Boolean(dataset.creation_sql),
      //     tableName: dataset.table_name,
      //   })),
      // });

      const executedStatements = new Set<string>();
      const knownTables = new Set<string>();
      const tableSchemas = new Map<
        string,
        Array<{ name: string; type: string }>
      >();

      const isNumericType = (type?: string): boolean => {
        if (!type) return false;
        const normalized = type.trim().toLowerCase();
        return /^(bigint|int|integer|smallint|tinyint|decimal|numeric|float|double|real|serial|money|number)/.test(
          normalized,
        );
      };

      const splitTuples = (valuesClause: string): string[] => {
        const tuples: string[] = [];
        let depth = 0;
        let buffer = "";
        let inString = false;
        for (let i = 0; i < valuesClause.length; i += 1) {
          const char = valuesClause[i];
          if (char === "'" && valuesClause[i - 1] !== "\\") {
            inString = !inString;
          }
          if (!inString) {
            if (char === "(") {
              depth += 1;
              if (depth === 1) {
                buffer = "";
                continue;
              }
            }
            if (char === ")") {
              depth -= 1;
              if (depth === 0) {
                tuples.push(buffer);
                buffer = "";
                continue;
              }
            }
          }
          if (depth > 0) {
            buffer += char;
          }
        }
        return tuples.map((tuple) => tuple.trim()).filter(Boolean);
      };

      const splitValues = (tuple: string): string[] => {
        const values: string[] = [];
        let buffer = "";
        let inString = false;
        for (let i = 0; i < tuple.length; i += 1) {
          const char = tuple[i];
          if (char === "'" && tuple[i - 1] !== "\\") {
            inString = !inString;
          }
          if (char === "," && !inString) {
            values.push(buffer.trim());
            buffer = "";
            continue;
          }
          buffer += char;
        }
        if (buffer.trim().length > 0) {
          values.push(buffer.trim());
        }
        return values;
      };

      const normalizeIdentifier = (value?: string): string | null => {
        if (!value) return null;
        return value.replace(/[`"\[\]]/g, "").trim().toLowerCase();
      };

      const parseColumnDefinitions = (definition: string) => {
        const columns: Array<{ name: string; type: string }> = [];
        let depth = 0;
        let buffer = "";
        for (let i = 0; i < definition.length; i += 1) {
          const char = definition[i];
          if (char === "(") {
            depth += 1;
            buffer += char;
            continue;
          }
          if (char === ")") {
            depth -= 1;
            buffer += char;
            continue;
          }
          if (char === "," && depth === 0) {
            if (buffer.trim().length > 0) {
              const tokens = buffer.trim().split(/\s+/);
              if (tokens.length >= 1) {
                columns.push({
                  name: tokens[0].replace(/[`"\[\]]/g, ""),
                  type: tokens.slice(1).join(" "),
                });
              }
            }
            buffer = "";
            continue;
          }
          buffer += char;
        }
        if (buffer.trim().length > 0) {
          const tokens = buffer.trim().split(/\s+/);
          if (tokens.length >= 1) {
            columns.push({
              name: tokens[0].replace(/[`"\[\]]/g, ""),
              type: tokens.slice(1).join(" "),
            });
          }
        }
        return columns;
      };

      const executeSqlBlock = async (
        sql?: string,
        options?: { onPreparedStatement?: (statement: string) => void },
      ) => {
        if (!sql) {
          return;
        }
        // console.log(sql);
        const sanitized = sanitizeSql(sql);
        const lines = sanitized.split("\n");
        const buffer: string[] = [];
        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (/^(\/\/|--)\s*@DATA_CREATION/i.test(trimmed)) {
            continue;
          }
          buffer.push(rawLine);
        }
        const filteredSql = buffer.join("\n");

        for (const statement of splitSqlStatements(filteredSql)) {
          if (cancelled) {
            return;
          }
          const trimmedStatement = statement.trim();
          const { statement: sanitizedStatement, skipStatement } = sanitizeInsertValuesClause(
            trimmedStatement,
          );
          if (skipStatement) {
            continue;
          }

          const preparedStatement = (sanitizedStatement ?? trimmedStatement).trim();
          const isSqlLike = /^(with|drop|create|insert|update|delete|merge|select|pragma|copy|vacuum)\b/i.test(
            preparedStatement,
          );
          if (!isSqlLike) {
            continue;
          }

          const normalized = preparedStatement.replace(/\s+/g, " ").trim().toLowerCase();
          if (!normalized || executedStatements.has(normalized)) {
            continue;
          }

          validateSqlStatement(preparedStatement);

          const createTargetIdentifier = extractCreateTableIdentifier(preparedStatement);
          const canonicalTarget = canonicalizeIdentifier(createTargetIdentifier);
          if (canonicalTarget && knownTables.has(canonicalTarget.key)) {
            await executeDuckDbQuery(
              `DROP TABLE IF EXISTS ${canonicalTarget.formatted} CASCADE`,
            );
            knownTables.delete(canonicalTarget.key);
          }
          options?.onPreparedStatement?.(preparedStatement);
          const result = await executeDuckDbQuery(preparedStatement);
          if (!result.success) {
            console.warn("DuckDB statement skipped because validation failed:", {
              error: result.error,
              statement: preparedStatement,
            });
            continue;
          }

          executedStatements.add(normalized);
          if (canonicalTarget) {
            knownTables.add(canonicalTarget.key);
          }
        }
      };

      setIsPreparingDuckDb(true);
      setDuckDbSetupError(null);
      if (questionChangedForRun) {
        setSqlResults([]);
        setSqlError('');
      }
      setDuckDbDatasetTables({});

      try {
        await resetDatabase();
        if (cancelled) {
          return;
        }

        let currentTables = await fetchCurrentTables();
        knownTables.clear();
        currentTables.forEach((tableName) => {
          const canonical = canonicalizeIdentifier(tableName);
          if (canonical) {
            knownTables.add(canonical.key);
          }
        });
        const datasetTableMap: Record<string, string[]> = {};

        for (const dataset of duckDbDatasets) {
          if (cancelled) {
            return;
          }

        const beforeTables = new Set(currentTables);
        const creationSql = normalizeCreationSql(dataset.creation_sql);
        const datasetSubjectType = resolveDatasetLanguage(
          dataset.subject_type,
          dataset.type,
          dataset.question_type,
        );

        const resolveDatasetRows = (): Record<string, unknown>[] => {
          if (Array.isArray(dataset.data) && dataset.data.length > 0) {
            return dataset.data as Record<string, unknown>[];
          }
          if (
            Array.isArray((dataset as Record<string, unknown>)?.dataset_rows) &&
            ((dataset as Record<string, unknown>)?.dataset_rows as unknown[]).length > 0
          ) {
            return ((dataset as Record<string, unknown>)?.dataset_rows as Record<string, unknown>[]) ?? [];
          }
          const csvCandidate = coalesceString(
            typeof dataset.dataset_csv_raw === "string" ? dataset.dataset_csv_raw : undefined,
            typeof (dataset as Record<string, unknown>)["csv"] === "string"
              ? ((dataset as Record<string, unknown>)["csv"] as string)
              : undefined,
          );
          if (csvCandidate && csvCandidate.trim().length > 0) {
            return parseCsvToObjects(csvCandidate);
          }
          return [];
        };

        const datasetRowObjects = resolveDatasetRows();

        const resolveDatasetColumns = (rows: Record<string, unknown>[]): string[] | undefined => {
          if (Array.isArray(dataset.columns) && dataset.columns.length > 0) {
            return dataset.columns as string[];
          }
          if (rows.length > 0) {
            return Object.keys(rows[0]);
          }
          return undefined;
        };
        const datasetColumnList = resolveDatasetColumns(datasetRowObjects);
        const hasStructuredRows = datasetRowObjects.length > 0 && !!datasetColumnList?.length;
        const allowStructuredFallback = datasetSubjectType === "google_sheets" || hasStructuredRows;
          const datasetKey =
            dataset.cacheKey ??
            deriveDatasetKey({
              id: dataset.id,
              table_name: dataset.table_name,
              creation_sql: creationSql,
            });
          const sanitizedStatementsForDataset: string[] = [];

          let datasetLoadedViaSql = false;
          let lastSqlError: unknown = null;

          if (creationSql) {
            try {
              await executeSqlBlock(creationSql, {
                onPreparedStatement: (preparedStatement) => {
                  sanitizedStatementsForDataset.push(preparedStatement);
                },
              });
              datasetLoadedViaSql = true;
            } catch (err) {
              lastSqlError = err;
              if (!allowStructuredFallback) {
                throw err;
              }
              console.warn("[DuckDB] Creation SQL failed, falling back to CSV load:", err);
            }
          }

          if (datasetLoadedViaSql && datasetKey && sanitizedStatementsForDataset.length > 0) {
            const sanitizedSql = sanitizedStatementsForDataset.join(";\n");
            setSanitizedCreationSqlByDataset((prev) => ({
              ...prev,
              [datasetKey]: sanitizedSql,
            }));
          }

          if (!datasetLoadedViaSql) {
            if (allowStructuredFallback) {
              const fallbackTableName =
                (typeof dataset.table_name === "string" && dataset.table_name.trim().length > 0
                  ? dataset.table_name
                  : undefined) ??
                (typeof dataset.name === "string" && dataset.name.trim().length > 0
                  ? dataset.name
                  : undefined) ??
                `dataset_${dataset.id ?? Math.random().toString(36).slice(2)}`;

              if (
                fallbackTableName &&
                datasetRowObjects.length > 0 &&
                datasetColumnList &&
                datasetColumnList.length > 0
              ) {
                const loaded = await loadDuckDbDataset(fallbackTableName, datasetRowObjects, datasetColumnList);
                if (!loaded) {
                  throw new Error(`Failed to load dataset ${fallbackTableName} from structured fallback`);
                }
                dataset.table_name = fallbackTableName;
                const canonical = canonicalizeIdentifier(fallbackTableName);
                if (canonical) {
                  knownTables.add(canonical.key);
                }
              } else {
                const rootError =
                  lastSqlError instanceof Error
                    ? lastSqlError
                    : new Error("Dataset missing structured rows for DuckDB load.");
                throw rootError;
              }
            } else {
              throw (
                lastSqlError instanceof Error
                  ? lastSqlError
                  : new Error("Failed to execute dataset creation SQL.")
              );
            }
          }

          currentTables = await fetchCurrentTables();
          if (cancelled) {
            return;
          }
          knownTables.clear();
          currentTables.forEach((tableName) => {
            const canonical = canonicalizeIdentifier(tableName);
            if (canonical) {
              knownTables.add(canonical.key);
            }
          });
          if (datasetKey) {
            const newTables = currentTables.filter((table) => !beforeTables.has(table));
            const fallbackTables =
              newTables.length > 0
                ? newTables
                : dataset.table_name && currentTables.includes(dataset.table_name)
                ? [dataset.table_name]
                : [];
            const expectedTables = creationSql ? extractTableNamesFromSql(creationSql) : [];
            const combinedTables = new Set<string>(datasetTableMap[datasetKey] ?? []);

            for (const tableName of [...newTables, ...fallbackTables, ...expectedTables]) {
              if (typeof tableName === "string" && tableName.trim().length > 0) {
                combinedTables.add(tableName);
              }
            }

            if (combinedTables.size > 0) {
              datasetTableMap[datasetKey] = Array.from(combinedTables);
            }
          }
        }

        if (!cancelled) {
          setDuckDbDatasetTables(datasetTableMap);
          setDuckDbTables(currentTables);
        }

        // console.log("[DuckDB] Datasets ready.");
      } catch (error) {
        console.error("[DuckDB] Failed to prepare datasets:", error);
        if (!cancelled) {
          setDuckDbTables([]);
          // setDuckDbSetupError(
          //   error instanceof Error ? error.message : "Failed to prepare SQL datasets",
          // );
        }
      } finally {
        if (!cancelled) {
          setIsPreparingDuckDb(false);
          preparedPopupQuestionRef.current = activePopupQuestionId;
        }
      }
    };

    prepareDatasets();

    return () => {
      cancelled = true;
    };
  }, [
    cachedWorkspaceRun,
    duckDbDatasets,
    datasetLoadSignature,
    executeDuckDbQuery,
    loadDuckDbDataset,
    isDuckDbReady,
    activePopupQuestionId,
    selectedQuestionType,
    shouldUseDuckDb,
    isRequestingWorkspaceHint,
  ]);

  useEffect(() => {
    if (!shouldUseDuckDb || !isDuckDbReady || !Object.keys(duckDbDatasetTables).length) {
      return;
    }

    let cancelled = false;

    const escapeIdentifier = (value: string) => value.replace(/"/g, '""');

    const fetchDerivedTables = async () => {
      const updates: Record<string, SqlDerivedTable[]> = {};

      for (const [datasetKey, tableNames] of Object.entries(duckDbDatasetTables)) {
        if (cancelled || !Array.isArray(tableNames) || tableNames.length === 0) {
          continue;
        }

        const existing = sqlDerivedTablesRef.current[datasetKey] ?? [];

        for (const tableName of tableNames) {
          if (existing.some((entry) => entry.tableName === tableName)) {
            continue;
          }

          try {
            const escaped = escapeIdentifier(tableName);
            const result = await executeDuckDbQuery(`SELECT * FROM "${escaped}";`);
            if (!result.success || !result.result) {
              continue;
            }

            const columns = result.result.columns ?? [];
            const rows = Array.isArray(result.result.rows) ? result.result.rows : [];

            const mappedRows = rows.map((row) => {
              const record: Record<string, unknown> = {};
              if (Array.isArray(row)) {
                columns.forEach((column, columnIndex) => {
                  record[column] = row[columnIndex];
                });
              } else if (row && typeof row === "object") {
                columns.forEach((column) => {
                  record[column] = (row as Record<string, unknown>)[column];
                });
              }
              return record;
            });

            if (!updates[datasetKey]) {
              updates[datasetKey] = [];
            }

            updates[datasetKey].push({
              tableName,
              columns,
              rows: mappedRows,
            });
          } catch (error) {
            console.error("Failed to collect SQL-derived table rows:", error);
          }
        }
      }

      if (cancelled || !Object.keys(updates).length) {
        return;
      }

      setSqlDerivedTables((prev) => {
        const merged = { ...prev };
        for (const [key, entries] of Object.entries(updates)) {
          const existingEntries = merged[key] ?? [];
          const unique = new Map(existingEntries.map((entry) => [entry.tableName, entry]));
          entries.forEach((entry) => unique.set(entry.tableName, entry));
          merged[key] = Array.from(unique.values());
        }
        return merged;
      });
    };

    fetchDerivedTables();

    return () => {
      cancelled = true;
    };
  }, [
    duckDbDatasetTables,
    executeDuckDbQuery,
    isDuckDbReady,
    shouldUseDuckDb,
  ]);

  useEffect(() => {
    // console.log('[AUTO-SELECT DEBUG] Effect triggered:', {
    //   resourceKind: selectedResource?.kind,
    //   activeExercise: activeExercise ? {
    //     id: activeExercise.id,
    //     title: activeExercise.title,
    //     hasQuestions: activeExercise.section_exercise_questions?.length || activeExercise.questions?.length || 0
    //   } : null,
    //   selectedQuestionForPopup: selectedQuestionForPopup?.id,
    // });

    if (selectedResource?.kind !== "exercise") {
      // console.log('[AUTO-SELECT DEBUG] Not exercise kind, returning');
      return;
    }

    if (!activeExercise) {
      // console.log('[AUTO-SELECT DEBUG] No active exercise, clearing selection');
      setSelectedQuestionForPopup(null);
      return;
    }

    const questions =
      (Array.isArray(activeExercise.section_exercise_questions) && activeExercise.section_exercise_questions.length > 0
        ? activeExercise.section_exercise_questions
        : activeExercise.questions) || [];

    // console.log('[AUTO-SELECT DEBUG] Questions found:', questions.length, questions);

    const currentExerciseId =
      selectedQuestionForPopup && "exerciseId" in selectedQuestionForPopup
        ? String((selectedQuestionForPopup as any).exerciseId)
        : null;
    const activeExerciseId = activeExercise?.id ? String(activeExercise.id) : null;

    if (!questions.length) {
      // console.log('[AUTO-SELECT DEBUG] No questions, clearing selection');
      if (currentExerciseId && activeExerciseId && currentExerciseId === activeExerciseId) {
        return;
      }
      setSelectedQuestionForPopup(null);
      return;
    }

    const currentQuestionId = selectedQuestionForPopup?.id;
    const hasCurrentSelection =
      currentQuestionId && currentExerciseId && activeExerciseId && currentExerciseId === activeExerciseId
        ? questions.some((q: any) => String(q.id) === String(currentQuestionId))
        : false;

    if (hasCurrentSelection) {
      // console.log('[AUTO-SELECT DEBUG] Has current selection, keeping it');
      return;
    }

    const firstQuestion = questions[0];
    // console.log('[AUTO-SELECT DEBUG] Setting first question:', firstQuestion);
    const exerciseDatasetType = resolveDatasetLanguage(
      activeExercise?.subject_type,
      activeExercise?.exercise_type,
      activeExercise?.practice_type,
      activeExercise?.type,
    );
    setActiveExerciseQuestion(
      {
        ...firstQuestion,
        exerciseId: activeExercise.id ? String(activeExercise.id) : null,
        exerciseTitle: activeExercise.title,
        exerciseDescription: activeExercise.description,
        exerciseDataset: normalizeCreationSql(activeExercise.dataset, {
          datasetType: exerciseDatasetType,
        }),
      },
      0,
    );
  }, [
    selectedResource?.kind,
    activeExercise,
    selectedQuestionForPopup,
    sectionExercises, // Add this dependency so useEffect runs when exercises are loaded
    activeExerciseQuestions,
    setActiveExerciseQuestion,
  ]);

  // Check if current lecture content is a video
  const isLectureVideo = useMemo(() => {
    if (!lectureContent) return false;

    const trimmed = lectureContent.trim();

    try {
      const url = new URL(trimmed);
      const lower = url.pathname.toLowerCase();

      return (
        url.hostname.includes("mediadelivery.net") ||
        lower.endsWith(".mp4") ||
        lower.endsWith(".webm") ||
        lower.endsWith(".ogg")
      );
    } catch {
      return false;
    }
  }, [lectureContent]);

  useEffect(() => {
    if (selectedResource?.kind === "lecture" && selectedResource.resourceId && isLectureVideo) {
      setLectureVideoReady(false);
      setLectureAutoPlayPending(true);
      syncPlayState(false);
      syncVideoTime(0);
      updateCurrentTime(0);
      updateDuration(0);
    } else {
      setLectureAutoPlayPending(false);
      setLectureVideoReady(true);
    }
  }, [
    selectedResource?.kind,
    selectedResource?.resourceId,
    isLectureVideo,
    syncPlayState,
    syncVideoTime,
    updateCurrentTime,
    updateDuration,
  ]);

  useEffect(() => {
    if (lectureVideoReady && lectureAutoPlayPending) {
      setLectureAutoPlayPending(false);
      syncPlayState(true);
    }
  }, [lectureVideoReady, lectureAutoPlayPending, syncPlayState]);

  // Scroll detection for floating video player
  useEffect(() => {
    if (!isLectureVideo || !lectureContent) {
      // console.log('Floating player: Not a video or no content', { isLectureVideo, lectureContent });
      return;
    }

    const checkFloatingPlayer = () => {
      if (!videoContainerRef.current) {
        // console.log('Floating player: No video container ref');
        return;
      }

      // Skip scroll detection when floating player is already shown to prevent flickering
      if (showFloatingPlayer) {
        // Only hide if main video gets focused (user clicked back to main area)
        if (isMainVideoFocused) {
          // console.log('Hiding floating player - main video focused');
          setShowFloatingPlayer(false);
          setIsFloatingPlayerManuallyClosed(false);
        }
        return;
      }

      const rect = videoContainerRef.current.getBoundingClientRect();
      const isVideoOutOfView = rect.bottom < 0 || rect.top > window.innerHeight;

      // console.log('Floating player scroll check:', {
      //   isVideoOutOfView,
      //   isVideoFocused: isMainVideoFocused,
      //   rectBottom: rect.bottom,
      //   rectTop: rect.top,
      //   windowHeight: window.innerHeight,
      //   showFloatingPlayer
      // });

      // Show floating player when video goes out of view AND main video is not focused AND not manually closed
      if (isVideoOutOfView && !isMainVideoFocused && !isFloatingPlayerManuallyClosed) {
        // console.log('Showing floating player - video out of view and not focused');
        // No need to manage video state since it's the same video element
        setShowFloatingPlayer(true);
      }
    };

    const handleScroll = () => {
      if (scrollThrottleRef.current) return;
      
      scrollThrottleRef.current = setTimeout(() => {
        checkFloatingPlayer();
        scrollThrottleRef.current = null;
      }, 100);
    };

    // Initial check on mount
    checkFloatingPlayer();

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', checkFloatingPlayer);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', checkFloatingPlayer);
    };

  }, [isLectureVideo, lectureContent, isMainVideoFocused, showFloatingPlayer, activeLecture?.title, selectedSection?.title]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (videoFocusTimeoutRef.current) {
        clearTimeout(videoFocusTimeoutRef.current);
      }
      if (scrollThrottleRef.current) {
        clearTimeout(scrollThrottleRef.current);
      }
      if (manualCloseTimeoutRef.current) {
        clearTimeout(manualCloseTimeoutRef.current);
      }
    };
  }, []);

  // Handle floating video player actions
  const handleCloseFloatingPlayer = useCallback(() => {
    setShowFloatingPlayer(false);
    setIsFloatingPlayerManuallyClosed(true);
    
    // No need to manage video state since it's the same video element
    
    // Clear any existing timeout
    if (manualCloseTimeoutRef.current) {
      clearTimeout(manualCloseTimeoutRef.current);
    }
    
    // Reset manual close flag after 3 seconds to allow automatic reopening
    manualCloseTimeoutRef.current = setTimeout(() => {
      setIsFloatingPlayerManuallyClosed(false);
    }, 3000);
  }, []);

  const handleExpandFloatingPlayer = useCallback(() => {
    setShowFloatingPlayer(false);
    setIsFloatingPlayerManuallyClosed(false); // Reset manual close flag since user is returning to main video
    if (videoContainerRef.current) {
      videoContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // No need to manage video state since it's the same video element
    
    // Clear any existing manual close timeout
    if (manualCloseTimeoutRef.current) {
      clearTimeout(manualCloseTimeoutRef.current);
    }
  }, []);

  // Removed handleFloatingVideoTimeUpdate and handleFloatingVideoPlayStateChange 
  // since we're now using the same video element that pops out

  const activeQuiz = useMemo(() => {

    if (

      !selectedSection ||

      !selectedResource ||

      selectedResource.kind !== "quiz" ||

      selectedResource.sectionId !== selectedSection.id

    ) {

      return null;

    }

    // Use loaded quiz if available, otherwise fall back to section data
    if (loadedQuiz && loadedQuiz.id === selectedResource.resourceId) {
      return loadedQuiz;
    }

    const quizzes = getQuizzes(selectedSection);

    if (!quizzes.length) return null;

    if (!selectedResource.resourceId) return quizzes[0];

    return quizzes.find((quiz) => quiz.id === selectedResource.resourceId) || quizzes[0];

  }, [selectedResource, selectedSection, loadedQuiz]);

  const activeQuizDifficulty = useMemo<GamificationDifficulty>(() => {
    const normalized = normalizeQuizDifficultyValue(activeQuiz?.difficulty);
    return normalized ?? "medium";
  }, [activeQuiz?.difficulty]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const quizSource = loadedQuiz ?? activeQuiz;
    if (!quizSource || !Array.isArray(quizSource.quiz_questions)) {
      return;
    }
    const missingIds = quizSource.quiz_questions
      .map((question) =>
        question && question.id !== undefined && question.id !== null
          ? String(question.id)
          : null,
      )
      .filter(
        (questionId): questionId is string =>
          Boolean(questionId) && !quizCorrectAnswers[questionId],
      );
    if (!missingIds.length) {
      return;
    }
    fetchQuizAnswers(missingIds);
  }, [loadedQuiz, activeQuiz, quizCorrectAnswers, fetchQuizAnswers, isAuthenticated]);

  const recordSectionQuizQuestionAttempt = useCallback(
    async (question: QuizQuestion | undefined, fallbackKey: string, isCorrect: boolean) => {
      if (!isAuthenticated) {
        return;
      }
      const questionKey =
        question && question.id !== undefined && question.id !== null
          ? String(question.id)
          : fallbackKey;
      if (!questionKey) {
        return;
      }
      if (quizQuestionGamificationLogged[questionKey]) {
        return;
      }
      setQuizQuestionGamificationLogged((prev) => ({
        ...prev,
        [questionKey]: true,
      }));
      try {
        await recordQuestionAttempt({
          questionId: questionKey,
          questionType: "quiz",
          difficulty: resolveQuizQuestionDifficulty(question, activeQuizDifficulty),
          isCorrect,
        });
      } catch (error) {
        console.error("Failed to record quiz question attempt:", error);
        setQuizQuestionGamificationLogged((prev) => {
          const next = { ...prev };
          delete next[questionKey];
          return next;
        });
      }
    },
    [activeQuizDifficulty, isAuthenticated, quizQuestionGamificationLogged],
  );

  const computedQuizSummary = useMemo<QuizSummaryResult | null>(() => {
    if (!quizSubmitted) {
      return null;
    }
    return buildQuizSummarySnapshot(loadedQuiz ?? activeQuiz ?? null, quizAnswers);
  }, [quizSubmitted, quizAnswers, activeQuiz, loadedQuiz, buildQuizSummarySnapshot]);

  useEffect(() => {
    if (quizSubmitted && computedQuizSummary) {
      setQuizSummarySnapshot(computedQuizSummary);
      setQuizSummaryOpen(true);
      if (selectedSection?.id) {
        setSectionQuizSummaries((prev) => ({
          ...prev,
          [selectedSection.id]: computedQuizSummary,
        }));
      }
    }
  }, [quizSubmitted, computedQuizSummary, selectedSection?.id]);

  const quizSummary = quizSummarySnapshot ?? computedQuizSummary;

  const lectureNode = useMemo(() => {

    if (!lectureContent) {

      return (

        <div className="w-full h-full flex items-center justify-center text-sm text-white/70">

          Lecture content coming soon.

        </div>

      );

    }

    const txt = lectureContent.trim();

    try {

      const url = new URL(txt);

      const lower = url.pathname.toLowerCase();

      if (url.hostname.includes("mediadelivery.net")) {

        return (
          <VideoPlayer
            src={txt}
            className="h-full w-full object-cover"
            onTimeUpdate={updateCurrentTime}
            onPlayStateChange={updatePlayState}
            onDurationChange={updateDuration}
            onVideoRef={handleVideoRef}
            currentTime={videoState.currentTime}
            shouldPlay={videoState.isPlaying}
            onReadyToPlay={handleLectureReady}
            disableNativeFullscreen
          />
        );

      }

      if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".ogg")) {

        return (
          <VideoPlayer
            src={txt}
            className="h-full w-full object-cover"
            onTimeUpdate={updateCurrentTime}
            onPlayStateChange={updatePlayState}
            onDurationChange={updateDuration}
            onVideoRef={handleVideoRef}
            currentTime={videoState.currentTime}
            shouldPlay={videoState.isPlaying}
            onReadyToPlay={handleLectureReady}
            disableNativeFullscreen
          />
        );

      }

      if (

        lower.endsWith(".png") ||

        lower.endsWith(".jpg") ||

        lower.endsWith(".jpeg") ||

        lower.endsWith(".gif") ||

        lower.endsWith(".webp")

      ) {

        return <img src={txt} alt="Learning Material" className="max-h-full object-contain rounded-lg" />;

      }

      if (lower.endsWith(".pdf")) {

        return <iframe src={txt} className="w-full h-full rounded-lg" />;

      }

      return (

        <a href={txt} target="_blank" className="text-xs underline text-blue-600 hover:text-blue-800">

          Open resource

        </a>

      );

    } catch {

      return (

        <div className="w-full h-full p-8 text-gray-800 overflow-auto bg-white rounded-lg">

          <div className="max-w-4xl mx-auto prose prose-lg">

            <div

              className="whitespace-pre-wrap leading-relaxed"

              dangerouslySetInnerHTML={{

                __html: txt

                  .replace(/^# (.*$)/gm, '<h1 class="text-3xl font-bold text-gray-900 mb-4 mt-8">$1</h1>')

                  .replace(/^## (.*$)/gm, '<h2 class="text-2xl font-semibold text-gray-800 mb-3 mt-6">$1</h2>')

                  .replace(/^### (.*$)/gm, '<h3 class="text-xl font-medium text-gray-700 mb-2 mt-4">$1</h3>')

                  .replace(/^-\s+(.*$)/gm, '<li class="ml-4 list-disc">$1</li>')

                  .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 list-decimal">$2</li>')

                  .replace(

                    /\`\`\`sql([\s\S]*?)\`\`\`/g,

                    '<pre class="bg-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto"><code class="language-sql">$1</code></pre>'

                  )

                  .replace(

                    /\`\`\`([\s\S]*?)\`\`\`/g,

                    '<pre class="bg-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto"><code>$1</code></pre>'

                  )

                  .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-2 py-1 rounded font-mono text-sm">$1</code>')

              }}

            />

          </div>

        </div>

      );

    }

  }, [lectureContent]);

  const currentSectionIndex = Math.max(0, allSections.findIndex((section) => section.id === selectedSectionId));

  const currentResourceLabel = useMemo(() => {

    if (!selectedResource) return "Lesson Overview";

    if (selectedResource.kind === "lecture") {

      return activeLecture?.title || resourceLabels.lecture;

    }

    if (selectedResource.kind === "exercise") {

      return activeExercise?.title || resourceLabels.exercise;

    }

    if (selectedResource.kind === "quiz") {

      return activeQuiz?.title || resourceLabels.quiz;

    }

    return resourceLabels[selectedResource.kind];

  }, [selectedResource, activeLecture, activeExercise, activeQuiz]);

    const buildResourceList = (section: Section) => {
      const resources: Array<{ kind: ResourceKind; resourceId: string }> = [];
      const sectionLectures = getLectures(section);
      sectionLectures.forEach((lecture, index) => {
        resources.push({
          kind: "lecture",
          resourceId: getLectureKey(lecture, section.id ?? null, index),
        });
      });

      const sectionQuizzes = getQuizzes(section);
      sectionQuizzes.forEach((quiz) => {
        if (quiz.id) {
          resources.push({
            kind: "quiz",
            resourceId: quiz.id,
          });
        }
      });

      const sectionAdaptiveQuizzes = getAdaptiveQuizzes(section);
      sectionAdaptiveQuizzes.forEach((adaptiveQuiz) => {
        resources.push({
          kind: "adaptive_quiz",
          resourceId: adaptiveQuiz.id,
        });
      });

      const sectionExercises = getExercises(section);
      sectionExercises.forEach((exercise) => {
        if (exercise.id) {
          resources.push({
            kind: "exercise",
            resourceId: exercise.id,
          });
        }
      });

      return resources;
    };

    const goToAdjacentLecture = (direction: -1 | 1) => {
      if (!selectedResource || !selectedSection) return;

      const lecturesInSection = getLectures(selectedSection);

      const lectureIndex = lectureSelection?.index ?? -1;
      const isLectureResource = selectedResource.kind === "lecture" && lectureIndex >= 0;
      const isLastLecture =
        isLectureResource &&
        lecturesInSection.length > 0 &&
        lectureIndex === lecturesInSection.length - 1;

      const adaptiveStatus = selectedSection ? activeSectionQuizzes[selectedSection.id] : undefined;
      const hasActiveAdaptiveQuiz = Boolean(adaptiveStatus?.hasActiveQuiz);
      const shouldResumeAdaptive =
        direction === 1 &&
        isLastLecture &&
        hasActiveAdaptiveQuiz &&
        !isAdaptiveQuizMode;

      if (shouldResumeAdaptive) {
        void handleStartAdaptiveQuiz(selectedSection);
        return;
      }

      const runningQuizResourceId = quizSession?.currentQuizId ?? null;
      const sectionId = selectedSection.id;
      const quizAlreadyCompleted = Boolean(completedSectionQuizzes[sectionId]);
      const viewingQuizSummary =
        quizSummaryOpen && quizSummarySectionId === sectionId;
      const shouldResumeQuizRunner =
        direction === 1 &&
        isLastLecture &&
        isQuizRunnerMode &&
        selectedSectionId === sectionId &&
        typeof runningQuizResourceId === "string";

      if (shouldResumeQuizRunner) {
        const storedQuiz =
          quizSession?.quizzes?.find((quiz) => quiz.id === runningQuizResourceId) ??
          (sectionQuizzes[sectionId] || []).find((quiz) => quiz.id === runningQuizResourceId);
        setLoadedQuiz(storedQuiz ?? null);
        setQuizSummaryOpen(false);
        setSelectedResource({
          sectionId,
          kind: "quiz",
          resourceId: runningQuizResourceId,
        });
        setQuizSession((prev) =>
          prev
            ? {
                ...prev,
                currentQuizId: runningQuizResourceId,
              }
            : prev,
        );
        setIsQuizRunnerMode(true);
        return;
      }

      const shouldStartQuizRunner =
        direction === 1 &&
        isLastLecture &&
        !hasActiveAdaptiveQuiz &&
        selectedSectionId === sectionId &&
        !isQuizRunnerMode &&
        !quizRunnerLoading[sectionId] &&
        !quizAlreadyCompleted &&
        !viewingQuizSummary;

      if (shouldStartQuizRunner) {
        void handleStartQuizRunner(selectedSection);
        return;
      }

      const currentResourceList = buildResourceList(selectedSection);

      const currentIndex = currentResourceList.findIndex(
        (r) => r.kind === selectedResource.kind && r.resourceId === selectedResource.resourceId,
      );

      const nextIndexInSection = currentIndex + direction;

      if (nextIndexInSection >= 0 && nextIndexInSection < currentResourceList.length) {
        const nextResource = currentResourceList[nextIndexInSection];
        setSelectedResource({
          sectionId: selectedSection.id,
          kind: nextResource.kind,
          resourceId: nextResource.resourceId,
        });
        return;
      }

      const targetSectionIndex = currentSectionIndex + direction;

      if (targetSectionIndex >= 0 && targetSectionIndex < allSections.length) {
        const targetSection = allSections[targetSectionIndex];
        setSelectedSectionId(targetSection.id);
        const fallback = getDefaultResource(targetSection as Section);
        setSelectedResource(fallback ?? null);
      }
    };

    const handlePrevResource = () => goToAdjacentLecture(-1);
    const handleNextResource = () => goToAdjacentLecture(1);
    const canJumpNextSection = currentSectionIndex < allSections.length - 1;
    const handleJumpToNextSection = () => {
      if (!canJumpNextSection) {
        return;
      }
      const nextSection = allSections[currentSectionIndex + 1];
      setSelectedSectionId(nextSection.id);
      setSelectedResource(getDefaultResource(nextSection as Section) ?? null);
    };
    const handleAdvanceFromPractice = useCallback(() => {
      if (!selectedSection) {
        resetPracticeState();
        return;
      }

      const currentExerciseId =
        (selectedPracticeExercise && selectedPracticeExercise.id) ||
        (activeExercise && activeExercise.id) ||
        null;

      const resources = buildResourceList(selectedSection);
      let nextSelection: SelectedResource | null = null;

      if (currentExerciseId) {
        const currentIndex = resources.findIndex(
          (r) => r.kind === "exercise" && r.resourceId === String(currentExerciseId),
        );
        if (currentIndex >= 0 && currentIndex < resources.length - 1) {
          const nextResource = resources[currentIndex + 1];
          nextSelection = {
            sectionId: selectedSection.id,
            kind: nextResource.kind,
            resourceId: nextResource.resourceId,
          };
        }
      }

      if (!nextSelection && currentSectionIndex < allSections.length - 1) {
        const nextSection = allSections[currentSectionIndex + 1];
        const fallback = getDefaultResource(nextSection as Section);
        if (fallback) {
          nextSelection = {
            sectionId: nextSection.id,
            kind: fallback.kind,
            resourceId: fallback.resourceId,
          };
        }
      }

      resetPracticeState();

      if (nextSelection) {
        setSelectedSectionId(nextSelection.sectionId);
        setSelectedResource(nextSelection);
      }
    }, [
      selectedSection,
      selectedPracticeExercise,
      activeExercise,
      buildResourceList,
      currentSectionIndex,
      allSections,
      getDefaultResource,
      resetPracticeState,
    ]);
    const renderLectureDisplay = () => {
      if (!selectedSection || selectedResource?.kind !== "lecture" || !activeLecture) {
        return null;
      }

      const lectures = getLectures(selectedSection);

      const totalLecturesInSection = Math.max(lectures.length, 1);

      const lectureNumber = (lectureSelection?.index ?? 0) + 1;

      const allResourcesInSection = buildResourceList(selectedSection);
      const currentResourceIndex = allResourcesInSection.findIndex(
        (r) => r.kind === selectedResource?.kind && r.resourceId === selectedResource?.resourceId,
      );

      const canGoPrev = currentResourceIndex > 0 || currentSectionIndex > 0;

      const canGoNext =
        currentResourceIndex < allResourcesInSection.length - 1 || currentSectionIndex < allSections.length - 1;

    const lectureMeta = `${lectureNumber} of ${totalLecturesInSection} in this section`;

    const lessonMeta = `Lesson ${currentSectionIndex + 1} of ${totalSections}`;

    const sectionSummary =

      typeof selectedSection.overview === "string" && selectedSection.overview.trim() !== ""

        ? selectedSection.overview.trim()

        : "Keep the momentum going and continue exploring the curriculum.";

    const sectionSummaryClean = sectionSummary.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (isLectureVideo) {

      return (

        <div className="overflow-hidden rounded-3xl border border-white/70 bg-white shadow-xl">

          <div className="relative bg-slate-950 text-white">
            <div className="pointer-events-auto absolute right-4 top-4 z-30 flex items-center gap-2">
              <button
                type="button"
                onClick={handleFullscreenToggle}
                className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/30 backdrop-blur transition hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                aria-pressed={isVideoFullscreen}
                aria-label={isVideoFullscreen ? "Exit full screen" : "Enter full screen"}
              >
                {isVideoFullscreen ? (
                  <>
                    <Minimize2 className="h-4 w-4" />
                    Exit Fullscreen
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-4 w-4 text-black/50" />
                   <span className="text-black/50"> Fullscreen </span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleNextResource}
                disabled={!canGoNext}
                className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/30 backdrop-blur transition hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                aria-label="Next resource"
              >
                <span className="text-black/50">Next</span>
                <ChevronRight className="h-4 w-4 text-black/50" />
              </button>
            </div>

            {isVideoFullscreen && (
              <div className="pointer-events-auto absolute left-4 bottom-4 z-30 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleNextResource}
                  disabled={!canGoNext}
                  className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/30 disabled:border-white/20 disabled:bg-white/10 disabled:text-white/60"
                >
                  Next Lecture
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleJumpToNextSection}
                  disabled={!canJumpNextSection}
                  className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/30 disabled:border-white/20 disabled:bg-white/10 disabled:text-white/60"
                >
                  Next Section
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div 
              ref={videoContainerRef} 
              data-xp-celebration-surface=""
              className={`relative transition-all duration-300 ${
                showFloatingPlayer 
                  ? "fixed z-50 bg-black rounded-lg shadow-2xl border border-gray-700 overflow-hidden" 
                  : "aspect-video w-full"
              }`}
              style={showFloatingPlayer ? {
                width: '320px',
                height: '180px',
                position: 'fixed',
                right: '20px',
                bottom: '20px',
                zIndex: 9999
              } : {}}
              onMouseEnter={handleVideoContainerMouseEnter}
              onMouseLeave={handleVideoContainerMouseLeave}
              onClick={handleVideoContainerClick}
              onDoubleClick={handleFullscreenToggle}
            >

              {/* Floating player header */}
              {showFloatingPlayer && (
                <div className="bg-gray-900 px-3 py-2 flex items-center justify-between cursor-move">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">
                      {activeLecture?.title || selectedSection?.title || "Video Player"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={handleExpandFloatingPlayer}
                      className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                      title="Expand to main view"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    </button>
                    <button
                      onClick={handleCloseFloatingPlayer}
                      className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                      title="Close floating player"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              <div className={`${showFloatingPlayer ? 'h-full' : 'absolute inset-0'}`}>{lectureNode}</div>
              {!showFloatingPlayer && (
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col p-3 sm:p-4">
                  {isVideoFullscreen && (
                    <div className="max-w-xs rounded-2xl bg-white/10 px-4 py-3 text-white shadow-[0_15px_45px_rgba(0,0,0,0.45)] backdrop-blur">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-black/50">
                        <Sparkles className="h-4 w-4 text-black/50" />
                        Total XP
                      </div>
                      <div className="mt-1 flex items-end gap-3" aria-live="polite">
                        <span className="text-3xl text-black/50 font-bold leading-none tracking-tight">
                          {typeof totalXp === "number" ? xpFormatter.format(totalXp) : "--"}
                        </span>
                        {recentXpGain ? (
                          <span className="rounded-full bg-emerald-400/90 px-3 py-1 text-sm font-semibold text-emerald-950 shadow-lg animate-bounce">
                            +{recentXpGain} XP
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-black/50">
                        {recentXpGain ? "XP added from this session!" : "Stay in full screen to keep earning."}
                      </p>
                    </div>
                  )}

                </div>
              )}
              
              {/* Test button for floating player */}
              {/* <button
                onClick={() => {
                  console.log('Manual floating player trigger', { isLectureVideo, lectureContent, isPlaying: videoState.isPlaying });
                  setWasPlayingBeforeFloating(videoState.isPlaying);
                  setShowFloatingPlayer(true);
                  setFloatingVideoSrc(lectureContent);
                  setFloatingVideoTitle(activeLecture?.title || selectedSection?.title || "Video");
                }}
                className="absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded text-xs z-10 shadow-md"
              >
                test floating
              </button> */}

              {/* Video overlay info - only show when not floating */}
              {!showFloatingPlayer && (
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-6 py-4">

                  <div>

                 

                  </div>

                <div className="hidden rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur lg:flex">

                  {/* <span>{lectureMeta}</span> */}

                  <span className="mx-2 text-white/40">|</span>

                  {/* <span>{lessonMeta}</span> */}

                </div>

                </div>
              )}


            </div>

            {showFloatingPlayer && (
              <div className="aspect-video w-full bg-slate-800 flex items-center justify-center">
                <div className="text-center text-white/70">
                  <div className="mb-2">
                    <svg className="w-12 h-12 mx-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium">Video playing in floating window</p>
                  <p className="text-xs mt-1 opacity-75">Click expand button to return here</p>
                </div>
              </div>
            )}

          </div>

          <div className="space-y-6 border-t border-slate-100 bg-white px-6 py-6">

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

              <div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">

                  <span className="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-600">

                    Section {currentSectionIndex + 1}

                  </span>

                  {lectures.length > 1 && (

                    <span className="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-600">

                      Lecture {lectureNumber}

                    </span>

                  )}

                </div>

                <h2 className="mt-3 text-lg font-semibold text-slate-900">

                  {selectedSection.title}

                </h2>

                {/* <p className="mt-1 text-sm text-slate-600">

                  {sectionSummaryClean.length > 240 ? `${sectionSummaryClean.slice(0, 240)}...` : sectionSummaryClean}

                </p> */}

              </div>

              <div className="flex items-center gap-3">

                <button

                  type="button"

                  onClick={handlePrevResource}

                  disabled={!canGoPrev}

                  className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"

                >

                  <ChevronLeft className="h-4 w-4" />

                  <span>Previous</span>

                </button>

                <button

                  type="button"

                  onClick={handleNextResource}

                  disabled={!canGoNext}

                  className="flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-200"

                >

                  <span>Next</span>

                  <ChevronRight className="h-4 w-4" />

                </button>

              </div>

            </div>

          </div>

        </div>

      );

    }

    return (

      <div className="overflow-hidden rounded-3xl border border-white/70 bg-white shadow-xl">

        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-100 via-white to-white px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Learning Material</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">{selectedSection.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{lessonMeta}</p>
            </div>
            <div className="flex items-center justify-end">
              {renderContentExpansionToggle("light")}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-6">

          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6">

            {lectureNode}

          </div>

        </div>

      </div>

    );

  };

  // const renderExerciseDisplay = () => {
  //   // Deprecated: exercise content now rendered via renderQuestionPopup('embedded').
  // };

  const renderQuizDisplay = () => {
    const renderAnswerContent = (
      text?: string,
      html?: string,
      fallback: string = 'Not provided',
    ) => {
      if (typeof html === 'string' && html.trim().length > 0) {
        return (
          <span
            className="inline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }
      if (typeof text === 'string' && text.trim().length > 0) {
        return text;
      }
      return fallback;
    };

    if (selectedResource?.kind !== "quiz") {

      return null;

    }

    // Show loading state if generation is in progress
    if (isGeneratingContentForSection) {
      return (
        <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden min-h-[460px] flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Generating quiz...</p>
          </div>
        </div>
      );
    }

    if (quizLoading) {

      return (

        <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden p-6">

          <div className="text-center text-gray-500">Loading quiz...</div>

        </div>

      );

    }

    const sectionResources = selectedSection ? buildResourceList(selectedSection) : [];
    const currentQuizResourceIndex =
      selectedResource?.kind === "quiz" && selectedResource.resourceId
        ? sectionResources.findIndex(
            (resource) =>
              resource.kind === selectedResource.kind &&
              resource.resourceId === selectedResource.resourceId,
          )
        : -1;
    const canAdvanceFromQuiz =
      currentQuizResourceIndex >= 0 &&
      (currentQuizResourceIndex < sectionResources.length - 1 ||
        currentSectionIndex < allSections.length - 1);
    const canGoPrev = currentQuizResourceIndex > 0 || currentSectionIndex > 0;
    const practiceExerciseForSection =
      selectedSectionId &&
      sectionExercises[selectedSectionId] &&
      sectionExercises[selectedSectionId].length > 0
        ? sectionExercises[selectedSectionId][0]
        : null;
    const handleGoToPracticeFromQuiz = () => {
      if (!practiceExerciseForSection || !selectedSectionId) {
        return;
      }
      handleSelectExercise(selectedSectionId, practiceExerciseForSection);
    };

    if (quizSummaryOpen && quizSummary) {
      const summaryTotalQuestions =
        quizSummary?.totalQuestions ??
        (Array.isArray(quizSummary?.responses) ? quizSummary.responses.length : 0);
      const summaryCorrectCount = quizSummary?.correctCount ?? 0;
      const summaryScorePercent =
        typeof quizSummary?.scorePercent === "number"
          ? quizSummary.scorePercent
          : summaryTotalQuestions > 0
          ? Math.round((quizScore / summaryTotalQuestions) * 100)
          : 0;

      // console.log('Rendering quiz summary', { quizSummary });
      return (
        <>
      <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Quiz Complete!</h2>
            <p className="text-sm text-gray-600 mt-1">Review your performance</p>
          </div>
          <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
            <button
              onClick={handleNextResource}
              disabled={!canAdvanceFromQuiz}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next Resource
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-6 mb-6">
              <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
                <div>
                  <div className="text-3xl font-bold text-indigo-600">{summaryTotalQuestions}</div>
                  <div className="text-sm text-gray-600 mt-1">Questions</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-green-600">{summaryCorrectCount}</div>
                  <div className="text-sm text-gray-600 mt-1">Correct</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-purple-600">{summaryScorePercent}%</div>
                  <div className="text-sm text-gray-600 mt-1">Score</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Question Review</h3>
              {(quizSummary?.responses ?? []).map((response, index) => (
                <div
                  key={response.key || index}
                  className={`border rounded-lg p-4 ${
                    response.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">Question {index + 1}</span>
                      {response.isCorrect ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                  </div>
                  <div
                    className="text-gray-800 mb-3 whitespace-pre-wrap prose prose-sm prose-slate max-w-none"
                    dangerouslySetInnerHTML={{ __html: response.questionHtml || '' }}
                  />
                  <div className="space-y-1 text-sm">
                    <div className="text-gray-600">
                      Your answer:{' '}
                      <span className={response.isCorrect ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                        {renderAnswerContent(response.userAnswer, response.userAnswerHtml, 'No answer')}
                      </span>
                    </div>
                    {!response.isCorrect && (
                      <div className="text-gray-600">
                        Correct answer:{' '}
                        <span className="text-green-700 font-medium">
                          {renderAnswerContent(response.correctAnswer, response.correctAnswerHtml)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {(practiceExerciseForSection || canAdvanceFromQuiz || canGoPrev) && (
            <div className="mt-4 px-6 pb-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePrevResource}
                disabled={!canGoPrev}
                className="flex-1 min-w-[150px] rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-slate-900 disabled:border-slate-200 disabled:text-slate-300"
              >
                Previous
              </button>
              {practiceExerciseForSection && (
                <button
                  type="button"
                  onClick={handleGoToPracticeFromQuiz}
                  className="flex-1 min-w-[180px] rounded-full bg-gradient-to-r from-green-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-green-600 hover:to-teal-600"
                >
                  Go to Practice Exercise
                </button>
              )}
              {canAdvanceFromQuiz && (
                <button
                  type="button"
                  onClick={handleNextResource}
                  className="flex-1 min-w-[150px] inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-slate-900"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </>
      );
    }

    if (!activeQuiz) {

      return (

        <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden p-6">

          <div className="text-center text-gray-500">No quiz available for this section.</div>

        </div>

      );

    }

    const questions = activeQuiz.quiz_questions || [];

    const totalQuestions = questions.length;

    if (questions.length === 0) {
      return (
        <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden p-6">
          <div className="text-center text-gray-500">No questions available for this quiz.</div>
        </div>
      );
    }

    const currentQuestion = questions[currentQuizQuestionIndex];
    const currentAnswerKey =
      (currentQuestion?.id != null ? String(currentQuestion.id) : null) ??
      currentQuizQuestionIndex.toString();
    const currentSelectedAnswer =
      quizAnswers[currentAnswerKey]?.[0] ?? '';
    const currentQuestionFeedback = questionFeedback[currentQuizQuestionIndex];
    const questionSubmitted = currentQuestionFeedback?.submitted ?? false;
    const isLastQuestion = currentQuizQuestionIndex === totalQuestions - 1;

    const handleQuestionSubmit = async () => {
      if (!currentQuestion || questionSubmitted) {
        return;
      }
      const answerKey = currentQuestion.id || currentQuizQuestionIndex.toString();
      const selectedValue = quizAnswers[answerKey]?.[0];
      if (!selectedValue) {
        return;
      }
      const correctData = await resolveCorrectAnswerForQuestion(currentQuestion);
      const comparableCorrectSource =
        correctData.text ??
        (typeof correctData.html === 'string' ? normalizeHintMessage(correctData.html) : '');
      const normalizedCorrect = normalizeAnswerValue(comparableCorrectSource);
      const normalizedSelected = normalizeAnswerValue(selectedValue);
      const userAnswerText = typeof selectedValue === 'string' ? selectedValue.trim() : '';
      const userAnswerHtml =
        userAnswerText.length > 0 ? sanitizeQuestionHTML(selectedValue) : undefined;
      const questionId =
        currentQuestion.id !== undefined && currentQuestion.id !== null
          ? String(currentQuestion.id)
          : undefined;
      const displayCorrectAnswer =
        correctData.text ??
        (typeof correctData.html === 'string'
          ? normalizeHintMessage(correctData.html)
          : '');
      const correctAnswerHtml =
        correctData.html ??
        (displayCorrectAnswer ? sanitizeQuestionHTML(displayCorrectAnswer) : undefined);
      const isCorrect =
        normalizedCorrect.length > 0 &&
        normalizedSelected.length > 0 &&
        normalizedCorrect === normalizedSelected;
      setQuestionFeedback((prev) => ({
        ...prev,
        [currentQuizQuestionIndex]: {
          submitted: true,
          isCorrect,
          questionId,
          userAnswer: userAnswerText || selectedValue,
          userAnswerHtml,
          correctAnswer: displayCorrectAnswer,
          correctAnswerHtml,
        },
      }));
      void recordSectionQuizQuestionAttempt(currentQuestion, answerKey, isCorrect);
    };

    const handleNext = () => {
      const feedback = questionFeedback[currentQuizQuestionIndex];
      if (!feedback?.submitted) {
        return;
      }
      if (currentQuizQuestionIndex < totalQuestions - 1) {
        setCurrentQuizQuestionIndex(currentQuizQuestionIndex + 1);
      } else {
        // Final submit
        let score = 0;
        questions.forEach((question, index) => {
          const feedbackEntry = questionFeedback[index];
          if (feedbackEntry?.submitted) {
            if (feedbackEntry.isCorrect) {
              score += 1;
            }
            return;
          }
          const userAnswer = quizAnswers[question.id || index.toString()];
          if (userAnswer && userAnswer.length > 0) {
            const correctOption = question.quiz_options?.find((opt) => opt.correct);
            if (correctOption && userAnswer[0] === correctOption.text) {
              score++;
            }
          }
        });
        const scorePercentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
        const summary = buildQuizSummarySnapshot(loadedQuiz ?? activeQuiz, quizAnswers);
        const sectionIdForSummary = selectedSection?.id;
        if (summary) {
          if (sectionIdForSummary) {
            setSectionQuizSummaries((prev) => ({
              ...prev,
              [sectionIdForSummary]: summary,
            }));
            setCompletedSectionQuizzes((prev) => ({
              ...prev,
              [sectionIdForSummary]: true,
            }));
            setQuizSummarySectionId(sectionIdForSummary);
          }
          setQuizSummarySnapshot(summary);
          setQuizSummaryOpen(true);
          void persistQuizSummary(sectionIdForSummary, loadedQuiz ?? activeQuiz, summary);
        }
        setQuizScore(score);
        setQuizSubmitted(true);
        const sectionIdForStatus = selectedSection?.id;
        if (sectionIdForStatus) {
          setCompletedSectionQuizzes((prev) => ({
            ...prev,
            [sectionIdForStatus]: true,
          }));
          void logModuleActivity({
            sectionId: sectionIdForStatus,
            kind: "quiz",
          });
          refreshSectionRequirementStatus(sectionIdForStatus);
          void fetchSectionRequirementStatuses([sectionIdForStatus]);
        }

        if (isQuizRunnerMode) {
          if (activeQuiz) {
            saveQuizRunnerResult(activeQuiz, quizAnswers, scorePercentage);
          }
          setIsQuizRunnerMode(false);
        } else if (quizSession && selectedSection) {
          handleQuizComplete(selectedSection.id, scorePercentage, quizAnswers);
        }
      }
    };

    const progressPct = totalQuestions > 0 ? ((currentQuizQuestionIndex + 1) / totalQuestions) * 100 : 0;

    return (
      <>
        <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedSection?.title} - {activeQuiz.title || resourceLabels.quiz}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Question {currentQuizQuestionIndex + 1} of {totalQuestions}
              </p>
            </div>
            <div className="flex items-center justify-end">
              {renderContentExpansionToggle("light")}
            </div>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="mb-4 text-gray-700 prose prose-sm prose-slate max-w-none">
              {(() => {
                const questionSource =
                  typeof currentQuestion?.text === 'string' && currentQuestion.text.trim().length > 0
                    ? currentQuestion.text
                    : typeof currentQuestion?.content === 'string'
                    ? currentQuestion.content
                    : '';
                const sanitized = sanitizeQuestionHTML(questionSource);
                if (sanitized && sanitized.trim().length > 0) {
                  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
                }
                return <p>Question unavailable.</p>;
              })()}
            </div>

            {currentQuestion?.type === 'text' && (
              <div className="space-y-3">
                <textarea
                  value={quizAnswers[currentAnswerKey]?.[0] || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setQuizAnswers(prev => ({
                      ...prev,
                      [currentAnswerKey]: [value]
                    }));
                  }}
                  placeholder="Type your answer here..."
                  className="w-full p-4 border border-gray-300 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 resize-none min-h-[120px] text-gray-900"
                  rows={4}
                  disabled={questionSubmitted}
                />
              </div>
            )}

            {currentQuestion?.quiz_options && currentQuestion.quiz_options.length > 0 && (
              <div className="space-y-3">
                {currentQuestion.quiz_options.map((option, optIndex) => {
                  const optionLetter = String.fromCharCode(65 + optIndex); // A, B, C, D...
                    const optionText = option?.text || '';
                    const sanitizedOption = sanitizeQuestionHTML(optionText);
                    const isSelected =
                      quizAnswers[currentAnswerKey]?.includes(optionText) || false;
                    const optionIsCorrect = isOptionMarkedCorrect(option);
                    let optionClasses =
                      'cursor-pointer rounded-lg border-2 p-4 transition-all duration-200 border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50';
                    if (questionSubmitted) {
                      if (optionIsCorrect) {
                        optionClasses = 'rounded-lg border-2 p-4 transition-all duration-200 border-emerald-500 bg-emerald-50 text-emerald-700';
                      } else if (isSelected) {
                        optionClasses = 'rounded-lg border-2 p-4 transition-all duration-200 border-red-500 bg-red-50 text-red-700';
                      } else {
                      optionClasses = 'rounded-lg border-2 p-4 transition-all duration-200 border-gray-200 bg-white text-gray-500';
                    }
                  } else if (isSelected) {
                    optionClasses =
                      'cursor-pointer rounded-lg border-2 p-4 transition-all duration-200 border-indigo-500 bg-indigo-50 text-indigo-700';
                  }
                  return (
                    <div
                      key={option.id || optIndex}
                      onClick={() => {
                        if (questionSubmitted) {
                          return;
                        }
                        setQuizAnswers(prev => ({
                          ...prev,
                          [currentAnswerKey]: [optionText]
                        }));
                      }}
                      className={optionClasses}
                    >
                      <span className="text-sm font-medium flex items-start gap-2">
                        <strong>{optionLetter})</strong>
                        {sanitizedOption && sanitizedOption.trim().length > 0 ? (
                          <span
                            className="inline prose prose-sm prose-slate max-w-none"
                            dangerouslySetInnerHTML={{ __html: sanitizedOption }}
                          />
                        ) : (
                          optionText || 'Option'
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end mt-6">
            <button
              onClick={handleQuestionSubmit}
              disabled={!currentSelectedAnswer || questionSubmitted}
              className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center"
            >
              <span>{questionSubmitted ? 'Submitted' : 'Submit'}</span>
            </button>
            <button
              onClick={handleNext}
              disabled={!questionSubmitted}
              className="w-full sm:w-auto px-6 py-2.5 bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLastQuestion ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
        {/* {canAdvanceFromQuiz && (
          <div className="mt-4 px-6 pb-6 flex justify-end">
            <button
              type="button"
              onClick={handleNextResource}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-slate-900"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )} */}
        {(practiceExerciseForSection || canAdvanceFromQuiz) && (
          <div className="mt-4 px-6 pb-6 flex gap-3">
            <button
              type="button"
              onClick={handlePrevResource}
              disabled={!canGoPrev}
              className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-slate-900 disabled:border-slate-200 disabled:text-slate-300"
            >
              Previous
            </button>
            {practiceExerciseForSection && (
              <button
                type="button"
                onClick={handleGoToPracticeFromQuiz}
                className="flex-1 rounded-full bg-gradient-to-r from-green-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-green-600 hover:to-teal-600"
              >
                Go to Practice Exercise
              </button>
            )}
          </div>
        )}
      </>
    );

  };

  const renderAdaptiveQuizDisplay = () => {
    // Show completion summary
    if (adaptiveQuizCompleted && adaptiveQuizSummary) {
      const adaptiveSectionResources = selectedSection ? buildResourceList(selectedSection) : [];
      const adaptiveCurrentResourceIndex =
        selectedResource?.kind === "adaptive_quiz" && selectedResource.resourceId
          ? adaptiveSectionResources.findIndex(
              (resource) =>
                resource.kind === selectedResource.kind &&
                resource.resourceId === selectedResource.resourceId,
            )
          : -1;
      const adaptiveCanAdvanceFromQuiz =
        adaptiveCurrentResourceIndex >= 0 &&
        (adaptiveCurrentResourceIndex < adaptiveSectionResources.length - 1 ||
          currentSectionIndex < allSections.length - 1);
      const adaptiveCanGoPrev = adaptiveCurrentResourceIndex > 0 || currentSectionIndex > 0;
      const adaptivePracticeExerciseForSection =
        selectedSectionId &&
        sectionExercises[selectedSectionId] &&
        sectionExercises[selectedSectionId].length > 0
          ? sectionExercises[selectedSectionId][0]
          : null;
      const handleGoToAdaptivePracticeExercise = () => {
        if (!adaptivePracticeExerciseForSection || !selectedSectionId) {
          return;
        }
        handleSelectExercise(selectedSectionId, adaptivePracticeExerciseForSection);
      };

      return (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Adaptive Quiz
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Quiz complete</h2>
            </div>
            <button
              onClick={handleExitAdaptiveQuiz}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Exit
            </button>
          </div>

          <div className="px-6 py-6">
            <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-2xl font-semibold text-slate-900">
                  {adaptiveQuizSummary.responses?.length || 0}
                </div>
                <div className="text-xs text-slate-500">Questions</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-2xl font-semibold text-slate-900">
                  {adaptiveQuizSummary.responses?.filter((r: any) => r.is_correct).length || 0}
                </div>
                <div className="text-xs text-slate-500">Correct</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-2xl font-semibold text-slate-900">
                  {Math.round(
                    ((adaptiveQuizSummary.responses?.filter((r: any) => r.is_correct).length || 0) /
                      (adaptiveQuizSummary.responses?.length || 1)) *
                      100,
                  )}
                  %
                </div>
                <div className="text-xs text-slate-500">Score</div>
              </div>
            </div>

            {adaptivePracticeExerciseForSection && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={handleGoToAdaptivePracticeExercise}
                  className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Go to Practice
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

  // Show current question
    if (currentAdaptiveQuestion) {
      const options = currentAdaptiveQuestion.options || [];
      const showOptionFeedback = showAdaptiveExplanation && lastAnswerCorrect !== null;
      const normalizedCorrectAnswer =
        typeof currentAdaptiveQuestion.correct_answer === 'string'
          ? currentAdaptiveQuestion.correct_answer.trim()
          : undefined;
      const correctOptionLabel =
        typeof currentAdaptiveQuestion.correct_option?.label === 'string'
          ? currentAdaptiveQuestion.correct_option.label.trim().toUpperCase()
          : normalizedCorrectAnswer && normalizedCorrectAnswer.length === 1
            ? normalizedCorrectAnswer.toUpperCase()
            : undefined;
      const normalizedCorrectOptionText =
        typeof currentAdaptiveQuestion.correct_option?.text === 'string'
          ? normalizeHintMessage(currentAdaptiveQuestion.correct_option.text)
          : undefined;
      const normalizedFallbackCorrectText =
        normalizedCorrectAnswer && normalizedCorrectAnswer.length > 1
          ? normalizeHintMessage(normalizedCorrectAnswer)
          : undefined;
      const correctOptionText =
        normalizedCorrectOptionText && normalizedCorrectOptionText.length > 0
          ? normalizedCorrectOptionText.toLowerCase()
          : normalizedFallbackCorrectText && normalizedFallbackCorrectText.length > 0
            ? normalizedFallbackCorrectText.toLowerCase()
            : undefined;
      const currentAdaptiveBaseNumber =
        typeof currentAdaptiveQuestion.question_number === 'number' &&
        Number.isFinite(currentAdaptiveQuestion.question_number) &&
        currentAdaptiveQuestion.question_number > 0
          ? currentAdaptiveQuestion.question_number
          : 1;
      const resolvedSessionCount =
        typeof adaptiveSessionCount === "number" &&
        Number.isFinite(adaptiveSessionCount) &&
        adaptiveSessionCount > 0
          ? adaptiveSessionCount
          : typeof adaptiveQuizSession?.sessionCount === "number" &&
              Number.isFinite(adaptiveQuizSession.sessionCount) &&
              adaptiveQuizSession.sessionCount > 0
            ? adaptiveQuizSession.sessionCount
            : typeof adaptiveQuizSession?.session_count === "number" &&
                Number.isFinite(adaptiveQuizSession.session_count) &&
                adaptiveQuizSession.session_count > 0
              ? adaptiveQuizSession.session_count
              : null;
      const sessionOffset =
        typeof resolvedSessionCount === "number"
          ? Math.max(resolvedSessionCount - 1, 0) * ADAPTIVE_QUIZ_SESSION_SIZE
          : liveAdaptiveQuestionOffset;
      const currentQuestionDisplayNumber = currentAdaptiveBaseNumber + sessionOffset;
      const totalQuestionTarget =
        typeof resolvedSessionCount === "number"
          ? resolvedSessionCount * ADAPTIVE_QUIZ_SESSION_SIZE
          : null;
      const totalQuestionCount =
        totalQuestionTarget ??
        (typeof adaptiveQuizSession?.target_length === "number"
          ? adaptiveQuizSession.target_length
          : null);
      const progressPercent = totalQuestionCount
        ? Math.min((currentQuestionDisplayNumber / totalQuestionCount) * 100, 100)
        : 0;

      // console.log(currentAdaptiveQuestion);

      const generatedPracticeExercise =
        selectedSectionId && sectionExercises[selectedSectionId] && sectionExercises[selectedSectionId].length
          ? sectionExercises[selectedSectionId][0]
          : null;
      const canJumpToPracticeExercise = Boolean(
        generatedPracticeExercise && selectedSectionId,
      );
      const handleJumpToPracticeExercise = () => {
        if (!canJumpToPracticeExercise || !generatedPracticeExercise || !selectedSectionId) {
          return;
        }
        handleSelectExercise(selectedSectionId, generatedPracticeExercise);
      };

        return (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Adaptive Quiz
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">
                    Question {currentQuestionDisplayNumber}
                    {totalQuestionCount ? ` of ${totalQuestionCount}` : ""}
                  </h2>
                </div>
                <button
                  onClick={handleExitAdaptiveQuiz}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Exit
                </button>
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-6">
              <div className="mx-auto flex w-full max-w-none flex-col gap-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-semibold text-slate-900">Question</h3>
                  <div
                    className="mt-3 text-lg leading-relaxed text-slate-700 prose prose-lg prose-slate max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeQuestionHTML(currentAdaptiveQuestion.question_text),
                    }}
                  />
                  {currentAdaptiveQuestion.difficulty && (
                    <span className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {currentAdaptiveQuestion.difficulty}
                    </span>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h4 className="text-lg font-semibold text-slate-900">Choose an answer</h4>
                  <div className="mt-4 space-y-3">
                    {options.map((option: any, index: number) => {
                      const optionLabel = option.label || String.fromCharCode(65 + index);
                      const optionText = option.text || option.option_text || option;
                      const optionDisplayText =
                        typeof optionText === 'string'
                          ? optionText
                          : optionText != null
                          ? String(optionText)
                          : '';
                      const optionHtml = sanitizeQuestionHTML(optionDisplayText);
                      const isSelected = adaptiveQuizAnswer === optionLabel;
                      const normalizedOptionLabel = optionLabel.trim().toUpperCase();
                      const normalizedOptionText = normalizeHintMessage(optionDisplayText);
                      const comparableOptionText =
                        normalizedOptionText.length > 0 ? normalizedOptionText.toLowerCase() : undefined;
                      const optionMarkedCorrect = isOptionMarkedCorrect(option);
                      const matchesLabel =
                        Boolean(correctOptionLabel) && normalizedOptionLabel === correctOptionLabel;
                      const matchesText =
                        Boolean(correctOptionText) &&
                        Boolean(comparableOptionText) &&
                        comparableOptionText === correctOptionText;
                      const isCorrectOption = optionMarkedCorrect || matchesLabel || matchesText;
                      const shouldHighlightCorrect = showOptionFeedback && isCorrectOption;
                      const shouldHighlightIncorrectSelection =
                        showOptionFeedback && !lastAnswerCorrect && isSelected && !isCorrectOption;

                      let optionStateClass =
                        'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50';
                      if (shouldHighlightCorrect) {
                        optionStateClass = 'border-emerald-400 bg-emerald-50';
                      } else if (shouldHighlightIncorrectSelection) {
                        optionStateClass = 'border-rose-400 bg-rose-50';
                      } else if (isSelected) {
                        optionStateClass = 'border-indigo-500 bg-indigo-50';
                      }

                      let indicatorClass = 'border-slate-300';
                      if (shouldHighlightCorrect) {
                        indicatorClass = 'border-emerald-500 bg-emerald-500';
                      } else if (shouldHighlightIncorrectSelection) {
                        indicatorClass = 'border-rose-500 bg-rose-500';
                      } else if (isSelected) {
                        indicatorClass = 'border-indigo-500 bg-indigo-500';
                      }

                      const showIndicatorDot = isSelected || shouldHighlightCorrect;

                      return (
                        <button
                          key={optionLabel}
                          onClick={() => setAdaptiveQuizAnswer(optionLabel)}
                          disabled={submittingAdaptiveAnswer || showAdaptiveExplanation}
                          className={`w-full rounded-xl border-2 p-4 text-left transition ${optionStateClass} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${indicatorClass}`}
                            >
                              {showIndicatorDot && <div className="h-2 w-2 rounded-full bg-white" />}
                            </div>
                            <span
                              className="text-lg text-slate-900 whitespace-pre-wrap"
                              dangerouslySetInnerHTML={{ __html: optionHtml }}
                              aria-label={optionDisplayText}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {showAdaptiveExplanation && lastAnswerCorrect !== null && (
                    <div
                      className={`mt-4 rounded-xl border p-3 text-sm ${
                        lastAnswerCorrect
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-rose-200 bg-rose-50 text-rose-800'
                      }`}
                    >
                      <div className="font-semibold">
                        {lastAnswerCorrect ? 'Nice work!' : 'Try again'}
                      </div>
                      {currentAdaptiveQuestion.explanation && (
                        <div
                          className="mt-2 text-sm text-slate-700 prose prose-sm prose-slate max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeQuestionHTML(currentAdaptiveQuestion.explanation),
                          }}
                        />
                      )}
                      {!lastAnswerCorrect && currentAdaptiveQuestion.correct_answer && (
                        <p className="mt-2 text-sm text-slate-700">
                          Correct answer:{' '}
                          <span className="font-medium">{currentAdaptiveQuestion.correct_answer}</span>
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <button
                      onClick={handleAdaptiveQuizSubmit}
                      disabled={!adaptiveQuizAnswer || submittingAdaptiveAnswer || showAdaptiveExplanation}
                      className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submittingAdaptiveAnswer ? 'Checking...' : 'Check my answer'}
                    </button>
                    <button
                      onClick={handleAdaptiveQuizNext}
                      disabled={
                        submittingAdaptiveAnswer ||
                        !showAdaptiveExplanation ||
                        !pendingAdaptiveQuestion
                      }
                      className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submittingAdaptiveAnswer ? (
                        <div className="h-5 w-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                      ) : (
                        <span>Next</span>
                      )}
                    </button>
                  </div>

                  {canJumpToPracticeExercise && (
                    <div className="mt-5 border-t border-slate-200 pt-4">
                      <button
                        type="button"
                        onClick={handleJumpToPracticeExercise}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        Go to Practice
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
    }

    // Loading state
    return (
      <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Starting adaptive quiz...</p>
          </div>
        </div>
      </div>
    );
  };

  const renderEmptyDisplay = () => (

    <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden min-h-[320px]">

      <div className="h-full w-full flex items-center justify-center p-12 text-sm text-gray-500">

        Select a lecture, exercise, or quiz from the sidebar to get started.

      </div>

    </div>

  );

  const renderQuestionPopup = (variant: "modal" | "embedded" = "modal") => {
    const isEmbedded = variant === "embedded";

    if (!selectedQuestionForPopup) {
      if (isEmbedded) {
        return (
          <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg min-h-[320px] flex items-center justify-center">
            <p className="text-sm text-gray-500">Select an exercise question to get started.</p>
          </div>
        );
      }
      return null;
    }

    if (!isEmbedded && !showQuestionPopup) {
      return null;
    }

    const question = selectedQuestionForPopup;
    const questionType = (question.question_type || question.type || "sql").toLowerCase();
    const questionList = activeExerciseQuestions;
    const currentQuestionIndex = questionList.findIndex(
      (item: any) => String(item.id) === String(question.id),
    );
    const hasNextQuestion =
      currentQuestionIndex >= 0 && currentQuestionIndex < questionList.length - 1;
    const sectionResources = selectedSection ? buildResourceList(selectedSection) : [];
    const currentExerciseId =
      (selectedPracticeExercise && selectedPracticeExercise.id) ||
      (activeExercise && activeExercise.id) ||
      (selectedResource?.kind === "exercise" ? selectedResource.resourceId : null);
    const currentPracticeResourceIndex =
      currentExerciseId && sectionResources.length
        ? sectionResources.findIndex(
            (resource) =>
              resource.kind === "exercise" && resource.resourceId === String(currentExerciseId),
          )
        : -1;
    const canAdvancePracticeResource =
      currentPracticeResourceIndex >= 0 &&
      (currentPracticeResourceIndex < sectionResources.length - 1 ||
        currentSectionIndex < allSections.length - 1);
    const handlePracticeNextResource = () => {
      handleAdvanceFromPractice();
    };
    const questionDifficulty =
      (question as any).difficulty ||
      (question as any).content?.difficulty ||
      (question as any).question_difficulty ||
      "";
    const latestHint = (question as any)?.latestHint ?? null;
    const latestHintMessage =
      latestHint && typeof latestHint.message === "string" ? latestHint.message : null;
    const latestHintVerdict =
      latestHint && typeof latestHint.verdict === "string" ? latestHint.verdict : null;

    const questionHint =
      latestHintMessage ||
      question.hint ||
      (question as any).adaptive_note ||
      (question as any).content?.hint ||
      "";

    const resolvedQuestionHtmlSource = resolveQuestionTextPreservingFormatting(
      question.text,
      question.question_text,
      (question as any)?.business_question,
      (question as any)?.prompt,
      typeof (question as any)?.content === "string"
        ? (question as any)?.content
        : typeof (question as any)?.content?.text === "string"
        ? (question as any)?.content?.text
        : undefined,
    );
    const questionHtml = resolvedQuestionHtmlSource
      ? sanitizeQuestionHTML(resolvedQuestionHtmlSource)
      : "";

    const maybeFormatAnswer = (value: string): string => {
      if (!value || typeof value !== "string") {
        return "";
      }

      const alreadyFenced = value.includes("```");
      const language = questionType;

      if (alreadyFenced || language !== "python") {
        return value;
      }

      let formatted = value;
      // Insert newlines before common Python statement boundaries to improve readability.
      formatted = formatted.replace(/\s+(from\s+\w[\w.]*\s+import\s+)/g, "\n$1");
      formatted = formatted.replace(/\s+(import\s+\w[\w.]*)/g, "\n$1");
      formatted = formatted.replace(/\s+(df_\w+\s*=)/g, "\n$1");
      formatted = formatted.replace(/\s+(result\s*=)/g, "\n$1");
      formatted = formatted.replace(/;\s*/g, ";\n");
      formatted = formatted.trim();

      return `\`\`\`python\n${formatted}\n\`\`\``;
    };

    const questionAnswer = (() => {
      const normalizeAnswer = (value: unknown): string | null => {
        if (typeof value === "string") {
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
        if (Array.isArray(value)) {
          const joined = value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((item) => item.length > 0)
            .join("\n")
            .trim();
          return joined.length > 0 ? joined : null;
        }
        return null;
      };

      const relatedAnswers =
        Array.isArray((question as any)?.section_exercise_answers)
          ? (question as any).section_exercise_answers
              .map((entry: any) => normalizeAnswer(entry?.answer_text))
              .filter((value): value is string => Boolean(value))
          : [];

      const exerciseAnswersMap =
        (activeExercise as any)?.context?.answers_sql_map ??
        (activeExercise as any)?.answers_sql_map ??
        null;

      const answerFromMap = (() => {
        if (!exerciseAnswersMap) {
          return null;
        }

        const lookup = (key: unknown) => {
          if (key === null || key === undefined) return null;
          const normalizedKey =
            typeof key === "number"
              ? String(key)
              : typeof key === "string" && key.trim().length > 0
              ? key.trim()
              : null;
          if (!normalizedKey) return null;
          const match =
            exerciseAnswersMap[normalizedKey] ??
            exerciseAnswersMap[String(Number(normalizedKey))];
          return typeof match === "string" && match.trim().length > 0
            ? match.trim()
            : null;
        };

        const candidateKeys = [
          (question as any)?.id,
          (question as any)?.question_id,
          (question as any)?.questionId,
          (question as any)?.content?.original_id,
          (question as any)?.original_id,
          (question as any)?.order_index,
          typeof (question as any)?.order_index === "number"
            ? (question as any)?.order_index + 1
            : null,
        ];

        for (const key of candidateKeys) {
          const resolved = lookup(key);
          if (resolved) {
            return resolved;
          }
        }

        return null;
      })();

      const candidates: unknown[] = [
        (question as any)?.answer_text,
        (question as any)?.answer,
        (question as any)?.answer_sql,
        question.correct_answer,
        question.solution,
        (question as any)?.content?.answer,
        (question as any)?.content?.solution,
        (question as any)?.content?.answer_sql,
        (question as any)?.content?.answerSql,
        answerFromMap,
        ...relatedAnswers,
      ];

      for (const candidate of candidates) {
        const normalized = normalizeAnswer(candidate);
        if (normalized) {
          return maybeFormatAnswer(normalized);
        }
      }

      return "";
    })();
    const questionAnswerHtml = questionAnswer ? sanitizeQuestionHTML(questionAnswer) : "";

    const pythonStarterCode = (() => {
      if (questionType !== "python") {
        return undefined;
      }

      const resolvePythonCreationSource = (candidate: unknown): string | undefined => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
          return undefined;
        }
        const record = candidate as Record<string, unknown>;
        const schemaInfoRaw = record["schema_info"];
        const schemaInfo =
          schemaInfoRaw && typeof schemaInfoRaw === "object" && !Array.isArray(schemaInfoRaw)
            ? (schemaInfoRaw as Record<string, unknown>)
            : undefined;

        return coalesceString(
          typeof record["create_python"] === "string" ? (record["create_python"] as string) : undefined,
          typeof record["creation_python"] === "string" ? (record["creation_python"] as string) : undefined,
          schemaInfo && typeof schemaInfo["create_python"] === "string"
            ? (schemaInfo["create_python"] as string)
            : undefined,
          schemaInfo && typeof schemaInfo["creation_python"] === "string"
            ? (schemaInfo["creation_python"] as string)
            : undefined,
          schemaInfo && typeof schemaInfo["data_creation_python"] === "string"
            ? (schemaInfo["data_creation_python"] as string)
            : undefined,
          typeof record["data_creation_python"] === "string"
            ? (record["data_creation_python"] as string)
            : undefined,
        );
      };

      const normalizePythonStarter = (source?: string | undefined) =>
        source
          ? normalizeCreationSql(source, {
              datasetType: "python",
              preserveFormatting: true,
            })
          : undefined;

      const candidateIds = new Set<string>();
      const candidateDatasets: PythonDatasetDefinition[] = [];
      const pushCandidate = (dataset?: PythonDatasetDefinition) => {
        if (!dataset) {
          return;
        }
        const key =
          typeof dataset.id === "string" && dataset.id.length > 0
            ? dataset.id
            : `${dataset.name ?? "dataset"}:${candidateDatasets.length}`;
        if (candidateIds.has(key)) {
          return;
        }
        candidateIds.add(key);
        candidateDatasets.push(dataset);
      };

      const activeBaseId = activeDatasetId
        ? (duckDbDatasetVariants.find(v => v.id === activeDatasetId)?.baseDatasetId ?? activeDatasetId)
        : null;

      const activeDefinition =
        activeBaseId
          ? availablePythonDatasets.find((dataset) => dataset.id === activeBaseId)
          : undefined;

      pushCandidate(activeDefinition);
      availablePythonDatasets.forEach((dataset) => pushCandidate(dataset));

      for (const dataset of candidateDatasets) {
        const normalized = normalizePythonStarter(resolvePythonCreationSource(dataset));
        if (normalized) {
          return normalized;
        }
      }

      const fallbackNormalized = normalizePythonStarter(
        resolvePythonCreationSource(questionDataset) ??
          resolvePythonCreationSource(
            (selectedQuestionForPopup as Record<string, unknown> | null | undefined)?.dataset,
          ) ??
          resolvePythonCreationSource(selectedQuestionForPopup),
      );

      return fallbackNormalized ?? undefined;
    })();

    const languageConfig: Record<string, { name: string; starterCode: string }> = {
      sql: {
        name: "SQL",
        starterCode: `-- Write your SQL query here\n-- ${question.text || question.question_text}\n\n-- Example solution:\n-- SELECT * FROM table_name;\n\n`,
      },
      python: {
        name: "Python",
        starterCode:
          pythonStarterCode ??
          `# Write your Python code here\n# ${question.text || question.question_text}\n\ndef solution():\n    # Your code here\n    pass\n\nsolution()\n`,
      },
      google_sheets: {
        name: "Google Sheets Formula",
        starterCode: `=${question.text || question.question_text}\n\n`,
      },
      statistics: {
        name: "Statistics",
        starterCode: `# Statistical analysis solution\n# ${question.text || question.question_text}\n\n`,
      },
      reasoning: {
        name: "Reasoning",
        starterCode: `# Logical reasoning solution\n# ${question.text || question.question_text}\n\n`,
      },
      math: {
        name: "Mathematics",
        starterCode: `# Mathematical solution\n# ${question.text || question.question_text}\n\n`,
      },
      geometry: {
        name: "Geometry",
        starterCode: `# Geometric solution\n# ${question.text || question.question_text}\n\n`,
      },
    };

    const config = languageConfig[questionType] || languageConfig.sql;
    const duckDbDatasetsForQuestion = shouldUseDuckDb ? duckDbDatasetVariants : [];
    const activeDuckDbDataset =
      shouldUseDuckDb && activeDatasetId
        ? duckDbDatasetsForQuestion.find((dataset) => dataset.id === activeDatasetId) ?? null
        : null;

    const WRAPPED_CELL_VALUE_PATTERN = /^\\?(['"])(.*)\\?\1$/;
    const NUMERIC_STRING_PATTERN = /^-?\d+(?:\.\d+)?$/;
    const DATE_TIME_DELIMITER_PATTERN = /[-/T]/;

    const normalizeDatasetCellValue = (value: unknown): unknown => {
      if (typeof value !== "string") {
        return value;
      }

      let normalized = value.trim();
      if (!normalized) {
        return "";
      }

      // console.log("Normalizing dataset cell value:", normalized);

      const stripEdgeQuotes = (input: string): string => {
        let result = input;
        for (let i = 0; i < 6; i++) {
          let changed = false;
          result = result.trim();

          if (/^\\+["']/.test(result)) {
            result = result.replace(/^\\+["']+/, "").trimStart();
            changed = true;
          } else if (/^["']/.test(result)) {
            result = result.slice(1).trimStart();
            changed = true;
          }

          if (/["']\\+$/.test(result)) {
            result = result.replace(/["']+\\+$/, "").trimEnd();
            changed = true;
          } else if (/["']$/.test(result)) {
            result = result.slice(0, -1).trimEnd();
            changed = true;
          }

          if (!changed) {
            break;
          }
        }
        return result;
      };

      normalized = stripEdgeQuotes(normalized);
      for (let i = 0; i < 3; i++) {
        const match = normalized.match(WRAPPED_CELL_VALUE_PATTERN);
        if (match && typeof match[2] === "string") {
          normalized = match[2].trim();
          normalized = stripEdgeQuotes(normalized);
          continue;
        }
        break;
      }

      normalized = normalized.replace(/\\(['"])/g, "$1");

      return normalized;
    };

    const isLikelyTimestampColumn = (columnName?: string) => {
      if (!columnName) {
        return false;
      }

      const normalized = columnName.trim().toLowerCase();
      if (!normalized) {
        return false;
      }

      if (DATASET_TIMESTAMP_COLUMNS.has(normalized)) {
        return true;
      }

      if (DATASET_TIMESTAMP_COLUMN_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
        return true;
      }

      return DATASET_TIMESTAMP_KEYWORDS.some((keyword) => normalized.includes(keyword));
    };

    const normalizeEpochToMilliseconds = (value: number): number | null => {
      const absValue = Math.abs(value);

      if (absValue >= 1e15) {
        return value / 1000;
      }

      if (absValue >= 1e11) {
        return value;
      }

      if (absValue >= 1e8) {
        return value * 1000;
      }

      return null;
    };

    const formatTimestampFromMilliseconds = (timestampMs: number): string | null => {
      const parsedDate = new Date(timestampMs);
      if (Number.isNaN(parsedDate.getTime())) {
        return null;
      }

      const year = parsedDate.getFullYear();
      const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
      const day = String(parsedDate.getDate()).padStart(2, "0");
      const hours = String(parsedDate.getHours()).padStart(2, "0");
      const minutes = String(parsedDate.getMinutes()).padStart(2, "0");
      const seconds = String(parsedDate.getSeconds()).padStart(2, "0");

      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    const formatDatasetTimestamp = (rawValue: unknown) => {
      const normalizedValue = normalizeDatasetCellValue(rawValue);

      if (normalizedValue instanceof Date && !Number.isNaN(normalizedValue.getTime())) {
        return formatTimestampFromMilliseconds(normalizedValue.getTime());
      }

      let numericValue: number | null = null;
      if (typeof normalizedValue === "number") {
        numericValue = normalizedValue;
      } else if (
        typeof normalizedValue === "string" &&
        NUMERIC_STRING_PATTERN.test(normalizedValue)
      ) {
        numericValue = Number(normalizedValue);
      }

      if (numericValue !== null && Number.isFinite(numericValue)) {
        const timestampMs = normalizeEpochToMilliseconds(numericValue);
        if (timestampMs !== null) {
          const formatted = formatTimestampFromMilliseconds(timestampMs);
          if (formatted) {
            return formatted;
          }
        }
      }

      if (typeof normalizedValue === "string") {
        const trimmed = normalizedValue.trim();
        if (trimmed.length >= 6 && DATE_TIME_DELIMITER_PATTERN.test(trimmed)) {
          const parsedDate = new Date(trimmed);
          const formatted = formatTimestampFromMilliseconds(parsedDate.getTime());
          if (formatted) {
            return formatted;
          }
        }
      }

      return null;
    };

    const TIME_ONLY_PATTERN = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?\s*(am|pm|AM|PM)?\s*$/;
    const padTimePart = (value: number) => String(value).padStart(2, "0");

    const parseTimeString = (
      value: string,
    ): { hours: number; minutes: number; seconds: number } | null => {
      const match = value.match(TIME_ONLY_PATTERN);
      if (!match) {
        return null;
      }

      let hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = match[3] ? Number(match[3]) : 0;
      const meridiem = match[5];

      if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return null;
      }

      if (meridiem) {
        const normalizedMeridiem = meridiem.toLowerCase();
        if (normalizedMeridiem === "pm" && hours < 12) {
          hours += 12;
        } else if (normalizedMeridiem === "am" && hours === 12) {
          hours = 0;
        }
      }

      if (hours >= 24 || minutes >= 60 || seconds >= 60) {
        return null;
      }

      return { hours, minutes, seconds };
    };

    const extractTimeComponents = (value: unknown) => {
      if (typeof value === "string") {
        const parsed = parseTimeString(value.trim());
        if (parsed) {
          return parsed;
        }
      }

      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return {
          hours: value.getHours(),
          minutes: value.getMinutes(),
          seconds: value.getSeconds(),
        };
      }

      if (typeof value === "number") {
        const parsedDate = new Date(value);
        if (!Number.isNaN(parsedDate.getTime())) {
          return {
            hours: parsedDate.getHours(),
            minutes: parsedDate.getMinutes(),
            seconds: parsedDate.getSeconds(),
          };
        }
      }

      return null;
    };

    const formatDatasetTime = (rawValue: unknown) => {
      const components = extractTimeComponents(rawValue);
      if (!components) {
        return null;
      }

      return `${padTimePart(components.hours)}:${padTimePart(components.minutes)}:${padTimePart(
        components.seconds,
      )}`;
    };

    const getDatasetTimeSortableValue = (rawValue: unknown) => {
      const components = extractTimeComponents(rawValue);
      if (!components) {
        return null;
      }

      return components.hours * 3600 + components.minutes * 60 + components.seconds;
    };

    const getColumnTypeMeta = (columnType?: string | null, columnName?: string) => {
      const result = {
        category: "unknown" as "unknown" | "timestamp" | "numeric" | "text" | "decimal" | "time",
        scale: undefined as number | undefined,
      };
      if (columnType && typeof columnType === "string") {
        const normalized = columnType.trim().toLowerCase();
        if (normalized) {
          if (/(?:date|timestamp|datetime|timestamptz|datetimetz)/.test(normalized)) {
            result.category = "timestamp";
            return result;
          }
          if (/\btimetz\b/.test(normalized) || /\btime\b/.test(normalized)) {
            result.category = "time";
            return result;
          }
          const decimalMatch = normalized.match(/(?:decimal|numeric)\s*\(\s*\d+\s*,\s*(\d+)\s*\)/);
          if (decimalMatch) {
            result.category = "decimal";
            result.scale = Number(decimalMatch[1]);
            return result;
          }
          if (/^decimal\b/.test(normalized)) {
            result.category = "decimal";
            result.scale = 2;
            return result;
          }
          if (/(?:int|float|double|real|money|number|year|month|hour|minute|second|quantity|price|amount|total|count|value|units)/.test(
            normalized,
          )) {
            result.category = "numeric";
            return result;
          }
          if (/(?:char|text|string|varchar|clob|blob|uuid|code|description|name|json)/.test(normalized)) {
            result.category = "text";
            return result;
          }
        }
      }
      if (isLikelyTimestampColumn(columnName)) {
        result.category = "timestamp";
      }
      return result;
    };

    const getSortableDatasetCellValue = (
      rawValue: unknown,
      columnName?: string,
      columnType?: string,
    ) => {
      const columnMeta = getColumnTypeMeta(columnType, columnName);

      if (columnMeta.category === "decimal" && isDuckDbDecimalValue(rawValue)) {
        const formattedDecimal = formatDuckDbDecimal(rawValue, columnMeta.scale ?? 2);
        const numeric = Number(formattedDecimal);
        if (Number.isFinite(numeric)) {
          return numeric;
        }
        return formattedDecimal;
      }

      const normalizedValue = normalizeDatasetCellValue(rawValue);

      if (columnMeta.category === "time") {
        const sortableTime = getDatasetTimeSortableValue(normalizedValue);
        if (sortableTime !== null) {
          return sortableTime;
        }
      }

      if (
        (columnMeta.category === "decimal" || columnMeta.category === "numeric") &&
        normalizedValue !== null &&
        normalizedValue !== undefined
      ) {
        const numeric =
          typeof normalizedValue === "number"
            ? normalizedValue
            : Number(normalizedValue);
        if (Number.isFinite(numeric)) {
          return numeric;
        }
      }

      if (columnMeta.category === "timestamp") {
        const formattedTimestamp = formatDatasetTimestamp(normalizedValue);
        if (formattedTimestamp) {
          return formattedTimestamp;
        }
      }

      if (normalizedValue === null || normalizedValue === undefined) {
        return normalizedValue;
      }

      return typeof normalizedValue === "string"
        ? normalizedValue.toLowerCase()
        : normalizedValue;
    };

    const compareSortableValues = (a: unknown, b: unknown) => {
      if (a === b) {
        return 0;
      }

      const isBlank = (value: unknown) =>
        value === null || value === undefined || value === "";

      if (isBlank(a)) {
        return 1;
      }
      if (isBlank(b)) {
        return -1;
      }

      const aIsNumber = typeof a === "number";
      const bIsNumber = typeof b === "number";

      if (aIsNumber && bIsNumber) {
        return a - b;
      }
      if (aIsNumber) {
        return -1;
      }
      if (bIsNumber) {
        return 1;
      }

      const aString = String(a);
      const bString = String(b);
      return aString.localeCompare(bString, undefined, { sensitivity: "base" });
    };

    const handleDatasetColumnSort = (column: string) => {
      setDatasetSortConfig((prev) => {
        if (prev && prev.column === column) {
          return {
            column,
            direction: prev.direction === "asc" ? "desc" : "asc",
          };
        }
        return { column, direction: "asc" };
      });
    };

    const getSortedDatasetRows = () => {
      if (!datasetPreview) {
        return [];
      }
      if (!datasetSortConfig) {
        return datasetPreview.rows;
      }
      const columnIndex = datasetPreview.columns.findIndex(
        (column) => column === datasetSortConfig.column,
      );
      if (columnIndex === -1) {
        return datasetPreview.rows;
      }
      const columnName = datasetSortConfig.column;
      const columnType = datasetPreview.columnTypes?.[columnName];
      const rowsCopy = [...datasetPreview.rows];
      rowsCopy.sort((left, right) => {
        const leftValue = getSortableDatasetCellValue(
          left[columnIndex],
          columnName,
          columnType,
        );
        const rightValue = getSortableDatasetCellValue(
          right[columnIndex],
          columnName,
          columnType,
        );
        const comparison = compareSortableValues(leftValue, rightValue);
        return datasetSortConfig.direction === "asc" ? comparison : -comparison;
      });
      return rowsCopy;
    };

    const datasetRowsForTable = getSortedDatasetRows();

    const ColumnHeaderWithType = ({
      columnName,
      columnType,
    }: {
      columnName: string;
      columnType?: string;
    }) => {
      const normalizedType = columnType?.trim();
      return (
        <div className="flex flex-col gap-0.5">
          <span>{columnName}</span>
          {normalizedType ? (
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {normalizedType}
            </span>
          ) : null}
        </div>
      );
    };

    const isDuckDbDecimalValue = (value: unknown): value is Uint32Array =>
      value instanceof Uint32Array && value.length === 4;

    const readDuckDbDecimalValue = (value: Uint32Array): bigint => {
      let current = 0n;
      for (let i = value.length - 1; i >= 0; i--) {
        current = (current << 32n) | BigInt(value[i]);
      }
      const signBit = 1n << 127n;
      if (current & signBit) {
        current -= 1n << 128n;
      }
      return current;
    };

    const formatDuckDbDecimal = (value: Uint32Array, scale: number) => {
      const decoded = readDuckDbDecimalValue(value);
      const neg = decoded < 0n;
      const absolute = neg ? -decoded : decoded;
      const scaleFactor = 10n ** BigInt(scale);
      const integerPart = absolute / scaleFactor;
      const fractionalPart = absolute % scaleFactor;
      const fractional = fractionalPart.toString().padStart(scale, '0');
      if (scale === 0) {
        return `${neg ? '-' : ''}${integerPart.toString()}`;
      }
      return `${neg ? '-' : ''}${integerPart.toString()}.${fractional}`;
    };

    const formatCellValue = (value: unknown, columnName?: string, columnType?: string) => {
      if (
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim().length === 0) ||
        (typeof value === "string" && value.trim().toUpperCase() === "NULL")
      ) {
        return "—";
      }

      const columnMeta = getColumnTypeMeta(columnType, columnName);
      if (columnMeta.category === "decimal" && isDuckDbDecimalValue(value)) {
        return formatDuckDbDecimal(value, columnMeta.scale ?? 2);
      }
      const normalizedValue = normalizeDatasetCellValue(value);

      if (typeof normalizedValue === "string" && normalizedValue.length === 0) {
        return "—";
      }

      if (columnMeta.category === "time") {
        const formattedTime = formatDatasetTime(normalizedValue);
        if (formattedTime) {
          return formattedTime;
        }
      }

      if (columnMeta.category === "timestamp") {
        const formattedTimestamp = formatDatasetTimestamp(normalizedValue);
        if (formattedTimestamp) {
          return formattedTimestamp;
        }
      }

      if (columnMeta.category === "decimal") {
        const numericValue =
          typeof normalizedValue === "number" ? normalizedValue : Number(normalizedValue);
        if (Number.isFinite(numericValue)) {
          const scale = columnMeta.scale ?? 2;
          const formatter = new Intl.NumberFormat("en-US", {
            minimumFractionDigits: scale,
            maximumFractionDigits: scale,
          });
          return formatter.format(numericValue);
        }
      }

      if (columnMeta.category === "numeric") {
        const numericValue =
          typeof normalizedValue === "number" ? normalizedValue : Number(normalizedValue);
        if (Number.isFinite(numericValue)) {
          return numericValue.toString();
        }
      }

      if (typeof normalizedValue === "object") {
        try {
          // console.log("Attempting to stringify object:", normalizedValue[0]);
          return JSON.stringify(normalizedValue[0]);
        } catch {
          return String(normalizedValue);
        }
      }

      return typeof normalizedValue === "string" ? normalizedValue : String(normalizedValue);
    };

    const containerClass = isEmbedded
      ? "flex flex-col rounded-2xl border border-white/60 bg-white/90 backdrop-blur-xl shadow-lg overflow-hidden"
      : "bg-white rounded-3xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col";

    const headerTitle =
      question.exerciseTitle || activeExercise?.title || selectedSection?.title || "Exercise";
    const headerSubtitle =
      question.exerciseDescription || activeExercise?.description || selectedSection?.overview || "";
    const trimmedSubtitle =
      typeof headerSubtitle === "string" && headerSubtitle.length > 160
        ? `${headerSubtitle.slice(0, 157)}...`
        : headerSubtitle;
    const businessContext = activeExercise?.content || "";

    const focusMode = true;
    const progressPercent =
      questionList.length > 0 ? ((currentQuestionIndex + 1) / questionList.length) * 100 : 0;

    const header = focusMode ? (
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Practice
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Question {currentQuestionIndex + 1} of {questionList.length}
            </h2>
          </div>
          {isEmbedded && (
            <button
              onClick={handleExitEmbeddedExercise}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Exit
            </button>
          )}
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    ) : (
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            {isEmbedded ? "Practice Exercise" : "Practice Question"}
          </p>
          <h2 className="mt-2 truncate text-xl font-semibold text-slate-900">{headerTitle}</h2>
          {headerSubtitle && (
            <p className="mt-1 text-sm text-slate-500">{headerSubtitle}</p>
            
          )}
          {businessContext && (
            <p className="mt-1 text-sm text-slate-500"><strong>Business Context:</strong> {businessContext}</p>
          )}
        </div>
        <div className="flex items-right gap-2">
          {/* {renderContentExpansionToggle("light")} */}
          {/* {isEmbedded && canAdvancePracticeResource && ( */}
            <button
              onClick={handlePracticeNextResource}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              Next Resource
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          {/* )} */}
          {isEmbedded && (
            <button
              onClick={handleExitEmbeddedExercise}
              className="flex items-right gap-2 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Exit
            </button>
          )}
          {/* <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              questionType === "sql"
                ? "bg-blue-100 text-blue-700"
                : questionType === "python" || questionType === "statistics"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {config.name}
          </span> */}
          {!isEmbedded && (
            <button
              onClick={() => {
                setShowQuestionPopup(false);
                setSelectedQuestionForPopup(null);
              }}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <Circle className="h-6 w-6" />
            </button>
          )}
        </div>
      </div>
    );

    const questionTabsBar =
      !focusMode && questionList.length > 0 ? (
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
          <div className="flex flex-wrap gap-2">
            {questionList.map((questionItem: any, index: number) => {
              const key = getExerciseQuestionKey(questionItem, index);
              const status = questionCompletionStatus[key];
              const isActive = index === currentQuestionIndex;
              const isCompleted = status === "completed";
              const isIncorrect = status === "incorrect";

              return (
                <button
                  key={key}
                  onClick={() => handleSelectExerciseQuestionTab(index)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? "border-indigo-600 bg-indigo-600 text-white shadow"
                      : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  ) : isIncorrect ? (
                    <XCircle className="h-3.5 w-3.5 text-rose-400" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-slate-300" />
                  )}
                  <span>Question {index + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null;
    const content = focusMode ? (
      <div className="flex-1 overflow-auto bg-slate-50 px-6 py-6">
        <div className="mx-auto flex w-full max-w-none flex-col gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-900">Question</h3>
            {questionHtml ? (
              <div
                className="mt-3 text-lg leading-relaxed text-slate-700 prose prose-lg prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: questionHtml }}
              />
            ) : (
              <p className="mt-3 text-lg leading-relaxed text-slate-700">
                {question.text || question.question_text}
              </p>
            )}
            {questionAnswer ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Answer (temporary)
                </div>
                {questionAnswerHtml ? (
                  <div
                    className="mt-2 text-sm leading-relaxed text-emerald-900 prose prose-sm prose-emerald max-w-none"
                    dangerouslySetInnerHTML={{ __html: questionAnswerHtml }}
                  />
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-emerald-900">
                    {questionAnswer}
                  </p>
                )}
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">Your answer</h4>
                <p className="mt-1 text-sm text-slate-500">
                  Share your thinking and final answer.
                </p>
              </div>
              {allowWorkspaceHint && (
                <button
                  onClick={handleWorkspaceHintClick}
                  disabled={!userId || isRequestingWorkspaceHint}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRequestingWorkspaceHint ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                  ) : (
                    <Lightbulb className="h-3.5 w-3.5" />
                  )}
                  <span>{isRequestingWorkspaceHint ? "Hinting..." : "Need a hint?"}</span>
                </button>
              )}
            </div>
            <textarea
              value={worksheetSolution}
              onChange={(event) => setWorksheetSolution(event.target.value)}
              placeholder="Type your answer here..."
              rows={6}
              className="mt-4 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-lg leading-8 text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {allowWorkspaceSubmission && (
                <button
                  onClick={handleWorkspaceSubmitClick}
                  disabled={isSubmittingWorkspace || !worksheetSolution.trim()}
                  className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingWorkspace ? "Checking..." : "Check my answer"}
                </button>
              )}
            </div>
            {worksheetHint && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span>{"Hint"}</span>
                </div>
                <p className="mt-2 text-sm text-amber-900 whitespace-pre-wrap">
                  {worksheetHint.message}
                </p>
              </div>
            )}
            <div className="mt-4">
              {isSubmittingWorkspace ? (
                <div className="flex items-center gap-2 text-sm text-indigo-600">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-transparent" />
                  <span>Evaluating your answer...</span>
                </div>
              ) : worksheetFeedback ? (
                <div
                  className={`rounded-xl border px-4 py-3 ${
                    worksheetFeedback.isCorrect
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <p className="text-sm font-semibold">
                    {worksheetFeedback.verdict || (worksheetFeedback.isCorrect ? "Nice work!" : "Try again")}
                  </p>
                  {worksheetFeedback.feedback && (
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      {worksheetFeedback.feedback}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  
                </p>
              )}
            </div>
            {questionList.length > 1 && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() => handleSelectExerciseQuestionTab(currentQuestionIndex - 1)}
                  disabled={currentQuestionIndex <= 0}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => handleSelectExerciseQuestionTab(currentQuestionIndex + 1)}
                  disabled={currentQuestionIndex >= questionList.length - 1}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    ) : (
      <div className="grid min-h-[520px] flex-1 grid-cols-1 overflow-hidden md:grid-cols">
        <div className="flex min-h-0 flex-col bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-6 py-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Question</h3>
                {questionHtml ? (
                  <div
                    className="mt-2 text-sm leading-relaxed text-slate-700 prose prose-sm prose-slate max-w-none"
                    dangerouslySetInnerHTML={{ __html: questionHtml }}
                  />
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      {question.text || question.question_text}
                    </p>
                  </>
                )}
                {questionAnswer ? (
                  <div className="mt-3">
                    <h4 className="text-sm font-semibold text-slate-900">Answer</h4>
                    {questionAnswerHtml ? (
                      <div
                        className="mt-3 text-sm leading-relaxed text-slate-700 prose prose-sm prose-slate max-w-none"
                        dangerouslySetInnerHTML={{ __html: questionAnswerHtml }}
                      />
                    ) : (
                      <p className="mt-3 text-sm leading-relaxed text-slate-700">
                        {questionAnswer}
                      </p>
                    )}
                  </div>
                ) : null}
                
              </div>
              {questionDifficulty && (
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    questionDifficulty === "Beginner"
                      ? "bg-emerald-100 text-emerald-700"
                      : questionDifficulty === "Intermediate"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {questionDifficulty}
                </span>
              )}
            </div>
            {/* {questionHint && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
                {latestHintMessage ? (
                  <div className="flex items-start gap-2">
                    <Lightbulb className="mt-0.5 h-4 w-4 text-amber-500" />
                    <div>
                      <p className="font-semibold text-indigo-900">
                        {latestHintVerdict?.trim() || "AI Hint"}
                      </p>
                      <p className="mt-1 text-indigo-800">{latestHintMessage}</p>
                    </div>
                  </div>
                ) : (
                  <span>
                    <span className="font-medium">Hint:</span> {questionHint}
                  </span>
                )}
              </div>
            )} */}
          </div>
          <div className="flex-1 overflow-auto px-6 py-5">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">Your Submission</h4>
                      <p className="mt-1 text-xs text-slate-500">
                        Summarize your findings before submitting for review.
                      </p>
                    </div>
                    {allowWorkspaceHint && (
                      <button
                        onClick={handleWorkspaceHintClick}
                        disabled={!userId || isRequestingWorkspaceHint}
                        className="inline-flex items-center gap-2 rounded-full border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isRequestingWorkspaceHint ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                        ) : (
                          <Lightbulb className="h-3.5 w-3.5" />
                        )}
                        <span>{isRequestingWorkspaceHint ? "Hinting..." : "Hint"}</span>
                      </button>
                    )}
                  </div>
                <div className="space-y-3 px-5 py-4">
                  <p className="text-sm font-semibold text-slate-600">
                    For Google sheet or Statistics, if you are solving using pivot table - briefly describe steps.
                  </p>
                  <textarea
                    value={worksheetSolution}
                    onChange={(event) => setWorksheetSolution(event.target.value)}
                      placeholder="Describe your analysis, highlight the steps you took, and state your final answer."
                      rows={6}
                      className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      {allowWorkspaceSubmission && (
                        <button
                          onClick={handleWorkspaceSubmitClick}
                          disabled={isSubmittingWorkspace || !worksheetSolution.trim()}
                          className="flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSubmittingWorkspace ? "Submitting..." : "Submit"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                   <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                     <h4 className="text-sm font-semibold text-slate-800">AI Feedback</h4>
                     {worksheetFeedback && (
                       <span
                         className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                           worksheetFeedback.isCorrect
                             ? "bg-emerald-100 text-emerald-700"
                             : "bg-amber-100 text-amber-700"
                         }`}
                       >
                         {worksheetFeedback.isCorrect ? "Looks correct" : "Needs review"}
                       </span>
                     )}
                   </div>
                   {worksheetHint && (
                     <div className="mx-5 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                       <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                         <Lightbulb className="h-3.5 w-3.5" />
                         <span>{"Hint"}</span>
                       </div>
                       <p className="mt-2 text-sm text-amber-900 whitespace-pre-wrap">
                         {worksheetHint.message}
                       </p>
                     </div>
                   )}
                   <div className="px-5 py-4">
                     {isSubmittingWorkspace ? (
                       <div className="flex items-center gap-2 text-sm text-indigo-600">
                         <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-transparent" />
                         <span>Evaluating your submission...</span>
                      </div>
                    ) : worksheetFeedback ? (
                      <div
                        className={`rounded-lg border px-4 py-3 ${
                          worksheetFeedback.isCorrect
                            ? "border-emerald-400/60 bg-emerald-50 text-emerald-800"
                            : "border-amber-400/60 bg-amber-50 text-amber-900"
                        }`}
                      >
                        <p className="text-sm font-semibold">{worksheetFeedback.verdict}</p>
                        {worksheetFeedback.feedback && (
                          <p className="mt-2 text-sm leading-relaxed text-slate-700">
                            {worksheetFeedback.feedback}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        Submit your summary to receive AI-powered feedback on your approach.
                      </p>
                    )}
                  </div>
                </div>
            
          </div>
        </div>
        
      </div>
    );

    const container = (
      <div className={containerClass}>
        {header}
        {questionTabsBar}
        {content}
      </div>
    );

    if (isEmbedded) {
      return container;
    }

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        {container}
      </div>
    );
  };


  let contentDisplay;
  const exerciseType = getExerciseTypeBySubject(subjectTitle);

  // console.log("Exercise Type:", exerciseType);
  // Show loader when generating content
  if (selectedSectionId && (generatingExercise[selectedSectionId] || generatingQuiz[selectedSectionId])) {
    const isGeneratingQuiz = generatingQuiz[selectedSectionId] && !generatingExercise[selectedSectionId];
    
    contentDisplay = (
      <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden min-h-[460px] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{isGeneratingQuiz ? "Starting adaptive quiz..." : "Generating exercise..."}</p>
        </div>
      </div>
    );
  } else if (isAdaptiveQuizMode) {    
    contentDisplay = renderAdaptiveQuizDisplay();
  } else if (isProblemSolving) {

    if (exerciseType === 'mentor_chat') {
      const mentorExercise = selectedPracticeExercise || activeExercise;
      const mentorQuestions =
        practiceQuestions.length > 0 ? practiceQuestions : activeExerciseQuestions;
      const mentorExerciseId =
        mentorExercise && mentorExercise.id
          ? String(mentorExercise.id)
          : undefined;
      const mentorResourceList = selectedSection ? buildResourceList(selectedSection) : [];
      const mentorResourceId =
        mentorExerciseId ??
        (selectedResource?.resourceId ? String(selectedResource.resourceId) : null);
      const mentorResourceKind =
        mentorExerciseId != null ? "exercise" : selectedResource?.kind ?? "exercise";
      const mentorResourceIndex =
        mentorResourceId && selectedSection
          ? mentorResourceList.findIndex(
              (resource) =>
                resource.kind === mentorResourceKind &&
                resource.resourceId === String(mentorResourceId),
            )
          : -1;
      const canAdvanceFromMentorPractice =
        mentorResourceIndex >= 0 &&
        (mentorResourceIndex < mentorResourceList.length - 1 ||
          currentSectionIndex < allSections.length - 1);
      const fallbackMentorQuestionId =
        activeMentorQuestionId ??
        (mentorQuestions.length
          ? extractQuestionIdentifier(mentorQuestions[0]) ??
            normalizeIdentifier(mentorQuestions[0]?.id)
          : null);

      contentDisplay = (
        <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Practice Mode: {mentorExercise?.title || 'Exercise'}
            </h2>
            <div className="flex items-center gap-2">
              <button
              type="button"
              onClick={handleAdvanceFromPractice}
              disabled={!canAdvanceFromMentorPractice}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"

            >
              Next Resource
              <ChevronRight className="h-4 w-4" />
            </button>
              <button
                onClick={handleExitPractice}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Exit
              </button>
            </div>
          </div>
          <PracticeMentorChat
            exerciseId={mentorExerciseId}
            sectionTitle={selectedSection?.title || undefined}
            exerciseTitle={mentorExercise?.title || 'Exercise'}
            exerciseDescription={mentorExercise?.description || ''}
            questions={mentorQuestions}
            activeQuestionId={fallbackMentorQuestionId}
            sessions={mentorChatSessions}
            loadingStates={mentorChatLoading}
            sendingStates={mentorChatSending}
            errorStates={mentorChatErrors}
            onSelectQuestion={(questionId) => {
              setActiveMentorQuestionId(questionId);
              loadMentorChatSession(questionId, mentorExerciseId, selectedSectionId);
            }}
            onLoadSession={(questionId, exerciseId) =>
              loadMentorChatSession(
                questionId,
                exerciseId ?? mentorExerciseId,
                selectedSectionId,
              )
            }
            onSendMessage={(questionId, message, exerciseId) =>
              sendMentorChatMessage(
                questionId,
                message,
                exerciseId ?? mentorExerciseId,
              )
            }
          />
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            <p className="font-semibold text-amber-800">Behavioural questions tip</p>
            <p>Enter each behaviour based questions one at a time rather than all questions in one go.</p>
          </div>
          <div className="border-t border-dashed border-slate-200 px-4 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={handleAdvanceFromPractice}
              disabled={!canAdvanceFromMentorPractice}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-900 disabled:border-slate-200 disabled:text-slate-400"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
            
          </div>
        </div>
      );
    } else {
      const typedExerciseType = exerciseType as
        | 'sql'
        | 'python'
        | 'google_sheets'
        | 'statistics'
        | 'reasoning'
        | 'math'
        | 'geometry';
          contentDisplay = (
            <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <span className="text-sm font-semibold text-gray-700">Practice</span>
                <button
                  onClick={handleExitPractice}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Exit
                </button>
              </div>
              <PracticeArea
                questions={practiceQuestions}
                datasets={practiceDatasets}
                exerciseType={typedExerciseType}
                exerciseTitle={selectedPracticeExercise?.title}
                exerciseDifficulty={(selectedPracticeExercise as any)?.difficulty ?? null}
                answersMap={
                  (selectedPracticeExercise as any)?.context?.answers_sql_map ??
                  (selectedPracticeExercise as any)?.answers_sql_map ??
                  null
                }
                focusMode
                onSubmit={handlePracticeSubmit}
                onRequestHint={allowWorkspaceHint ? handlePracticeHintRequest : undefined}
                allowHint={allowWorkspaceHint}
                allowSubmission={allowWorkspaceSubmission}
                practiceDatasetLoading={isPracticeDatasetLoading}
              />
            </div>
          );
        }
  } else if (selectedResource?.kind === "lecture") {
    contentDisplay = renderLectureDisplay();
  } else if (selectedResource?.kind === "exercise") {
    contentDisplay = renderQuestionPopup("embedded");
  } else if (selectedResource?.kind === "quiz") {
    contentDisplay = renderQuizDisplay();
  } else {
    contentDisplay = renderEmptyDisplay();
  }

  const activePracticeTitle = isPracticeMode && selectedPracticeExercise
    ? selectedPracticeExercise.title
    : null;

  const aggregatedLectureMinutes = calculateTotalLectureTime();
  const watchedLectureMinutes = calculateWatchedLectureTime();
  const sectionCompletionStats = useMemo(() => {
    const sections = allSections || [];
    const total = sections.length;
    if (total === 0) {
      return { total: 0, completed: 0, percent: 0 };
    }
    let completed = 0;
    sections.forEach((section) => {
      if (getSectionRequirementSummary(section).completed) {
        completed += 1;
      }
    });
    return {
      total,
      completed,
      percent: Math.round((completed / total) * 100),
    };
  }, [allSections, getSectionRequirementSummary]);
  const sectionProgressPercent = sectionCompletionStats.percent;
  const sectionProgressLabel =
    sectionCompletionStats.total > 0
      ? `${sectionCompletionStats.completed}/${sectionCompletionStats.total} sections complete`
      : "No sections yet";
  const resolvedTotalLectureMinutes =
    hasHydrated && aggregatedLectureMinutes > 0
      ? aggregatedLectureMinutes
      : Math.max(1, Math.ceil(totalSections * 15));
  const watchTimeLabel =
    hasHydrated && aggregatedLectureMinutes > 0
      ? `${watchedLectureMinutes}/${aggregatedLectureMinutes} mins watched`
      : null;

  const isExerciseFocusView = Boolean(selectedQuestionForPopup);
  const hideChrome = isPracticeMode || isExerciseFocusView || isAdaptiveQuizMode;
  const showOutline = !isContentExpanded && !hideChrome;

  return (

    <div
      className={`relative grid grid-cols-1 gap-6 h-full min-h-0 overflow-hidden ${
        showOutline ? "xl:grid-cols-[1fr_380px]" : ""
      }`}
    >

      <div ref={mainContentRef} className="flex flex-col gap-6 min-w-0 overflow-y-auto">

        {!hideChrome && (
          <div className="order-1 lg:order-1 rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-6 backdrop-blur-xl shadow-lg">

          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

            <div>

              <h1 className="text-2xl font-bold text-gray-900 mb-2">

                {trackTitle}

                {subjectTitle ? ` / ${subjectTitle}` : ""}

              </h1>

              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">

                <div className="flex items-center gap-2">

                  <BookOpen className="h-4 w-4" />

                  <span>

                    {totalSections} lesson{totalSections === 1 ? "" : "s"}

                  </span>

                </div>

              <div className="flex items-center gap-2">

                  <Clock className="h-4 w-4" />

                  <span>~{resolvedTotalLectureMinutes} minutes of video</span>

                </div>

              </div>

            </div>

            <div className="flex w-full flex-col items-end gap-3 sm:flex-row sm:items-center sm:justify-end lg:w-auto lg:flex-col lg:items-end">
              <button
                type="button"
                onClick={toggleContentExpanded}
                className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-4 py-2 text-sm font-medium text-indigo-600 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/70 focus:ring-offset-1"
              >
                <Menu className="h-4 w-4" />
                {isContentExpanded ? "Browse Outline" : "Collapse Outline"}
              </button>

              
            </div>

          </div>

          <div className="w-full bg-gray-200 rounded-full h-2">

            <div

              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-500 ease-out"

              style={{ width: `${sectionProgressPercent}%` }}

            />

          </div>

          <div className="mt-2 text-xs text-gray-600 text-center">

            {sectionProgressLabel}{watchTimeLabel ? ` - ${watchTimeLabel}` : ""}

          </div>

          </div>
        )}

        {/* {selectedSection && (

          <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 p-4 backdrop-blur-xl">

            <div className="flex items-center justify-between">

              <div className="flex items-center gap-3">

                <div className="p-2 bg-indigo-100 rounded-lg">

                  <Play className="h-5 w-5 text-indigo-600" />

                </div>

                <div>

                  <h3 className="font-semibold text-gray-900">Current Activity</h3>

                  <p className="text-sm text-gray-600">

                    {selectedSection.title}

                    {currentResourceLabel ? ` - ${currentResourceLabel}` : ""}

                  </p>

                </div>

              </div>

              <div className="text-sm text-gray-500">

                Lesson {currentSectionIndex + 1} of {totalSections}

              </div>

            </div>

          </div>

        )} */}

        <div className="order-2 lg:order-2">
          {selectedAdaptiveSessionReview ? (
            <div className="mb-4">{renderAdaptiveSessionSummaryPanel()}</div>
          ) : (
            contentDisplay
          )}
        </div>

        {!hideChrome && (
          <div className="order-3">
            <ProfessionalCourseTabs
              courseHrefBase={`/curriculum/${courseSlugForUrl || courseId}/${subjectSlugForUrl || subjectId}`}
              sectionId={selectedSectionId}
              sectionTitle={selectedSection?.title}
              section={selectedSection}
              courseId={courseId}
              subjectId={subjectId}
              trackTitle={trackTitle}
              subjectTitle={subjectTitle || undefined}
              canAccessApi={isAuthenticated}
            />
          </div>
        )}

      </div>

      {showOutline && (
        <aside
          className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col gap-4 overflow-y-auto bg-white/95 px-4 py-6 backdrop-blur-md shadow-xl sm:px-6 xl:static xl:z-auto xl:gap-6 xl:bg-transparent xl:px-0 xl:py-0 xl:shadow-none xl:[scrollbar-width:thin] xl:[&::-webkit-scrollbar]:w-2 xl:[&::-webkit-scrollbar-thumb]:rounded-full xl:[&::-webkit-scrollbar-thumb]:bg-slate-300/60 xl:hover:[&::-webkit-scrollbar-thumb]:bg-slate-400/70 xl:[&::-webkit-scrollbar-track]:bg-transparent xl:max-h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:pr-2"
        >
          <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-indigo-700 shadow-sm xl:hidden">
            <span className="text-sm font-semibold">Course Outline</span>
            <button
              type="button"
              onClick={closeNavigation}
              className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-600 shadow-sm transition hover:bg-indigo-50"
            >
              Collapse
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {activePracticeTitle ? (
            <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-4 backdrop-blur-xl shadow-lg">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Practice Exercise</div>
              <p className="mt-3 text-xl font-semibold text-gray-900">{activePracticeTitle}</p>
            </div>
          ) : (
            <>

          <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-4 backdrop-blur-xl shadow-lg">

          <div className="flex items-center gap-2 mb-3">

            <BookOpen className="h-5 w-5 text-indigo-500" />

            <h2 className="font-semibold text-gray-900">Course Content</h2>

            {showRequirements && lockModules && debugUiEnabled ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {manualUnlockedModuleList.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleClearManualUnlocks}
                    className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-600 shadow-sm transition hover:bg-amber-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset Unlock Overrides
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={debugModuleUnlocks}
                  className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 shadow-sm transition hover:bg-indigo-50"
                >
                  Check Unlock Status
                </button>
              </div>
            ) : null}

          </div>

          <p className="text-sm text-gray-600">Drill into a section to pick the resource you want to study.</p>

        </div>

        <div className="space-y-4">

          {(visibleModules || []).map((module, moduleIndex) => {
            // console.log("Rendering module:", module);
            const moduleAccessible = isModuleAccessible(module);
            const moduleIdentifier = getModuleIdentifier(module);
            // console.log("Module Accessibility:", module);
            const moduleIsMandatory = isMandatoryModule(module);
            const statusOverrideLabel = getModuleStatusValue(module);
            const moduleStatusLabel =
              typeof statusOverrideLabel === "string" && statusOverrideLabel.trim().length > 0
                ? statusOverrideLabel
                : moduleIsMandatory
                ? "Mandatory"
                : "Optional";
            const moduleStatusBadgeClass = moduleIsMandatory
              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200";
            const showModuleStatus = moduleIndex !== 0 && Boolean(moduleStatusLabel);
            const moduleKey = module?.id || module?.slug;
            const requirementSummary =
              (moduleKey ? moduleRequirementSummaries.get(String(moduleKey)) : null) ??
              getModuleRequirementSummary(module);

            // console.log("Module Requirement Summary:", module.title, requirementSummary);
                    const requirementBadgeCandidates = [
                      {
                        label: "Lectures",
                        met: requirementSummary.lecturesSatisfied,
                        applicable: requirementSummary.lecturesApplicable ?? true,
                      },
                      {
                        label: "Adaptive Quiz",
                        met: requirementSummary.adaptiveSatisfied,
                        applicable: requirementSummary.quizApplicable ?? true,
                      },
                      {
                        label: "Exercise",
                        met: requirementSummary.exerciseSatisfied,
                        applicable: requirementSummary.exerciseApplicable ?? true,
                      },
                    ];
                    const requirementBadges = requirementBadgeCandidates.filter(
                      (item) => item.applicable,
                    );
                    const displayRequirementTotalCount = requirementSummary.totalCount ?? 0;
                    const displayRequirementMetCount = requirementSummary.metCount ?? 0;
                    const displayRequirementPercent = requirementSummary.progressPercent ?? 0;
                    const displayRequirementCompleted = requirementSummary.completed;
                    return (
            <div

              key={module.slug || `module-${moduleIndex}`}

              className={`rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 backdrop-blur-xl shadow-lg overflow-hidden ${lockModules && !moduleAccessible ? "opacity-70" : ""}`}

            >

              <div className="p-4 border-b border-gray-200/50">

                <h3 className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">

                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-bold">

                    {moduleIndex + 1}

                  </div>

                  {module.title}
                  {showModuleStatus ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${moduleStatusBadgeClass}`}
                    >
                      {moduleStatusLabel}
                    </span>
                  ) : null}
                  {lockModules && !moduleAccessible && (
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        <Lock className="h-3.5 w-3.5" /> Locked
                      </span>
                      {debugUiEnabled && moduleIdentifier ? (
                        <button
                          type="button"
                          onClick={() => handleUnlockModule(moduleIdentifier)}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-600 shadow-sm transition hover:bg-emerald-50"
                        >
                          <Unlock className="h-3 w-3" />
                          Unlock
                        </button>
                      ) : null}
                    </div>
                  )}

                </h3>

                <p className="text-sm text-gray-600 mt-1">

                  {(module.sections || []).length} lesson{(module.sections || []).length === 1 ? "" : "s"}

                </p>

                {showRequirements && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                      <span>Requirements</span>
                      <span>
                        {displayRequirementMetCount}/{displayRequirementTotalCount} met
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${displayRequirementCompleted ? "bg-emerald-500" : "bg-indigo-500"}`}
                        style={{ width: `${displayRequirementPercent}%` }}
                      />
                    </div>
                  </div>
                )}

              </div>

              <div className="p-2">

                {(module.sections || []).map((section, moduleSectionIndex) => {

                  const isCurrentSection = section.id === selectedSectionId;
                  const lectures = getLectures(section);
                  
                  const exercises = getExercises(section);

                    const quizzes = getQuizzes(section);

                    const requirementSummary = getSectionRequirementSummary(section);
                    const sectionCompleted = requirementSummary.completed;
                    const exerciseRequirementMet = requirementSummary.exerciseSatisfied;
                    // console.log("Section Requirement Summary:", requirementSummary);
                    const exerciseStatusMap = requirementSummary.exerciseStatuses ?? {};
                    // console.log("Exercise Status Map:", exerciseStatusMap);
                    const resolveExerciseCompletion = (exerciseId: unknown) => {
                      if (exerciseId === undefined || exerciseId === null) {
                        return exerciseRequirementMet;
                      }
                      const key = String(exerciseId);
                      if (Object.prototype.hasOwnProperty.call(exerciseStatusMap, key)) {
                        return Boolean(exerciseStatusMap[key]);
                      }
                      return exerciseRequirementMet;
                    };
                    const adaptiveCompleted = requirementSummary.adaptiveSatisfied;

                    const isExpanded = isCurrentSection;

                    const matchesLecture =

                      selectedResource?.sectionId === section.id && selectedResource.kind === "lecture";

                    const defaultLectureKey = lectures.length
                      ? getLectureKey(lectures[0], section.id ?? null, 0)
                      : null;

                    const activeLectureKey = matchesLecture

                      ? selectedResource.resourceId ?? defaultLectureKey

                      : null;

                    const sectionToolConfig = section?.id
                      ? lessonToolConfigBySection?.[String(section.id)]
                      : undefined;
                    const allowAiExercise = resolveToolEnabled(sectionToolConfig?.aiExercise);
                    const allowAiAdaptiveQuiz = resolveToolEnabled(sectionToolConfig?.aiAdaptiveQuiz);

                    const sectionExercisesData = sectionExercises[section.id];
                    // console.log("Section Exercises Data:", sectionExercisesData);
                    const hasExercisesFromAPI = Boolean(
                      Array.isArray(sectionExercisesData) && sectionExercisesData.length > 0,
                    );
                    const hasAdminSectionExercise = Array.isArray(sectionExercisesData)
                      ? sectionExercisesData.some((exercise) => exercise?.flag === "admin")
                      : false;
                    const exercisesFetchPending =
                      loadingSectionExercises[section.id] ||
                      sectionExercisesData === undefined;
                    // const shouldHideGenerationButtons =
                    //   exercises.length > 0 ||
                    //   hasExercisesFromAPI ||
                    //   (moduleIndex === 0 && moduleSectionIndex === 0);
                    const adaptiveQuizStatus = activeSectionQuizzes[section.id];
                    const hasActiveAdaptiveQuiz = Boolean(adaptiveQuizStatus?.hasActiveQuiz);
                    const adaptiveHistoryEntries = section.id ? sectionAdaptiveHistories[section.id] ?? [] : [];
                    const adaptiveHistoryTotals = adaptiveHistoryEntries.reduce(
                      (acc, entry) => {
                        const totalQuestions =
                          typeof entry.summary?.totalQuestions === "number" && Number.isFinite(entry.summary.totalQuestions)
                            ? entry.summary.totalQuestions
                            : 0;
                        const answeredQuestions =
                          typeof entry.summary?.answeredQuestions === "number" &&
                          Number.isFinite(entry.summary.answeredQuestions)
                            ? entry.summary.answeredQuestions
                            : 0;
                        const correctAnswers =
                          typeof entry.summary?.correctAnswers === "number" &&
                          Number.isFinite(entry.summary.correctAnswers)
                            ? entry.summary.correctAnswers
                            : 0;
                        return {
                          totalQuestions: acc.totalQuestions + totalQuestions,
                          totalAnswered: acc.totalAnswered + answeredQuestions,
                          totalCorrect: acc.totalCorrect + correctAnswers,
                        };
                      },
                      { totalQuestions: 0, totalAnswered: 0, totalCorrect: 0 },
                    );
                    const adaptiveAggregateScore =
                      adaptiveHistoryTotals.totalQuestions > 0
                        ? Math.round(
                            (adaptiveHistoryTotals.totalCorrect / adaptiveHistoryTotals.totalQuestions) * 100,
                          )
                        : 0;
                    const adaptivePassing = adaptiveAggregateScore >= 70;
                    const adaptiveButtonLabel = hasActiveAdaptiveQuiz ? "Resume Adaptive Quiz" : "Start AI Adaptive Quiz";
                    const adaptiveButtonLoadingLabel = hasActiveAdaptiveQuiz ? "Resuming..." : "Starting...";
                    const quizRunnerBusy = Boolean(quizRunnerLoading[section.id]);
                    const sectionQuizzesData = sectionQuizzes[section.id];
                    // console.log("Section Quizzes Data:", sectionQuizzesData);
                    const hasStoredQuizzes =
                      Array.isArray(sectionQuizzesData) &&
                      sectionQuizzesData.some((quiz) => quizHasQuestions(quiz));
                    // console.log(section.title, "hasStoredQuizzes:", hasStoredQuizzes);
                    const isSectionTopicEmpty = section.title === "Interview Practice Questions" || section.title === "End Project" || section.title === "End Project Final";
                    const hasAvailableQuizzes = hasStoredQuizzes;
                    const storedSectionQuizSummary = sectionQuizSummaries[section.id];
                    const cachedSummary =
                      storedSectionQuizSummary ||
                      (quizSummarySectionId === section.id ? quizSummarySnapshot : null);
                    const hasPersistedSummary = Boolean(cachedSummary);
                    const sectionQuizForSelection =
                      (sectionQuizzesData || []).find((quiz) => quizHasQuestions(quiz)) ??
                      quizzes.find((quiz) => quizHasQuestions(quiz));
                    const resolvedResourceId =
                      sectionQuizForSelection?.id !== undefined && sectionQuizForSelection?.id !== null
                        ? String(sectionQuizForSelection.id)
                        : undefined;
                    const runningQuizResourceId = quizSession?.currentQuizId;
                    const hasRunningQuizSession =
                      isQuizRunnerMode &&
                      runningQuizResourceId != null &&
                      quizSession?.sectionId === section.id &&
                      !completedSectionQuizzes[section.id];
                    const quizIsCompleted = Boolean(completedSectionQuizzes[section.id]) || hasPersistedSummary;
                    const bringQuizControlsIntoFocus = () => {
                      handleExitPractice();
                      handleExitAdaptiveQuiz();
                      openNavigation();
                      autoScrollArmedRef.current = true;
                      setSelectedSectionId(section.id);
                    };
                    const handleResumeQuizRunner = () => {
                      if (!runningQuizResourceId) {
                        return;
                      }
                      bringQuizControlsIntoFocus();
                      const storedQuiz =
                        quizSession?.quizzes?.find((quiz) => quiz.id === runningQuizResourceId) ??
                        (sectionQuizzesData || []).find((quiz) => quiz.id === runningQuizResourceId);
                      setLoadedQuiz(storedQuiz ?? null);
                      setQuizSummaryOpen(false);
                      setSelectedResource({
                        sectionId: section.id,
                        kind: "quiz",
                        resourceId: runningQuizResourceId,
                      });
                      setQuizSession((prev) =>
                        prev
                          ? {
                              ...prev,
                              currentQuizId: runningQuizResourceId,
                            }
                          : prev,
                      );
                      setIsQuizRunnerMode(true);
                    };
                    const handleOpenQuizClick = () => {
                      if (!moduleAccessible) {
                        return;
                      }
                      if (hasRunningQuizSession) {
                        handleResumeQuizRunner();
                        return;
                      }
                      if (quizIsCompleted) {
                        void handleViewAttemptedClick();
                        return;
                      }
                      void handleStartQuizRunner(section, { force: true });
                    };
                    const handleViewAttemptedClick = async () => {
                      if (!moduleAccessible) {
                        return;
                      }
                      bringQuizControlsIntoFocus();
                      setSelectedResource({
                        sectionId: section.id,
                        kind: "quiz",
                        resourceId: resolvedResourceId,
                      });
                      let summaryToShow = cachedSummary;
                      if (summaryToShow) {
                        openPersistedQuizSummary(section.id, summaryToShow);
                        return;
                      }
                      if (resolvedResourceId) {
                        const fetched = await fetchPersistedQuizSummary(section.id, resolvedResourceId);
                        if (fetched) {
                          openPersistedQuizSummary(section.id, fetched);
                          return;
                        }
                      }
                      console.warn("No stored quiz summary available for this section yet.");
                    };

                    return (

                    <div key={section.id} className="mb-2 last:mb-0">

                      <button

                        ref={registerSectionRef(section.id)}

                        onClick={() => {
                          if (!moduleAccessible) return;
                          openNavigation();

                          handleExitAdaptiveQuiz();
                          autoScrollArmedRef.current = true;
                          setSelectedSectionId((prev) => (prev === section.id ? prev : section.id));

                          setSelectedResource((prev) => {
                            if (prev && prev.sectionId === section.id) {
                              return prev;
                            }
                            return getDefaultResource(section) ?? null;

                          });

                        }}

                        disabled={!moduleAccessible}
                        className={`group relative flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                          isCurrentSection
                            ? "border-indigo-300 bg-indigo-50/90 text-indigo-800 shadow-sm"
                            : moduleAccessible
                            ? "border-transparent bg-white/80 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/60"
                            : "border-transparent bg-white/60 text-slate-400 cursor-not-allowed"
                        }`}

                      >

                        <div
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl`}
                        >
                          
                        </div>

                        <div className="flex-1 min-w-0">

                          <div
                            className={`truncate text-sm font-semibold ${
                              isCurrentSection
                                ? "text-indigo-900"
                                : "text-slate-800 group-hover:text-indigo-700"
                            }`}
                          >
                            {section.title}
      
                          </div>

                          {showRequirements && (
                            <div
                              className={`mt-1 text-xs ${
                                sectionCompleted
                                  ? "text-emerald-600"
                                  : isCurrentSection
                                  ? "text-indigo-600"
                                  : "text-slate-500"
                              }`}
                            >
                              {sectionCompleted
                                ? "All requirements met"
                                : `${requirementSummary.metCount}/${requirementSummary.totalCount} requirements`}
                            </div>
                          )}

                        </div>

                        <ChevronRight

                          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${

                            isExpanded ? "rotate-90 text-indigo-500" : ""

                          }`}

                        />

                      </button>



                      {isExpanded && (

                        <div className="mt-2 space-y-1 pl-11 pr-2 pb-3">

                          {lectures.map((lecture, lectureIndex) => {

                            const lectureKey = getLectureKey(
                              lecture,
                              section.id ?? null,
                              lectureIndex,
                            );

                            const isActiveLecture = matchesLecture && activeLectureKey === lectureKey;
                            const lectureIdentifier = lectureKey ? String(lectureKey) : undefined;
                            const lectureWatched = lectureIdentifier
                              ? watchedLectureIds.has(lectureIdentifier)
                              : false;

                            return (

                              <button

                                key={lectureKey}

                                onClick={() => {
                                  if (!moduleAccessible) return;
                                  openNavigation();

                                  // Exit practice/adaptive flows so the lecture can show
                                  handleExitPractice();
                                  handleExitAdaptiveQuiz();

                                  setSelectedSectionId(section.id);
                                  setSelectedResource({
                                    sectionId: section.id,
                                    kind: "lecture",
                                    resourceId: lectureKey,
                                  });
                                }}

                                disabled={!moduleAccessible}
                                className={`group flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                                  isActiveLecture
                                    ? "border-indigo-200 bg-indigo-50 text-indigo-800 shadow-sm"
                                    : moduleAccessible
                                    ? "border-transparent text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700"
                                    : "border-transparent text-slate-400 cursor-not-allowed bg-white/70"
                                }`}

                              >

                                <span
                                  className={`flex h-7 w-7 items-center justify-center rounded-xl ${
                                    isActiveLecture
                                      ? "bg-indigo-100 text-indigo-600"
                                      : "bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600"
                                  }`}
                                >
                                  <Play className="h-3.5 w-3.5" />
                                </span>

                                <div className="flex flex-1 items-center justify-between gap-2">
                                  <span>{lecture.title || `Lecture ${lectureIndex + 1}`}</span>
                                  {lectureIdentifier && (
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                                        lectureWatched ? "text-emerald-600 bg-emerald-50" : "text-slate-400 bg-slate-100"
                                      }`}
                                    >
                                      {lectureWatched ? (
                                        <CheckCircle className="h-3 w-3" />
                                      ) : (
                                        <Clock className="h-3 w-3" />
                                      )}
                                      {lectureWatched ? "Watched" : "Not watched"}
                                    </span>
                                  )}
                                </div>

                              </button>

                            );

                          })}

                          

                          
                          
                          {(() => {
                            const renderExerciseTiles = () => {
                              if (hasExercisesFromAPI) {
                                return sectionExercisesData.map((exercise: any) => {
                                  const isActiveExercise =
                                    selectedPracticeExercise?.id === exercise.id;

                                  // slice description to first 100 chars
                                  const descriptionPreview = exercise.description
                                    ? exercise.description.length > 100 ? exercise.description.slice(0, 100) + "..." : exercise.description
                                    : null;
                                  return (
                                    <div key={exercise.id} className="space-y-2">
                                      <div className="p-3 bg-gray-50 rounded-lg">
                                        <h4 className="font-medium text-gray-900 text-sm">{exercise.title}</h4>
                                        {exercise.description && (
                                          
                                          <p className="text-xs text-gray-600 mt-1">{descriptionPreview}</p>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => moduleAccessible && handleSelectExercise(section.id, exercise)}
                                        disabled={!moduleAccessible}
                                        className={`group flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                                          isActiveExercise
                                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
                                            : moduleAccessible
                                            ? "border border-transparent bg-white/80 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700"
                                            : "border border-transparent bg-white/60 text-slate-400 cursor-not-allowed"
                                        }`}
                                      >
                                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                          <Code className="h-3.5 w-3.5" />
                                        </span>
                                        <div className="flex flex-1 items-center justify-between gap-2 text-left">
                                          <span>Open Exercise</span>
                                          <RequirementChip
                                            completed={resolveExerciseCompletion(exercise.id)}
                                            pendingLabel="Pending"
                                          />
                                        </div>
                                      </button>
                                    </div>
                                  );
                                });
                              }

                              if (exercises.length > 0) {
                                return exercises.map((exercise, exerciseIndex) => {
                                  const isActiveExercise =
                                    selectedPracticeExercise?.id === exercise.id;
                                  return (
                                    <div key={exercise.id || exerciseIndex} className="space-y-2">
                                      <div className="p-3 bg-gray-50 rounded-lg">
                                        <h4 className="font-medium text-gray-900 text-sm">{exercise.title}</h4>
                                        {exercise.description && (
                                          <p className="text-xs text-gray-600 mt-1">{exercise.description}</p>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => moduleAccessible && handleSelectExercise(section.id, exercise)}
                                        disabled={!moduleAccessible}
                                        className={`group flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                                          isActiveExercise
                                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
                                            : moduleAccessible
                                            ? "border border-transparent bg-white/80 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700"
                                            : "border border-transparent bg-white/60 text-slate-400 cursor-not-allowed"
                                        }`}
                                      >
                                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                          <Code className="h-3.5 w-3.5" />
                                        </span>
                                        <div className="flex flex-1 items-center justify-between gap-2 text-left">
                                          <span>Open Exercise</span>
                                          <RequirementChip
                                            completed={resolveExerciseCompletion(exercise.id)}
                                            pendingLabel="Pending"
                                          />
                                        </div>
                                      </button>
                                    </div>
                                  );
                                });
                              }

                              return null;
                            };

                            if (exerciseType === "mentor_chat") {
                              return renderExerciseTiles();
                            }

                            return (
                              <>
                                
                                <div className="space-y-2 mt-2">
                                  {hasAvailableQuizzes && (
                                    <button
                                      type="button"
                                      onClick={handleOpenQuizClick}
                                      disabled={!moduleAccessible || quizRunnerBusy}
                                      className={`group flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                                        moduleAccessible
                                          ? "border border-transparent bg-white/80 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700"
                                          : "border border-transparent bg-white/60 text-slate-400 cursor-not-allowed"
                                      }`}
                                    >
                                    {quizRunnerBusy ? (
                                      <div className="flex w-full items-center justify-center gap-3">
                                        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                        <span>Preparing quiz...</span>
                                      </div>
                                    ) : (
                                      <div className="flex flex-1 items-center justify-between text-left">
                                        <div className="flex items-center gap-2">
                                          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                            <Code className="h-3.5 w-3.5" />
                                          </span>
                                          <span>
                                            {quizIsCompleted
                                              ? "View Attempted Quiz"
                                              : hasRunningQuizSession
                                              ? "Quiz Running"
                                              : "Open Quiz"}
                                          </span>
                                        </div>
                                        <span
                                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold ${
                                            quizIsCompleted
                                              ? "text-emerald-600 bg-emerald-50"
                                              : "text-slate-500 bg-slate-100"
                                          }`}
                                        >
                                          {quizIsCompleted ? "Completed" : "Pending"}
                                        </span>
                                      </div>
                                    )}
                                    </button>
                                  )}
                                  {!isSectionTopicEmpty && (
                                    <>
                                    
                                  {!hasAvailableQuizzes && adaptiveHistoryEntries.length > 0 && (
                                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                                    <div className="mb-2 text-[11px] font-semibold text-slate-700">
                                      Adaptive quiz sessions
                                    </div>
                                     <div className="grid gap-2">
                                       {adaptiveHistoryEntries.map((entry, entryIndex) => {
                                         const sessionLabel = `AI Quiz Session ${adaptiveHistoryEntries.length - entryIndex}`;
                                         const timestampLabel =
                                           formatAdaptiveSessionTimestamp(entry.updatedAt) ||
                                           formatAdaptiveSessionTimestamp(entry.createdAt) ||
                                           "Recent session";
                                         const isActive =
                                           selectedAdaptiveSessionReview?.sessionId === entry.sessionId;
                                         const isLoading =
                                           loadingAdaptiveSessionSummary === entry.sessionId;
                                         return (
                                           <button
                                             key={entry.sessionId || `${section.id}-${entryIndex}`}
                                             onClick={() =>
                                               moduleAccessible &&
                                               handleViewAdaptiveSessionSummary(section.id, entry, entryIndex)
                                             }
                                             disabled={!moduleAccessible || isLoading}
                                             className={`w-full rounded-2xl border px-3 py-2 text-left font-semibold transition ${
                                               isActive
                                                 ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                                                 : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"
                                             } ${isLoading ? "opacity-70 cursor-wait" : ""}`}
                                           >
                                             <div className="flex items-center justify-between gap-3">
                                               <div>
                                                 <div className="text-sm font-semibold text-slate-900">
                                                   {sessionLabel}
                                                 </div>
                                                 <div className="text-[11px] text-slate-500">
                                                   {timestampLabel}
                                                 </div>
                                               </div>
                                               <span className="text-[11px] font-semibold text-slate-500">
                                                 {entry.summary.score}% score
                                               </span>
                                             </div>
                                             <div className="mt-1 text-[11px] text-slate-500">
                                               {entry.summary.totalQuestions} questions · {entry.summary.correctAnswers}/{entry.summary.answeredQuestions} correct
                                               {isLoading && (
                                                 <span className="ml-2 text-indigo-500">Loading...</span>
                                               )}
                                             </div>
                                           </button>
                                         );
                                       })}
                                     </div>
                                     <div className="mt-2 rounded-2xl border border-slate-200 bg-white/90 p-3 text-[12px] text-slate-600 shadow-sm">
                                       <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                                         <span>Total across sessions</span>
                                         <span>Passing ≥ 70%</span>
                                       </div>
                                       <div className="mt-2 flex items-end justify-between text-lg font-semibold text-slate-900">
                                         <span>{adaptiveHistoryTotals.totalQuestions} questions</span>
                                         <span>{adaptiveAggregateScore}% score</span>
                                       </div>
                                       <p className="mt-1 text-[11px] text-slate-500">
                                         {adaptiveHistoryTotals.totalCorrect}/{adaptiveHistoryTotals.totalAnswered} correct answers
                                       </p>
                                       <div
                                         className={`mt-2 inline-flex items-center justify-center rounded-full border px-3 py-0.5 text-[11px] font-semibold ${
                                           adaptivePassing
                                             ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                             : "border-red-200 bg-red-50 text-red-700"
                                         }`}
                                       >
                                         {adaptivePassing ? "Passed" : "Needs improvement"}
                                       </div>
                                     </div>
                                   </div>
                                )}

                                </>
                                  )}

                                  { !isSectionTopicEmpty && ( 
                                    <>
                                    

                                  {allowAiAdaptiveQuiz && (
                                  
                                  <button
                                    onClick={() => moduleAccessible && handleStartAdaptiveQuiz(section)}
                                    disabled={generatingQuiz[section.id] || isAdaptiveQuizMode || !moduleAccessible}
                                    className="w-full rounded-lg px-3 py-2 text-sm flex items-center gap-2 transition bg-gradient-to-r from-green-500 to-teal-500 text-white hover:from-green-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {generatingQuiz[section.id] ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        <div className="flex flex-1 items-center justify-between gap-2 text-left">
                                          <span>{adaptiveButtonLoadingLabel}</span>
                                          <RequirementChip completed={adaptiveCompleted} pendingLabel="Pending" />
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <Activity className="h-4 w-4" />
                                        <div className="flex flex-1 items-center justify-between gap-2 text-left">
                                          <span>{adaptiveButtonLabel}</span>
                                          <RequirementChip completed={adaptiveCompleted} pendingLabel="Pending" />
                                        </div>
                                      </>
                                    )}
                                  </button>
                                  )}
                                  </>
                                  )}
                                  {/* {adaptiveHistoryEntries.length > 0 && (
                                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                                      <div className="mb-2 text-[11px] font-semibold text-slate-700">
                                        Adaptive quiz sessions
                                      </div>
                                      <div className="grid gap-2">
                                        {adaptiveHistoryEntries.map((entry, entryIndex) => {
                                          const sessionLabel = `AI Quiz Session ${entryIndex + 1}`;
                                          const timestampLabel =
                                            formatAdaptiveSessionTimestamp(entry.updatedAt) ||
                                            formatAdaptiveSessionTimestamp(entry.createdAt) ||
                                            "Recent session";
                                          const isActive =
                                            selectedAdaptiveSessionReview?.sessionId === entry.sessionId;
                                          const isLoading =
                                            loadingAdaptiveSessionSummary === entry.sessionId;
                                          return (
                                            <button
                                              key={entry.sessionId || `${section.id}-${entryIndex}`}
                                              onClick={() =>
                                                moduleAccessible &&
                                                handleViewAdaptiveSessionSummary(section.id, entry, entryIndex)
                                              }
                                              disabled={!moduleAccessible || isLoading}
                                              className={`w-full rounded-2xl border px-3 py-2 text-left font-semibold transition ${
                                                isActive
                                                  ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                                                  : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"
                                              } ${isLoading ? "opacity-70 cursor-wait" : ""}`}
                                            >
                                              <div className="flex items-center justify-between gap-3">
                                                <div>
                                                  <div className="text-sm font-semibold text-slate-900">
                                                    {sessionLabel}
                                                  </div>
                                                  <div className="text-[11px] text-slate-500">
                                                    {timestampLabel}
                                                  </div>
                                                </div>
                                                <span className="text-[11px] font-semibold text-slate-500">
                                                  {entry.summary.score}% score
                                                </span>
                                              </div>
                                              <div className="mt-1 text-[11px] text-slate-500">
                                                {entry.summary.totalQuestions} questions · {entry.summary.correctAnswers}/{entry.summary.answeredQuestions} correct
                                                {isLoading && (
                                                  <span className="ml-2 text-indigo-500">Loading...</span>
                                                )}
                                              </div>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )} */}
                                </div>

                                {renderExerciseTiles()}

                                {allowAiExercise && !hasAdminSectionExercise && (
                                  <button
                                    onClick={() => moduleAccessible && handleGenerateExercise(section)}
                                    disabled={
                                      generatingExercise[section.id] ||
                                      !moduleAccessible ||
                                      exercisesFetchPending
                                    }
                                    className="w-full rounded-lg px-3 py-2 text-sm flex items-center gap-2 transition bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                                  >
                                    {exercisesFetchPending ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        <span>Loading exercises...</span>
                                      </>
                                    ) : generatingExercise[section.id] ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        <span>Generating...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Code className="h-4 w-4" />
                                        <span>Generate AI Case Study</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>

                      )}

                    </div>

                  );

                })}

              </div>

            </div>

          );
          })}

          </div>

          </>
        )}
        </aside>
      )}
    </div>

    );
}
