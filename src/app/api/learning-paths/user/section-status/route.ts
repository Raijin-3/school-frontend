import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type SectionStatusPayload = {
  sectionIds?: string[];
};

type SectionRequirementSummary = {
  lecturesSatisfied: boolean;
  adaptiveSatisfied: boolean;
  exerciseSatisfied: boolean;
  totalExercises: number;
  completedExercises: number;
  exerciseStatuses: Record<string, boolean>;
  totalQuizQuestions?: number;
  answeredQuizQuestions?: number;
  quizSatisfied?: boolean;
  quizApplicable: boolean;
  lecturesApplicable: boolean;
  exerciseApplicable: boolean;
  lectureCount: number;
  metCount: number;
  totalCount: number;
  completed: boolean;
  progressPercent: number;
  subjectTitle?: string;
};

const DEFAULT_CHUNK_SIZE = 90;

const chunkArray = <T,>(items: T[], chunkSize = DEFAULT_CHUNK_SIZE) => {
  if (!items.length) return [] as T[][];
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

type QueryResult<Row> = Promise<{
  data: Row[] | null;
  error: any;
}>;

const fetchRowsInChunks = async <Row>(
  ids: string[],
  queryFactory: (chunk: string[]) => QueryResult<Row>,
  chunkSize = DEFAULT_CHUNK_SIZE,
) => {
  if (!ids.length) {
    return { data: [] as Row[], error: null };
  }
  const aggregated: Row[] = [];
  for (const chunk of chunkArray(ids, chunkSize)) {
    const { data, error } = await queryFactory(chunk);
    if (error) {
      return { data: aggregated, error };
    }
    if (Array.isArray(data) && data.length) {
      aggregated.push(...data);
    }
  }
  return { data: aggregated, error: null };
};

const getSubjectTitle = async (
  supabaseClient: ReturnType<typeof supabaseServer>,
  sectionModuleMap: Map<string, string>,
): Promise<Map<string, string>> => {
  const moduleIds = Array.from(
    new Set(
      Array.from(sectionModuleMap.values()).filter(
        (moduleId): moduleId is string => Boolean(moduleId),
      ),
    ),
  );
  if (!moduleIds.length) {
    return new Map();
  }

  const { data: moduleRows, error: moduleError } = await fetchRowsInChunks(
    moduleIds,
    (chunk) =>
      supabaseClient
        .from("modules")
        .select("id, subject_id")
        .in("id", chunk),
  );
  if (moduleError) {
    console.warn("Failed to load module subjects:", moduleError?.message);
    return new Map();
  }

  const moduleSubjectById = new Map<string, string>();
  const subjectIds = new Set<string>();
  (moduleRows || []).forEach((row) => {
    if (!row?.id) return;
    const subjectId =
      typeof row.subject_id === "string" && row.subject_id.trim().length > 0
        ? row.subject_id.trim()
        : "";
    if (!subjectId) return;
    moduleSubjectById.set(row.id, subjectId);
    subjectIds.add(subjectId);
  });
  if (!subjectIds.size) {
    return new Map();
  }

  const { data: subjectRows, error: subjectError } = await fetchRowsInChunks(
    Array.from(subjectIds),
    (chunk) =>
      supabaseClient
        .from("subjects")
        .select("id, title")
        .in("id", chunk),
  );
  if (subjectError) {
    console.warn("Failed to load subject titles:", subjectError?.message);
    return new Map();
  }

  const subjectTitleById = new Map<string, string>();
  (subjectRows || []).forEach((row) => {
    if (!row?.id) return;
    const candidateTitle =
      typeof row.title === "string" && row.title.trim().length > 0
        ? row.title.trim()
        : "";
    if (candidateTitle) {
      subjectTitleById.set(row.id, candidateTitle);
    }
  });
  if (!subjectTitleById.size) {
    return new Map();
  }

  const sectionSubjectTitles = new Map<string, string>();
  sectionModuleMap.forEach((moduleId, sectionId) => {
    if (!moduleId) return;
    const subjectId = moduleSubjectById.get(moduleId);
    if (!subjectId) return;
    const title = subjectTitleById.get(subjectId);
    if (!title) return;
    if (sectionSubjectTitles.has(sectionId)) return;
    sectionSubjectTitles.set(sectionId, title);
  });

  return sectionSubjectTitles;
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

type AdaptiveSessionSummaryInfo = {
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  score: number;
};

const timestampToNumber = (value?: string | null) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveOrderIndex = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const isMissingRelationError = (error: any) => {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === "string" && code.trim() === "42P01";
};

export async function POST(request: NextRequest) {
  try {
    const sb = supabaseServer();
    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json()) as SectionStatusPayload;
    const sectionIds = Array.isArray(payload?.sectionIds)
      ? Array.from(
          new Set(
            payload.sectionIds
              .map((value) => {
                if (typeof value === "string" && value.trim().length > 0) {
                  return value.trim();
                }
                return undefined;
              })
              .filter((value): value is string => Boolean(value)),
          ),
        )
      : [];

    if (!sectionIds.length) {
      return NextResponse.json({ statuses: {} }, { status: 200 });
    }

    const normalizedSectionIds = Array.from(new Set(sectionIds));

    const {
      data: sectionMetadataRows,
      error: sectionMetadataError,
    } = await fetchRowsInChunks(
      normalizedSectionIds,
      (chunk) =>
        sb
          .from("sections")
          .select("id, module_id, order_index, title")
          .in("id", chunk),
    );
    if (sectionMetadataError) {
      console.error("Failed to load section metadata:", sectionMetadataError.message);
      return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
    }

    const moduleIdsForSections = new Set<string>();
    const sectionTitleById = new Map<string, string>();
    const sectionModuleById = new Map<string, string>();
    (sectionMetadataRows || []).forEach((row) => {
      if (!row?.id || !row?.module_id) return;
      moduleIdsForSections.add(row.module_id);
      if (typeof row.title === "string" && row.title.trim().length) {
        sectionTitleById.set(row.id, row.title.trim());
      }
      sectionModuleById.set(row.id, row.module_id);
    });

    const moduleIds = Array.from(moduleIdsForSections);

    const moduleSectionRowsResult = await fetchRowsInChunks(
      moduleIds,
      (chunk) =>
        sb
          .from("sections")
          .select("id, module_id, order_index")
          .in("module_id", chunk),
    );
    if (moduleSectionRowsResult.error) {
      console.error(
        "Failed to load module sections:",
        moduleSectionRowsResult.error.message,
      );
      return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
    }
    const moduleSectionRows = moduleSectionRowsResult.data ?? [];

    const sectionsByModule = new Map<
      string,
      { sectionId: string; orderIndex: number | null }[]
    >();
    moduleSectionRows.forEach((row) => {
      if (!row?.id || !row?.module_id) return;
      if (!moduleIdsForSections.has(row.module_id)) return;
      const list = sectionsByModule.get(row.module_id) ?? [];
      list.push({ sectionId: row.id, orderIndex: resolveOrderIndex(row.order_index) });
      sectionsByModule.set(row.module_id, list);
    });

    const moduleOrderIndexById = new Map<string, number | null>();
    const { data: moduleOrderRows, error: moduleOrderError } = await fetchRowsInChunks(
      moduleIds,
      (chunk) =>
        sb
          .from("modules")
          .select("id, order_index")
          .in("id", chunk),
    );
    if (moduleOrderError) {
      console.warn("Failed to load module order indexes:", moduleOrderError.message);
    } else {
      (moduleOrderRows || []).forEach((row) => {
        if (!row?.id) return;
        moduleOrderIndexById.set(row.id, resolveOrderIndex(row.order_index));
      });
    }
    let firstModuleId: string | null = null;
    let firstModuleRank = Number.POSITIVE_INFINITY;
    moduleIds.forEach((moduleId) => {
      const rankValue = moduleOrderIndexById.has(moduleId)
        ? moduleOrderIndexById.get(moduleId) ?? Number.POSITIVE_INFINITY
        : Number.POSITIVE_INFINITY;
      if (firstModuleId === null || rankValue < firstModuleRank) {
        firstModuleId = moduleId;
        firstModuleRank = rankValue;
      }
    });
    if (firstModuleId === null && moduleIds.length > 0) {
      firstModuleId = moduleIds[0];
    }
    const findFirstSectionIdInModule = (moduleId: string) => {
      const entries = sectionsByModule.get(moduleId);
      if (!entries?.length) {
        return null;
      }
      let candidateId: string | null = null;
      let candidateRank = Number.POSITIVE_INFINITY;
      entries.forEach((entry) => {
        if (!entry?.sectionId) return;
        const entryRank = entry.orderIndex ?? Number.POSITIVE_INFINITY;
        if (candidateId === null || entryRank < candidateRank) {
          candidateId = entry.sectionId;
          candidateRank = entryRank;
        }
      });
      return candidateId;
    };
    const firstSectionIdForFirstModule =
      firstModuleId !== null ? findFirstSectionIdInModule(firstModuleId) : null;
    const sectionSubjectTitles = await getSubjectTitle(sb, sectionModuleById);

    // above sectionSubjectTitles has duplicate values for different sectionIds
    // this needs to be fixed here
    const uniqueSectionSubjectTitles = Array.from(sectionSubjectTitles.values())[0];

    
    const { data: lectures, error: lecturesError } = await fetchRowsInChunks(
      normalizedSectionIds,
      (chunk) =>
        sb
          .from("lectures")
          .select("id, section_id")
          .in("section_id", chunk),
    );
    if (lecturesError) {
      console.error("Failed to load section lectures:", lecturesError.message);
      return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
    }
    const lectureCountBySection = new Map<string, number>();
    (lectures || []).forEach((lecture) => {
      if (!lecture?.section_id) return;
      lectureCountBySection.set(
        lecture.section_id,
        (lectureCountBySection.get(lecture.section_id) || 0) + 1,
      );
    });

    const { data: sectionExercises, error: sectionExercisesError } =
      await fetchRowsInChunks(
        normalizedSectionIds,
        (chunk) =>
          sb
            .from("section_exercises")
            .select("id, section_id")
            .or(`user_id.eq.${user.id},user_id.is.null`)
            .in("section_id", chunk),
      );
    if (sectionExercisesError) {
      console.error("Failed to load section exercises:", sectionExercisesError.message);
      return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
    }
    const exerciseToSection = new Map<string, string>();
    const sectionExerciseIds = new Map<string, string[]>();
    const exerciseCompletionById = new Map<string, boolean>();
    (sectionExercises || []).forEach((exercise) => {
      if (!exercise?.id || !exercise.section_id) return;
      const sectionId = exercise.section_id;
      const exerciseId = String(exercise.id);
      exerciseToSection.set(exerciseId, sectionId);
      const list = sectionExerciseIds.get(sectionId) ?? [];
      list.push(exerciseId);
      sectionExerciseIds.set(sectionId, list);
    });

    const { data: sectionQuizzes, error: sectionQuizzesError } = await fetchRowsInChunks(
      normalizedSectionIds,
      (chunk) => sb.from("quizzes").select("id, section_id").in("section_id", chunk),
    );
    if (sectionQuizzesError) {
      console.error("Failed to load section quizzes:", sectionQuizzesError.message);
      return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
    }
    const quizToSection = new Map<string, string>();
    (sectionQuizzes || []).forEach((quiz) => {
      if (!quiz?.id || !quiz.section_id) return;
      const quizId = String(quiz.id);
      quizToSection.set(quizId, quiz.section_id);
    });
    const quizIds = Array.from(quizToSection.keys());
    const quizQuestionIdsBySection = new Map<string, Set<string>>();
    if (quizIds.length) {
      const {
        data: quizQuestionRows,
        error: quizQuestionError,
      } = await fetchRowsInChunks(
        quizIds,
        (chunk) =>
          sb
            .from("quiz_questions")
            .select("id, quiz_id")
            .in("quiz_id", chunk),
      );
      if (quizQuestionError) {
        console.error("Failed to load section quiz questions:", quizQuestionError.message);
        return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
      }
      (quizQuestionRows || []).forEach((row) => {
        if (!row?.quiz_id || !row?.id) return;
        const sectionId = quizToSection.get(String(row.quiz_id));
        if (!sectionId) return;
        const existing = quizQuestionIdsBySection.get(sectionId) ?? new Set<string>();
        existing.add(String(row.id));
        quizQuestionIdsBySection.set(sectionId, existing);
      });
    }

    const exerciseIds = Array.from(exerciseToSection.keys());
    const exerciseQuestionsBySection = new Map<string, string[]>();
    const exerciseQuestionIdsByExercise = new Map<string, Set<string>>();
    const addExerciseQuestion = (exerciseId?: string | null, questionId?: string | null) => {
      if (!exerciseId || !questionId) return;
      const sectionId = exerciseToSection.get(String(exerciseId));
      if (!sectionId) return;
      const list = exerciseQuestionsBySection.get(sectionId) ?? [];
      list.push(String(questionId));
      exerciseQuestionsBySection.set(sectionId, list);
      const exerciseKey = String(exerciseId);
      const questionKey = String(questionId);
      const exerciseQuestionSet = exerciseQuestionIdsByExercise.get(exerciseKey) ?? new Set<string>();
      exerciseQuestionSet.add(questionKey);
      exerciseQuestionIdsByExercise.set(exerciseKey, exerciseQuestionSet);
    };

    const { data: exerciseQuestions, error: exerciseQuestionError } = await fetchRowsInChunks(
      exerciseIds,
      (chunk) =>
        sb
          .from("section_exercise_questions")
          .select("id, exercise_id")
          .in("exercise_id", chunk),
    );
    if (exerciseQuestionError) {
      console.error("Failed to load exercise questions:", exerciseQuestionError.message);
      return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
    }
    (exerciseQuestions || []).forEach((question) => {
      addExerciseQuestion(question?.exercise_id, question?.id);
    });

    const {
      data: practiceQuestions,
      error: practiceQuestionsError,
    } = await fetchRowsInChunks(
      exerciseIds,
      (chunk) =>
        sb
          .from("section_exercise_questions")
          .select("id, exercise_id")
          .in("exercise_id", chunk),
    );
    if (practiceQuestionsError) {
      if (!isMissingRelationError(practiceQuestionsError)) {
        console.error(
          "Failed to load practice exercise questions:",
          practiceQuestionsError.message,
        );
        return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
      }
    } else {
      (practiceQuestions || []).forEach((question) => {
        addExerciseQuestion(question?.exercise_id, question?.id);
      });
    }

    if (exerciseIds.length) {
      const { data: exerciseProgressRows, error: exerciseProgressError } =
        await fetchRowsInChunks(
          exerciseIds,
          (chunk) =>
            sb
              .from("section_exercise_progress")
              .select("exercise_id, status")
              .eq("student_id", user.id)
              .in("exercise_id", chunk),
        );
      if (exerciseProgressError) {
        console.error(
          "Failed to load exercise progress:",
          exerciseProgressError.message,
        );
        return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
      }
      (exerciseProgressRows || []).forEach((row) => {
        if (!row?.exercise_id) return;
        const exerciseId = String(row.exercise_id);
        const isCompleted = String(row.status).trim().toLowerCase() === "completed";
        if (isCompleted) {
          exerciseCompletionById.set(exerciseId, true);
        }
      });
    }

    const basicQuizCompletedSections = new Set<string>();
    if (quizIds.length) {
      const {
        data: basicQuizAttemptRows,
        error: basicQuizAttemptError,
      } = await fetchRowsInChunks(
        quizIds,
        (chunk) =>
          sb
            .from("quiz_attempts")
            .select("quiz_id")
            .eq("user_id", user.id)
            .in("quiz_id", chunk),
      );
      if (basicQuizAttemptError) {
        console.error("Failed to load quiz attempts:", basicQuizAttemptError.message);
        return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
      }
      (basicQuizAttemptRows || []).forEach((row) => {
        if (!row?.quiz_id) return;
        const quizId = String(row.quiz_id);
        const sectionId = quizToSection.get(quizId);
        if (sectionId) {
          basicQuizCompletedSections.add(sectionId);
        }
      });
    }

    const { data: watchedLectures, error: watchedError } = await fetchRowsInChunks(
      normalizedSectionIds,
      (chunk) =>
        sb
          .from("user_section_lecture_progress")
          .select("section_id, lecture_id")
          .eq("user_id", user.id)
          .eq("is_watched", true)
          .in("section_id", chunk),
    );
    if (watchedError) {
      console.error("Failed to load lecture progress:", watchedError.message);
      return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
    }
    const watchedCountBySection = new Map<string, number>();
    (watchedLectures || []).forEach((row) => {
      if (!row?.section_id) return;
      watchedCountBySection.set(
        row.section_id,
        (watchedCountBySection.get(row.section_id) || 0) + 1,
      );
    });

    const { data: adaptiveSessions, error: adaptiveError } = await fetchRowsInChunks(
      normalizedSectionIds,
      (chunk) =>
        sb
          .from("adaptive_quiz_sessions")
          .select(
            "id, section_id, status, current_question_number, created_at, updated_at, conversation_history",
          )
          .eq("user_id", user.id)
          .in("section_id", chunk)
          .in("status", ["completed", "stopped"]),
    );
    if (adaptiveError) {
      console.error("Failed to load adaptive quiz statuses:", adaptiveError.message);
      return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
    }
    const adaptiveQuestionTargetsBySection = new Map<string, number>();
    const adaptiveSessionHistory: Record<string, AdaptiveSessionHistoryEntry[]> = {};
    (adaptiveSessions || []).forEach((row) => {
      if (!row?.section_id) return;
      const sectionId = row.section_id;
      const questionNumber = Number(row?.current_question_number ?? 0);
      if (Number.isFinite(questionNumber) && questionNumber > 0) {
        const currentMax = adaptiveQuestionTargetsBySection.get(sectionId) ?? 0;
        if (questionNumber > currentMax) {
          adaptiveQuestionTargetsBySection.set(sectionId, questionNumber);
        }
      }

      if (!row.id) {
        return;
      }
      const rawConversation =
        Array.isArray(row.conversation_history) && row.conversation_history.length > 0
          ? row.conversation_history
          : Array.isArray(row.conversationHistory)
          ? row.conversationHistory
          : [];
      const conversationHistory = rawConversation
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
      const entry: AdaptiveSessionHistoryEntry = {
        sessionId: String(row.id),
        status: typeof row.status === "string" ? row.status : null,
        currentQuestionNumber: Number(row?.current_question_number ?? 0),
        createdAt: typeof row.created_at === "string" ? row.created_at : null,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
        conversationHistory,
      };
      const existing = adaptiveSessionHistory[sectionId] ?? [];
      existing.push(entry);
      adaptiveSessionHistory[sectionId] = existing;
    });
    Object.keys(adaptiveSessionHistory).forEach((sectionId) => {
      adaptiveSessionHistory[sectionId].sort(
        (a, b) => timestampToNumber(b.updatedAt) - timestampToNumber(a.updatedAt),
      );
      adaptiveSessionHistory[sectionId] = adaptiveSessionHistory[sectionId].slice(0, 3);
    });

    const sessionIds = Array.from(
      new Set(
        Object.values(adaptiveSessionHistory)
          .flatMap((entries) => entries.map((entry) => entry.sessionId))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const responseSummaries = new Map<string, AdaptiveSessionSummaryInfo>();
    if (sessionIds.length) {
      const { data: responses, error: responsesError } = await fetchRowsInChunks(
        sessionIds,
        (chunk) =>
          sb
            .from("adaptive_quiz_responses")
            .select("session_id, is_correct, user_answer")
            .in("session_id", chunk),
      );
      if (responsesError) {
        console.error("Failed to load adaptive quiz responses:", responsesError.message);
      } else if (responses && Array.isArray(responses)) {
        responses.forEach((row) => {
          const sessionId = typeof row?.session_id === "string" ? row.session_id : null;
          if (!sessionId) {
            return;
          }
          const existing = responseSummaries.get(sessionId) ?? {
            totalQuestions: 0,
            answeredQuestions: 0,
            correctAnswers: 0,
            score: 0,
          };
          existing.totalQuestions += 1;
          const hasAnswer =
            row.user_answer !== null &&
            row.user_answer !== undefined &&
            (typeof row.user_answer !== "string" || row.user_answer.trim().length > 0);
          if (hasAnswer) {
            existing.answeredQuestions += 1;
          }
          if (row.is_correct === true) {
            existing.correctAnswers += 1;
          }
          responseSummaries.set(sessionId, existing);
        });
      }
    }

    responseSummaries.forEach((summary) => {
      if (summary.answeredQuestions > 0) {
        summary.score = Math.round((summary.correctAnswers / summary.answeredQuestions) * 100);
      } else {
        summary.score = 0;
      }
    });

    const defaultSummaryFromEntry = (entry: AdaptiveSessionHistoryEntry): AdaptiveSessionSummaryInfo => {
      const totalQuestionsEstimate = Math.max(0, entry.currentQuestionNumber - 1);
      return {
        totalQuestions: totalQuestionsEstimate,
        answeredQuestions: 0,
        correctAnswers: 0,
        score: 0,
      };
    };

    Object.keys(adaptiveSessionHistory).forEach((sectionId) => {
      adaptiveSessionHistory[sectionId] = adaptiveSessionHistory[sectionId].map((entry) => ({
        ...entry,
        summary: responseSummaries.get(entry.sessionId) ?? defaultSummaryFromEntry(entry),
      }));
    });

    const { data: quizAttempts, error: quizAttemptsError } = await fetchRowsInChunks(
      normalizedSectionIds,
      (chunk) =>
        sb
          .from("user_section_quiz_attempts")
          .select("section_id, question_id")
          .eq("user_id", user.id)
          .in("section_id", chunk),
    );
    if (quizAttemptsError) {
      console.error("Failed to load quiz attempts:", quizAttemptsError.message);
      return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
    }
    const quizQuestionsAnsweredBySection = new Map<string, Set<string>>();
    (quizAttempts || []).forEach((row) => {
      if (!row?.section_id || !row?.question_id) return;
      const sectionSet = quizQuestionsAnsweredBySection.get(row.section_id) ?? new Set<string>();
      sectionSet.add(String(row.question_id));
      quizQuestionsAnsweredBySection.set(row.section_id, sectionSet);
    });

    const { data: quizResponses, error: quizResponsesError } = await fetchRowsInChunks(
      quizIds,
      (chunk) =>
        sb
          .from("quiz_responses")
          .select(`
            question_id,
            quiz_attempts (
              quiz_id
            )
          `)
          .eq("quiz_attempts.user_id", user.id)
          .in("quiz_attempts.quiz_id", chunk),
    );

    if (quizResponsesError) {
      console.error("Failed to load quiz responses:", quizResponsesError.message);
      return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
    }
    const staticQuizResponsesBySection = new Map<string, Set<string>>();
    (quizResponses || []).forEach((row) => {
      if (!row?.quiz_id || !row?.question_id) return;
      const sectionId = quizToSection.get(String(row.quiz_id));
      if (!sectionId) return;
      const sectionSet = staticQuizResponsesBySection.get(sectionId) ?? new Set<string>();
      sectionSet.add(String(row.question_id));
      staticQuizResponsesBySection.set(sectionId, sectionSet);
    });

    const { data: exerciseAttempts, error: exerciseError } = await fetchRowsInChunks(
      exerciseIds,
      (chunk) =>
        sb
          .from("section_exercise_question_submissions")
          .select("exercise_id, question_id, submitted_at")
          .eq("student_id", user.id)
          .in("exercise_id", chunk)
          .order("submitted_at", { ascending: false, nullsLast: false }),
    );
    if (exerciseError) {
      console.error("Failed to load exercise submissions:", exerciseError.message);
      return NextResponse.json({ error: "Failed to load sections" }, { status: 500 });
    }
    const answeredExerciseBySection = new Map<string, Set<string>>();
    const processedExerciseQuestions = new Set<string>();
    const answeredExerciseQuestionsByExercise = new Map<string, Set<string>>();
    const orderedExerciseAttempts = (exerciseAttempts || []).slice().sort((a, b) => {
      return timestampToNumber(b?.submitted_at ?? null) - timestampToNumber(a?.submitted_at ?? null);
    });
    orderedExerciseAttempts.forEach((row) => {
      if (!row?.exercise_id || !row?.question_id) return;
      const sectionId = exerciseToSection.get(String(row.exercise_id));
      if (!sectionId) return;
      const key = [sectionId, row.exercise_id ?? "", row.question_id]
        .map((value) => String(value))
        .join(":");
      if (processedExerciseQuestions.has(key)) {
        return;
      }
      processedExerciseQuestions.add(key);
      const exerciseKey = String(row.exercise_id);
      const answeredExerciseSet =
        answeredExerciseQuestionsByExercise.get(exerciseKey) ?? new Set<string>();
      answeredExerciseSet.add(String(row.question_id));
      answeredExerciseQuestionsByExercise.set(exerciseKey, answeredExerciseSet);
      const sectionSet = answeredExerciseBySection.get(sectionId) ?? new Set<string>();
      sectionSet.add(String(row.question_id));
      answeredExerciseBySection.set(sectionId, sectionSet);
    });

    const statuses: Record<string, SectionRequirementSummary> = {};
    sectionIds.forEach((sectionId) => {
      const totalLectures = lectureCountBySection.get(sectionId) ?? 0;
      const watchedLecturesCount = watchedCountBySection.get(sectionId) ?? 0;
      const exerciseQuestionIds = exerciseQuestionsBySection.get(sectionId) ?? [];
      const uniqueQuestionIds = Array.from(new Set(exerciseQuestionIds));
      const exerciseQuestionsTotal = uniqueQuestionIds.length;
      const answeredExerciseCount = answeredExerciseBySection.get(sectionId)?.size ?? 0;
      const sectionExerciseIdList = sectionExerciseIds.get(sectionId) ?? [];
      const exerciseStatuses: Record<string, boolean> = {};
      let completedExerciseCount = 0;
      let hasFullyAnsweredExercise = false;
      sectionExerciseIdList.forEach((exerciseId) => {
        const progressCompleted = Boolean(exerciseCompletionById.get(exerciseId));
        const questionSet = exerciseQuestionIdsByExercise.get(exerciseId);
        const answeredSet = answeredExerciseQuestionsByExercise.get(exerciseId);
        const questionSetSize = questionSet?.size ?? 0;
        const answeredSetSize = answeredSet?.size ?? 0;
        const allQuestionsAnswered =
          questionSetSize > 0 && answeredSetSize >= questionSetSize;
        // Treat an explicitly completed exercise progress record as completion, even if
        // not all questions have submissions (needed for mentor_chat / generated flows).
        const completed =
          Boolean(progressCompleted) || (questionSetSize > 0 ? allQuestionsAnswered : false);
        exerciseStatuses[exerciseId] = completed;
        if (!hasFullyAnsweredExercise && allQuestionsAnswered) {
          hasFullyAnsweredExercise = true;
        }
        if (completed) {
          completedExerciseCount += 1;
        }
      });
      const totalSectionExercises = sectionExerciseIdList.length;
      const hasAnyCompletedSectionExercise =
        totalSectionExercises > 0 && completedExerciseCount >= 1;
      const answeredAllExerciseQuestions =
        exerciseQuestionsTotal > 0 && answeredExerciseCount >= exerciseQuestionsTotal;
      const adaptiveQuestionTarget = adaptiveQuestionTargetsBySection.get(sectionId) ?? 0;
      const answeredAdaptiveQuestions = quizQuestionsAnsweredBySection.get(sectionId)?.size ?? 0;
      const quizQuestionSet = quizQuestionIdsBySection.get(sectionId);
      const totalQuizQuestions = quizQuestionSet?.size ?? 0;
      const staticAnsweredQuizQuestions =
        staticQuizResponsesBySection.get(sectionId)?.size ?? 0;

      let lecturesSatisfied =
        totalLectures > 0 && watchedLecturesCount >= totalLectures;
      const basicQuizCompleted = basicQuizCompletedSections.has(sectionId);
      let adaptiveSatisfied =
        basicQuizCompleted ||
        (adaptiveQuestionTarget > 0 && answeredAdaptiveQuestions >= adaptiveQuestionTarget);

      // Exercise is satisfied if either:
      // 1. The section has user-specific exercises and at least one of them is completed
      // 2. There are no recorded exercises but all inline exercise questions have been answered
      let exerciseSatisfied =
        (totalSectionExercises > 0
          ? hasFullyAnsweredExercise
          : answeredAllExerciseQuestions);

      if(uniqueSectionSubjectTitles === 'Art of Problem Solving' ) {
          exerciseSatisfied = hasAnyCompletedSectionExercise;
      }

      // can we get section title here?
      const currentSectionTitle = sectionTitleById.get(sectionId);
      // console.log("Current Section Title:", currentSectionTitle);
      


      const sectionModuleId = sectionModuleById.get(sectionId);
      const isFirstModuleFirstSection =
        Boolean(
          firstModuleId &&
            firstSectionIdForFirstModule &&
            sectionModuleId === firstModuleId &&
            sectionId === firstSectionIdForFirstModule,
        );
      let lecturesApplicable = totalLectures > 0;
      const hasStaticQuizQuestions = totalQuizQuestions > 0;
      // When there are no physical quiz questions we only expose the adaptive flow,
      // so count the quiz requirement immediately instead of waiting for a session row.
      const shouldShowAdaptiveRequirement = !hasStaticQuizQuestions;
      let quizApplicable =
        hasStaticQuizQuestions || adaptiveQuestionTarget > 0 || shouldShowAdaptiveRequirement;
      if (isFirstModuleFirstSection) {
        quizApplicable = false;
      }
      let exerciseApplicable =
        totalSectionExercises > 0 || exerciseQuestionsTotal > 0;
      if (isFirstModuleFirstSection) {
        exerciseApplicable = false;
      }

      // console.log(uniqueSectionSubjectTitles, currentSectionTitle);

       if(uniqueSectionSubjectTitles === 'Art of Problem Solving' ) {
          quizApplicable = false;
      }

       if(uniqueSectionSubjectTitles === 'Art of Problem Solving' ) {
        if(currentSectionTitle?.trim() === "Case Study"){
            exerciseSatisfied = true;
            lecturesSatisfied = true;
            adaptiveSatisfied = true;
        }
       }

       if(uniqueSectionSubjectTitles === 'Google Sheets') {
        if(currentSectionTitle?.trim() === "End Project Final"){
            exerciseSatisfied = false;
            lecturesSatisfied = false;
            adaptiveSatisfied = true;
            quizApplicable = false;
        }
        if(currentSectionTitle?.trim() === "End Project"){
            exerciseSatisfied = true;
            lecturesSatisfied = true;
            adaptiveSatisfied = true;
            quizApplicable = false;
        }
       }

       if(uniqueSectionSubjectTitles === 'Google Sheets') {
        if(currentSectionTitle?.trim() === "Pivot table - Practice Problem"){
            exerciseSatisfied = true;
            lecturesSatisfied = false;
            adaptiveSatisfied = true;
        }
       }

       if(uniqueSectionSubjectTitles === 'Python') {
        if(currentSectionTitle?.trim() === "Practice Exercise"){
            exerciseSatisfied = true;
            lecturesSatisfied = true;
            adaptiveSatisfied = true;
        }
       }

      //  for empty topic tagging
       if(uniqueSectionSubjectTitles === 'Python') {
        if(currentSectionTitle?.trim() === "Interview Practice Questions"){
            quizApplicable = false;
        }
       }

      //  if(uniqueSectionSubjectTitles === 'Art of Problem Solving' ) {
      //   if(currentSectionTitle?.trim() === "Case Study"){
      //       lecturesApplicable = false;
      //       quizApplicable = false;
      //       exerciseApplicable = false;
      //   }
      //  }

      const requirementDefinitions = [
        { applicable: lecturesApplicable, satisfied: lecturesSatisfied },
        { applicable: quizApplicable, satisfied: adaptiveSatisfied },
        { applicable: exerciseApplicable, satisfied: exerciseSatisfied },
      ];
      const totalCount = requirementDefinitions.filter((entry) => entry.applicable).length;
      const metCount = requirementDefinitions.filter(
        (entry) => entry.applicable && entry.satisfied,
      ).length;
      const completed = totalCount === 0 ? true : metCount === totalCount;
      const progressPercent =
        totalCount === 0 ? 100 : Math.round((metCount / totalCount) * 100);
      const subjectTitle = sectionSubjectTitles.get(sectionId);

      statuses[sectionId] = {
        lecturesSatisfied,
        adaptiveSatisfied,
        exerciseSatisfied,
        totalExercises: totalSectionExercises,
        completedExercises: completedExerciseCount,
        exerciseStatuses,
        totalQuizQuestions,
        answeredQuizQuestions: staticAnsweredQuizQuestions,
        quizSatisfied: totalQuizQuestions > 0 && staticAnsweredQuizQuestions >= totalQuizQuestions,
        quizApplicable,
        lectureCount: totalLectures,
        lecturesApplicable,
        exerciseApplicable,
        metCount,
        totalCount,
        completed,
        progressPercent,
        subjectTitle,
      };
    });

    return NextResponse.json({ statuses, adaptiveSessionHistory }, { status: 200 });
  } catch (error: any) {
    console.error("Section status lookup failed:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
