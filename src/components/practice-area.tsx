"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  Code,
  Database,
  BarChart3,
  FileSpreadsheet,
  Check,
  X,
  Clock,
  Eye,
  EyeOff,
  RefreshCw,
  Lightbulb,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { RichContent } from './rich-content';
import { formatDatasetValue } from '@/lib/utils';
import { apiGet } from '@/lib/api-client';

type PracticeQuestion = {
  id: string;
  exercise_id: string;
  text: string;
  type: 'sql' | 'python' | 'google_sheets' | 'statistics' | 'reasoning' | 'math' | 'problem_solving' | 'geometry';
  language?: string;
  content?: any;
  section_exercise_answers?: Array<{
    id?: string;
    answer_text?: string;
    is_case_sensitive?: boolean;
  }>;
  answer_text?: string;
  correct_answer?: string | string[] | null;
  solution?: string | null;
  hint?: string;
  explanation?: string;
  starter_code?: string;
  expected_runtime?: number;
  test_cases?: any[];
  sample_data?: any;
  order_index: number;
  latestSubmission?: {
    userAnswer?: string;
    isCorrect?: boolean;
    score?: number;
    feedback?: string | null;
    verdict?: string;
    evaluation?: { verdict?: string; feedback?: string } | null;
    submittedAt?: string;
    attemptNumber?: number;
  };
  latestHint?: {
    verdict?: string;
    message: string;
    userAnswer?: string;
    datasetContext?: string;
    requestedAt?: string;
    rawResponse?: unknown;
  };
};

type Dataset = {
  id: string;
  name: string;
  description?: string;
  table_name?: string;
  columns?: string[];
  data?: any[];
  creation_sql?: string;
  schema_info?: any;
};

const DATASET_TABLE_GROUPING_KEYS = ['table_name', 'table', 'tableName', 'dataset_name'];

type DatasetRowGroup = {
  tableName: string;
  rows: Array<Record<string, unknown>>;
  columns: string[];
};

const getColumnsFromRows = (
  rows: Array<Record<string, unknown>>,
  explicitColumns?: string[],
): string[] => {
  if (explicitColumns && explicitColumns.length > 0) {
    return explicitColumns;
  }
  const seen = new Set<string>();
  const ordered: string[] = [];
  rows.forEach((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      Object.keys(row).forEach((column) => {
        if (!seen.has(column)) {
          seen.add(column);
          ordered.push(column);
        }
      });
    }
  });
  if (ordered.length > 0) {
    return ordered;
  }
  return ['value'];
};

const groupDatasetRowsByTable = (dataset?: Dataset | null): DatasetRowGroup[] | null => {
  if (!dataset) {
    return null;
  }
  const rawRows = Array.isArray(dataset.data) ? dataset.data : [];
  if (rawRows.length === 0) {
    return null;
  }

  const firstObjectRow = rawRows.find(
    (row) => row && typeof row === 'object' && !Array.isArray(row),
  ) as Record<string, unknown> | undefined;
  if (!firstObjectRow) {
    return null;
  }

  const groupingKey = DATASET_TABLE_GROUPING_KEYS.find((key) =>
    Object.prototype.hasOwnProperty.call(firstObjectRow, key),
  );
  if (!groupingKey) {
    return null;
  }

  const columnsHint =
    Array.isArray(dataset.columns) && dataset.columns.length > 0
      ? dataset.columns.filter((column) => column !== groupingKey)
      : undefined;

  const grouped = new Map<string, Array<Record<string, unknown>>>();

  rawRows.forEach((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return;
    }
    const nameValue = row[groupingKey];
    const tableName = nameValue != null ? String(nameValue) : 'Table';
    const bucket = grouped.get(tableName) ?? [];
    bucket.push(row as Record<string, unknown>);
    grouped.set(tableName, bucket);
  });

  if (grouped.size <= 1) {
    return null;
  }

  return Array.from(grouped.entries()).map(([tableName, rows]) => {
    const cleanedRows = rows.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return row as Record<string, unknown>;
      }
      const copy = { ...row };
      delete copy[groupingKey];
      return copy;
    }) as Array<Record<string, unknown>>;
    const columns = getColumnsFromRows(cleanedRows, columnsHint);
    return {
      tableName: tableName || 'Table',
      rows: cleanedRows,
      columns,
    };
  });
};

const PRACTICE_SUBMISSION_STORAGE_PREFIX = "jarvis.practice.submission";

const getPracticeSubmissionStorageKey = (exerciseId: string, questionId: string) =>
  `${PRACTICE_SUBMISSION_STORAGE_PREFIX}:${exerciseId}:${questionId}`;

const readStoredPracticeSubmission = (exerciseId?: string, questionId?: string): string | null => {
  if (!exerciseId || !questionId || typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(
      getPracticeSubmissionStorageKey(exerciseId, questionId),
    );
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored);
    const code = typeof parsed?.code === "string" ? parsed.code : "";
    return code.trim().length > 0 ? code : null;
  } catch (error) {
    console.warn("Failed to read cached practice submission:", error);
    return null;
  }
};

const persistPracticeSubmission = (
  exerciseId?: string,
  questionId?: string,
  code?: string,
) => {
  if (!exerciseId || !questionId || !code || typeof window === "undefined") {
    return;
  }
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    return;
  }
  try {
    const payload = {
      code: normalizedCode,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      getPracticeSubmissionStorageKey(exerciseId, questionId),
      JSON.stringify(payload),
    );
  } catch (error) {
    console.warn("Failed to persist practice submission:", error);
  }
};

type PracticeAreaProps = {
  questions: PracticeQuestion[];
  datasets: Dataset[];
  exerciseType: 'sql' | 'python' | 'google_sheets' | 'statistics' | 'reasoning' | 'math' | 'problem_solving' | 'geometry';
  exerciseTitle?: string;
  exerciseDifficulty?: string | null;
  answersMap?: Record<string, string> | null;
  allowHint?: boolean;
  allowSubmission?: boolean;
  onSubmit?: (
    questionId: string,
    solution: string
  ) => Promise<{
    success: boolean;
    isCorrect?: boolean;
    feedback?: string;
    verdict?: string;
    evaluation?: { verdict?: string; feedback?: string } | null;
    submission?: unknown;
  }>;
  onRequestHint?: (
    questionId: string,
    solution: string
  ) => Promise<{ verdict?: string; message: string } | null>;
  onNext?: () => void;
  onPrevious?: () => void;
  practiceDatasetLoading?: boolean;
};

const getLanguageIcon = (type: string) => {
  switch (type) {
    case 'sql':
      return <Database className="w-4 h-4" />;
    case 'python':
      return <Code className="w-4 h-4" />;
    case 'statistics':
      return <BarChart3 className="w-4 h-4" />;
    case 'google_sheets':
      return <FileSpreadsheet className="w-4 h-4" />;
    default:
      return <Code className="w-4 h-4" />;
  }
};

const getLanguageDisplayName = (type: string) => {
  switch (type) {
    case 'sql':
      return 'SQL';
    case 'python':
      return 'Python';
    case 'statistics':
      return 'Statistics';
    case 'google_sheets':
      return 'Google Sheets';
    case 'reasoning':
      return 'Logic & Reasoning';
    case 'math':
      return 'Mathematics';
    case 'geometry':
      return 'Geometry';
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
};

const getDefaultCode = (type: string, questionText: string) => {
  switch (type) {
    case 'sql':
      return '-- Write your SQL query here\nSELECT \n  \nFROM \n  \nWHERE \n  ;';
    case 'python':
      return `# Write your Python solution here
def solution():
    # Your code here
    pass

# Test your solution
result = solution()
print(result)`;
    case 'statistics':
      return `# Statistical analysis
import pandas as pd
import numpy as np

# Your analysis here
`;
    case 'google_sheets':
      return '=';
    default:
      return '# Write your solution here';
  }
};

const DATASET_DEFAULT_TABLE_KEY = '__default';

export function PracticeArea({
  questions,
  datasets,
  exerciseType,
  exerciseTitle,
  exerciseDifficulty,
  answersMap,
  onSubmit,
  onRequestHint,
  onNext,
  onPrevious,
  practiceDatasetLoading = false,
  allowHint = true,
  allowSubmission = true,
}: PracticeAreaProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userCode, setUserCode] = useState('');
  const [showDataset, setShowDataset] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    success: boolean;
    isCorrect?: boolean;
    feedback?: string;
    verdict?: string;
    evaluation?: { verdict?: string; feedback?: string } | null;
  } | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [hintResult, setHintResult] = useState<{ verdict?: string; message: string } | null>(null);
  const [isRequestingHint, setIsRequestingHint] = useState(false);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  const lastQuestionIdRef = useRef<string | null>(null);
  const lastSubmittedQuestionIdRef = useRef<string | null>(null);

  const currentQuestion = questions[currentQuestionIndex];
  const currentDataset = datasets[currentQuestionIndex];
  const [expandedDatasetTables, setExpandedDatasetTables] = useState<Record<string, boolean>>({});
  const toggleDatasetTableExpansion = (tableKey: string) => {
    setExpandedDatasetTables((prev) => ({
      ...prev,
      [tableKey]: !prev[tableKey],
    }));
  };
  const datasetRows = Array.isArray(currentDataset?.data)
    ? (currentDataset.data as Array<Record<string, unknown>>)
    : [];
  const groupedDatasetTables = groupDatasetRowsByTable(currentDataset);
  const datasetColumns =
    Array.isArray(currentDataset?.columns) && currentDataset.columns.length > 0
      ? currentDataset.columns
      : undefined;
  const datasetDefaultColumns = getColumnsFromRows(datasetRows, datasetColumns);
  const renderDatasetRowsTable = (columns: string[], rows: Array<Record<string, unknown>>) => {
    if (!rows || rows.length === 0) {
      return <div className="text-xs text-gray-500">No rows available for this table.</div>;
    }
    const resolvedColumns = columns.length > 0 ? columns : ['value'];
    const visibleRows = rows.slice(0, 5);

    const getCellValue = (row: unknown, column: string) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        return formatDatasetValue((row as Record<string, unknown>)[column]);
      }
      if (column === 'value') {
        return formatDatasetValue(row);
      }
      return '';
    };

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border border-gray-200">
          <thead>
            <tr className="bg-gray-50">
              {resolvedColumns.map((column) => (
                <th
                  key={column}
                  className="px-2 py-1 border border-gray-200 text-left"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {resolvedColumns.map((column) => (
                  <td
                    key={`${rowIndex}-${column}`}
                    className="px-2 py-1 border border-gray-200"
                  >
                    {getCellValue(row, column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  const currentQuestionId = useMemo(() => {
    if (!currentQuestion) {
      return null;
    }
    const rawId =
      (currentQuestion as Record<string, unknown> | undefined)?.id ??
      (currentQuestion as Record<string, unknown> | undefined)?.question_id ??
      null;
    return rawId !== null && rawId !== undefined ? String(rawId) : null;
  }, [currentQuestion]);

  const currentExerciseId = useMemo(() => {
    if (!currentQuestion) {
      return null;
    }
    const candidate =
      (currentQuestion as { exercise_id?: unknown })?.exercise_id ??
      (currentQuestion as { exerciseId?: unknown })?.exerciseId ??
      (currentQuestion as { exerciseId?: unknown })?.exercise_id;
    if (candidate === null || candidate === undefined) {
      return null;
    }
    return String(candidate);
  }, [currentQuestion]);

  const resolvedQuestionText = useMemo(() => {
    if (!currentQuestion) {
      return '';
    }

    const rawContent =
      typeof (currentQuestion as any)?.content === 'string'
        ? (currentQuestion as any).content
        : typeof (currentQuestion as any)?.content?.text === 'string'
        ? (currentQuestion as any).content.text
        : undefined;

    const candidates = [
      currentQuestion.text,
      (currentQuestion as any)?.question_text,
      (currentQuestion as any)?.business_question,
      (currentQuestion as any)?.prompt,
      rawContent,
    ];

    const match = candidates.find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );

    return match ?? '';
  }, [currentQuestion]);

  const latestSubmission = useMemo(() => {
    if (!currentQuestion) {
      return null;
    }
    const submission = (currentQuestion as Record<string, any>)?.latestSubmission;
    return submission ?? null;
  }, [currentQuestion]);

  const resolvedAnswerText = useMemo(() => {
    const normalizeAnswer = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      if (Array.isArray(value)) {
        const joined = value
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0)
          .join('\n')
          .trim();
        return joined.length > 0 ? joined : null;
      }
      return null;
    };

    if (!currentQuestion) {
      return '';
    }

    const relatedAnswers =
      Array.isArray((currentQuestion as any)?.section_exercise_answers)
        ? (currentQuestion as any).section_exercise_answers
            .map((entry: any) => normalizeAnswer(entry?.answer_text))
            .filter((value): value is string => Boolean(value))
        : [];

    const answerFromMap = (() => {
      if (!answersMap) {
        return null;
      }

      const lookup = (key: unknown) => {
        if (key === null || key === undefined) return null;
        const normalizedKey =
          typeof key === 'number'
            ? String(key)
            : typeof key === 'string' && key.trim().length > 0
            ? key.trim()
            : null;
        if (!normalizedKey) return null;
        const match =
          answersMap[normalizedKey] ??
          answersMap[String(Number(normalizedKey))];
        return typeof match === 'string' && match.trim().length > 0
          ? match.trim()
          : null;
      };

      const candidateKeys = [
        (currentQuestion as any)?.id,
        (currentQuestion as any)?.question_id,
        (currentQuestion as any)?.questionId,
        (currentQuestion as any)?.content?.original_id,
        (currentQuestion as any)?.original_id,
        (currentQuestion as any)?.order_index,
        typeof (currentQuestion as any)?.order_index === 'number'
          ? (currentQuestion as any)?.order_index + 1
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
      (currentQuestion as any)?.answer_text,
      (currentQuestion as any)?.answer,
      (currentQuestion as any)?.answer_sql,
      currentQuestion.correct_answer,
      currentQuestion.solution,
      (currentQuestion as any)?.content?.answer,
      (currentQuestion as any)?.content?.solution,
      (currentQuestion as any)?.content?.answer_sql,
      (currentQuestion as any)?.content?.answerSql,
      answerFromMap,
      ...relatedAnswers,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeAnswer(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return '';
  }, [answersMap, currentQuestion]);

  // Initialize code when question changes
  useEffect(() => {
    if (!currentQuestion) {
      lastQuestionIdRef.current = null;
      setUserCode('');
      setSubmissionResult(null);
      setHintResult(null);
      return;
    }

    const identifier = currentQuestionId ?? `${currentQuestionIndex}`;
    if (lastQuestionIdRef.current === identifier) {
      return;
    }

    lastQuestionIdRef.current = identifier;
    lastSubmittedQuestionIdRef.current = null;

    const cachedSubmissionCode = readStoredPracticeSubmission(
      currentExerciseId ?? undefined,
      currentQuestionId ?? undefined,
    );
    const storedSubmission = (currentQuestion as Record<string, any>)?.latestSubmission;
    const submissionCandidate =
      storedSubmission &&
      typeof storedSubmission.userAnswer === 'string' &&
      storedSubmission.userAnswer.trim().length > 0
        ? storedSubmission.userAnswer
        : undefined;
    const starterCode =
      cachedSubmissionCode ??
      submissionCandidate ??
      (typeof currentQuestion.starter_code === 'string' &&
      currentQuestion.starter_code.trim().length > 0
        ? currentQuestion.starter_code
        : getDefaultCode(exerciseType, resolvedQuestionText));

    setUserCode(starterCode);
    setShowHint(false);
    setElapsedTime(0);
    setIsTimerRunning(true);
  }, [
    currentQuestion,
    currentQuestionId,
    currentQuestionIndex,
    currentExerciseId,
    exerciseType,
    resolvedQuestionText,
  ]);

  // Sync submission result with stored data
  useEffect(() => {
    if (!currentQuestion) {
      setSubmissionResult(null);
      return;
    }

    if (latestSubmission) {
      setSubmissionResult({
        success: true,
        isCorrect: Boolean(latestSubmission.isCorrect),
        feedback:
          latestSubmission.feedback ||
          latestSubmission.evaluation?.feedback ||
          undefined,
        verdict:
          latestSubmission.verdict ||
          (latestSubmission.isCorrect ? 'Correct' : 'Incorrect'),
        evaluation: latestSubmission.evaluation ?? null,
      });
    } else if (
      currentQuestionId &&
      lastSubmittedQuestionIdRef.current === currentQuestionId
    ) {
      // Preserve the most recent in-flight submission result until we receive synced data.
      return;
    } else {
      setSubmissionResult(null);
    }
  }, [currentQuestion, currentQuestionId, latestSubmission]);

  const questionStatus = useMemo<"correct" | "incorrect" | null>(() => {
    if (submissionResult && typeof submissionResult.isCorrect === 'boolean') {
      return submissionResult.isCorrect ? 'correct' : 'incorrect';
    }
    if (latestSubmission && typeof latestSubmission.isCorrect === 'boolean') {
      return latestSubmission.isCorrect ? 'correct' : 'incorrect';
    }
    return null;
  }, [latestSubmission, submissionResult]);

  // Sync hint result with stored data
  useEffect(() => {
    if (!currentQuestion) {
      setHintResult(null);
      return;
    }

    const storedHint = (currentQuestion as Record<string, any>)?.latestHint;
    if (storedHint) {
      setHintResult({
        verdict: storedHint.verdict,
        message: storedHint.message,
      });
    } else {
      setHintResult(null);
    }
  }, [currentQuestion]);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Fetch recent submissions for the question
  useEffect(() => {
    if (!currentQuestionId || !currentExerciseId) {
      setRecentSubmissions([]);
      setLoadingSubmissions(false);
      return;
    }

    let isSubscribed = true;

    const fetchRecentSubmissions = async () => {
      try {
        setLoadingSubmissions(true);
        const data = await apiGet<any>(
          `/v1/sections/exercises/${currentExerciseId}/questions/${currentQuestionId}/submissions`
        );
        if (!isSubscribed) {
          return;
        }
        const submissions = data?.submissions || [];
        setRecentSubmissions(submissions);
        const latestSubmission = submissions[0];
        const latestAnswerCandidate =
          latestSubmission?.user_answer ?? latestSubmission?.userAnswer;
        if (typeof latestAnswerCandidate === 'string') {
          setUserCode(latestAnswerCandidate);
          persistPracticeSubmission(currentExerciseId, currentQuestionId, latestAnswerCandidate);
        }
      } catch (error) {
        if (isSubscribed) {
          console.error('Failed to fetch submission history:', error);
          setRecentSubmissions([]);
        }
      } finally {
        if (isSubscribed) {
          setLoadingSubmissions(false);
        }
      }
    };

    fetchRecentSubmissions();

    return () => {
      isSubscribed = false;
    };
  }, [currentExerciseId, currentQuestionId]);

  const canSubmit = Boolean(allowSubmission && onSubmit);
  const canRequestHint = Boolean(allowHint && onRequestHint);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !currentQuestion) return;

    setIsSubmitting(true);
    setIsTimerRunning(false);
    setHintResult(null);

    try {
      const result = await onSubmit(currentQuestion.id, userCode);
      setSubmissionResult(result);
      if (currentQuestionId) {
        lastSubmittedQuestionIdRef.current = currentQuestionId;
      }
    } catch (error) {
      setSubmissionResult({
        success: false,
        feedback: 'An error occurred while submitting your solution.'
      });
      if (currentQuestionId) {
        lastSubmittedQuestionIdRef.current = currentQuestionId;
      }
    } finally {
      setIsSubmitting(false);
      if (currentExerciseId && currentQuestionId) {
        persistPracticeSubmission(currentExerciseId, currentQuestionId, userCode);
      }
    }
  }, [
    canSubmit,
    onSubmit,
    currentQuestion,
    currentQuestionId,
    currentExerciseId,
    userCode,
    fallbackDifficulty,
  ]);

  const handleHintRequest = useCallback(async () => {
    if (!canRequestHint || !currentQuestion) {
      return;
    }
    setIsRequestingHint(true);
    try {
      const result = await onRequestHint(currentQuestion.id, userCode);
      if (result) {
        setHintResult(result);
      } else {
        setHintResult({
          verdict: 'Try Again',
          message: 'Unable to generate a hint right now. Give it another shot in a moment.',
        });
      }
    } catch (error) {
      setHintResult({
        verdict: 'Try Again',
        message: 'Something went wrong while fetching a hint. Please try once more.',
      });
    } finally {
      setIsRequestingHint(false);
    }
  }, [canRequestHint, onRequestHint, currentQuestion, userCode]);

  const handleNext = useCallback(() => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else if (onNext) {
      onNext();
    }
  }, [currentQuestionIndex, questions.length, onNext]);

  const handlePrevious = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    } else if (onPrevious) {
      onPrevious();
    }
  }, [currentQuestionIndex, onPrevious]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentQuestion) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center text-gray-500">
          No questions available for this quiz.
        </div>
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-end gap-3">
          <button
            onClick={handlePrevious}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>
          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg bg-indigo-600 hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full max-h-[calc(100vh-8rem)]">
      {/* Left Panel - Question Description */}
      <div className="w-1/2 flex flex-col border-r border-gray-200">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getLanguageIcon(exerciseType)}
              <h2 className="text-lg font-semibold text-gray-900">
                {exerciseTitle || 'Practice Exercise'}
              </h2>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatTime(elapsedTime)}
              </div>
              <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                {getLanguageDisplayName(exerciseType)}
              </div>
            </div>
          </div>
        </div>

        {/* Question Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {/* Question Number and Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-medium text-gray-900">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </h3>
                {questionStatus ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      questionStatus === 'correct'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}
                  >
                    {questionStatus === 'correct' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <X className="w-3.5 h-3.5" />
                    )}
                    {questionStatus === 'correct' ? 'Correct' : 'Incorrect'}
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevious}
                  disabled={currentQuestionIndex === 0}
                  className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                >
                  Previous
                </button>
                <button
                  onClick={handleNext}
                  disabled={currentQuestionIndex === questions.length - 1}
                  className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed text-blue-700 rounded"
                >
                  Next
                </button>
              </div>
            </div>

            {/* Question Text */}
            <div className="prose-content">
              <RichContent content={resolvedQuestionText} className="text-gray-700" />
            </div>

            {resolvedAnswerText && (
              <div className="border border-emerald-200 rounded-lg bg-emerald-50 p-3">
                <div className="text-sm font-semibold text-emerald-800">
                  Answer
                </div>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-sm text-emerald-900">
                  {resolvedAnswerText}
                </pre>
              </div>
            )}

            {/* Dataset Section */}
            {currentDataset && (
              <div className="border border-gray-200 rounded-lg">
                <button
                  onClick={() => setShowDataset(!showDataset)}
                  className="w-full p-3 text-left flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <span className="font-medium">Dataset: {currentDataset.name}</span>
                  </div>
                  {showDataset ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {showDataset && (
                  <div className="px-3 pb-3">
                    <p className="text-sm text-gray-600 mb-2">{currentDataset.description}</p>
                    {currentDataset.columns && (
                      <div className="mb-2">
                        <p className="text-sm font-medium text-gray-700">Columns:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {currentDataset.columns.map((column, idx) => (
                            <span key={idx} className="px-2 py-1 bg-gray-100 text-xs rounded">
                              {column}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {practiceDatasetLoading ? (
                      <div className="py-6 text-center text-xs text-gray-500">
                        Loading dataset preview...
                      </div>
                    ) : (
                      datasetRows.length > 0 && (
                        <>
                          {groupedDatasetTables ? (
                            groupedDatasetTables.map((group, index) => {
                              const key = `${group.tableName || 'Table'}-${index}`;
                              const isExpanded = Boolean(expandedDatasetTables[key]);
                              const visibleRows = isExpanded
                                ? group.rows
                                : group.rows.slice(0, 5);
                              return (
                                <div key={key} className="mb-4 last:mb-0">
                                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                    <span className="font-medium text-gray-700">
                                      Table: {group.tableName}
                                    </span>
                                    <div className="flex items-center gap-3">
                                      {group.rows.length > 5 && (
                                        <button
                                          type="button"
                                          onClick={() => toggleDatasetTableExpansion(key)}
                                          className="text-xs text-gray-600 underline decoration-dotted underline-offset-2"
                                        >
                                          {isExpanded ? 'Show first 5 rows' : 'Show all rows'}
                                        </button>
                                      )}
                                      <span className="text-xs text-gray-500">
                                        {isExpanded
                                          ? `Showing ${group.rows.length} rows`
                                          : `Showing ${visibleRows.length} of ${group.rows.length} rows`}
                                      </span>
                                    </div>
                                  </div>
                                  {renderDatasetRowsTable(group.columns, visibleRows)}
                                </div>
                              );
                            })
                          ) : (
                            <>
                              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                <div className="flex items-center gap-3">
                                  {datasetRows.length > 5 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleDatasetTableExpansion(DATASET_DEFAULT_TABLE_KEY)
                                      }
                                      className="text-xs text-gray-600 underline decoration-dotted underline-offset-2"
                                    >
                                      {expandedDatasetTables[DATASET_DEFAULT_TABLE_KEY]
                                        ? 'Show first 5 rows'
                                        : 'Show all rows'}
                                    </button>
                                  )}
                                </div>
                                <span className="text-xs text-gray-500">
                                  {expandedDatasetTables[DATASET_DEFAULT_TABLE_KEY]
                                    ? `Showing ${datasetRows.length} rows`
                                    : `Showing ${Math.min(5, datasetRows.length)} of ${datasetRows.length} rows`}
                                </span>
                              </div>
                              {renderDatasetRowsTable(
                                datasetDefaultColumns,
                                expandedDatasetTables[DATASET_DEFAULT_TABLE_KEY]
                                  ? datasetRows
                                  : datasetRows.slice(0, 5),
                              )}
                            </>
                          )}
                        </>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Hint Section */}
            {currentQuestion.hint && (
              <div className="border border-yellow-200 rounded-lg">
                <button
                  onClick={() => setShowHint(!showHint)}
                  className="w-full p-3 text-left flex items-center justify-between hover:bg-yellow-50"
                >
                  <span className="font-medium text-yellow-800">💡 Hint</span>
                  {showHint ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {showHint && (
                  <div className="px-3 pb-3 text-sm text-yellow-700">
                    <RichContent content={currentQuestion.hint} className="text-yellow-700" />
                  </div>
                )}
              </div>
            )}

            {/* Explanation Section */}
            {currentQuestion.explanation && submissionResult && (
              <div className="border border-blue-200 rounded-lg">
                <div className="p-3 bg-blue-50">
                  <span className="font-medium text-blue-800">📝 Explanation</span>
                </div>
                <div className="px-3 py-3 text-sm text-blue-900">
                  <RichContent content={currentQuestion.explanation} className="text-blue-900" />
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Right Panel - Code Editor */}
      <div className="w-1/2 flex flex-col">
        {/* Code Editor Header */}
        <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">
              Solution ({getLanguageDisplayName(exerciseType)})
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const defaultCode = getDefaultCode(exerciseType, resolvedQuestionText);
                setUserCode(defaultCode);
                setSubmissionResult(null);
                setHintResult(null);
                lastSubmittedQuestionIdRef.current = null;
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
            >
              <RefreshCw className="w-3 h-3" />
              Reset
            </button>
            {canRequestHint ? (
              <button
                onClick={handleHintRequest}
                disabled={isRequestingHint}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-900 rounded disabled:opacity-60"
              >
                {isRequestingHint ? (
                  <RefreshCw className="w-3 h-3 animate-spin text-yellow-600" />
                ) : (
                  <Lightbulb className="w-3 h-3 text-yellow-500" />
                )}
                {isRequestingHint ? 'Hinting...' : 'Get Hint'}
              </button>
            ) : null}
            {canSubmit && (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                {isSubmitting ? 'Running...' : 'Submit'}
              </button>
            )}
          </div>
        </div>

        {/* Code Editor */}
        <div className="flex-1">
          <textarea
            value={userCode}
            onChange={(e) => setUserCode(e.target.value)}
            className="w-full h-full p-4 font-mono text-sm border-none resize-none focus:outline-none"
            placeholder={`Write your ${getLanguageDisplayName(exerciseType)} solution here...`}
            style={{ 
              fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
              tabSize: 2,
              minHeight: '400px'
            }}
          />
        </div>
        {/* Output Section */}
        <div className="border-t border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-500">
              Output
            </span>
          </div>
          <div className="px-4 py-3 text-sm text-gray-700 min-h-[120px] overflow-auto">
            {submissionResult ? (
              <div
                className={`flex flex-col gap-2 rounded-lg border p-3 ${
                  submissionResult.isCorrect
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {submissionResult.isCorrect ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-red-600" />
                  )}
                  <span
                    className={`font-medium ${
                      submissionResult.isCorrect ? 'text-green-800' : 'text-red-800'
                    }`}
                  >
                    {submissionResult.verdict
                      ? submissionResult.verdict
                      : submissionResult.isCorrect
                        ? 'Correct!'
                        : 'Incorrect'}
                  </span>
                </div>
                {submissionResult.feedback ? (
                  <div
                    className={`text-sm ${
                      submissionResult.isCorrect ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    <RichContent content={submissionResult.feedback} />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Run your solution to see detailed feedback here.
              </p>
            )}
            {hintResult ? (
              <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <div className="flex items-start gap-2 text-sm text-yellow-900">
                  <Lightbulb className="mt-0.5 h-4 w-4 text-yellow-500" />
                  <div>
                    {hintResult.verdict ? (
                      <span className="font-semibold">{hintResult.verdict}: </span>
                    ) : null}
                    <span>{hintResult.message}</span>
                  </div>
                </div>
              </div>
            ) : null}
            {recentSubmissions.length > 0 && (
              <div className="mt-4 border-t border-gray-200 pt-3">
                <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                  📝 Attempt History ({recentSubmissions.length})
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {recentSubmissions.map((submission, idx) => (
                    <div
                      key={submission.id}
                      className={`p-2 rounded text-xs border ${
                        submission.is_correct
                          ? 'border-green-200 bg-green-50'
                          : 'border-yellow-200 bg-yellow-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          {submission.is_correct ? (
                            <Check className="w-3 h-3 text-green-600 flex-shrink-0" />
                          ) : (
                            <Clock className="w-3 h-3 text-yellow-600 flex-shrink-0" />
                          )}
                          <span className="font-medium truncate">
                            Attempt #{submission.attempt_number}
                          </span>
                        </div>
                        <span className="text-gray-500 whitespace-nowrap flex-shrink-0">
                          {new Date(submission.submitted_at).toLocaleTimeString()}
                        </span>
                      </div>
                      {submission.feedback && (
                        <p className="text-gray-700 mt-1 line-clamp-2">
                          {submission.feedback}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between">
          <button
            onClick={handlePrevious}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>
          <span className="text-sm text-gray-600">
            Question {currentQuestionIndex + 1} of {questions.length}
          </span>
          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg bg-indigo-600 hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
