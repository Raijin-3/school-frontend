import { NextRequest, NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase-server";

type UserLearningPathRow = {
  id: string;
  path: any;
  updated_at?: string;
};

const normalizeArray = <T>(value: any): T[] => (Array.isArray(value) ? value : []);

const parseOrderIndex = (value: any): number | undefined => {
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

const resolveOrderIndex = (source: any) =>
  parseOrderIndex(
    source?.order_index ??
      source?.orderIndex ??
      source?.order ??
      source?.orderNumber ??
      source?.orderPosition,
  );

const sortByResolvedOrder = <T>(items: T[]): T[] => {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const resolved = resolveOrderIndex(item);
      return {
        item,
        index,
        order: typeof resolved === "number" && Number.isFinite(resolved)
          ? resolved
          : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.index - b.index;
    })
    .map(({ item }) => item);
};

const extractPathCourses = (row: UserLearningPathRow | null) => {
  if (!row) {
    console.log("DEBUG: row is null");
    return [];
  }

  const raw = (row as any).path;
  console.log("DEBUG: raw type:", typeof raw);
  console.log("DEBUG: raw is array:", Array.isArray(raw));
  console.log("DEBUG: raw content keys:", raw ? Object.keys(raw) : "null");

  if (!raw) {
    console.log("DEBUG: raw is empty");
    return [];
  }

  if (typeof raw === "string") {
    console.log("DEBUG: raw is string, attempting to parse JSON");
    try {
      const parsed = JSON.parse(raw);
      return extractPathCourses({ id: row.id, path: parsed, updated_at: row.updated_at });
    } catch (e) {
      console.log("DEBUG: Failed to parse raw as JSON");
      return [];
    }
  }

  if (Array.isArray(raw)) {
    console.log("DEBUG: raw is array, returning as-is");
    return raw;
  }

  if (typeof raw === "object") {
    // First check for personalized_data structure (new format)
    if (raw.personalized_data) {
      console.log("DEBUG: Found personalized_data in raw");
      console.log("DEBUG: personalized_data keys:", Object.keys(raw.personalized_data));

      if (Array.isArray(raw.personalized_data.courses)) {
        console.log("DEBUG: Found courses at raw.personalized_data.courses");
        return raw.personalized_data.courses;
      }
      if (Array.isArray(raw.personalized_data.steps)) {
        console.log("DEBUG: Found steps at raw.personalized_data.steps, extracting courses from steps");
        // Extract courses from steps if that's where they are
        const courses = [];
        for (const step of raw.personalized_data.steps) {
          if (step.resources?.course_structure?.courses) {
            console.log(`DEBUG: Found ${step.resources.course_structure.courses.length} courses in step`);
            courses.push(...step.resources.course_structure.courses);
          }
        }
        return courses.length > 0 ? courses : [];
      }
    }

    // Check for path.personalized_data structure
    if (raw.path?.personalized_data) {
      console.log("DEBUG: Found path.personalized_data in raw");
      if (Array.isArray(raw.path.personalized_data.courses)) {
        console.log("DEBUG: Found courses at raw.path.personalized_data.courses");
        return raw.path.personalized_data.courses;
      }
      if (Array.isArray(raw.path.personalized_data.steps)) {
        console.log("DEBUG: Found steps at raw.path.personalized_data.steps, extracting courses from steps");
        const courses = [];
        for (const step of raw.path.personalized_data.steps) {
          if (step.resources?.course_structure?.courses) {
            courses.push(...step.resources.course_structure.courses);
          }
        }
        return courses.length > 0 ? courses : [];
      }
    }

    // Check for direct path structure
    if (raw.path) {
      console.log("DEBUG: Found raw.path, checking for courses");
      if (Array.isArray(raw.path.courses)) {
        console.log("DEBUG: Found courses at raw.path.courses");
        return raw.path.courses;
      }
      if (Array.isArray(raw.path.steps)) {
        console.log("DEBUG: Found steps at raw.path.steps, extracting courses from steps");
        const courses = [];
        for (const step of raw.path.steps) {
          if (step.resources?.course_structure?.courses) {
            courses.push(...step.resources.course_structure.courses);
          }
        }
        return courses.length > 0 ? courses : [];
      }
    }

    // Check for steps at root level
    if (Array.isArray(raw.steps)) {
      console.log("DEBUG: Found steps at root level, extracting courses from steps");
      const courses = [];
      for (const step of raw.steps) {
        if (step.resources?.course_structure?.courses) {
          courses.push(...step.resources.course_structure.courses);
        }
      }
      return courses.length > 0 ? courses : [];
    }

    // Legacy checks for backward compatibility
    if (Array.isArray((raw as any).courses)) {
      console.log("DEBUG: Found courses at raw.courses");
      return (raw as any).courses;
    }
    if (Array.isArray((raw as any).path?.courses)) {
      console.log("DEBUG: Found courses at raw.path.courses");
      return (raw as any).path.courses;
    }

    const keys = Object.keys(raw);
    console.log("DEBUG: raw object keys:", keys);

    for (const key of keys) {
      const value = (raw as any)[key];
      if (Array.isArray(value)) {
        console.log("DEBUG: Found array at raw.", key);
        return value;
      }
    }

    // Try to extract from any nested structure that might contain courses
    const tryExtractFromNested = (obj: any, path: string = ""): any[] => {
      if (!obj || typeof obj !== 'object') return [];

      if (Array.isArray(obj)) {
        return obj;
      }

      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const nestedPath = path ? `${path}.${key}` : key;
          const value = obj[key];

          if (key.toLowerCase().includes('course') && Array.isArray(value)) {
            console.log(`DEBUG: Found courses at ${nestedPath}`);
            return value;
          }

          if (typeof value === 'object') {
            const result = tryExtractFromNested(value, nestedPath);
            if (result.length > 0) {
              return result;
            }
          }
        }
      }

      return [];
    };

    const nestedResult = tryExtractFromNested(raw);
    if (nestedResult.length > 0) {
      return nestedResult;
    }
  }

  console.log("DEBUG: Could not extract courses, returning empty array");
  return [];
};

type SupabaseRouteClient = ReturnType<typeof supabaseServer>;

const toModuleId = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const collectModuleIdsFromCourses = (courses: any[]): string[] => {
  const ids = new Set<string>();
  normalizeArray(courses).forEach((course: any) => {
    normalizeArray(course?.subjects).forEach((subject: any) => {
      // Try to get modules from various possible locations
      let modules: any[] = [];

      if (Array.isArray(subject?.modules)) {
        modules = subject.modules;
      } else if (Array.isArray(subject?.module_list)) {
        modules = subject.module_list;
      } else if (Array.isArray(subject?.items)) {
        modules = subject.items;
      } else if (typeof subject === 'object' && subject !== null) {
        // Look for any array property that might contain modules
        for (const [key, value] of Object.entries(subject)) {
          if (Array.isArray(value)) {
            modules = value;
            break;
          }
        }
      }

      // Check nested structures
      if (modules.length === 0 && typeof subject === 'object' && subject !== null) {
        if (subject.course_structure?.modules && Array.isArray(subject.course_structure.modules)) {
          modules = subject.course_structure.modules;
        } else if (subject.resources?.modules && Array.isArray(subject.resources.modules)) {
          modules = subject.resources.modules;
        } else if (subject.resources?.course_structure?.modules && Array.isArray(subject.resources.course_structure.modules)) {
          modules = subject.resources.course_structure.modules;
        }
      }
      
      normalizeArray(modules).forEach((module: any) => {
        const candidate =
          toModuleId(module?.id) ??
          toModuleId(module?.moduleId) ??
          toModuleId(module?.module_id);
        if (candidate) {
          ids.add(candidate);
        }
      });
    });
  });
  return Array.from(ids);
};

type ModuleStatusRecord = {
  module_id?: string | null;
  status?: string | null;
  correctness_percentage?: number | null;
  progress?: number | null;
};

const fetchModuleStatusMap = async (
  sb: SupabaseRouteClient,
  userId: string,
  moduleIds: string[],
): Promise<Map<string, ModuleStatusRecord>> => {
  const normalizedIds = Array.from(
    new Set(
      moduleIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (!normalizedIds.length) {
    return new Map();
  }
  const { data, error } = await sb
    .from("user_module_status")
    .select("module_id, status, correctness_percentage, progress")
    .eq("user_id", userId)
    .in("module_id", normalizedIds);
  if (error) {
    console.warn("Failed to load module status map:", error.message);
    return new Map();
  }
  const map = new Map<string, ModuleStatusRecord>();
  (data || []).forEach((row) => {
    if (row?.module_id) {
      map.set(String(row.module_id), row);
    }
  });
  return map;
};

const clampProgressValue = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return Math.round(value);
};

export async function GET(_request: NextRequest) {
  try {
    const sb = supabaseServer();

    // Debug: Log all cookies to understand session state
    const allCookies = _request.cookies.getAll();
    const authCookies = allCookies.filter(c => c.name.startsWith('sb-'));
    // console.log("Authentication Debug - All Cookies:", allCookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`));
    // console.log("Authentication Debug - Auth Cookies:", authCookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`));

    const authHeader = _request.headers.get("authorization");
    const tokenFromHeader = authHeader
      ? authHeader.replace(/^Bearer\s+/i, "").trim()
      : "";
    let user = null;
    let authError = null;
    let authSource: "header" | "cookie" | null = null;

    const headerAuthResult = tokenFromHeader
      ? await sb.auth.getUser(tokenFromHeader)
      : null;
    const headerAuthError = headerAuthResult?.error ?? null;
    if (headerAuthResult?.data?.user) {
      user = headerAuthResult.data.user;
      authSource = "header";
    }

    if (!user) {
      const {
        data: { user: cookieUser },
        error: cookieAuthError,
      } = await sb.auth.getUser();
      if (cookieUser) {
        user = cookieUser;
        authSource = "cookie";
      }
      authError = cookieAuthError;
    } else {
      authError = headerAuthResult?.error ?? null;
    }

    // // Enhanced debug logging
    // console.log("Authentication Debug - Supabase Response:", {
    //   hasError: !!authError,
    //   errorMessage: authError?.message,
    //   errorCode: authError?.code,
    //   errorStatus: authError?.status,
    //   hasUser: !!user,
    //   userId: user?.id,
    //   userEmail: user?.email,
    //   userRole: user?.role,
    //   userAppMetadata: user?.app_metadata
    // });

    if (authError || !user) {
      authError = authError ?? headerAuthError ?? null;
      console.log("Unauthorized access attempt - user not authenticated");
      console.log("Auth error:", authError);
      console.log("User object:", user);

      // Return 401 Unauthorized instead of demo content
      return NextResponse.json(
        {
          error: "Unauthorized access",
          message: "Please log in to access your personalized learning path",
          requiresAuthentication: true,
          redirectTo: "/login",
          debugInfo: {
            hasAuthCookies: authCookies.length > 0,
            cookieNames: authCookies.map(c => c.name),
            supabaseError: authError?.message,
            headerProvided: Boolean(tokenFromHeader),
            headerAuthError: headerAuthError?.message,
            resolvedAuthSource: authSource ?? "none",
            timestamp: new Date().toISOString()
          }
        },
        { status: 401 }
      );
    }

    // Prefer the persisted learning path with progress
    try {
      const { data: existingPath, error: uplError } = await sb
        .from("user_learning_path")
        .select("id, path, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (uplError) {
        console.warn("Failed to load user_learning_path:", uplError.message);
      }

      const coursesFromPath = extractPathCourses(existingPath as UserLearningPathRow | null);
      console.log("DEBUG: coursesFromPath.length:", coursesFromPath.length);
      console.log("DEBUG: coursesFromPath structure:", JSON.stringify(coursesFromPath).substring(0, 1000));
      if (coursesFromPath.length > 0) {
        const moduleStatusMap = await fetchModuleStatusMap(
          sb,
          user.id,
          collectModuleIdsFromCourses(coursesFromPath),
        );
        const response = sortByResolvedOrder(normalizeArray<any>(coursesFromPath)).map((course: any) => {
          const courseSubjects = sortByResolvedOrder(normalizeArray<any>(course?.subjects));
          const courseTitle = course?.title || course?.name || "Course";
          const courseOrder = resolveOrderIndex(course);

          const subjects = courseSubjects.map((subject: any) => {
            // Debug: Log the subject structure to understand module data
            console.log(`DEBUG: Processing subject ${subject?.title ?? subject?.name ?? "Subject"}`);
            console.log(`DEBUG: Subject modules raw data:`, JSON.stringify(subject?.modules).substring(0, 500));

            // Extract modules from various possible locations in the subject structure
            let subjectModules: any[] = [];

            // Try to get modules from different possible paths
            if (Array.isArray(subject?.modules)) {
              subjectModules = subject.modules;
              console.log(`DEBUG: Found ${subjectModules.length} modules at subject.modules`);
            } else if (Array.isArray(subject?.module_list)) {
              subjectModules = subject.module_list;
              console.log(`DEBUG: Found ${subjectModules.length} modules at subject.module_list`);
            } else if (Array.isArray(subject?.items)) {
              subjectModules = subject.items;
              console.log(`DEBUG: Found ${subjectModules.length} modules at subject.items`);
            } else if (typeof subject === 'object' && subject !== null) {
              // Look for any array property that might contain modules
              for (const [key, value] of Object.entries(subject)) {
                if (Array.isArray(value)) {
                  subjectModules = value;
                  console.log(`DEBUG: Found ${subjectModules.length} modules at subject.${key}`);
                  break;
                }
              }
            }

            // If still no modules, check if modules are nested in a different structure
            if (subjectModules.length === 0 && typeof subject === 'object' && subject !== null) {
              // Check for nested structure like subject.course_structure.modules
              if (subject.course_structure?.modules && Array.isArray(subject.course_structure.modules)) {
                subjectModules = subject.course_structure.modules;
                console.log(`DEBUG: Found ${subjectModules.length} modules at subject.course_structure.modules`);
              }
              // Check for structure like subject.resources?.modules
              else if (subject.resources?.modules && Array.isArray(subject.resources.modules)) {
                subjectModules = subject.resources.modules;
                console.log(`DEBUG: Found ${subjectModules.length} modules at subject.resources.modules`);
              }
              // Check for structure like subject.resources?.course_structure?.modules
              else if (subject.resources?.course_structure?.modules && Array.isArray(subject.resources.course_structure.modules)) {
                subjectModules = subject.resources.course_structure.modules;
                console.log(`DEBUG: Found ${subjectModules.length} modules at subject.resources.course_structure.modules`);
              }
              // Try recursive extraction from any nested structure
              else {
                const tryExtractModulesFromNested = (obj: any, path: string = ""): any[] => {
                  if (!obj || typeof obj !== 'object') return [];

                  if (Array.isArray(obj)) {
                    return obj;
                  }

                  for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                      const nestedPath = path ? `${path}.${key}` : key;
                      const value = obj[key];

                      if (key.toLowerCase().includes('module') && Array.isArray(value)) {
                        console.log(`DEBUG: Found modules at ${nestedPath}`);
                        return value;
                      }

                      if (typeof value === 'object') {
                        const result = tryExtractModulesFromNested(value, nestedPath);
                        if (result.length > 0) {
                          return result;
                        }
                      }
                    }
                  }

                  return [];
                };

                const nestedModules = tryExtractModulesFromNested(subject);
                if (nestedModules.length > 0) {
                  subjectModules = nestedModules;
                  console.log(`DEBUG: Found ${subjectModules.length} modules through recursive extraction`);
                }
              }
            }

            const subjectOrder = resolveOrderIndex(subject);
            const sortedSubjectModules = sortByResolvedOrder(subjectModules);

            const rawModules = sortedSubjectModules.map((module: any) => {
                // Debug: Log each module being processed
                console.log(`DEBUG: Processing module:`, {
                  id: module?.id,
                  title: module?.title,
                  status: module?.status,
                  is_active: module?.is_active
                });

                const moduleIdRef =
                  toModuleId(module?.id) ??
                  toModuleId(module?.moduleId) ??
                  toModuleId(module?.module_id);
                const moduleStatusRow = moduleIdRef
                  ? moduleStatusMap.get(moduleIdRef)
                  : undefined;
                const statusValue = typeof module?.status === "string" ? module.status : "mandatory";
                let normalizedStatus = statusValue.toLowerCase() === "optional" ? "optional" : "mandatory";
                const activeToken =
                  typeof module?.active === "string"
                    ? module.active.toLowerCase()
                  : typeof module?.active_state === "string"
                  ? module.active_state.toLowerCase()
                  : undefined;
              const explicitActive =
                typeof module?.is_active === "boolean"
                  ? module.is_active
                  : activeToken === "active"
                  ? true
                  : activeToken === "inactive"
                  ? false
                  : undefined;
              const isActive =
                normalizedStatus === "optional"
                  ? true
                  : typeof explicitActive === "boolean"
                  ? explicitActive
                  : false;
              let activeState =
                normalizedStatus === "optional"
                  ? "active"
                  : typeof explicitActive === "boolean"
                  ? explicitActive
                    ? "active"
                    : "inactive"
                  : "inactive";

              if(module?.order_index === 0){
                activeState = "active";
                // normalizedStatus = "optional";
              }

              const normalizedProgress =
                clampProgressValue(moduleStatusRow?.progress) ??
                null;
              const normalizedCorrectness =
                typeof moduleStatusRow?.correctness_percentage === "number"
                  ? moduleStatusRow.correctness_percentage
                  : typeof module?.correctness_percentage === "number"
                  ? module.correctness_percentage
                  : module?.correctness_percentage ?? null;

              return {
                id: module?.id,
                slug: module?.slug,
                title: module?.title ?? module?.name ?? "Module",
                status: normalizedStatus,
                is_mandatory: normalizedStatus !== "optional",
                is_active: isActive,
                active: activeState,
                subjectId: subject?.id,
                subjectTitle: subject?.title ?? subject?.name ?? "Subject",
                courseId: course?.id,
                courseTitle,
                correctness_percentage: normalizedCorrectness,
                order_index: resolveOrderIndex(module),
                completed:
                  module?.completed === true ||
                  (normalizedProgress !== null && normalizedProgress >= 100),
                progress: normalizedProgress ?? undefined,
              };
            });

            const modulesWithStatus = ensureFirstModuleActive(rawModules);

            // Debug logging to verify modules are being generated
            console.log(`Generated ${modulesWithStatus.length} modules for subject ${subject?.title ?? subject?.name ?? "Subject"}`);
            if (modulesWithStatus.length > 0) {
              console.log('First module:', {
                id: modulesWithStatus[0].id,
                title: modulesWithStatus[0].title,
                is_active: modulesWithStatus[0].is_active,
                active: modulesWithStatus[0].active,
                status: modulesWithStatus[0].status
              });
            }

            return {
              id: subject?.id,
              title: subject?.title ?? subject?.name ?? "Subject",
              courseId: course?.id,
              courseTitle,
              order_index: subjectOrder,
              modules: modulesWithStatus,
            };
          });

          return {
            id: course?.id,
            title: courseTitle,
            order_index: courseOrder,
            subjects,
          };
        });

        return NextResponse.json(response, { status: 200 });
      }
    } catch (e) {
      console.warn("Falling back to computed path; user_learning_path lookup failed:", e);
    }

    // Fallback: compute from assignments and module status
    const { data: userCourses, error: courseError } = await sb
      .from("user_course_assignments")
      .select("course_id")
      .eq("user_id", user.id);

    if (courseError) {
      console.log("Error fetching user courses:", courseError.message);
      return NextResponse.json({ error: courseError.message }, { status: 500 });
    }

    if (!userCourses || userCourses.length === 0) {
      return NextResponse.json({ error: "No courses assigned to the user" }, { status: 404 });
    }

    const courseIds = userCourses.map((course) => course.course_id);

    const { data: courses, error: coursesError } = await sb
      .from("courses")
      .select("id, title")
      .in("id", courseIds);

    if (coursesError) {
      console.log("Error fetching courses:", coursesError.message);
      return NextResponse.json({ error: coursesError.message }, { status: 500 });
    }

    const { data: subjects, error: subjectsError } = await sb
      .from("subjects")
      .select("id, title, course_id, order_index")
      .in("course_id", courseIds);

    if (subjectsError) {
      console.log("Error fetching subjects:", subjectsError.message);
      return NextResponse.json({ error: subjectsError.message }, { status: 500 });
    }

    const subjectIds = subjects.map((subject) => subject.id);
    const { data: modules, error: modulesError } = await sb
      .from("modules")
      .select("id, title, subject_id, order_index")
      .in("subject_id", subjectIds);

    if (modulesError) {
      console.log("Error fetching modules:", modulesError.message);
      return NextResponse.json({ error: modulesError.message }, { status: 500 });
    }

    const moduleIds = modules.map((module) => module.id);
    let userModuleStatuses: { module_id: string; status: string; correctness_percentage?: number | null; progress?: number | null }[] = [];

    if (moduleIds.length > 0) {
      const { data, error: statusError } = await sb
        .from("user_module_status")
        .select("module_id, status, correctness_percentage, progress")
        .eq("user_id", user.id)
        .in("module_id", moduleIds);

      if (statusError) {
        console.log("Error fetching module statuses:", statusError.message);
        return NextResponse.json({ error: statusError.message }, { status: 500 });
      }

      userModuleStatuses = data || [];
    }

    const response = sortByResolvedOrder(courses || []).map((course) => {
      const courseSubjects = sortByResolvedOrder(
        (subjects || []).filter((subject) => subject.course_id === course.id),
      );

      const courseSubjectsWithModules = courseSubjects.map((subject) => {
        const subjectModules = sortByResolvedOrder(
          (modules || []).filter((module) => module.subject_id === subject.id),
        );

        const subjectModulesWithStatus = subjectModules.map((module) => {
          const userStatus = userModuleStatuses.find((status) => status.module_id === module.id);
          const normalizedStatus =
            typeof userStatus?.status === "string" && userStatus.status.toLowerCase() === "optional"
              ? "optional"
              : "mandatory";

          return {
            id: module.id,
            title: module.title,
            status: normalizedStatus,
            subjectId: subject.id,
            subjectTitle: subject.title,
            courseId: course.id,
            courseTitle: course.title,
            correctness_percentage: userStatus?.correctness_percentage ?? null,
            order_index: resolveOrderIndex(module),
            is_mandatory: normalizedStatus !== "optional",
            progress: userStatus?.progress ?? null,
          };
        });

        let previousMandatoryCompleted = true;
        const modulesWithActivation = sortByResolvedOrder(subjectModulesWithStatus).map((module) => {
          const moduleProgress = typeof module.progress === "number" ? module.progress : 0;
          const moduleCompleted = module.status === "optional" ? true : moduleProgress >= 100;
          const isMandatory = module.status !== "optional";
          const isActive = isMandatory ? previousMandatoryCompleted : true;
          if (isMandatory) {
            previousMandatoryCompleted = previousMandatoryCompleted && moduleCompleted;
          }
          const optionalActive = module.status === "optional";

          return {
            ...module,
            is_active: optionalActive ? true : isActive,
            active: optionalActive || isActive ? "active" : "inactive",
            completed: moduleCompleted,
          };
        });

        return {
          id: subject.id,
          title: subject.title,
          courseId: course.id,
          courseTitle: course.title,
          order_index: resolveOrderIndex(subject),
          modules: modulesWithActivation,
        };
      });

      return {
        id: course.id,
        title: course.title,
        subjects: courseSubjectsWithModules,
      };
    });

    return NextResponse.json(response, { status: 200 });
  } catch (e: any) {
    console.error("Get user learning path error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
const ensureFirstModuleActive = (modules: any[]): any[] => {
  if (!Array.isArray(modules) || modules.length === 0) return modules;
  let targetIndex = 0;
  let bestOrder = Number.POSITIVE_INFINITY;

  modules.forEach((module, index) => {
    const orderValue =
      typeof module?.order_index === "number" && Number.isFinite(module.order_index)
        ? module.order_index
        : typeof module?.order_index === "string" && module.order_index.trim().length > 0
        ? Number(module.order_index)
        : index;
    if (orderValue < bestOrder) {
      bestOrder = orderValue;
      targetIndex = index;
    }
  });

  modules[targetIndex] = {
    ...modules[targetIndex],
    is_active: true,
    active: "active",
  };

  return modules;
};
