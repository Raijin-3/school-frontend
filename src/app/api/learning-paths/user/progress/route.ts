import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type ModuleActivityKind = "lecture" | "quiz" | "exercise";

const resolveOrderValue = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const sortByOrderIndex = <T extends Record<string, any>>(items: T[]): T[] => {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      item,
      index,
      order: resolveOrderValue(
        item?.order_index ??
          item?.orderIndex ??
          item?.order ??
          item?.orderNumber ??
          item?.orderPosition,
        index,
      ),
    }))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.index - b.index;
    })
    .map(({ item }) => item);
};

type ActivityPayload = {
  courseId?: string;
  subjectId?: string;
  moduleId?: string;
  sectionId?: string;
  lectureId?: string;
  watchedSeconds?: number;
  durationSeconds?: number;
  quizQuestionId?: string;
  exerciseId?: string;
  exerciseQuestionId?: string;
  exerciseIsCorrect?: boolean;
  exerciseUserAnswer?: string;
  exerciseAnswer?: string;
  moduleLectureIds?: string[] | null;
  activity?: ModuleActivityKind;
};

const normalizeArray = <T>(value: any): T[] => (Array.isArray(value) ? value : []);

type ModuleRequirementStatus = "mandatory" | "optional";

const normalizeRequirementStatus = (value?: string | null): ModuleRequirementStatus => {
  if (typeof value === "string" && value.toLowerCase() === "optional") {
    return "optional";
  }
  return "mandatory";
};

const isMandatoryModuleFromPath = (module: any): boolean => {
  const statusValue = typeof module?.status === "string" ? module.status.toLowerCase() : "";
  if (statusValue === "optional") return false;
  if (typeof module?.is_mandatory === "boolean") {
    return module.is_mandatory;
  }
  return true;
};

const computeModuleCompletionFlag = (module: any): boolean => {
  if (module?.completed === true) return true;
  const activity = module?.activity;
  if (
    activity &&
    activity.viewedLecture &&
    activity.attemptedQuiz &&
    activity.attemptedExercise
  ) {
    return true;
  }
  if (
    typeof module?.correctness_percentage === "number" &&
    module.correctness_percentage >= 100
  ) {
    return true;
  }
  return false;
};

const applyModuleActivationMetadata = (modules: any[]): any[] => {
  let previousMandatoryCompleted = true;

  return sortByOrderIndex(modules).map((module) => {
    const normalizedStatus = normalizeRequirementStatus(module?.status);
    const isMandatory = normalizedStatus !== "optional";
    const completionFlag = computeModuleCompletionFlag(module);
    const isActive = isMandatory ? previousMandatoryCompleted : true;

    if (isMandatory) {
      previousMandatoryCompleted = previousMandatoryCompleted && completionFlag;
    }

    return {
      ...module,
      status: normalizedStatus,
      is_mandatory: isMandatory,
      completed: completionFlag,
      is_active: isActive,
      active: isActive ? "active" : "inactive",
    };
  });
};

const toId = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
};

const toNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

type SupabaseRouteClient = ReturnType<typeof supabaseServer>;

const toStringSet = (values: Array<string | number | null | undefined>): Set<string> => {
  const set = new Set<string>();
  values.forEach((value) => {
    if (value === null || value === undefined) return;
    const asString = String(value).trim();
    if (asString.length > 0) {
      set.add(asString);
    }
  });
  return set;
};

type ModuleProgressSnapshot = {
  totalLectures: number;
  watchedLectures: number;
  totalExerciseQuestions: number;
  answeredExerciseQuestions: number;
  totalAdaptiveSections: number;
  completedAdaptiveSections: number;
  percent: number;
  sectionIds: string[];
};

type ModuleSectionProgress = {
  total: number;
  completed: number;
  percent: number;
} | null;

type ModuleProgressCalculationResult = {
  snapshot: ModuleProgressSnapshot;
  sectionProgress: ModuleSectionProgress;
};

const computeModuleProgressSnapshot = async ({
  supabaseClient,
  userId,
  moduleId,
}: {
  supabaseClient: SupabaseRouteClient;
  userId: string;
  moduleId: string;
}): Promise<ModuleProgressSnapshot> => {
  const sb = supabaseClient;
  const { data: sectionRows, error: sectionError } = await sb
    .from("sections")
    .select("id")
    .eq("module_id", moduleId);
  if (sectionError) {
    throw new Error(`module_sections_fetch_failed:${sectionError.message}`);
  }
  const sectionIds = (sectionRows || [])
    .map((row: any) => row?.id)
    .filter((value): value is string => Boolean(value));

  if (!sectionIds.length) {
    return {
      totalLectures: 0,
      watchedLectures: 0,
      totalExerciseQuestions: 0,
      answeredExerciseQuestions: 0,
      totalAdaptiveSections: 0,
      completedAdaptiveSections: 0,
      percent: 0,
    };
  }

  const { data: lectureRows, error: lectureError } = await sb
    .from("lectures")
    .select("id, section_id")
    .in("section_id", sectionIds);
  if (lectureError) {
    throw new Error(`module_lectures_fetch_failed:${lectureError.message}`);
  }
  const lectureIds = toStringSet(
    (lectureRows || []).map((lecture: any) => lecture?.id ?? null),
  );

  const { data: watchedRows, error: watchedError } = await sb
    .from("user_section_lecture_progress")
    .select("lecture_id")
    .eq("user_id", userId)
    .eq("is_watched", true)
    .in("section_id", sectionIds);
  if (watchedError) {
    throw new Error(`lecture_progress_fetch_failed:${watchedError.message}`);
  }
  const watchedLectureIds = toStringSet(
    (watchedRows || []).map((row: any) => row?.lecture_id ?? null),
  );

  const { data: exerciseRows, error: exerciseError } = await sb
    .from("section_exercises")
    .select("id, section_id")
    .in("section_id", sectionIds);
  if (exerciseError) {
    throw new Error(`section_exercises_fetch_failed:${exerciseError.message}`);
  }
  const exerciseIds = (exerciseRows || [])
    .map((row: any) => row?.id)
    .filter((value): value is string => Boolean(value));

  let exerciseQuestionIds = new Set<string>();
  if (exerciseIds.length) {
    const { data: questionRows, error: questionError } = await sb
      .from("section_exercise_questions")
      .select("id, exercise_id")
      .in("exercise_id", exerciseIds);
    if (questionError) {
      throw new Error(`exercise_questions_fetch_failed:${questionError.message}`);
    }
    exerciseQuestionIds = toStringSet(
      (questionRows || []).map((row: any) => row?.id ?? null),
    );
  }

  const { data: submissionRows, error: submissionError } = await sb
    .from("user_section_exercise_submissions")
    .select("question_id, section_id")
    .eq("user_id", userId)
    .eq("module_id", moduleId)
    .in("section_id", sectionIds);
  if (submissionError) {
    throw new Error(`exercise_submissions_fetch_failed:${submissionError.message}`);
  }
  const answeredExerciseQuestionIds = toStringSet(
    (submissionRows || []).map((row: any) => row?.question_id ?? null),
  );

  const { data: adaptiveRows, error: adaptiveError } = await sb
    .from("adaptive_quiz_sessions")
    .select("section_id, status")
    .eq("user_id", userId)
    .in("section_id", sectionIds)
    .in("status", ["completed", "stopped"]);
  if (adaptiveError) {
    throw new Error(`adaptive_sessions_fetch_failed:${adaptiveError.message}`);
  }
  const completedAdaptiveSections = toStringSet(
    (adaptiveRows || []).map((row: any) => row?.section_id ?? null),
  );

  const totals = {
    totalLectures: lectureIds.size,
    watchedLectures: watchedLectureIds.size,
    totalExerciseQuestions: exerciseQuestionIds.size,
    answeredExerciseQuestions: answeredExerciseQuestionIds.size,
    totalAdaptiveSections: sectionIds.length,
    completedAdaptiveSections: completedAdaptiveSections.size,
  };
  const completedUnits =
    totals.watchedLectures +
    totals.answeredExerciseQuestions +
    totals.completedAdaptiveSections;
  const totalUnits =
    totals.totalLectures +
    totals.totalExerciseQuestions +
    totals.totalAdaptiveSections;

  return {
    ...totals,
    percent: totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0,
    sectionIds,
  };
};

const fetchModuleSectionCompletion = async ({
  sectionIds,
  request,
}: {
  sectionIds: string[];
  request: NextRequest;
}): Promise<{ total: number; completed: number; percent: number } | null> => {
  if (!sectionIds.length) {
    return { total: 0, completed: 0, percent: 0 };
  }
  try {
    const url = new URL("/api/learning-paths/user/section-status", request.url);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ sectionIds }),
    });
    if (!response.ok) {
      console.warn("Section status fetch failed:", response.status);
      return null;
    }
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const statuses = (payload.statuses ?? {}) as Record<string, { completed?: boolean }>;
    let completed = 0;
    sectionIds.forEach((sectionId) => {
      if (statuses[String(sectionId)]?.completed) {
        completed += 1;
      }
    });
    const total = sectionIds.length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, percent };
  } catch (error) {
    console.warn("Failed to retrieve module section progress:", (error as any)?.message || error);
    return null;
  }
};

const persistModuleProgress = async ({
  supabaseClient,
  userId,
  moduleId,
  status,
  correctnessPercentage,
  progressPercent,
}: {
  supabaseClient: SupabaseRouteClient;
  userId: string;
  moduleId: string;
  status: "mandatory" | "optional";
  correctnessPercentage?: number | null;
  progressPercent: number;
}) => {
  const { error } = await supabaseClient.from("user_module_status").upsert(
    {
      user_id: userId,
      module_id: moduleId,
      status,
      correctness_percentage:
        typeof correctnessPercentage === "number"
          ? correctnessPercentage
          : 0,
      progress: Math.max(0, Math.min(100, Math.round(progressPercent))),
      last_updated: new Date().toISOString(),
    },
    { onConflict: "user_id,module_id" },
  );
  if (error) {
    throw new Error(`module_progress_upsert_failed:${error.message}`);
  }
};

const recalcAndPersistModuleProgress = async ({
  supabaseClient,
  userId,
  moduleId,
  moduleStatus,
  correctnessPercentage,
  sectionStatusRequest,
}: {
  supabaseClient: SupabaseRouteClient;
  userId: string;
  moduleId: string;
  moduleStatus: "mandatory" | "optional";
  correctnessPercentage?: number | null;
  sectionStatusRequest: NextRequest;
}): Promise<ModuleProgressCalculationResult> => {
  const snapshot = await computeModuleProgressSnapshot({
    supabaseClient,
    userId,
    moduleId,
  });
  const sectionProgress = await fetchModuleSectionCompletion({
    sectionIds: snapshot.sectionIds,
    request: sectionStatusRequest,
  });
  await persistModuleProgress({
    supabaseClient,
    userId,
    moduleId,
    status: moduleStatus,
    correctnessPercentage,
    progressPercent: sectionProgress?.percent ?? snapshot.percent,
  });
  return {
    snapshot,
    sectionProgress,
  };
};

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as ActivityPayload;
    const moduleId = toId(payload.moduleId);
    const courseId = toId(payload.courseId);
    const subjectId = toId(payload.subjectId);
    const rawActivity = payload.activity;
    const activity = typeof rawActivity === "string" ? rawActivity.toLowerCase() : "";

    if (!moduleId) {
      return NextResponse.json({ error: "moduleId is required" }, { status: 400 });
    }

    const sb = supabaseServer();
    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Persist activity details so completion can be derived reliably
    const sectionId = toId(payload.sectionId);
    const lectureId = toId(payload.lectureId);
    const rawWatchedSeconds = toNumber(payload.watchedSeconds);
    const rawDurationSeconds = toNumber(payload.durationSeconds);
    const watchedSeconds =
      typeof rawWatchedSeconds === "number" ? Math.round(rawWatchedSeconds) : undefined;
    const durationSeconds =
      typeof rawDurationSeconds === "number" ? Math.round(rawDurationSeconds) : undefined;
    const quizQuestionId = toId(payload.quizQuestionId);
    const exerciseId = toId(payload.exerciseId);
    const exerciseQuestionId = toId(payload.exerciseQuestionId);
    const exerciseIsCorrect =
      typeof payload.exerciseIsCorrect === "boolean" ? payload.exerciseIsCorrect : undefined;
    const exerciseUserAnswer = (() => {
      const candidate =
        typeof payload.exerciseUserAnswer === "string"
          ? payload.exerciseUserAnswer
          : typeof payload.exerciseAnswer === "string"
          ? payload.exerciseAnswer
          : undefined;
      if (typeof candidate !== "string") return undefined;
      const trimmed = candidate.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    })();
    const moduleLectureIds = Array.isArray(payload.moduleLectureIds)
      ? Array.from(
          new Set(
            payload.moduleLectureIds
              .map((id) => toId(id))
              .filter((value): value is string => Boolean(value)),
          ),
        )
      : undefined;
    type ModuleContext = {
      id: string;
      isOptional: boolean;
      status: "mandatory" | "optional";
      correctnessPercentage?: number | null;
    };
    let cachedModuleContext: ModuleContext | null = null;
    const resolveModuleContext = async (): Promise<ModuleContext> => {
      if (cachedModuleContext) return cachedModuleContext;
      let resolvedId = moduleId;
      let isOptional = false;
      let statusValue: "mandatory" | "optional" = "mandatory";
      let correctnessValue: number | undefined;
      try {
        const { data: moduleRow, error: moduleError } = await sb
          .from("modules")
          .select("id, slug")
          .or(`id.eq.${moduleId},slug.eq.${moduleId}`)
          .limit(1)
          .maybeSingle();
        if (moduleError) {
          throw moduleError;
        }
        if (moduleRow?.id) {
          resolvedId = moduleRow.id;
        }
      } catch (error) {
        console.warn("Failed to resolve module metadata:", (error as any)?.message || error);
      }

      try {
        const { data: statusRow, error: statusError } = await sb
          .from("user_module_status")
          .select("status, correctness_percentage")
          .eq("user_id", user.id)
          .eq("module_id", resolvedId)
          .limit(1)
          .maybeSingle();
        if (statusError) {
          console.warn("Failed to read user_module_status:", statusError.message);
        }
        if (statusRow?.status && typeof statusRow.status === "string") {
          const normalizedStatus =
            statusRow.status.toLowerCase() === "optional" ? "optional" : "mandatory";
          isOptional = normalizedStatus === "optional";
          statusValue = normalizedStatus;
        }
        if (
          statusRow &&
          typeof statusRow.correctness_percentage === "number" &&
          Number.isFinite(statusRow.correctness_percentage)
        ) {
          correctnessValue = statusRow.correctness_percentage;
        }
      } catch (error) {
        console.warn("User module status fetch error:", (error as any)?.message || error);
      }

      cachedModuleContext = {
        id: resolvedId,
        isOptional,
        status: statusValue,
        correctnessPercentage: correctnessValue,
      };
      return cachedModuleContext;
    };

    const {
      id: normalizedModuleId,
      isOptional: moduleIsOptional,
      status: moduleStatusForUpsert,
      correctnessPercentage: existingCorrectnessPercentage,
    } = await resolveModuleContext();
    let cachedModuleLectureInfo: { ids: string[]; total: number } | null = null;

    const fetchModuleLectureInfo = async (): Promise<{ ids: string[]; total: number }> => {
      if (cachedModuleLectureInfo) return cachedModuleLectureInfo;
      try {
        const { data: sectionRows, error: sectionError } = await sb
          .from("sections")
          .select("id")
          .eq("module_id", normalizedModuleId);
        if (sectionError) throw sectionError;

        const sectionIds = (sectionRows || [])
          .map((row: any) => row?.id)
          .filter((value): value is string => Boolean(value));
        if (!sectionIds.length) {
          cachedModuleLectureInfo = {
            ids: moduleLectureIds ?? [],
            total: moduleLectureIds?.length ?? 0,
          };
          return cachedModuleLectureInfo;
        }

        const { data: lectureRows, error: lectureError } = await sb
          .from("lectures")
          .select("id")
          .in("section_id", sectionIds);
        if (lectureError) throw lectureError;

        const lectureIds = (lectureRows || [])
          .map((row: any) => row?.id)
          .filter((value): value is string => Boolean(value))
          .map((value) => String(value));

        cachedModuleLectureInfo = {
          ids: lectureIds,
          total: lectureIds.length,
        };
        return cachedModuleLectureInfo;
      } catch (error) {
        console.warn("Failed to resolve module lecture info:", (error as any)?.message || error);
        cachedModuleLectureInfo = {
          ids: moduleLectureIds ?? [],
          total: moduleLectureIds?.length ?? 0,
        };
        return cachedModuleLectureInfo;
      }
    };

    let cachedModuleExerciseInfo: { ids: string[]; total: number } | null = null;
    const fetchModuleExerciseInfo = async (): Promise<{ ids: string[]; total: number }> => {
      if (cachedModuleExerciseInfo) return cachedModuleExerciseInfo;
      try {
        const { data: sectionRows, error: sectionError } = await sb
          .from("sections")
          .select("id")
          .eq("module_id", normalizedModuleId);
        if (sectionError) throw sectionError;

        const sectionIds = (sectionRows || [])
          .map((row: any) => row?.id)
          .filter((value): value is string => Boolean(value));
        if (!sectionIds.length) {
          cachedModuleExerciseInfo = { ids: [], total: 0 };
          return cachedModuleExerciseInfo;
        }

        const { data: exerciseRows, error: exercisesError } = await sb
          .from("section_exercises")
          .select("id")
          .in("section_id", sectionIds);
        if (exercisesError) throw exercisesError;

        const exerciseIds = (exerciseRows || [])
          .map((row: any) => row?.id)
          .filter((value): value is string => Boolean(value))
          .map((value) => String(value));
        if (!exerciseIds.length) {
          cachedModuleExerciseInfo = { ids: [], total: 0 };
          return cachedModuleExerciseInfo;
        }

        const { data: questionRows, error: questionError } = await sb
          .from("section_exercise_questions")
          .select("id, exercise_id")
          .in("exercise_id", exerciseIds);
        if (questionError) throw questionError;

        const questionIds = (questionRows || [])
          .map((row: any) => row?.id)
          .filter((value): value is string => Boolean(value))
          .map((value) => String(value));

        cachedModuleExerciseInfo = {
          ids: questionIds,
          total: questionIds.length,
        };
        return cachedModuleExerciseInfo;
      } catch (error) {
        console.warn("Failed to resolve module exercise info:", (error as any)?.message || error);
        cachedModuleExerciseInfo = { ids: [], total: 0 };
        return cachedModuleExerciseInfo;
      }
    };

    const upsertLectureProgress = async () => {
      if (activity !== "lecture" || !sectionId || !lectureId) return { recorded: false, isWatched: false };
      const isWatched =
        typeof watchedSeconds === "number" &&
        typeof durationSeconds === "number" &&
        durationSeconds > 0 &&
        watchedSeconds / durationSeconds >= 0.95;
      const { error } = await sb
        .from("user_section_lecture_progress")
        .upsert(
        {
          user_id: user.id,
          course_id: courseId ?? null,
          subject_id: subjectId ?? null,
          module_id: normalizedModuleId,
          section_id: sectionId,
          lecture_id: lectureId,
          duration_seconds: durationSeconds ?? null,
          watched_seconds: watchedSeconds ?? null,
            is_watched: isWatched || null,
            last_watched_at: new Date().toISOString(),
          },
          { onConflict: "user_id,lecture_id" },
        );
      if (error) {
        console.error("Failed to upsert lecture progress:", error.message);
        throw new Error(`lecture_progress_insert_failed:${error.message}`);
      }
      return { recorded: true, isWatched };
    };

    const insertQuizAttempt = async () => {
      if (activity !== "quiz" || !sectionId) return { recorded: false };
      const { error } = await sb.from("user_section_quiz_attempts").upsert(
        {
          user_id: user.id,
          course_id: courseId ?? null,
          subject_id: subjectId ?? null,
          module_id: normalizedModuleId,
          section_id: sectionId,
          question_id: quizQuestionId ?? null,
          attempted_at: new Date().toISOString(),
        },
        { onConflict: "user_id,section_id,question_id" },
      );
      if (error) {
        console.error("Failed to record quiz attempt:", error.message);
        throw new Error(`quiz_attempt_insert_failed:${error.message}`);
      }
      return { recorded: true };
    };

    const insertExerciseSubmission = async () => {
      console.log(activity, sectionId);
      if (activity !== "exercise" || !sectionId) return { recorded: false };
      const payload = {
        user_id: user.id,
        course_id: courseId ?? null,
        subject_id: subjectId ?? null,
        module_id: normalizedModuleId,
        section_id: sectionId,
        exercise_id: exerciseId ?? null,
        question_id: exerciseQuestionId ?? null,
        is_correct: typeof exerciseIsCorrect === "boolean" ? exerciseIsCorrect : null,
        submitted_at: new Date().toISOString(),
      };
      console.log("Recording exercise submission", payload);
      const { error } = await sb.from("user_section_exercise_submissions").insert(payload);
      if (error) {
        console.error("Failed to record exercise submission:", error.message);
        throw new Error(`exercise_submission_insert_failed:${error.message}`);
      }
      return { recorded: true };
    };

    const insertExerciseQuestionSubmission = async () => {
      if (
        activity !== "exercise" ||
        !sectionId ||
        !exerciseId ||
        !exerciseQuestionId
      ) {
        return { recorded: false };
      }
      const payload = {
        student_id: user.id,
        exercise_id: exerciseId,
        question_id: exerciseQuestionId,
        user_answer: exerciseUserAnswer ?? null,
        is_correct: typeof exerciseIsCorrect === "boolean" ? exerciseIsCorrect : true,
        submitted_at: new Date().toISOString(),
      };
      const { error } = await sb
        .from("section_exercise_question_submissions")
        .insert(payload);
      if (error) {
        console.error("Failed to insert question submission:", error.message);
        throw new Error(`exercise_question_submission_failed:${error.message}`);
      }
      return { recorded: true };
    };

    const upsertExerciseProgress = async () => {
      if (activity !== "exercise" || !sectionId || !exerciseId) return { recorded: false };
      const progressPayload = {
        student_id: user.id,
        exercise_id: exerciseId,
        status: "completed",
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from("section_exercise_progress").upsert(progressPayload, {
        onConflict: "exercise_id,student_id",
      });
      if (error) {
        console.error("Failed to upsert exercise progress:", error.message);
        throw new Error(`exercise_progress_upsert_failed:${error.message}`);
      }
      return { recorded: true };
    };

    // Fire-and-forget logging (errors are captured and surfaced later if needed)
    let lectureRecord: { recorded: boolean; isWatched: boolean } | undefined;
    console.log("Processing activity:", activity);
    if (activity === "lecture") {
      console.log("About to upsert lecture progress");
      lectureRecord = await upsertLectureProgress();
    } else if (activity === "quiz") {
      console.log("About to insert quiz attempt");
      await insertQuizAttempt();
    } else if (activity === "exercise") {
      console.log("About to insert exercise submission");
      await insertExerciseSubmission();
      await insertExerciseQuestionSubmission();
      await upsertExerciseProgress();
    }

    const deriveModuleCompletion = async () => {
      if (moduleIsOptional) {
        return {
          viewedLecture: true,
          attemptedQuiz: true,
          attemptedExercise: true,
          exerciseFullyCorrect: true,
        };
      }
      const safeHas = async (fn: () => Promise<boolean>): Promise<boolean> => {
        try {
          return await fn();
        } catch (error) {
          console.warn("Completion derivation fallback:", (error as any)?.message || error);
          return false;
        }
      };

      const hasWatchedLecture = await safeHas(async () => {
        const lectureInfo = await fetchModuleLectureInfo();
        if (lectureInfo.total > 0 && lectureInfo.ids.length > 0) {
        const { count, error } = await sb
          .from("user_section_lecture_progress")
          .select("lecture_id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_watched", true)
          .in("lecture_id", lectureInfo.ids);
          if (error) throw error;
          return (count ?? 0) >= lectureInfo.total;
        }
        return Boolean(lectureRecord?.isWatched);
      });

      const quizRequirementMet = await safeHas(async () => {
        const { count, error } = await sb
          .from("user_section_quiz_attempts")
          .select("question_id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("module_id", normalizedModuleId)
          .not("question_id", "is", null);
        if (error) throw error;
        return (count ?? 0) >= 10;
      });

      const exerciseProgress = await (async () => {
        try {
          const exerciseInfo = await fetchModuleExerciseInfo();
          if (exerciseInfo.total === 0) {
            return { attempted: true, fullyCorrect: true };
          }
          const { data, error } = await sb
            .from("user_section_exercise_submissions")
            .select("question_id, is_correct")
            .eq("user_id", user.id)
            .eq("module_id", normalizedModuleId);
          if (error) throw error;
          const attemptedSet = new Set<string>();
          const correctSet = new Set<string>();
          (data || []).forEach((row: any) => {
            const rawQuestionId = row?.question_id;
            if (!rawQuestionId) {
              return;
            }
            const normalizedId = String(rawQuestionId);
            attemptedSet.add(normalizedId);
            if (row?.is_correct === true) {
              correctSet.add(normalizedId);
            }
          });
          const attempted = exerciseInfo.ids.every((id) => attemptedSet.has(id));
          const fullyCorrect = exerciseInfo.ids.every((id) => correctSet.has(id));
          return { attempted, fullyCorrect };
        } catch (error) {
          console.warn(
            "Exercise completion derivation fallback:",
            (error as any)?.message || error,
          );
          return { attempted: false, fullyCorrect: false };
        }
      })();

      return {
        viewedLecture: hasWatchedLecture,
        attemptedQuiz: quizRequirementMet,
        attemptedExercise: exerciseProgress.attempted,
        exerciseFullyCorrect: exerciseProgress.fullyCorrect,
      };
    };

    const moduleCompletion = await deriveModuleCompletion();
    let moduleProgressResult: ModuleProgressCalculationResult | null = null;
    try {
      moduleProgressResult = await recalcAndPersistModuleProgress({
        supabaseClient: sb,
        userId: user.id,
        moduleId: normalizedModuleId,
        moduleStatus: moduleStatusForUpsert,
        correctnessPercentage: existingCorrectnessPercentage,
        sectionStatusRequest: request,
      });
    } catch (error) {
      console.warn("Module progress update failed:", (error as any)?.message || error);
    }

    const moduleProgressSnapshot = moduleProgressResult?.snapshot ?? null;
    const sectionProgress = moduleProgressResult?.sectionProgress ?? null;
    const sectionCompletionMet =
      sectionProgress === null
        ? null
        : sectionProgress.total === 0
        ? true
        : sectionProgress.completed >= sectionProgress.total;
    const legacyModuleCompletion =
      moduleCompletion.viewedLecture &&
      moduleCompletion.attemptedQuiz &&
      moduleCompletion.exerciseFullyCorrect;
    const moduleCompletionAllRequirementsMet =
      sectionCompletionMet !== null ? sectionCompletionMet : legacyModuleCompletion;
    const moduleProgressPercent =
      sectionProgress?.percent ?? moduleProgressSnapshot?.percent ?? null;

    const buildModuleCompletionPayload = (completed: boolean) => ({
      viewedLecture: moduleCompletion.viewedLecture,
      attemptedQuiz: moduleCompletion.attemptedQuiz,
      attemptedExercise: moduleCompletion.attemptedExercise,
      exerciseFullyCorrect: moduleCompletion.exerciseFullyCorrect,
      completed,
      progressPercent: moduleProgressPercent,
    });

    const { data: existingPath, error: pathError } = await sb
      .from("user_learning_path")
      .select("id, path")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pathError) {
      console.error("Failed to read user_learning_path:", pathError.message);
      return NextResponse.json({ error: "Failed to read learning path" }, { status: 500 });
    }

    if (!existingPath) {
      console.warn(
        "Learning path progress update attempted without stored user path. Skipping path mutation.",
      );
      return NextResponse.json({
        ok: true,
        updated: false,
        moduleCompletion: buildModuleCompletionPayload(moduleCompletionAllRequirementsMet),
      });
    }

    const base = (existingPath as any).path || {};
    const pathCourses = normalizeArray<any>((base as any).courses ?? (base as any).path?.courses);

    let updated = false;
    let moduleMarkedCompleted = false;

    const updatedCourses = pathCourses.map((course: any) => {
      const courseMatch =
        !courseId ||
        course?.id === courseId ||
        (typeof course?.slug === "string" && course.slug === courseId);
      const courseSubjects = normalizeArray<any>(course?.subjects);

      const updatedSubjects = courseSubjects.map((subject: any) => {
        const subjectMatch =
          !subjectId ||
          subject?.id === subjectId ||
          (typeof subject?.slug === "string" && subject.slug === subjectId);
        const modules = normalizeArray<any>(subject?.modules);
        let moduleJustCompletedKey: string | undefined;

        const updatedModules = modules.map((module: any) => {
          const modId = toId(module?.id);
          const modSlug = toId(module?.slug);
          const matched =
            (!!modId && modId === moduleId) ||
            (!!modSlug && modSlug === moduleId);
          if (!matched) {
            return module;
          }

          const existingActivity = (module?.activity || {}) as Record<string, boolean>;
          const nextActivity = {
            ...existingActivity,
            viewedLecture: moduleCompletion.viewedLecture || existingActivity.viewedLecture,
            attemptedQuiz: moduleCompletion.attemptedQuiz || existingActivity.attemptedQuiz,
            attemptedExercise:
              moduleCompletion.attemptedExercise || existingActivity.attemptedExercise,
            exerciseFullyCorrect:
              moduleCompletion.exerciseFullyCorrect ||
              existingActivity.exerciseFullyCorrect ||
              false,
          };

          const moduleFullyCompleted = moduleCompletionAllRequirementsMet;
          if (moduleFullyCompleted) {
            moduleMarkedCompleted = true;
            moduleJustCompletedKey = modId ?? modSlug ?? undefined;
          }

          const nextModule = {
            ...module,
            activity: nextActivity,
            completed: moduleFullyCompleted ? true : module?.completed ?? false,
            correctness_percentage:
              moduleFullyCompleted
                ? 100
                : typeof module?.correctness_percentage === "number"
                ? module.correctness_percentage
                : null,
          };

          // Optional: reduce gating strictness by marking optional when complete
          if (moduleFullyCompleted && typeof nextModule.status !== "string") {
            nextModule.status = "optional";
          }

          updated = true;
          return nextModule;
        });

        let normalizedModules = applyModuleActivationMetadata(updatedModules);
        if (moduleJustCompletedKey) {
          const completedIndex = normalizedModules.findIndex((module: any) => {
            const normalizedId = toId(module?.id);
            const normalizedSlug = toId(module?.slug);
            return (
              (normalizedId && moduleJustCompletedKey === normalizedId) ||
              (normalizedSlug && moduleJustCompletedKey === normalizedSlug)
            );
          });
          if (completedIndex >= 0) {
            const nextMandatoryIndex = normalizedModules.findIndex(
              (module: any, idx: number) =>
                idx > completedIndex &&
                isMandatoryModuleFromPath(module) &&
                module?.completed !== true,
            );
            if (nextMandatoryIndex >= 0) {
              normalizedModules = normalizedModules.map((module: any, idx: number) =>
                idx === nextMandatoryIndex
                  ? { ...module, is_active: true, active: "active" }
                  : module,
              );
            }
          }
        }

        return {
          ...subject,
          modules: normalizedModules,
        };
      });

      return {
        ...course,
        subjects: updatedSubjects,
      };
    });

    if (!updated) {
      return NextResponse.json({
        ok: true,
        updated: false,
        moduleCompletion: buildModuleCompletionPayload(false),
      });
    }

    const nextPath = Array.isArray((base as any).courses)
      ? { ...(base as any), courses: updatedCourses }
      : { path: { ...(base as any).path, courses: updatedCourses } };

    const { error: updateError } = await sb
      .from("user_learning_path")
      .update({ path: nextPath })
      .eq("id", (existingPath as any).id);

    if (updateError) {
      console.error("Failed to update user_learning_path:", updateError.message);
      return NextResponse.json({ error: "Failed to save progress" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      updated: true,
      moduleCompletion: buildModuleCompletionPayload(moduleMarkedCompleted),
    });
  } catch (error: any) {
    console.error("Update learning path progress error:", error);
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
