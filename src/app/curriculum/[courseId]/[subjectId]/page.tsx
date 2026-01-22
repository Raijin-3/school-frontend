import { redirect } from "next/navigation";
import { apiGet } from "@/lib/api";
import { supabaseServer } from "@/lib/supabase-server";
import { Sidebar } from "../../../dashboard/sidebar";
import { MobileSidebar } from "../../../dashboard/mobile-sidebar";
import { SubjectLearningInterface } from "@/components/subject-learning-interface";

type Track = any;
type CurriculumList = { tracks?: Array<{ id?: string; slug?: string; title?: string }> };
type TriggerConfig = {
  aiHint?: boolean;
  aiExercise?: boolean;
  playground?: boolean;
  aiSubmission?: boolean;
  aiAdaptiveQuiz?: boolean;
};
type StudentAssignmentDetail = {
  assignment_id?: string;
  subject_id?: string;
  assigned_at?: string;
  lesson_assignments?: {
    id?: string;
    class_id?: string;
    subject_id?: string;
    module_id?: string;
    section_id?: string | null;
    trigger_config?: TriggerConfig | null;
    assigned_at?: string;
  };
};

const normalizeBaseUrl = (input?: string | null) => {
  if (!input) return "";
  return input.replace(/\/+$/, "");
};

const resolveMediaSource = (body: string | undefined | null, baseUrl: string): string => {
  if (!body) return body ?? "";
  if (/^https?:\/\//i.test(body)) return body;
  if (!baseUrl) return body;
  return `${baseUrl}/${body.replace(/^\/+/,'')}`;
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

const parseLectureContent = (raw: unknown, baseUrl: string): string => {
  if (typeof raw !== "string") {
    if (raw === null || raw === undefined) return "";
    return String(raw);
  }
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof (parsed as any).body === "string") {
      return resolveMediaSource((parsed as any).body, baseUrl);
    }
  } catch (error) {
    // ignore parse errors and return original string
  }
  return trimmed;
};

const normalizeTriggerConfig = (value: unknown): TriggerConfig => {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    aiHint: raw.aiHint === true,
    aiExercise: raw.aiExercise === true,
    playground: raw.playground === true,
    aiSubmission: raw.aiSubmission === true,
    aiAdaptiveQuiz: raw.aiAdaptiveQuiz === true,
  };
};

const normalizeLecture = (lecture: any, baseUrl: string) => {
  if (!lecture) return lecture;
  return {
    ...lecture,
    content: parseLectureContent(lecture.content, baseUrl),
  };
};

const normalizeSection = (section: any, baseUrl: string) => {
  const normalizedLecture = normalizeLecture(section?.lecture, baseUrl);
  const normalizedLectures = Array.isArray(section?.lectures)
    ? section.lectures.map((lecture: any) => normalizeLecture(lecture, baseUrl))
    : undefined;
  return {
    ...section,
    lecture: normalizedLecture,
    lectures: normalizedLectures,
  };
};

const normalizeModules = (modules: any[], baseUrl: string) => {
  return modules.map((module: any) => ({
    ...module,
    sections: Array.isArray(module.sections)
      ? module.sections.map((section: any) => normalizeSection(section, baseUrl))
      : [],
  }));
};

type PathModuleMeta = {
  status?: string;
  is_mandatory?: boolean;
  is_active?: boolean;
  active?: string;
  completed?: boolean;
  correctness_percentage?: number | null;
  order_index?: number;
};

const buildPathModuleMeta = (modules: any[]) => {
  const meta = new Map<string, PathModuleMeta>();
  const order = new Map<string, number>();
  const allowed = new Set<string>();

  modules.forEach((module, index) => {
    if (!module) return;
    const orderCandidates = [
      module?.order_index,
      module?.orderIndex,
      module?.order,
      module?.orderNumber,
      module?.order_position,
      module?.orderPosition,
    ];
    let resolvedOrderIndex = orderCandidates.reduce<number | undefined>((acc, candidate) => {
      if (acc !== undefined) return acc;
      return parseOrderIndexValue(candidate);
    }, undefined);
    if (resolvedOrderIndex === undefined) {
      resolvedOrderIndex = index;
    }
    const statusValue =
      typeof module?.status === "string" ? module.status.toLowerCase() : "";
    const normalizedStatus = statusValue === "optional" ? "optional" : "mandatory";
    const isMandatory =
      typeof module?.is_mandatory === "boolean"
        ? module.is_mandatory
        : normalizedStatus !== "optional";
    const rawActive =
      typeof module?.is_active === "boolean" ? module.is_active : undefined;
    const isActive = isMandatory ? rawActive === true : true;
    const metaEntry: PathModuleMeta = {
      status: normalizedStatus,
      is_mandatory: isMandatory,
      is_active: isActive,
      active: isActive ? "active" : "inactive",
      completed: module?.completed ?? false,
      correctness_percentage:
        typeof module?.correctness_percentage === "number"
          ? module.correctness_percentage
          : typeof module?.progress === "number"
          ? module.progress
          : null,
      order_index: resolvedOrderIndex,
    };
    const registerMetaKey = (key?: unknown) => {
      if (key === null || key === undefined) return;
      const normalized = String(key);
      meta.set(normalized, metaEntry);
      order.set(normalized, resolvedOrderIndex!);
    };
    registerMetaKey(module?.id);
    registerMetaKey(module?.slug);
    if (isActive) {
      if (module?.slug) {
        allowed.add(String(module.slug));
      }
      if (module?.id) {
        allowed.add(String(module.id));
      }
    }
  });

  return {
    meta,
    order,
    allowedIds: Array.from(allowed),
  };
};

export const metadata = { title: "Subject | Curriculum" };

export default async function SubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; subjectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const resolvedParams = await params;
  const resolvedSearchParams: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const { courseId: courseParam, subjectId: subjectParam } = resolvedParams;
  const moduleParam = resolvedSearchParams?.module;
  const initialModuleSlug = Array.isArray(moduleParam) ? moduleParam[0] : moduleParam;

  // Helper function to slugify titles for URL-friendly names
  const slugify = (text: string): string => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove non-word chars
      .replace(/[\s_-]+/g, '-') // Replace spaces, underscores with single dash
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
  };

  const humanizeSlug = (value?: string | null) => {
    if (!value) return "";
    return value
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  // Resolve course ID when slug is provided
  let courseLookupId: string = courseParam;
  let courseSlugForUrl: string = courseParam;
  let allowedModuleIds: string[] | undefined;
  let pathModuleMetaMap: Map<string, PathModuleMeta> = new Map();
  let pathModuleOrderMap: Map<string, number> = new Map();
  try {
    const curriculumList = await apiGet<CurriculumList>('/v1/curriculum').catch(() => null as any);
    const tracks = Array.isArray(curriculumList?.tracks) ? curriculumList!.tracks : [];
    const courseMatch = tracks.find((t) => {
      const trackSlug = typeof t.slug === "string" ? t.slug : slugify(t.title || "");
      return t.id === courseParam || trackSlug === courseParam;
    });
    if (courseMatch?.id) {
      courseLookupId = courseMatch.id;
    }
    if (courseMatch) {
      courseSlugForUrl = courseMatch.slug ?? slugify(courseMatch.title || courseParam);
    } else {
      courseSlugForUrl = slugify(courseParam);
    }
  } catch (error) {
    courseSlugForUrl = slugify(courseParam);
  }

  const track: Track = await apiGet(`/v1/curriculum/${courseLookupId}`).catch(() => null as any);
  // If we couldn't determine a slug earlier, derive from the fetched track
  if (!courseSlugForUrl && track) {
    courseSlugForUrl = track?.slug ?? slugify(track?.title || courseLookupId);
  }
  const modules = Array.isArray(track?.modules) ? track.modules : [];
  const baseMediaUrl = normalizeBaseUrl(process.env.BASE_MEDIA_URL ?? process.env.NEXT_PUBLIC_BASE_MEDIA_URL ?? "");
  const normalizedModulesRaw = normalizeModules(modules, baseMediaUrl);
  let normalizedModules: any[] = [];

  const moduleIdsForStatus = normalizedModulesRaw
    .map((module: any) => {
      if (module?.id) return String(module.id);
      return undefined;
    })
    .filter((value): value is string => Boolean(value));

  try {
    const { data: userPathRow, error: userPathError } = await sb
      .from("user_learning_path")
      .select("path")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (userPathError) {
      console.warn("Failed to load user_learning_path:", userPathError.message);
    } else {
      const rawPath = (userPathRow as any)?.path || {};
      const courseCandidates = Array.isArray((rawPath as any).courses)
        ? (rawPath as any).courses
        : Array.isArray((rawPath as any).path?.courses)
          ? (rawPath as any).path.courses
          : [];
      const courses = Array.isArray(courseCandidates) ? courseCandidates : [];
      const courseMatch = courses.find((c: any) => {
        const cId = c?.id ? String(c.id) : "";
        const cSlug = typeof c?.slug === "string" ? c.slug : slugify(c?.title || "");
        const normalizedCourseParam = slugify(courseParam);
        return cId === courseLookupId || cSlug === courseParam || cSlug === normalizedCourseParam;
      });
      const subjects = Array.isArray(courseMatch?.subjects) ? courseMatch.subjects : [];
      const subjectMatch = subjects.find((s: any) => {
        const sId = s?.id ? String(s.id) : "";
        const sSlug = typeof s?.slug === "string" ? s.slug : slugify(s?.title || "");
        const normalizedSubjectParam = slugify(subjectParam);
        return (
          sId === subjectParam ||
          sSlug === subjectParam ||
          sSlug === normalizedSubjectParam
        );
      });
      const pathModules = Array.isArray(subjectMatch?.modules) ? subjectMatch.modules : [];
      if (pathModules.length > 0) {
        const metaResult = buildPathModuleMeta(pathModules);
        pathModuleMetaMap = metaResult.meta;
        pathModuleOrderMap = metaResult.order;
        allowedModuleIds = metaResult.allowedIds;
      }
    }
  } catch (error) {
    console.warn("Failed to derive allowed module IDs:", error);
    allowedModuleIds = undefined;
  }

  const userModuleStatusMap = new Map<string, string | null>();
  if (moduleIdsForStatus.length > 0) {
    try {
      const { data: userModuleStatusRows, error: userModuleStatusError } = await sb
        .from("user_module_status")
        .select("module_id, status")
        .eq("user_id", user.id)
        .in("module_id", moduleIdsForStatus);
      if (userModuleStatusError) {
        console.warn("Failed to load module statuses for subject page:", userModuleStatusError.message);
      } else {
        (userModuleStatusRows || []).forEach((row) => {
          if (row?.module_id) {
            userModuleStatusMap.set(row.module_id, row?.status ?? null);
          }
        });
      }
    } catch (statusError: any) {
      console.warn("Failed to query user_module_status:", statusError?.message || statusError);
    }
  }

  const userPathModuleMeta = pathModuleMetaMap;
  const moduleStatusOverrides: Record<string, string> = {};

  normalizedModules = normalizedModulesRaw.map((module: any, index: number) => {
    const moduleId = module?.id ? String(module.id) : undefined;
    const slugKey = module?.slug ? String(module.slug) : undefined;
    const metaFromPath =
      (moduleId && userPathModuleMeta.get(moduleId)) ||
      (slugKey && userPathModuleMeta.get(slugKey));

    const userStatusRaw = moduleId ? userModuleStatusMap.get(moduleId) : undefined;
    const userStatusValue =
      typeof userStatusRaw === "string" && userStatusRaw.trim().length > 0
        ? userStatusRaw.trim()
        : null;
    if (userStatusValue) {
      if (moduleId) {
        moduleStatusOverrides[moduleId] = userStatusValue;
      }
      if (slugKey) {
        moduleStatusOverrides[slugKey] = userStatusValue;
      }
    }
    const normalizedUserStatus = userStatusValue ? userStatusValue.toLowerCase() : null;
    const normalizedPathStatus =
      typeof metaFromPath?.status === "string" && metaFromPath.status.trim().length > 0
        ? metaFromPath.status
        : null;
    const derivedStatus =
      userStatusValue ??
      normalizedPathStatus ??
      (typeof module?.status === "string" ? module.status : "mandatory");
    const statusLower =
      typeof derivedStatus === "string" ? derivedStatus.toLowerCase() : "mandatory";
    const derivedMandatory =
      normalizedUserStatus !== null
        ? normalizedUserStatus !== "optional"
        : typeof metaFromPath?.is_mandatory === "boolean"
        ? metaFromPath.is_mandatory
        : statusLower !== "optional";
    const derivedActive =
      typeof metaFromPath?.is_active === "boolean"
        ? metaFromPath.is_active
        : typeof module?.is_active === "boolean"
        ? module.is_active
        : undefined;
    const derivedActiveState =
      typeof metaFromPath?.active === "string"
        ? metaFromPath.active
        : derivedActive === true
        ? "active"
        : derivedActive === false
        ? "inactive"
        : module?.active;
    const derivedCompletion =
      typeof module?.completed === "boolean"
        ? module.completed
        : typeof metaFromPath?.completed === "boolean"
        ? metaFromPath.completed
        : false;
    const derivedCorrectness =
      typeof module?.correctness_percentage === "number"
        ? module.correctness_percentage
        : typeof metaFromPath?.correctness_percentage === "number"
        ? metaFromPath.correctness_percentage
        : null;
    const resolvedOrderIndex =
      typeof metaFromPath?.order_index === "number"
        ? metaFromPath.order_index
        : module?.order_index;
    return {
      ...module,
      status: derivedStatus,
      is_mandatory: derivedMandatory,
      is_active: derivedActive,
      active: derivedActiveState,
      completed: derivedCompletion,
      correctness_percentage: derivedCorrectness,
      order_index: resolvedOrderIndex ?? module?.order_index,
      __initialOrder: typeof module?.__initialOrder === "number" ? module.__initialOrder : index,
    };
  });

  const moduleMetaByKey = new Map<
    string,
    { status?: string; is_mandatory?: boolean; is_active?: boolean; active?: string }
  >();
  normalizedModules.forEach((module: any) => {
    const key = module?.slug || module?.id;
    if (!key) return;
    moduleMetaByKey.set(String(key), {
      status: module?.status,
      is_mandatory: module?.is_mandatory,
      is_active: typeof module?.is_active === "boolean" ? module.is_active : undefined,
      active: typeof module?.active === "string" ? module.active : undefined,
    });
  });

  // Fetch user learning path to determine allowed modules for this course/subject
  const isModuleMandatory = (module: any) => {
    const status = typeof module?.status === "string" ? module.status.toLowerCase() : "";
    if (status === "optional") return false;
    if (typeof module?.is_mandatory === "boolean") return module.is_mandatory;
    const lookupKey = module?.slug || module?.id;
    if (lookupKey && moduleMetaByKey.has(String(lookupKey))) {
      const lookup = moduleMetaByKey.get(String(lookupKey))!;
      const lookupStatus =
        typeof lookup.status === "string" ? lookup.status.toLowerCase() : "";
      if (lookupStatus === "optional") return false;
      if (typeof lookup.is_mandatory === "boolean") return lookup.is_mandatory;
    }
    return true;
  };

  const resolveModuleActiveState = (module: any): boolean | undefined => {
    if (typeof module?.is_active === "boolean") return module.is_active;
    const activeValue =
      typeof module?.active === "string" ? module.active.toLowerCase() : undefined;
    if (activeValue === "active") return true;
    if (activeValue === "inactive") return false;
    const lookupKey = module?.slug || module?.id;
    if (lookupKey && moduleMetaByKey.has(String(lookupKey))) {
      const lookup = moduleMetaByKey.get(String(lookupKey))!;
      if (typeof lookup.is_active === "boolean") return lookup.is_active;
      const lookupActive =
        typeof lookup.active === "string" ? lookup.active.toLowerCase() : undefined;
      if (lookupActive === "active") return true;
      if (lookupActive === "inactive") return false;
    }
    return undefined;
  };
  // Only gate modules when we have a concrete allowlist; otherwise show all modules
  const allowedModuleIdsForClient = Array.isArray(allowedModuleIds) && allowedModuleIds.length > 0
    ? allowedModuleIds
    : undefined;

  // Find subject by ID or slug (backward compatibility)
  let subject = null;
  if (Array.isArray(track?.subjects)) {
    // First try to find by ID (UUID)
    subject = track.subjects.find((s: any) => s.id === subjectParam);

    // If not found by ID, try to find by slugified title
    if (!subject) {
      subject = track.subjects.find((s: any) => (
        slugify(s.title) === subjectParam ||
        (typeof s.slug === "string" && s.slug === subjectParam)
      ));
    }
  }

  const resolveModuleOrder = (module: any): number => {
    const pathOrderKey = module?.slug || module?.id;
    if (pathOrderKey && pathModuleOrderMap.has(String(pathOrderKey))) {
      const lookup = pathModuleOrderMap.get(String(pathOrderKey));
      if (typeof lookup === "number") {
        return lookup;
      }
    }
    const raw = module?.order_index;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim().length > 0) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (typeof module?.__initialOrder === "number" && Number.isFinite(module.__initialOrder)) {
      return module.__initialOrder;
    }
    return Number.POSITIVE_INFINITY;
  };

  let subjectModules = normalizedModules
    .filter((m: any) => m.subjectId === subject?.id)
    .sort((a, b) => {
      const orderA = resolveModuleOrder(a);
      const orderB = resolveModuleOrder(b);
      if (orderA !== orderB) return orderA - orderB;
      const keyA = (a?.slug || a?.id || "").toString();
      const keyB = (b?.slug || b?.id || "").toString();
      return keyA.localeCompare(keyB);
    });

  let lessonToolConfigBySection: Record<string, TriggerConfig> | undefined;
  try {
    const assignmentDetails = await apiGet<StudentAssignmentDetail[]>(
      `/v1/student/lesson-assignments/details?subject_id=${encodeURIComponent(subject?.id || subjectParam)}`,
    );
    const assignedSectionIds = new Set<string>();
    const assignedModuleIds = new Set<string>();
    const normalizedAssignments = Array.isArray(assignmentDetails) ? assignmentDetails : [];

    normalizedAssignments.forEach((entry) => {
      const assignment = entry?.lesson_assignments;
      const moduleId = assignment?.module_id ? String(assignment.module_id) : null;
      const sectionId = assignment?.section_id ? String(assignment.section_id) : null;

      if (sectionId) {
        assignedSectionIds.add(sectionId);
        if (moduleId) {
          assignedModuleIds.add(moduleId);
        }
      } else if (moduleId) {
        assignedModuleIds.add(moduleId);
      }
    });

    if (assignedSectionIds.size > 0 || assignedModuleIds.size > 0) {
      subjectModules = subjectModules
        .map((module: any) => {
          const moduleId = module?.id ? String(module.id) : "";
          const allowAllSections = moduleId && assignedModuleIds.has(moduleId);
          const sections = (module?.sections || []).filter((section: any) => {
            const sectionId = section?.id ? String(section.id) : "";
            return allowAllSections || assignedSectionIds.has(sectionId);
          });
          return {
            ...module,
            sections,
          };
        })
        .filter((module: any) => (module?.sections || []).length > 0);
    } else {
      subjectModules = [];
    }

    const moduleSectionMap = new Map<string, string[]>();
    subjectModules.forEach((module: any) => {
      const moduleId = module?.id ? String(module.id) : "";
      if (!moduleId) return;
      const sections = Array.isArray(module?.sections)
        ? module.sections
            .map((section: any) => (section?.id ? String(section.id) : ""))
            .filter(Boolean)
        : [];
      moduleSectionMap.set(moduleId, sections);
    });

    const toolConfigBySection: Record<string, TriggerConfig> = {};
    const applyToolConfig = (sectionId: string | null, config: TriggerConfig) => {
      if (!sectionId) return;
      if (!Object.prototype.hasOwnProperty.call(toolConfigBySection, sectionId)) {
        toolConfigBySection[sectionId] = config;
      }
    };

    normalizedAssignments.forEach((entry) => {
      const assignment = entry?.lesson_assignments;
      const moduleId = assignment?.module_id ? String(assignment.module_id) : null;
      const sectionId = assignment?.section_id ? String(assignment.section_id) : null;
      const config = normalizeTriggerConfig(assignment?.trigger_config);

      if (sectionId) {
        applyToolConfig(sectionId, config);
        return;
      }

      if (moduleId) {
        const sections = moduleSectionMap.get(moduleId) ?? [];
        sections.forEach((id) => applyToolConfig(id, config));
      }
    });

    if (Object.keys(toolConfigBySection).length > 0) {
      lessonToolConfigBySection = toolConfigBySection;
    }
  } catch (error) {
    console.warn("Failed to load assigned sections; showing all sections by default.");
  }

  const optionalModuleIds = subjectModules
    .filter((module: any) => {
      const activeState = resolveModuleActiveState(module);
      if (activeState === false) return false;
      const status = typeof module?.status === "string" ? module.status.toLowerCase() : "";
      if (status === "optional") return true;
      if (typeof module?.is_mandatory === "boolean") {
        return module.is_mandatory === false;
      }
      return false;
    })
    .map((module: any) => module?.slug || module?.id)
    .filter((value): value is string => Boolean(value))
    .map((value) => String(value));
  const allSections = subjectModules.flatMap((m: any) => m.sections || []);
  const completedSections = Math.floor(allSections.length * 0.6); // Mock completion data
  const subjectSlugForUrl = subject?.slug ?? slugify(subject?.title || subjectParam);
  const resolvedSubjectTitle =
    subject?.title?.trim() && subject.title.trim().length > 0
      ? subject.title
      : humanizeSlug(subjectSlugForUrl || subjectParam);

  // If no allowlist exists (e.g., brand new user/path), only unlock the first module and lock the rest
  let effectiveAllowedModuleIds = allowedModuleIdsForClient;
  if (!effectiveAllowedModuleIds || effectiveAllowedModuleIds.length === 0) {
    const firstModule = subjectModules[0];
    const firstModuleId = firstModule?.slug || firstModule?.id;
    effectiveAllowedModuleIds = firstModuleId ? [String(firstModuleId)] : [];
  }
  if (optionalModuleIds.length > 0) {
    const merged = new Set([...(effectiveAllowedModuleIds ?? []), ...optionalModuleIds]);
    effectiveAllowedModuleIds = Array.from(merged);
  }

  // Redirect IDs to slug-based URLs when available
  const courseParamNormalized = courseParam;
  const subjectParamNormalized = subjectParam;
  const targetCourseSegment = courseSlugForUrl || courseParamNormalized;
  const targetSubjectSegment = subjectSlugForUrl || subjectParamNormalized;
  const needsRedirect =
    targetCourseSegment !== courseParamNormalized || targetSubjectSegment !== subjectParamNormalized;
  if (needsRedirect) {
    const query = moduleParam ? `?module=${encodeURIComponent(initialModuleSlug || "")}` : "";
    redirect(`/curriculum/${targetCourseSegment}/${targetSubjectSegment}${query}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30">
      <MobileSidebar active="/curriculum" />
      <div className="lg:flex lg:gap-6 max-w-screen-2xl mx-auto p-4 md:p-6">
        <Sidebar active="/curriculum" defaultOpen={false} />

        <div className="flex-1">
          <SubjectLearningInterface
            trackTitle={track?.title || "Course"}
            subjectTitle={resolvedSubjectTitle}
            subjectModules={subjectModules as any}
            completedSections={completedSections}
            totalSections={allSections.length}
            courseId={track?.id || courseLookupId}
            subjectId={subject?.id || subjectParam}
            initialModuleSlug={initialModuleSlug}
            courseSlugForUrl={courseSlugForUrl}
            subjectSlugForUrl={subjectSlugForUrl}
            allowedModuleIds={undefined}
            moduleStatusOverrides={
              Object.keys(moduleStatusOverrides).length ? moduleStatusOverrides : undefined
            }
            lessonToolConfigBySection={lessonToolConfigBySection}
            lockModules={false}
            showRequirements={false}
          />
        </div>
      </div>
    </div>
  );
}
