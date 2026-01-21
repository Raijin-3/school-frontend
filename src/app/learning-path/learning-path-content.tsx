"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { toast } from "@/lib/toast";
import { supabaseBrowser } from "@/lib/supabase-browser";

import { Star, Trophy, Lock, Package2, CheckCircle, ArrowDown, Zap, BookOpen, Calendar } from "lucide-react";

const LEARNING_PATH_REFRESH_KEY = "jarvis-learning-path-refresh";
const LEARNING_PATH_CACHE_PREFIX = "jarvis.learning-path.cache";
const VISIBLE_NODES_STORAGE_KEY_PREFIX = "jarvis.learning-path.visible-nodes";

const normalizeSlug = (value?: string) =>
  (value || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Keep the same props signature to avoid touching page.tsx

export function LearningPathContent({
  isFirstTime,
  profile,
  subjectSlug,
  courseSlug,
}: {
  isFirstTime: boolean;
  profile: any;
  subjectSlug?: string;
  courseSlug?: string;
}) {

  const [loading, setLoading] = useState(true);

  const [modules, setModules] = useState<ModuleWithMandatory[]>([]);

  const [pathNodes, setPathNodes] = useState<PathNode[]>([]);



  const [query, setQuery] = useState("");

  const [visibleNodes, setVisibleNodes] = useState(6); // Show first 6 nodes initially

  const [animatedNodes, setAnimatedNodes] = useState<Set<string>>(new Set());

  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const loadLearningPathModulesRef = useRef<((options?: { forceReload?: boolean }) => void | Promise<void>)>(() => {});

  const visibleNodesStorageKey = useMemo(() => {
    const courseSegment = courseSlug ? `course:${courseSlug}` : "course:all";
    const subjectSegment = subjectSlug ? `subject:${subjectSlug}` : "subject:all";
    return `${VISIBLE_NODES_STORAGE_KEY_PREFIX}:${courseSegment}:${subjectSegment}`;
  }, [courseSlug, subjectSlug]);

  const persistVisibleNodes = useCallback(
    (count: number) => {
      if (typeof window === "undefined" || !visibleNodesStorageKey) {
        return;
      }
      window.localStorage.setItem(visibleNodesStorageKey, String(count));
    },
    [visibleNodesStorageKey],
  );

  useEffect(() => {
    setVisibleNodes(6);
  }, [visibleNodesStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !visibleNodesStorageKey || pathNodes.length === 0) {
      return;
    }
    const storedRaw = window.localStorage.getItem(visibleNodesStorageKey);
    const storedValue = typeof storedRaw === "string" ? Number(storedRaw) : NaN;
    if (!Number.isFinite(storedValue) || storedValue <= 0) {
      return;
    }
    const desired = Math.min(pathNodes.length, Math.max(6, storedValue));
    if (desired <= 0) {
      return;
    }
    setVisibleNodes((prev) => {
      if (prev >= desired) {
        if (storedValue > pathNodes.length) {
          persistVisibleNodes(desired);
        }
        return prev;
      }
      persistVisibleNodes(desired);
      return desired;
    });
  }, [pathNodes.length, visibleNodesStorageKey, persistVisibleNodes]);

  const parseOrderIndexValue = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  if (typeof value === "string" && value.trim().length > 0) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    return undefined;
  };

  const clampProgressValue = (value?: number | null): number | undefined => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return undefined;
    }
    if (value <= 0) return 0;
    if (value >= 100) return 100;
    return Math.round(value);
  };

  const resolveOrderIndexFromSource = (source: any) =>
    parseOrderIndexValue(
      source?.order_index ??
        source?.orderIndex ??
        source?.order ??
        source?.orderNumber ??
        source?.orderPosition,
    );

  const isModuleMandatory = (module?: ModuleWithMandatory | null): boolean => {
    if (!module) {
      return false;
    }
    const statusValue =
      typeof module.status === "string" ? module.status.toLowerCase() : "";
    if (statusValue === "optional") {
      return false;
    }
    if (typeof module.is_mandatory === "boolean") {
      return module.is_mandatory;
    }
    return true;
  };

  const totalMandatoryModules = useMemo(
    () => modules.filter((module) => isModuleMandatory(module)).length,
    [modules],
  );
  const totalModules = modules.length;
  const savedWeeks = Math.max(0, totalModules - totalMandatoryModules);
  const formattedTotalWeeks =
    totalMandatoryModules === 0 || totalModules === 0
      ? "TBD"
      : `${totalMandatoryModules} weeks`;
  const showEstimatedTime = !loading && formattedTotalWeeks !== "TBD";
  const showSavedWeeks = !loading && savedWeeks > 0;

  useEffect(() => {

    loadLearningPathModules();

    // eslint-disable-next-line react-hooks-exhaustive-deps

  }, []);

  useEffect(() => {

    const handleRefresh = () => {

      loadLearningPathModulesRef.current?.({ forceReload: true });

    };

    const handleStorage = (event: StorageEvent) => {

      if (event.key === LEARNING_PATH_REFRESH_KEY) {

        handleRefresh();

      }

    };

    window.addEventListener("learning-path-refresh", handleRefresh as EventListener);

    window.addEventListener("storage", handleStorage);

    return () => {

      window.removeEventListener("learning-path-refresh", handleRefresh as EventListener);

      window.removeEventListener("storage", handleStorage);

    };

  }, []);

  // Animate nodes in sequence after data loads

  useEffect(() => {

    if (pathNodes.length > 0 && !loading) {

      const timer = setTimeout(() => {

        pathNodes.slice(0, visibleNodes).forEach((node, index) => {

          setTimeout(() => {

            setAnimatedNodes(prev => new Set([...prev, node.id]));

          }, index * 200); // Stagger animations by 200ms

        });

      }, 300);

      return () => clearTimeout(timer);

    }

  }, [pathNodes, visibleNodes, loading]);

  // If pathNodes is empty after initial load, wait 4 seconds and refresh
  useEffect(() => {
    if (pathNodes.length === 0 && !loading) {
      const timer = setTimeout(() => {
        console.log("No path nodes found, refreshing learning path data...");
        loadLearningPathModulesRef.current?.({ forceReload: true });
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [pathNodes.length, loading]);

  // Find the current node (next node to work on)

  const findCurrentNode = (nodes: PathNode[]): PathNode | null => {
    const preferredNode = nodes.find(
      (node) =>
        node.type === "module" &&
        !node.locked &&
        !node.completed &&
        isModuleMandatory(node.module ?? null),
    );
    if (preferredNode) {
      return preferredNode;
    }
    return nodes.find((node) => !node.locked && !node.completed) || null;
  };

  // Convert modules to path nodes

  const createPathNodes = (modules: ModuleWithMandatory[]): PathNode[] => {
    const nodes: PathNode[] = [];

    const usedIds = new Set<string>();
    const slug = (s?: string) =>
      (s || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const uniqueId = (base: string) => {
      let id = base || "node";
      let i = 1;
      while (usedIds.has(id)) {
        id = `${base}-${i++}`;
      }
      usedIds.add(id);
      return id;
    };

    nodes.push({
      id: uniqueId('start'),
      type: 'start',
      title: 'Start Learning',
      description: 'Begin your journey',
      completed: false,
      locked: false
    });

    const clampProgress = (value?: number | null) =>
      clampProgressValue(value) ?? 0;

    type CompletionSummary = {
      completed: boolean;
      progress: number;
    };

    const completionSummaryCache = new WeakMap<ModuleWithMandatory, CompletionSummary>();

    const getCompletionSummary = (module: ModuleWithMandatory): CompletionSummary => {
      const cached = completionSummaryCache.get(module);
      if (cached) return cached;
      const storedProgress = clampProgressValue(module.progress);

      // const status = module.moduleStatus;
      // if (status) {
      //   const lecturesSatisfied =
      //     status.totalLectures === 0
      //       ? true
      //       : status.watchedLectures >= status.totalLectures;
      //   const quizSatisfied = Boolean(status.hasQuizAttempt);
      //   const exerciseSatisfied = Boolean(status.hasExerciseAttempt);

      //   // ✅ Match subject-learning-interface: 0 / 33 / 67 / 100 based on 3 requirements
      //   const requirements = [lecturesSatisfied, quizSatisfied, exerciseSatisfied];
      //   const metCount = requirements.filter(Boolean).length;
      //   const totalCount = requirements.length || 1;
      //   const requirementProgress = (metCount / totalCount) * 100;

      //   const summary: CompletionSummary = {
      //     completed: metCount === totalCount,
      //     progress: Math.round(clampProgress(requirementProgress)),
      //   };

      //   completionSummaryCache.set(module, summary);
      //   return summary;
      // }

      const status = module.moduleStatus;
      if (status) {
        // ✅ Requirement booleans (same as before)
        const lecturesSatisfied =
          status.totalLectures === 0
            ? true
            : status.watchedLectures >= status.totalLectures;
        const quizSatisfied = Boolean(status.hasQuizAttempt);
        const exerciseSatisfied = Boolean(status.hasExerciseAttempt);

        // ✅ Root-level combined progress inputs
        const totalLectures = status.totalLectures ?? 0;
        const watchedLectures = status.watchedLectures ?? 0;

        const quizTotal =
          status.quizQuestionsTotal ??
          status.quizQuestionsAnswered ??
          0;
        const quizDone = status.quizQuestionsAnswered ?? 0;

        const exerciseTotal = status.exerciseQuestionsTotal ?? 0;
        const exerciseDone = status.exerciseQuestionsCorrect ?? 0;

        const totalUnits = totalLectures + quizTotal + exerciseTotal;
        const completedUnits = watchedLectures + quizDone + exerciseDone;

        const hasDetailedMetrics =
          totalLectures > 0 ||
          quizTotal > 0 ||
          exerciseTotal > 0;

        const combinedProgress = hasDetailedMetrics && totalUnits > 0
          ? (completedUnits / totalUnits) * 100
          : NaN;

        const legacyProgress =
          status.lectureCompletionPercent ??
          module.correctness_percentage ??
          0;

        const progress =
          storedProgress ??
          clampProgress(
            Number.isFinite(combinedProgress) ? combinedProgress : legacyProgress,
          );
        const progressComplete = progress >= 100;

        const summary: CompletionSummary = {
          // ✅ Completed still means ALL 3 requirements satisfied (or progress reached 100%)
          completed: progressComplete || (lecturesSatisfied && quizSatisfied && exerciseSatisfied),
          progress,
        };

        completionSummaryCache.set(module, summary);
        return summary;
      }

      const moduleFlaggedComplete = Boolean(module.completed);
      const fallbackProgress = storedProgress ?? (moduleFlaggedComplete ? 100 : 0);
      const fallbackCompleted = fallbackProgress >= 100 || moduleFlaggedComplete;
      const summary: CompletionSummary = {
        completed: fallbackCompleted,
        progress: fallbackProgress,
      };
      completionSummaryCache.set(module, summary);
      return summary;
    };

    const resolveActivationState = (module: ModuleWithMandatory): boolean | undefined => {
      if (typeof module.is_active === "boolean") return module.is_active;
      if (typeof module.active === "string") {
        const normalized = module.active.toLowerCase();
        if (normalized === "active") return true;
        if (normalized === "inactive") return false;
      }
      return undefined;
    };

    let previousMandatoryProgressComplete = true;
    let previousModuleSubjectKey: string | undefined;
    let previousModuleMandatory: boolean | undefined;
    const seenSubjectKeys = new Set<string>();

    // Add module nodes with progressive unlocking logic
    modules.forEach((module, index) => {
      const completion = getCompletionSummary(module);
      const baseModuleId = `module-${slug(module.course_title)}-${slug(module.subject_title)}-${slug(module.id)}`;
      const isFirst = index === 0;
      const mandatory = isModuleMandatory(module);
      const subjectKey =
        (module.subjectId ?? module.subject_title ?? module.course_title ?? `subject-${module.courseId}`) || `subject-${index}`;
      const isSubjectFirst = !seenSubjectKeys.has(subjectKey);
      if (isSubjectFirst) {
        seenSubjectKeys.add(subjectKey);
      }

      const shouldUnlockForOptionalPrev =
        mandatory &&
        previousModuleSubjectKey === subjectKey &&
        previousModuleMandatory === false;

      const locked =
        mandatory &&
        index > 0 &&
        !previousMandatoryProgressComplete &&
        !isSubjectFirst &&
        !shouldUnlockForOptionalPrev;
      const explicitActivation = resolveActivationState(module);
      const computedActive = explicitActivation ?? (!locked || !mandatory);

      const decoratedModule: ModuleWithMandatory = {
        ...module,
        completed: completion.completed,
        progress: completion.progress,
        status: module.status ?? (mandatory ? "mandatory" : "optional"),
        is_active: computedActive,
        active: computedActive ? "active" : "inactive",
        isFirstModule: isFirst,
      };

      // if(decoratedModule.status === 'mandatory') {
        nodes.push({
          id: uniqueId(baseModuleId),
          type: 'module',
          title: module.title,
          description: `${module.subject_title} - ${module.course_title}`,
          completed: completion.completed,
          locked,
          progress: completion.progress,
          module: decoratedModule,
        });
      // }

      if (mandatory) {
        previousMandatoryProgressComplete = completion.progress >= 100;
      }
      previousModuleSubjectKey = subjectKey;
      previousModuleMandatory = mandatory;
    });

    const mandatoryModules = modules.filter((module) => isModuleMandatory(module));
    const modulesToCheck = mandatoryModules.length === 0 ? modules : mandatoryModules;
    const allMandatoryCompleted = modulesToCheck.every((module) =>
      getCompletionSummary(module).completed,
    );

    nodes.push({
      id: uniqueId('final'),
      type: 'final',
      title: 'Learning Complete',
      description: 'Congratulations!',
      completed: allMandatoryCompleted,
      locked: !allMandatoryCompleted
    });

    return nodes;
  };

  // console.log("Nodes", pathNodes);

  const loadLearningPathModules = async ({ forceReload = false }: { forceReload?: boolean } = {}) => {

    let hadCachedData = false;

    try {

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const userId = session?.user?.id ?? null;
      const cacheKey = buildLearningPathCacheKey(userId, courseSlug, subjectSlug);
      if (forceReload && cacheKey) {
        clearLearningPathCache(cacheKey);
      }
      const cachedPayload =
        !forceReload && cacheKey ? readLearningPathCache(cacheKey) : null;
      const cacheValid =
        Boolean(cachedPayload?.modules?.length) &&
        Boolean(cachedPayload?.pathNodes?.length);
      if (cacheValid) {
        hadCachedData = true;
        setModules(cachedPayload!.modules);
        setPathNodes(cachedPayload!.pathNodes);
      }

      setLoading(!cacheValid);

      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      // Fetch or generate once the user's learning path
      const userPathRes = await fetch("/api/learning-paths/user/me", {
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: "include",
        cache: "no-store",
      });

      // Handle 401 Unauthorized - redirect to login
      if (userPathRes.status === 401) {
        const errorData = await userPathRes.json().catch(() => ({}));
        console.log("Unauthorized access to learning path:", errorData);
        toast.error(errorData.message || "Please log in to access your learning path");
        // Redirect to login page
        if (typeof window !== "undefined") {
          window.location.href = errorData.redirectTo || "/login";
        }
        return;
      }

      if (!userPathRes.ok) {

        throw new Error("Failed to load your learning path");

      }

      const learningPath = await userPathRes.json();

      console.log("learningPath", learningPath);

      const candidates = Array.isArray(learningPath)
        ? learningPath
        : Array.isArray(learningPath?.path?.path?.courses)
          ? learningPath.path.path.courses
          : Array.isArray(learningPath?.path?.courses)
            ? learningPath.path.courses
            : [];

      const extractedModules: ModuleWithMandatory[] = [];

      candidates.forEach((course: any, courseIndex) => {
        const subjects = Array.isArray(course?.subjects) ? course.subjects : [];
        const courseId = course?.id ?? course?.courseId ?? course?.course_id;
        const courseTitle = course?.title ?? "";
        const courseOrderRaw = resolveOrderIndexFromSource(course);
        const courseOrder =
          typeof courseOrderRaw === "number" && Number.isFinite(courseOrderRaw)
            ? courseOrderRaw
            : courseIndex;
        subjects.forEach((subject: any, subjectIndex) => {
          const modules = Array.isArray(subject?.modules) ? subject.modules : [];
          // console.log("jjjjjjjjjj",modules);
          const subjectId = subject?.id ?? subject?.subjectId ?? subject?.subject_id;
          const subjectTitle = subject?.title ?? "";
          const subjectOrderRaw = resolveOrderIndexFromSource(subject);
          const subjectOrder =
            typeof subjectOrderRaw === "number" && Number.isFinite(subjectOrderRaw)
              ? subjectOrderRaw
              : subjectIndex;
          modules.forEach((module: any) => {
            const moduleId = module?.moduleId ?? module?.module_id ?? module?.id ?? module?.slug;

            if (!moduleId) return;

            const correctnessRaw = module?.correctness_percentage;

            const correctnessNumber =
              correctnessRaw === null || correctnessRaw === undefined ? undefined : Number(correctnessRaw);

            const normalizedCorrectness =
              typeof correctnessNumber === "number" && Number.isFinite(correctnessNumber)
                ? correctnessNumber
                : undefined;

            const rawActive =
              typeof module?.active === "string" ? module.active.toLowerCase() : undefined;
            const explicitActive =
              typeof module?.is_active === "boolean"
                ? module.is_active
                : rawActive === "active"
                ? true
                : rawActive === "inactive"
                ? false
                : undefined;
            const activeLabel =
              typeof module?.active === "string"
                ? module.active
                : typeof explicitActive === "boolean"
                ? explicitActive
                  ? "active"
                  : "inactive"
                : undefined;

            extractedModules.push({
              id: String(moduleId),
              title: module?.title ?? "Module",
              subject_title: subjectTitle,
              course_title: courseTitle,
              subjectId: subjectId ? String(subjectId) : undefined,
              courseId: courseId ? String(courseId) : undefined,
              status: module?.status,
              correctness_percentage: normalizedCorrectness,
              assessment_based: module?.assessment_based,
              is_mandatory: module?.is_mandatory,
              order_index: resolveOrderIndexFromSource(module),
              course_order_index: courseOrder,
              subject_order_index: subjectOrder,
              is_active: typeof explicitActive === "boolean" ? explicitActive : undefined,
              active: activeLabel,
              completed: typeof module?.completed === "boolean" ? module.completed : undefined,
              progress: typeof module?.progress === "number" ? module.progress : undefined,
            });
          });
        });
      });

      const modulesWithProgress = extractedModules.map((module) => {
        const normalized =
          clampProgressValue(module.progress) ??
          clampProgressValue(module.correctness_percentage) ??
          0;

        return {
          ...module,
          progress: normalized,
          completed: module.completed ?? normalized >= 100,
        };
      });

      const filteredModules = modulesWithProgress.filter((module) => {
        console.log("Filtering module", module);
        const courseMatch = courseSlug
          ? (() => {
              const courseSlugCandidate = normalizeSlug(module.course_title || module.courseId);
              const courseIdSlug = normalizeSlug(module.courseId);
              const target = normalizeSlug(courseSlug);
              return courseSlugCandidate === target || courseIdSlug === target;
            })()
          : true;

        const subjectMatch = subjectSlug
          ? (() => {
              const subjectSlugCandidate = normalizeSlug(module.subject_title || module.subjectId);
              const subjectIdSlug = normalizeSlug(module.subjectId);
              const target = normalizeSlug(subjectSlug);
              return subjectSlugCandidate === target || subjectIdSlug === target;
            })()
          : true;

        return courseMatch && subjectMatch;
      });

      // Debug logging for filtering
      // console.log('[DEBUG] === MODULE FILTERING ===');
      // console.log(`[DEBUG] Total modules from backend: ${modulesWithProgress.length}`);
      // console.log(`[DEBUG] Modules after filtering: ${filteredModules.length}`);
      // console.log(`[DEBUG] Filter criteria - CourseSlug: ${courseSlug}, SubjectSlug: ${subjectSlug}`);

      // Log each module that was extracted
      // console.log('[DEBUG] Extracted modules:', modulesWithProgress.map(m => ({
      //   id: m.id,
      //   title: m.title,
      //   course: m.course_title,
      //   subject: m.subject_title,
      //   status: m.status,
      //   mandatory: m.is_mandatory
      // })));

      if (filteredModules.length === 0) {
        console.warn("[DEBUG] No modules match the filter criteria", {
          courseSlug,
          subjectSlug,
          availableModules: modulesWithProgress.map(m => ({
            course: m.course_title,
            subject: m.subject_title,
            moduleId: m.id
          }))
        });
        setModules([]);
        setPathNodes([]);
        return;
      }

      const uniqueModuleIds = Array.from(new Set(filteredModules.map((module) => module.id)));
      const moduleIdsForStatus = uniqueModuleIds
        .map((id) => (typeof id === "string" ? id.trim() : null))
        .filter((id): id is string => Boolean(id));
      let modulesWithStatus: ModuleWithMandatory[] = filteredModules;
      console.log("moduleIdsForStatus", moduleIdsForStatus);
      if (moduleIdsForStatus.length) {
        try {
        const moduleStatusRes = await fetch("/api/learning-paths/user/module-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ moduleIds: moduleIdsForStatus }),
        });

          if (moduleStatusRes.ok) {
            const moduleStatusJson = await moduleStatusRes.json();
            const statusRecords = (moduleStatusJson?.statuses ?? {}) as Record<string, ModuleCompletionStatus | undefined>;
            const statusMap = new Map<string, ModuleCompletionStatus>();

            Object.entries(statusRecords).forEach(([moduleId, status]) => {
              if (!moduleId || !status) return;
              statusMap.set(moduleId, {
                ...status,
                moduleId: status.moduleId ?? moduleId,
                totalLectures: status.totalLectures,
                watchedLectures: status.watchedLectures,
                quizQuestionsTotal: status.quizQuestionsTotal,
                quizQuestionsAnswered: status.quizQuestionsAnswered,
                exerciseQuestionsTotal: status.exerciseQuestionsTotal,
                exerciseQuestionsCorrect: status.exerciseQuestionsCorrect,
                hasQuizAttempt: status.hasQuizAttempt,
                hasExerciseAttempt: status.hasExerciseAttempt,
                lectureCompletionPercent: status.lectureCompletionPercent,
                completed: status.completed,
                progress:
                  typeof status.progress === "number" && Number.isFinite(status.progress)
                    ? Math.max(0, Math.min(100, status.progress))
                    : undefined,
              });
            });



            modulesWithStatus = filteredModules.map((module) => {
              const statusForModule = statusMap.get(module.id);
              const lectureProgress =
                typeof statusForModule?.lectureCompletionPercent === "number"
                  ? Math.max(0, Math.min(100, statusForModule.lectureCompletionPercent))
                  : undefined;
              const statusProgress =
                clampProgressValue(statusForModule?.progress ?? null) ?? lectureProgress;
              const resolvedProgress =
                statusProgress ??
                clampProgressValue(module.progress) ??
                0;
              const resolvedCompleted =
                statusForModule?.completed ??
                module.completed ??
                resolvedProgress >= 100;

              return {
                ...module,
                completed: resolvedCompleted,
                progress: resolvedProgress,
                moduleStatus: statusForModule,
              };
            });
          } else {
          const errorText = await moduleStatusRes.text().catch(() => moduleStatusRes.statusText);
          console.error("Failed to load module completion statuses:", errorText);
          toast.error("Unable to load module progress. Please refresh.");
        }
      } catch (statusError: any) {
        console.error("Failed to load module completion statuses:", statusError?.message || statusError);
        toast.error("Unable to load module progress. Please refresh.");
      }
    }

    // remove duplicates from modulesWithStatus based on module.id
    const deduplicatedModules = modulesWithStatus.reduce<ModuleWithMandatory[]>((acc, curr) => {
      if (!acc.some(item => item.id === curr.id)) acc.push(curr);
      return acc;
    }, []);

      console.log("modulesWithStatus", modulesWithStatus);
      const sortedModules = deduplicatedModules
        .map((module, index) => {
          const courseOrder =
            typeof module.course_order_index === "number" && Number.isFinite(module.course_order_index)
              ? module.course_order_index
              : Number.POSITIVE_INFINITY;
          const subjectOrder =
            typeof module.subject_order_index === "number" && Number.isFinite(module.subject_order_index)
              ? module.subject_order_index
              : Number.POSITIVE_INFINITY;
          const moduleOrder =
            typeof module.order_index === "number" && Number.isFinite(module.order_index)
              ? module.order_index
              : Number.POSITIVE_INFINITY;

          return {
            module,
            index,
            courseOrder,
            subjectOrder,
            moduleOrder,
          };
        })
        .sort((a, b) => {
          if (a.courseOrder !== b.courseOrder) {
            return a.courseOrder - b.courseOrder;
          }
          if (a.subjectOrder !== b.subjectOrder) {
            return a.subjectOrder - b.subjectOrder;
          }
          if (a.moduleOrder !== b.moduleOrder) {
            return a.moduleOrder - b.moduleOrder;
          }
          return a.index - b.index;
        })
        .map((entry) => entry.module);

      // console.log("aaaaaaaa",sortedModules);

      // Add final summary logging
      // console.log('[DEBUG] === FINAL MODULE SUMMARY ===');
      // console.log(`[DEBUG] Modules after sorting: ${sortedModules.length}`);
      // console.log(`[DEBUG] Module IDs to display:`, sortedModules.map(m => m.id));

      // Log module status distribution
      const mandatoryCount = sortedModules.filter(m => m.status === 'mandatory' || m.is_mandatory).length;
      const optionalCount = sortedModules.filter(m => m.status === 'optional' || !m.is_mandatory).length;
      // console.log(`[DEBUG] Mandatory modules: ${mandatoryCount}`);
      // console.log(`[DEBUG] Optional modules: ${optionalCount}`);

      const nodes = createPathNodes(sortedModules);
      setModules(sortedModules);
      setPathNodes(nodes);

      if (cacheKey) {
        writeLearningPathCache(cacheKey, {
          modules: sortedModules,
          pathNodes: nodes,
          timestamp: Date.now(),
        });
      }

    } catch (e: any) {

      console.error("Failed to load learning path modules:", e);

      toast.error(e?.message || "Failed to load learning path modules");

      if (!hadCachedData) {
        setModules([]);
        setPathNodes([]);
      }

    } finally {

      setLoading(false);

    }

  };

  loadLearningPathModulesRef.current = loadLearningPathModules;

  const handleRefreshLearningPath = async () => {
    try {
      setLoading(true);
      const regenerateRes = await fetch("/api/learning-paths/user/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const regenerateText = await regenerateRes.text();
      if (!regenerateRes.ok) {
        throw new Error(regenerateText || "Failed to refresh learning path");
      }
      toast.success("Learning path refreshed");
      await loadLearningPathModules({ forceReload: true });
      if (regenerateRes.ok) {
        try {
          router.refresh();
        } catch (refreshError) {
          console.warn("Route refresh after learning-path regenerate failed:", refreshError);
        }
      }
    } catch (error: any) {
      console.error("Failed to refresh learning path:", error);
      toast.error(error?.message || "Failed to refresh learning path");
    } finally {
      setLoading(false);
    }
  };

  // Handle cache clearing events (e.g., from logout)
  useEffect(() => {
    const handleCacheClear = () => {
      // Clear any learning path related caches
      localStorage.removeItem(LEARNING_PATH_REFRESH_KEY);
      sessionStorage.removeItem(LEARNING_PATH_REFRESH_KEY);
      Object.keys(localStorage)
        .filter((key) => key.startsWith(LEARNING_PATH_CACHE_PREFIX))
        .forEach((key) => localStorage.removeItem(key));
      console.log("Learning path cache cleared");
    };

    window.addEventListener('learning-path-cache-clear', handleCacheClear);

    return () => {
      window.removeEventListener('learning-path-cache-clear', handleCacheClear);
    };
  }, []);

  // Helper to get node icon (brand-colored for available states)

  const getNodeIcon = (node: PathNode) => {

    if (node.locked) {

      return <Lock className="h-6 w-6 text-gray-400" />;

    }

    switch (node.type) {

      case 'start':

        return <Star className="h-6 w-6 text-white" />;

      case 'milestone':

        return <Package2 className="h-6 w-6 text-gray-600" />;

      case 'final':

        return <Trophy className="h-6 w-6 text-gray-600" />;

      default:

        return node.completed ?

          <CheckCircle className="h-6 w-6 text-white" /> :

          <Star className="h-6 w-6 text-[hsl(var(--brand))]" />;

    }

  };

  // Helper to get node style

  const getNodeStyle = (node: PathNode) => {

    if (node.type === 'start' && !node.locked) {

      return "bg-[hsl(var(--brand))] border-[hsl(var(--brand))] text-white hover:brightness-110";

    }

    if (node.completed) {

      return "bg-[hsl(var(--brand))] border-[hsl(var(--brand))] text-white";

    }

    if (node.locked) {

      return "bg-muted border-border text-gray-400 cursor-not-allowed";

    }

    return "bg-white border-border hover:bg-muted";

  };

  // Handle node click

  const handleNodeClick = (node: PathNode) => {

    if (node.locked) {

      toast.error("Complete the previous step to unlock this one");

      return;

    }

    if (node.type === 'start') {

      toast.success("Starting your learning journey!");

    } else if (node.type === 'module') {

      const moduleInfo = node.module;

      if (!moduleInfo) {

        toast.error("Module link unavailable. Try refreshing your learning path.");

        return;

      }

      const legacyModule = moduleInfo as ModuleWithMandatory & { course_id?: string; subject_id?: string };

      const courseId = moduleInfo.courseId ?? legacyModule.course_id;

      const subjectId = moduleInfo.subjectId ?? legacyModule.subject_id;

      const moduleId = moduleInfo.id;

      if (courseId && subjectId && moduleId) {

        toast.success(`Loading ${node.title}...`);

        const targetUrl = `/curriculum/${courseId}/${subjectId}?module=${encodeURIComponent(moduleId)}`;
        if (typeof window !== "undefined") {
          window.open(targetUrl, "_blank", "noopener,noreferrer");
        } else {
          router.push(targetUrl);
        }

      } else {

        toast.error("Module link unavailable. Try refreshing your learning path.");

      }

    } else if (node.type === 'milestone') {

      toast.success("Milestone reached! Great progress!");

    } else if (node.type === 'final') {

      toast.success("Congratulations on completing the learning path!");

    }

  };

  // Load more nodes

  const handleLoadMore = () => {

    const newVisibleCount = Math.min(visibleNodes + 6, pathNodes.length);

    persistVisibleNodes(newVisibleCount);

    setVisibleNodes(newVisibleCount);

    // Animate new nodes

    pathNodes.slice(visibleNodes, newVisibleCount).forEach((node, index) => {

      setTimeout(() => {

        setAnimatedNodes(prev => new Set([...prev, node.id]));

      }, index * 150);

    });

  };

  return (

    <div className={`relative ${isFirstTime ? "bg-gradient-to-br from-[hsl(var(--brand))/0.06] via-white to-[hsl(var(--brand-accent))/0.06]" : ""}`}>

      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">

        <div className="flex items-center justify-between gap-3 flex-wrap">

          <div className="space-y-1">

            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Personalized Learning Path</h1>

            <p className="text-sm text-gray-600">Follow the snake path to complete your personalized learning journey. Complete each step to unlock the next.</p>

          </div>

          <div className="flex items-center gap-2">

            {/* <Button variant="secondary" onClick={handleRefreshLearningPath} disabled={loading}>

              {loading ? "Loading..." : "Refresh"}

            </Button> */}

          </div>

        </div>

        {(showEstimatedTime || showSavedWeeks) && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {showEstimatedTime && (
              <div className="rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 p-5 shadow-2xl border border-white/20 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-white/70">Estimated time</p>
                    <p className="text-3xl font-semibold mt-1">{formattedTotalWeeks}</p>
                  </div>
                  <div className="rounded-2xl bg-white/20 p-3 shadow-lg">
                    <Calendar className="h-6 w-6 text-white" />
                  </div>
                </div>
                {/* <p className="mt-3 text-sm text-white/90">
                  {totalMandatoryModules} mandatory module{totalMandatoryModules === 1 ? "" : "s"} out of {totalModules} total A? ~1 week each of guided hands-on learning.
                </p> */}
                {/* <p className="text-xs text-white/80 mt-1">
                  Saved {savedWeeks} week{savedWeeks === 1 ? "" : "s"}.
                </p> */}
              </div>
            )}
            {showSavedWeeks && (
              <div className="rounded-2xl bg-white/80 backdrop-blur-md border border-slate-200 p-4 shadow-lg">
                <div className="flex items-center gap-2">
                  {/* <Zap className="h-5 w-5 text-[hsl(var(--brand))]" />
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Why this matters</p> */}
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  You have saved {savedWeeks} weeks of learning.
                </p>
              </div>
            )}
          </div>
        )}

        {loading ? (

          <div className="flex items-center justify-center min-h-96">

            <div className="text-center">

              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3" />

              <p className="text-gray-600">Loading your learning path...</p>

            </div>

          </div>

        ) : pathNodes.length === 0 ? (

          <div className="rounded-lg border p-8 text-center text-gray-600 bg-white/60 space-y-4">

            <h3 className="text-xl font-semibold text-gray-900">No Modules Available</h3>

            {courseSlug || subjectSlug ? (
              <div className="space-y-2">
                <p>No modules match the current filter criteria.</p>
                <div className="text-sm text-gray-500">
                  {courseSlug && <p>Course filter: <span className="font-medium">{courseSlug}</span></p>}
                  {subjectSlug && <p>Subject filter: <span className="font-medium">{subjectSlug}</span></p>}
                </div>
                <Button
                  variant="secondary"
                  onClick={handleRefreshLearningPath}
                  className="mt-4"
                >
                  Prepare Your Learning Path
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p>Your personalized learning path is currently empty.</p>
                <p className="text-sm text-gray-500">
                  Click below to refresh and generate your learning path.
                </p>
                <Button
                  variant="secondary"
                  onClick={handleRefreshLearningPath}
                  className="mt-4"
                >
                  Prepare Your Learning Path
                </Button>
              </div>
            )}

          </div>

        ) : (

          <div className="relative">

            {/* Animated Learning Path */}

            <div className="py-12 max-w-5xl mx-auto relative">

              {/* Dynamic Background Pattern */}

              <div className="absolute inset-0 overflow-hidden pointer-events-none">

                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-[hsl(var(--brand))]/5 to-transparent rounded-full blur-3xl animate-pulse"></div>

                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-br from-[hsl(var(--brand-accent))]/5 to-transparent rounded-full blur-2xl animate-pulse delay-1000"></div>

              </div>

              {/* Central Learning Path Container */}

              <div className="relative">

                {pathNodes.slice(0, visibleNodes).map((node, index) => {

                  const isVisible = index < visibleNodes;

                  const isAnimated = animatedNodes.has(node.id);

                  const isEven = index % 2 === 0;

                  const isLast = index === pathNodes.length - 1;

                  const showConnection = !isLast && index < visibleNodes - 1;

                  const currentNode = findCurrentNode(pathNodes);

                  const isCurrentNode = currentNode?.id === node.id;

                  return (

                    <div key={node.id} className="relative mb-16">

                      {/* Animated Connection Path */}

                      {showConnection && (

                        <div className="absolute left-1/2 top-20 transform -translate-x-1/2 z-0 pointer-events-none">

                          <div className={`

                            w-0.5 h-16 bg-gradient-to-b from-[hsl(var(--brand))]/40 via-[hsl(var(--brand))]/20 to-[hsl(var(--brand-accent))]/40

                            transition-all duration-1000 ease-out ${isAnimated ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0'}

                          `}></div>

                          {/* Flowing Animation */}

                          <div className={`

                            absolute top-0 w-0.5 h-4 bg-gradient-to-b from-[hsl(var(--brand))] to-transparent

                            animate-pulse ${isAnimated ? 'opacity-60' : 'opacity-0'}

                          `}></div>

                          {/* Connection Dot */}

                          <div className={`

                            absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full

                            bg-[hsl(var(--brand-accent))] transition-all duration-500 delay-300

                            ${isAnimated ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}

                          `}></div>

                        </div>

                      )}

                      {/* Centered Content Layout */}

                      <div className={`

                        flex items-center justify-center transition-all duration-700 ease-out transform

                        ${isAnimated ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}

                      `}>

                        {/* Left Node (for odd indices) */}

                        {!isEven && (

                          <div className="relative flex-shrink-0 mr-6">

                            <button

                              onClick={() => handleNodeClick(node)}

                              disabled={node.locked}

                              className={`

                                relative w-20 h-20 rounded-full border-3 transition-all duration-700 group

                                flex items-center justify-center shadow-xl hover:shadow-2xl

                                transform hover:scale-110 ${node.locked ? 'cursor-not-allowed' : 'cursor-pointer'}

                                ${getNodeStyle(node)}

                                ${isCurrentNode ? 'animate-current-node' : ''}

                              `}

                            >

                              {/* Glow Effect for Active Nodes */}

                              {!node.locked && (

                                <div className={`

                                  absolute inset-0 rounded-full bg-[hsl(var(--brand))]/20 blur-lg transition-opacity duration-300

                                  ${isCurrentNode ? 'opacity-60' : 'opacity-0 group-hover:opacity-100'}

                                `}></div>

                              )}

                              {/* Enhanced Glow for Current Node */}

                              {isCurrentNode && (

                                <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[hsl(var(--brand))]/30 to-[hsl(var(--brand-accent))]/30 blur-md opacity-70 animate-pulse"></div>

                              )}

                              {/* Node Icon */}

                              <div className="relative z-10 transition-transform duration-300 group-hover:rotate-12">

                                {getNodeIcon(node)}

                              </div>

                              {/* Progress Ring for Module Nodes */}

                              {node.type === 'module' && node.progress !== undefined && (

                                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 80 80">

                                  <circle

                                    cx="40"

                                    cy="40"

                                    r="36"

                                    stroke="currentColor"

                                    strokeWidth="3"

                                    fill="none"

                                    className="text-gray-200"

                                  />

                                  <circle

                                    cx="40"

                                    cy="40"

                                    r="36"

                                    stroke="hsl(var(--brand))"

                                    strokeWidth="3"

                                    fill="none"

                                    strokeDasharray={`${2 * Math.PI * 36}`}

                                    strokeDashoffset={`${2 * Math.PI * 36 * (1 - (node.progress || 0) / 100)}`}

                                    className="transition-all duration-1000 ease-out"

                                    style={{ filter: 'drop-shadow(0 0 6px hsl(var(--brand)))' }}

                                  />

                                </svg>

                              )}

                              {/* Completion Badge */}

                              {node.completed && (

                                <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-lg">

                                  <CheckCircle className="w-4 h-4 text-white" />

                                </div>

                              )}

                            </button>

                            {/* Floating Animation for Current Node Only */}

                            {isCurrentNode && (

                              <div className="absolute -inset-2 bg-[hsl(var(--brand))]/10 rounded-full animate-current-pulse opacity-75"></div>

                            )}

                          </div>

                        )}

                        {/* Centered Content Card */}

                        <div
                          role="button"
                          tabIndex={node.locked ? -1 : 0}
                          aria-disabled={node.locked}
                          onClick={() => {
                            if (node.locked) {
                              return;
                            }
                            handleNodeClick(node);
                          }}
                          onKeyDown={(event) => {
                            if (node.locked) {
                              return;
                            }
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleNodeClick(node);
                            }
                          }}
                          className={`

                            w-80 bg-white/80 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-gray-200/50

                            transition-all duration-500 ${isAnimated ? 'opacity-100' : 'opacity-0'}

                            hover:shadow-xl hover:bg-white/90 group

                            ${node.locked ? 'opacity-60 filter blur-[1px] saturate-50' : 'cursor-pointer'}

                          `}
                        >

                          <div className="flex items-start justify-between">

                            <div className="flex-1">

                              <h3 className={`font-semibold text-lg transition-colors duration-200 ${

                                node.locked ? 'text-gray-400' : 'text-gray-900 group-hover:text-[hsl(var(--brand))]'

                              }`}>

                                {node.title}

                              </h3>

                              {node.description && (

                                <p className={`text-sm mt-1 ${node.locked ? 'text-gray-400' : 'text-gray-600'}`}>

                                  {node.description}

                                </p>

                              )}

                              {/* Module Status and Progress */}

                              {node.type === 'module' && (

                                <div className="mt-2 flex items-center gap-2">

                                  {node.module?.status && (

                                      <span

                                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${

                                          node.module?.status.includes('optional')

                                            ? 'bg-[hsl(var(--brand))]/10 text-amber-700'

                                            : 'bg-[hsl(var(--brand))]/10 text-[hsl(var(--brand))]'

                                        }`}

                                      >

                                        <Zap className="w-3 h-3" />

                                        {node.module?.status}

                                      </span>

                                    )}

                                  {node.progress !== undefined && (

                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">

                                      {Math.round(node.progress)}% Complete

                                    </span>

                                  )}

                                </div>

                              )}

                              {/* Other Node Types Status */}

                              {node.type === 'start' && (

                                <div className="mt-2">

                                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">

                                    <BookOpen className="w-3 h-3" />

                                    Journey Begins

                                  </span>

                                </div>

                              )}

                              {node.type === 'final' && (

                                <div className="mt-2">

                                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">

                                    <Trophy className="w-3 h-3" />

                                    Final Goal

                                  </span>

                                </div>

                              )}

                            </div>

                            {/* Action Icon */}

                            <div className="ml-3 flex-shrink-0">

                              <ArrowDown className={`w-5 h-5 transition-colors duration-200 ${

                                node.locked ? 'text-gray-400' : 'text-[hsl(var(--brand))] group-hover:text-[hsl(var(--brand-accent))]'

                              }`} />

                            </div>

                          </div>

                        </div>

                        {/* Right Node (for even indices) */}

                        {isEven && (

                          <div className="relative flex-shrink-0 ml-6">

                            <button

                              onClick={() => handleNodeClick(node)}

                              disabled={node.locked}

                              className={`

                                relative w-20 h-20 rounded-full border-3 transition-all duration-700 group

                                flex items-center justify-center shadow-xl hover:shadow-2xl

                                transform hover:scale-110 ${node.locked ? 'cursor-not-allowed' : 'cursor-pointer'}

                                ${getNodeStyle(node)}

                                ${isCurrentNode ? 'animate-current-node' : ''}

                              `}

                            >

                              {/* Glow Effect for Active Nodes */}

                              {!node.locked && (

                                <div className={`

                                  absolute inset-0 rounded-full bg-[hsl(var(--brand))]/20 blur-lg transition-opacity duration-300

                                  ${isCurrentNode ? 'opacity-60' : 'opacity-0 group-hover:opacity-100'}

                                `}></div>

                              )}

                              {/* Enhanced Glow for Current Node */}

                              {isCurrentNode && (

                                <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[hsl(var(--brand))]/30 to-[hsl(var(--brand-accent))]/30 blur-md opacity-70 animate-pulse"></div>

                              )}

                              {/* Node Icon */}

                              <div className="relative z-10 transition-transform duration-300 group-hover:rotate-12">

                                {getNodeIcon(node)}

                              </div>

                              {/* Progress Ring for Module Nodes */}

                              {node.type === 'module' && node.progress !== undefined && node.progress > 0 && (

                                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 80 80">

                                  <circle

                                    cx="40"

                                    cy="40"

                                    r="36"

                                    stroke="currentColor"

                                    strokeWidth="3"

                                    fill="none"

                                    className="text-gray-200"

                                  />

                                  <circle

                                    cx="40"

                                    cy="40"

                                    r="36"

                                    stroke="hsl(var(--brand))"

                                    strokeWidth="3"

                                    fill="none"

                                    strokeDasharray={`${2 * Math.PI * 36}`}

                                    strokeDashoffset={`${2 * Math.PI * 36 * (1 - (node.progress || 0) / 100)}`}

                                    className="transition-all duration-1000 ease-out"

                                    style={{ filter: 'drop-shadow(0 0 6px hsl(var(--brand)))' }}

                                  />

                                </svg>

                              )}

                              {/* Completion Badge */}

                              {node.completed && (

                                <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-lg">

                                  <CheckCircle className="w-4 h-4 text-white" />

                                </div>

                              )}

                            </button>

                            {/* Floating Animation for Current Node Only */}

                            {isCurrentNode && (

                              <div className="absolute -inset-2 bg-[hsl(var(--brand))]/10 rounded-full animate-current-pulse opacity-75"></div>

                            )}

                          </div>

                        )}

                      </div>

                    </div>

                  );

                })}

              </div>

              {/* Load More Section */}

              {pathNodes.length > visibleNodes && (

                <div className="mt-16 text-center">

                  <div className="inline-block bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-gray-200/50">

                    <div className="space-y-4">

                      <div className="flex items-center justify-center space-x-2">

                        <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-[hsl(var(--brand))] to-transparent"></div>

                        <Package2 className="w-6 h-6 text-[hsl(var(--brand))]" />

                        <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-[hsl(var(--brand))] to-transparent"></div>

                      </div>

                      <h3 className="text-xl font-semibold text-gray-900">Continue Your Journey</h3>

                      <p className="text-gray-600 max-w-md mx-auto">

                        {pathNodes.length - visibleNodes} more modules await. Load them to continue your personalized learning path.

                      </p>

                      <Button

                        onClick={handleLoadMore}

                        className="bg-[hsl(var(--brand))] hover:bg-[hsl(var(--brand))]/90 text-white px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"

                      >

                        <span className="flex items-center gap-2">

                          Load More Modules

                        </span>

                      </Button>

                      <p className="text-sm text-gray-500 mt-2">

                        Showing {visibleNodes} of {pathNodes.length} modules

                      </p>

                    </div>

                  </div>

                </div>

              )}

            </div>

            {/* Enhanced Legend */}

            <div className="mt-16 bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-gray-200/50">

              <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">

                <Star className="w-5 h-5 text-[hsl(var(--brand))]" />

                Learning Path Guide

              </h4>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

                {/* Available Node */}

                <div className="flex items-center gap-3">

                  <div className="w-10 h-10 bg-[hsl(var(--brand))] border-[hsl(var(--brand))] text-white rounded-full flex items-center justify-center shadow-md">

                    <Star className="w-4 h-4" />

                  </div>

                  <div>

                    <div className="font-medium text-gray-900">Available</div>

                    <div className="text-xs text-gray-600">Ready to start</div>

                  </div>

                </div>

                {/* Completed Node */}

                <div className="flex items-center gap-3">

                  <div className="w-10 h-10 bg-green-500 border-green-500 text-white rounded-full flex items-center justify-center shadow-md">

                    <CheckCircle className="w-4 h-4" />

                  </div>

                  <div>

                    <div className="font-medium text-gray-900">Completed</div>

                    <div className="text-xs text-gray-600">Well done!</div>

                  </div>

                </div>

                {/* Locked Node */}

                <div className="flex items-center gap-3">

                  <div className="w-10 h-10 bg-gray-400 border-gray-400 text-white rounded-full flex items-center justify-center shadow-md">

                    <Lock className="w-4 h-4" />

                  </div>

                  <div>

                    <div className="font-medium text-gray-900">Locked</div>

                    <div className="text-xs text-gray-600">Complete prerequisites first</div>

                  </div>

                </div>

                {/* Final Goal */}

                <div className="flex items-center gap-3">

                  <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 border-yellow-500 text-white rounded-full flex items-center justify-center shadow-md">

                    <Trophy className="w-4 h-4" />

                  </div>

                  <div>

                    <div className="font-medium text-gray-900">Final Goal</div>

                    <div className="text-xs text-gray-600">Journey completion</div>

                  </div>

                </div>

              </div>

              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border-l-4 border-blue-400">

                <div className="flex-shrink-0">

                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">

                    <Zap className="w-4 h-4 text-blue-600" />

                  </div>

                </div>

                <div>

                  <div className="font-medium text-blue-900">Pro Tip</div>

                  <div className="text-sm text-blue-700 mt-1">

                    Hover over nodes to see progress rings and glow effects. Complete modules sequentially to unlock the next step in your learning journey.

                  </div>

                </div>

              </div>

            </div>

          </div>

        )}

      </div>

    </div>

  );

}

// Types

type ModuleWithMandatory = {
  id: string;
  title: string;
  course_title: string;
  subject_title: string;
  courseId?: string;
  subjectId?: string;
  status?: string;
  correctness_percentage?: number;
  assessment_based?: boolean;
  completed?: boolean;
  progress?: number;
  moduleStatus?: ModuleCompletionStatus;
  is_mandatory?: boolean;
  is_active?: boolean;
  active?: string;
  order_index?: number;
  course_order_index?: number;
  subject_order_index?: number;
  isFirstModule?: boolean;
}

type ModuleCompletionStatus = {
  moduleId: string;
  totalLectures: number;
  watchedLectures: number;
  hasQuizAttempt: boolean;
  hasExerciseAttempt: boolean;
  quizQuestionsAnswered?: number;
  quizQuestionsTotal?: number;
  exerciseQuestionsTotal?: number;
  exerciseQuestionsCorrect?: number;
  completed: boolean;
  lectureCompletionPercent: number;
  progress?: number | null;
}

type PathNode = {

  id: string;
  type: 'start' | 'module' | 'milestone' | 'final';
  title: string;
  description?: string;
  completed: boolean;
  locked: boolean;
  progress?: number;
  module?: ModuleWithMandatory;

}

type LearningPathCache = {
  modules: ModuleWithMandatory[];
  pathNodes: PathNode[];
  timestamp: number;
};

const normalizeCacheSegment = (value?: string) => {
  const normalized = normalizeSlug(value);
  return normalized.length ? normalized : "all";
};

function buildLearningPathCacheKey(
  userId?: string | null,
  courseSlug?: string,
  subjectSlug?: string,
): string | null {
  if (!userId) {
    return null;
  }
  const courseSegment = normalizeCacheSegment(courseSlug);
  const subjectSegment = normalizeCacheSegment(subjectSlug);
  return `${LEARNING_PATH_CACHE_PREFIX}:user:${userId}:course:${courseSegment}:subject:${subjectSegment}`;
}

function readLearningPathCache(key?: string | null): LearningPathCache | null {
  if (!key || typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (
      !Array.isArray(parsed.modules) ||
      !Array.isArray(parsed.pathNodes)
    ) {
      return null;
    }
    return parsed as LearningPathCache;
  } catch (error) {
    console.warn("Failed to read learning path cache:", error);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return null;
  }
}

function writeLearningPathCache(key: string | null, payload: LearningPathCache) {
  if (!key || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to persist learning path cache:", error);
  }
}

function clearLearningPathCache(key?: string | null) {
  if (!key || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
