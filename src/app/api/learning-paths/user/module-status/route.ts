import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseService } from "@/lib/supabase-service";

type ModuleStatusPayload = {
  moduleIds?: string[];
};

const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const looksLikeUuid = (value: string) => uuidPattern.test(value);
const DEFAULT_IN_CHUNK_SIZE = 90;

const chunkArray = <T>(items: T[], chunkSize = DEFAULT_IN_CHUNK_SIZE) => {
  if (!items.length) {
    return [] as T[][];
  }
  if (chunkSize <= 0) {
    return [items];
  }
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
  chunkSize = DEFAULT_IN_CHUNK_SIZE,
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

const timestampToNumber = (value?: string | null) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
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

    const payload = (await request.json()) as ModuleStatusPayload;
    const moduleIds = Array.isArray(payload?.moduleIds)
      ? Array.from(
          new Set(
            payload.moduleIds
              .map((value) => {
                if (typeof value === "string" && value.trim().length > 0) {
                  return value.trim();
                }
                if (typeof value === "number") {
                  return String(value);
                }
                return undefined;
              })
              .filter((value): value is string => Boolean(value)),
          ),
        )
      : [];

    if (!moduleIds.length) {
      return NextResponse.json({ statuses: {} }, { status: 200 });
    }

    const requestedToActualModuleId = new Map<string, string>();
    const adminClient = supabaseService();
    const moduleOptionalInfo = new Map<string, boolean>();
    const moduleProgressMap = new Map<string, number | null>();
    const slugCandidates = moduleIds.filter((value) => !looksLikeUuid(value));

    if (slugCandidates.length) {
      try {
        const { data: slugMatches } = await sb
          .from("modules")
          .select("id, slug")
          .in("slug", slugCandidates);
        (slugMatches || []).forEach((row) => {
          if (row?.slug && row?.id) {
            requestedToActualModuleId.set(row.slug, row.id);
          }
        });
      } catch (slugError: any) {
        console.warn("Skipping slug to module mapping:", slugError?.message || slugError);
      }
    }

    moduleIds.forEach((moduleId) => {
      if (!requestedToActualModuleId.has(moduleId) && looksLikeUuid(moduleId)) {
        requestedToActualModuleId.set(moduleId, moduleId);
      }
    });

    const normalizedModuleIds = Array.from(
      new Set(
        moduleIds
          .map((moduleId) => requestedToActualModuleId.get(moduleId))
          .filter((value): value is string => Boolean(value && looksLikeUuid(value))),
      ),
    );

    if (!normalizedModuleIds.length) {
      return NextResponse.json({ statuses: {} }, { status: 200 });
    }

    const { data: moduleMetadataRows, error: moduleMetadataError } = await fetchRowsInChunks(
      normalizedModuleIds,
      (chunk) =>
        sb
          .from("modules")
          .select("id, subject_id, order_index")
          .in("id", chunk),
    );
    if (moduleMetadataError) {
      console.error("Failed to load module metadata:", moduleMetadataError.message);
      return NextResponse.json({ error: "Failed to load modules" }, { status: 500 });
    }

    const metadataLookupIds = normalizedModuleIds.filter((id) => !moduleOptionalInfo.has(id));
    if (metadataLookupIds.length) {
      try {
        const { data: statusRows, error: statusError } = await fetchRowsInChunks(
          metadataLookupIds,
          (chunk) =>
        adminClient
              .from("user_module_status")
              .select("module_id, status, progress")
              .eq("user_id", user.id)
              .in("module_id", chunk),
        );
        if (statusError) {
          console.warn("User module status lookup failed:", statusError.message);
        }
        (statusRows || []).forEach((row) => {
          if (!row?.module_id) return;
          const statusValue = typeof row.status === "string" ? row.status.toLowerCase() : "";
          moduleOptionalInfo.set(row.module_id, statusValue === "optional");
          const parsedProgress =
            typeof row.progress === "number" && Number.isFinite(row.progress)
              ? Math.max(0, Math.min(100, row.progress))
              : null;
          moduleProgressMap.set(row.module_id, parsedProgress);
        });
      } catch (error) {
        console.warn("User module status fetch error:", (error as any)?.message || error);
      }
    }

    const { data: sections, error: sectionsError } = await fetchRowsInChunks(
      normalizedModuleIds,
      (chunk) =>
        sb
          .from("sections")
          .select("id, module_id")
          .in("module_id", chunk),
    );
    if (sectionsError) {
      console.error("Failed to load sections:", sectionsError.message);
      return NextResponse.json({ error: "Failed to load modules" }, { status: 500 });
    }

    const sectionIds = (sections || [])
      .map((section) => section?.id)
      .filter((value): value is string => Boolean(value));

    const sectionsByModule = new Map<string, string[]>();
    (sections || []).forEach((section) => {
      if (!section?.id || !section?.module_id) return;
      const list = sectionsByModule.get(section.module_id) ?? [];
      list.push(section.id);
      sectionsByModule.set(section.module_id, list);
    });

    const { data: lectures, error: lecturesError } = await fetchRowsInChunks(
      sectionIds,
      (chunk) =>
        sb
          .from("lectures")
          .select("id, section_id")
          .in("section_id", chunk),
    );
    if (lecturesError) {
      console.error("Failed to load lectures:", lecturesError.message);
      return NextResponse.json({ error: "Failed to load modules" }, { status: 500 });
    }

    const lectureCountBySection = new Map<string, number>();
    const sectionToModule = new Map<string, string>();
    (sections || []).forEach((section) => {
      if (!section?.id || !section?.module_id) return;
      sectionToModule.set(section.id, section.module_id);
    });
    (lectures || []).forEach((lecture) => {
      if (!lecture?.section_id) return;
      lectureCountBySection.set(
        lecture.section_id,
        (lectureCountBySection.get(lecture.section_id) || 0) + 1,
      );
    });

    const { data: sectionExercises, error: sectionExercisesError } = await fetchRowsInChunks(
      sectionIds,
      (chunk) =>
        sb
          .from("section_exercises")
          .select("id, section_id")
          .in("section_id", chunk),
    );
    if (sectionExercisesError) {
      console.error("Failed to load section exercises:", sectionExercisesError.message);
      return NextResponse.json({ error: "Failed to load modules" }, { status: 500 });
    }
    const exerciseToSection = new Map<string, string>();
    (sectionExercises || []).forEach((exercise) => {
      if (!exercise?.id || !exercise.section_id) return;
      exerciseToSection.set(String(exercise.id), exercise.section_id);
    });

    const exerciseIds = Array.from(exerciseToSection.keys());
    const exerciseQuestionsBySection = new Map<string, Map<string, Set<string>>>();
    const addExerciseQuestion = (exerciseId?: string | null, questionId?: string | null) => {
      if (!exerciseId || !questionId) return;
      const sectionId = exerciseToSection.get(String(exerciseId));
      if (!sectionId) return;
      const sectionMap = exerciseQuestionsBySection.get(sectionId) ?? new Map<string, Set<string>>();
      const exerciseKey = String(exerciseId);
      const questionSet = sectionMap.get(exerciseKey) ?? new Set<string>();
      questionSet.add(String(questionId));
      sectionMap.set(exerciseKey, questionSet);
      exerciseQuestionsBySection.set(sectionId, sectionMap);
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
      return NextResponse.json({ error: "Failed to load modules" }, { status: 500 });
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
        console.error("Failed to load practice exercise questions:", practiceQuestionsError.message);
        return NextResponse.json({ error: "Failed to load modules" }, { status: 500 });
      }
    } else {
      (practiceQuestions || []).forEach((question) => {
        addExerciseQuestion(question?.exercise_id, question?.id);
      });
    }

    const { data: watchedLectures, error: watchedError } = await fetchRowsInChunks(
      sectionIds,
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
      return NextResponse.json({ error: "Failed to load modules" }, { status: 500 });
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
      sectionIds,
      (chunk) =>
        sb
          .from("adaptive_quiz_sessions")
          .select("section_id, status")
          .eq("user_id", user.id)
          .in("section_id", chunk)
          .in("status", ["completed", "stopped"]),
    );
    if (adaptiveError) {
      console.error("Failed to load adaptive quiz statuses:", adaptiveError.message);
      return NextResponse.json({ error: "Failed to load modules" }, { status: 500 });
    }
    const adaptiveCompletedSections = new Set<string>();
    (adaptiveSessions || []).forEach((row) => {
      if (!row?.section_id) return;
      adaptiveCompletedSections.add(row.section_id);
    });

    const { data: exerciseAttempts, error: exerciseError } = await fetchRowsInChunks(
      sectionIds,
      (chunk) =>
        sb
          .from("user_section_exercise_submissions")
          .select("section_id, exercise_id, question_id, submitted_at")
          .eq("user_id", user.id)
          .in("section_id", chunk)
          .order("submitted_at", { ascending: false, nullsLast: false }),
    );
    if (exerciseError) {
      console.error("Failed to load exercise submissions:", exerciseError.message);
      return NextResponse.json({ error: "Failed to load modules" }, { status: 500 });
    }
    const answeredExerciseBySection = new Map<string, Map<string, Set<string>>>();
    const processedExerciseQuestions = new Set<string>();
    const orderedExerciseAttempts = (exerciseAttempts || []).slice().sort((a, b) => {
      return timestampToNumber(b?.submitted_at ?? null) - timestampToNumber(a?.submitted_at ?? null);
    });
    orderedExerciseAttempts.forEach((row) => {
      const sectionId = row?.section_id;
      const exerciseId = row?.exercise_id;
      const questionId = row?.question_id;
      if (!sectionId || !exerciseId || !questionId) {
        return;
      }
      const key = [sectionId, exerciseId, questionId]
        .map((value) => String(value))
        .join(":");
      if (processedExerciseQuestions.has(key)) {
        return;
      }
      processedExerciseQuestions.add(key);
      const sectionMap = answeredExerciseBySection.get(sectionId) ?? new Map<string, Set<string>>();
      const exerciseKey = String(exerciseId);
      const questionSet = sectionMap.get(exerciseKey) ?? new Set<string>();
      questionSet.add(String(questionId));
      sectionMap.set(exerciseKey, questionSet);
      answeredExerciseBySection.set(sectionId, sectionMap);
    });

    const sectionRequirementSummaries = new Map<
      string,
      {
        lecturesSatisfied: boolean;
        adaptiveSatisfied: boolean;
        exerciseSatisfied: boolean;
        totalLectures: number;
        watchedLectures: number;
        exerciseQuestionsTotal: number;
        answeredExerciseCount: number;
        exerciseQuestionBreakdown: Map<string, { total: number; answered: number }>;
      }
    >();
    sectionIds.forEach((sectionId) => {
      const totalLectures = lectureCountBySection.get(sectionId) ?? 0;
      const watchedLectures = watchedCountBySection.get(sectionId) ?? 0;
      const exerciseQuestionsByExercise = exerciseQuestionsBySection.get(sectionId) ?? new Map();
      const answeredByExercise = answeredExerciseBySection.get(sectionId) ?? new Map();
      const exerciseQuestionBreakdown = new Map<string, { total: number; answered: number }>();
      let exerciseQuestionsTotal = 0;
      let answeredExerciseCount = 0;
      exerciseQuestionsByExercise.forEach((questionSet, exerciseId) => {
        const total = questionSet.size;
        const answered = answeredByExercise.get(exerciseId)?.size ?? 0;
        exerciseQuestionBreakdown.set(exerciseId, { total, answered });
        exerciseQuestionsTotal += total;
        answeredExerciseCount += answered;
      });
      answeredByExercise.forEach((questionSet, exerciseId) => {
        if (!exerciseQuestionBreakdown.has(exerciseId)) {
          const answered = questionSet.size;
          exerciseQuestionBreakdown.set(exerciseId, { total: 0, answered });
          answeredExerciseCount += answered;
        }
      });
      const lecturesSatisfied = totalLectures > 0 && watchedLectures >= totalLectures;
      const adaptiveSatisfied = adaptiveCompletedSections.has(sectionId);
      // console.log("Exercise satisfaction:", {
      //   exerciseQuestionsTotal,
      //   answeredExerciseCount,
      //   exerciseQuestionBreakdown: Object.fromEntries(exerciseQuestionBreakdown.entries()),
      // });
      const exerciseSatisfied =
        exerciseQuestionsTotal > 0 && answeredExerciseCount >= exerciseQuestionsTotal;
      // console.log("Exercise satisfied:", exerciseSatisfied);
      sectionRequirementSummaries.set(sectionId, {
        lecturesSatisfied,
        adaptiveSatisfied,
        exerciseSatisfied,
        totalLectures,
        watchedLectures,
        exerciseQuestionsTotal,
        answeredExerciseCount,
        exerciseQuestionBreakdown,
      });
    });

    const statuses: Record<string, any> = {};
    moduleIds.forEach((moduleId) => {
      const actualModuleId = requestedToActualModuleId.get(moduleId) || moduleId;
      const moduleIsOptional = moduleOptionalInfo.get(actualModuleId) ?? false;
      const moduleSectionIds = sectionsByModule.get(actualModuleId) ?? [];
      const sectionSummaries = moduleSectionIds.map(
        (sectionId) => sectionRequirementSummaries.get(sectionId) ?? null,
      );
      const totalLectures = sectionSummaries.reduce(
        (sum, summary) => sum + (summary?.totalLectures ?? 0),
        0,
      );
      const watchedLecturesCount = sectionSummaries.reduce(
        (sum, summary) => sum + (summary?.watchedLectures ?? 0),
        0,
      );
      const exerciseQuestionsTotal = sectionSummaries.reduce(
        (sum, summary) => sum + (summary?.exerciseQuestionsTotal ?? 0),
        0,
      );
      const answeredExerciseCount = sectionSummaries.reduce(
        (sum, summary) => sum + (summary?.answeredExerciseCount ?? 0),
        0,
      );
      const adaptiveSectionsCompleted = sectionSummaries.filter(
        (summary) => summary?.adaptiveSatisfied,
      ).length;
      let lecturesSatisfied =
        moduleSectionIds.length === 0
          ? false
          : sectionSummaries.every((summary) => summary?.lecturesSatisfied);
      let adaptiveSatisfied =
        moduleSectionIds.length === 0
          ? false
          : sectionSummaries.every((summary) => summary?.adaptiveSatisfied);
      let exerciseSatisfied =
        moduleSectionIds.length === 0
          ? false
          : sectionSummaries.every((summary) => summary?.exerciseSatisfied);
      if (moduleIsOptional) {
        lecturesSatisfied = true;
        adaptiveSatisfied = true;
        exerciseSatisfied = true;
      }
      const completed = lecturesSatisfied && adaptiveSatisfied && exerciseSatisfied;
      const baseLecturePercent =
        totalLectures > 0
          ? Math.min(100, Math.round((watchedLecturesCount / totalLectures) * 100))
          : 100;
      const lectureCompletionPercent = baseLecturePercent;
      const moduleProgressValue = moduleProgressMap.get(actualModuleId) ?? null;
      statuses[moduleId] = {
        moduleId: actualModuleId,
        totalLectures,
        watchedLectures: watchedLecturesCount,
        hasQuizAttempt: adaptiveSatisfied,
        hasExerciseAttempt: exerciseSatisfied,
        quizQuestionsAnswered: adaptiveSectionsCompleted,
        exerciseQuestionsTotal,
        exerciseQuestionsCorrect: answeredExerciseCount,
        completed,
        lectureCompletionPercent,
        progress: moduleProgressValue,
      };
    });

    return NextResponse.json({ statuses }, { status: 200 });
  } catch (error: any) {
    console.error("Module status lookup failed:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
