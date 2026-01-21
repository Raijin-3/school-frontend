import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { apiGet, apiPost } from "@/lib/api";
import { Sidebar } from "../dashboard/sidebar";
import { MobileSidebar } from "../dashboard/mobile-sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Star, Target, Award, ChevronRight, CheckCircle, AlertCircle, Wand2, Brain, BarChart3 } from "lucide-react";
import { StartSessionButton } from "@/components/playground/start-session-button";
import { LoadingLinkButton } from "@/components/playground/loading-link-button";

export const metadata = { title: "Playground - Jarvis" };

type WeakSection = {
  sectionId: string;
  subjectId?: string | null;
  sectionTitle?: string | null;
  subjectTitle?: string | null;
  adaptiveTotal: number;
  adaptiveWrong: number;
  caseTotal: number;
  caseWrong: number;
  accuracy: number;
  weaknessScore: number;
  lastSeenAt?: string | null;
  createdAt?: string | null;
  averageScorePercent?: number | null;
  completedSessions?: number;
  passed?: boolean;
};

type PlaygroundSession = {
  id: string;
  subject: string;
  status: "pending" | "active" | "completed" | "canceled";
  created_at: string;
  completed_at?: string | null;
  section_title?: string | null;
  source_summary?: {
    score_percent?: number | null;
  } | null;
};

type PlaygroundTopic = {
  id: string;
  topic_id?: string | null;
  topic_name_snapshot: string;
  weight: number;
  diagnosed_weak_concept?: string | null;
};

type PlaygroundQuizSet = {
  id: string;
  topic_id?: string | null;
  ai_response?: {
    mcq_set?: {
      confidence_rebuild?: Array<{
        question_id: number;
        question: string;
        options: Record<string, string>;
        correct_option: string;
        explanation: string;
        difficulty: string;
      }>;
      stretch?: Array<{
        question_id: number;
        question: string;
        options: Record<string, string>;
        correct_option: string;
        explanation: string;
        difficulty: string;
      }>;
      real_world_business_mcqs?: Array<{
        question_id: number;
        question: string;
        options: Record<string, string>;
        correct_option: string;
        explanation: string;
        difficulty: string;
        what_it_tests?: string;
      }>;
    };
  };
};

type PlaygroundSessionDetail = {
  session: PlaygroundSession;
  sections?: Array<{
    section_id?: string | null;
  }>;
  topics: PlaygroundTopic[];
  quizSets?: PlaygroundQuizSet[];
};

const formatShortId = (value?: string | null) =>
  value ? value.replace(/-/g, "").slice(0, 8).toUpperCase() : "UNKNOWN";

const formatPercent = (value: number) => `${Math.round(value)}%`;
const formatTitle = (title?: string | null, fallbackId?: string | null) =>
  title?.trim() ? title : `Section ${formatShortId(fallbackId)}`;

async function startPlaygroundSession(formData: FormData) {
  "use server";
  const subjectId = formData.get("subjectId");
  const sectionId = formData.get("sectionId");
  const result = await apiPost<{ session?: { id?: string } }>(
    "/v1/playground/sessions/start",
    {
      subjectId: typeof subjectId === "string" && subjectId.trim() ? subjectId : undefined,
      sectionId: typeof sectionId === "string" && sectionId.trim() ? sectionId : undefined,
    },
  );
  const sessionId = result?.session?.id;
  if (sessionId) {
    redirect(`/playground/sessions/${sessionId}`);
  }
  redirect("/playground");
}

export default async function AssessmentPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [weakSections, allSections, history] = await Promise.all([
    apiPost<WeakSection[]>("/v1/playground/weak-sections", {}),
    apiPost<WeakSection[]>("/v1/playground/weak-sections", {
      minAccuracy: 1.01,
      minAttempts: 1,
    }),
    apiGet<PlaygroundSession[]>("/v1/playground/history"),
  ]);

  const latestSession = history?.[0];
  const activeSession = history?.find((session) => session.status === "active");
  const latestSessionDetail = latestSession
    ? await apiGet<PlaygroundSessionDetail>(`/v1/playground/sessions/${latestSession.id}`)
    : null;
  const activeSessionDetail =
    activeSession && activeSession.id === latestSession?.id
      ? latestSessionDetail
      : activeSession
        ? await apiGet<PlaygroundSessionDetail>(`/v1/playground/sessions/${activeSession.id}`)
        : null;

  const completedCount = history?.filter((session) => session.status === "completed").length || 0;
  const passedSections =
    allSections?.filter((section) => {
      const score = section.averageScorePercent;
      return typeof score === "number" && score >= 70 && (section.completedSessions ?? 0) > 0;
    }) || [];
  const filteredWeakSections = weakSections
    .filter(
    (section) =>
      section.adaptiveWrong + section.caseWrong >= 3 &&
      !(
        typeof section.averageScorePercent === "number" &&
        section.averageScorePercent >= 70 &&
        (section.completedSessions ?? 0) > 0
      ),
    )
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  const totalSectionsFlagged = weakSections.filter(
    (section) => section.adaptiveWrong + section.caseWrong >= 3,
  ).length;
  const totalPending = filteredWeakSections.length;
  const totalPassed = passedSections.length;
  const headerSubject = latestSession?.subject || "Your";
  const topicsById = new Map(
    (latestSessionDetail?.topics || [])
      .filter((topic) => topic.topic_id)
      .map((topic) => [String(topic.topic_id), topic.topic_name_snapshot]),
  );
  const quizSets = latestSessionDetail?.quizSets || [];
  const activeSectionToSession = new Map<string, string>();
  (activeSessionDetail?.sections || []).forEach((section) => {
    if (section.section_id) {
      activeSectionToSession.set(String(section.section_id), activeSessionDetail.session.id);
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/50">
      <MobileSidebar active="/playground" />
      <div className="lg:flex lg:gap-6 max-w-screen-2xl mx-auto p-4 md:p-6">
        <Sidebar active="/playground" />
        <section className="flex-1">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-8 backdrop-blur-xl shadow-xl mb-8">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5"></div>
            <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-emerald-200/30 to-teal-200/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-200/50 px-4 py-2 text-sm font-medium text-emerald-700">
                  <Trophy className="h-4 w-4 text-emerald-500" />
                  {headerSubject} Playground
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Award className="h-4 w-4 text-amber-500" />
                  <span>{completedCount} sessions completed</span>
                </div>
              </div>

              <h1 className="text-4xl font-bold leading-tight text-gray-900 mb-3">
                Rebuild Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">Weak Spots</span>
              </h1>
              <p className="text-lg text-gray-600 mb-6">
                Target the sections where you struggled. We turn past mistakes into adaptive sessions, tuned to your weakest topics.
              </p>

              {/* Stats */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="bg-white/60 rounded-xl p-4 border border-white/60 md:col-start-1">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Target className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{totalSectionsFlagged}</div>
                      <div className="text-sm text-gray-500">Total Sections Flagged</div>
                    </div>
                  </div>
                </div>
                <div className="bg-white/60 rounded-xl p-4 border border-white/60 ">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <BarChart3 className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-amber-600">{totalPending}</div>
                      <div className="text-sm text-gray-500">Total Pending</div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/60 rounded-xl p-4 border border-white/60">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-emerald-600">{totalPassed}</div>
                      <div className="text-sm text-gray-500">Total Passed</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-white/60 border border-white/60 rounded-xl p-1">
              <TabsTrigger value="upcoming" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                Focus Areas
              </TabsTrigger>
              <TabsTrigger value="passed" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                Passed
              </TabsTrigger>
              <TabsTrigger value="completed" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {filteredWeakSections.map((section, index) => (
                  <div key={section.sectionId} className="group relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-6 backdrop-blur-xl shadow-lg transition-all hover:shadow-2xl hover:scale-[1.02]">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                    <div className="relative z-10">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-3 rounded-xl ${index % 2 === 0 ? "bg-emerald-100" : "bg-blue-100"}`}>
                            <Wand2 className={`h-6 w-6 ${index % 2 === 0 ? "text-emerald-600" : "text-blue-600"}`} />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">{formatTitle(section.sectionTitle, section.sectionId)}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="inline-block px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                                {section.subjectTitle?.trim()
                                  ? section.subjectTitle
                                  : section.subjectId
                                    ? `Subject ${formatShortId(section.subjectId)}`
                                    : "General"}
                              </span>
                              {/* <span className="inline-block px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                                {section.adaptiveWrong + section.caseWrong} weak questions
                              </span> */}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                              section.passed
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {section.passed ? "Passed" : "Needs improvement"}
                          </span>
                          <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                        </div>
                      </div>

                      {/* Section Details */}
                      <div className="space-y-4 mb-6">
                        <div className="flex items-center gap-3">
                          <BarChart3 className="h-5 w-5 text-gray-500" />
                          <div>
                            <div className="font-medium text-gray-900">
                              {typeof section.averageScorePercent === "number"
                                ? `${Math.round(section.averageScorePercent)}% avg score`
                                : "No score yet"}
                            </div>
                            <div className="text-sm text-gray-500">
                              {(section.completedSessions ?? 0).toLocaleString()} sessions completed
                            </div>
                            <div className="text-sm text-gray-500">
                              Last seen {section.lastSeenAt ? new Date(section.lastSeenAt).toLocaleDateString() : "N/A"}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg bg-white/60 border border-white/60 p-3">
                          <div className="text-sm text-gray-600">
                            We will pull topics from this section and adapt questions based on your missed patterns.
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      {activeSectionToSession.has(section.sectionId) ? (
                        <LoadingLinkButton
                          href={`/playground/sessions/${activeSectionToSession.get(section.sectionId)}`}
                          label="Resume Adaptive Session"
                          loadingLabel="Loading..."
                          className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium transition-all hover:shadow-lg ${
                            index % 2 === 0
                              ? "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                              : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                          }`}
                        />
                      ) : (
                        <form action={startPlaygroundSession}>
                          <input type="hidden" name="subjectId" value={section.subjectId ?? ""} />
                          <input type="hidden" name="sectionId" value={section.sectionId ?? ""} />
                          <StartSessionButton
                            className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium transition-all hover:shadow-lg ${
                              index % 2 === 0
                                ? "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                                : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                            }`}
                          />
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {filteredWeakSections.length === 0 && (
                <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-12 backdrop-blur-xl shadow-lg text-center mt-6">
                  <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No weak sections yet</h3>
                  <p className="text-gray-600">Complete a few adaptive quizzes or case studies to unlock your playground.</p>
                </div>
              )}

              {/* <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
                <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-6 backdrop-blur-xl shadow-lg lg:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Topics to Rebuild</h3>
                      <p className="text-sm text-gray-600">Auto-selected from weak sections</p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-medium">
                      <Star className="h-4 w-4" />
                      High priority
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(latestSessionDetail?.topics || []).map((topic) => {
                      const weight = topic.weight || 0;
                      const tier = weight >= 70 ? "high" : weight >= 50 ? "medium" : "low";
                      return (
                        <div
                          key={topic.id}
                          className={`px-3 py-2 rounded-xl border text-sm font-medium ${
                            tier === "high"
                              ? "bg-amber-50 border-amber-200 text-amber-700"
                              : tier === "medium"
                                ? "bg-blue-50 border-blue-200 text-blue-700"
                                : "bg-emerald-50 border-emerald-200 text-emerald-700"
                          }`}
                        >
                          {topic.topic_name_snapshot}
                          {topic.diagnosed_weak_concept ? (
                            <span className="ml-2 text-xs text-gray-500">({topic.diagnosed_weak_concept})</span>
                          ) : null}
                        </div>
                      );
                    })}
                    {(latestSessionDetail?.topics?.length ?? 0) === 0 && (
                      <div className="text-sm text-gray-500">No topics yet. Start a session to generate them.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-6 backdrop-blur-xl shadow-lg">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Latest Questions</h3>
                  <div className="space-y-4 text-sm text-gray-600">
                    {quizSets.length === 0 && (
                      <div className="text-sm text-gray-500">No questions yet. Start a session to generate them.</div>
                    )}
                    {quizSets.map((quiz) => {
                      const mcqSet = quiz.ai_response?.mcq_set;
                      const questions = [
                        ...(mcqSet?.confidence_rebuild || []),
                        ...(mcqSet?.stretch || []),
                        ...(mcqSet?.real_world_business_mcqs || []),
                      ];
                      const topicName =
                        (quiz.topic_id && topicsById.get(String(quiz.topic_id))) || "Topic";
                      return (
                        <div key={quiz.id} className="rounded-xl border border-white/60 bg-white/60 p-4">
                          <div className="font-semibold text-gray-900 mb-2">{topicName}</div>
                          <div className="text-xs text-gray-500 mb-3">{questions.length} questions</div>
                          <div className="space-y-3">
                            {questions.slice(0, 3).map((q) => (
                              <div key={q.question_id} className="text-sm text-gray-700">
                                <span className="font-semibold text-gray-900 mr-2">Q{q.question_id}.</span>
                                {q.question}
                              </div>
                            ))}
                            {questions.length > 3 && (
                              <div className="text-xs text-gray-500">+{questions.length - 3} more</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div> */}
            </TabsContent>

            <TabsContent value="passed" className="mt-6">
              <div className="space-y-4">
                {passedSections.map((section) => {
                  const score = section.averageScorePercent ?? 0;
                  return (
                    <div key={section.sectionId} className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-6 backdrop-blur-xl shadow-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-xl bg-emerald-100">
                            <Star className="h-6 w-6 text-emerald-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">
                              {formatTitle(section.sectionTitle, section.sectionId)}
                            </h3>
                            {section.subjectTitle && (
                              <div className="text-sm text-gray-500 mt-1">
                                {section.subjectTitle}
                              </div>
                            )}
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                              <span>Completed sessions: {(section.completedSessions ?? 0).toLocaleString()}</span>
                              <span>Score: {formatPercent(score)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-emerald-600">Passed</div>
                          <div className="text-sm text-gray-500">70%+ score</div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {passedSections.length === 0 && (
                  <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-12 backdrop-blur-xl shadow-lg text-center">
                    <Star className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No passed topics yet</h3>
                    <p className="text-gray-600">Finish a playground session with a 70%+ score to appear here.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="completed" className="mt-6">
              <div className="space-y-4">
                {(history || []).map((session) => (
                  <div key={session.id} className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-6 backdrop-blur-xl shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${session.status === "completed" ? "bg-green-100" : "bg-amber-100"}`}>
                          {session.status === "completed" ? (
                            <CheckCircle className="h-6 w-6 text-green-600" />
                          ) : (
                            <AlertCircle className="h-6 w-6 text-amber-600" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{session.section_title}</h3>
                          {session.subject && (
                            <div className="text-sm text-gray-500 mt-1">
                              {session.subject}
                            </div>
                          )}
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                            <span>Started: {new Date(session.created_at).toLocaleDateString()}</span>
                            <span>·</span>
                            <span>Status: {session.status}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`text-lg font-semibold ${session.status === "completed" ? "text-green-600" : "text-amber-600"}`}>
                          {session.status === "completed" ? "Completed" : "In progress"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {session.completed_at ? new Date(session.completed_at).toLocaleDateString() : "Keep going"}
                        </div>
                        <div className="mt-3 flex justify-end">
                          <LoadingLinkButton
                            href={`/playground/sessions/${session.id}`}
                            label={session.status === "completed" ? "View Summary" : "Resume"}
                            loadingLabel="Loading..."
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                              session.status === "completed"
                                ? "bg-green-600 text-white hover:bg-green-700"
                                : "bg-amber-500 text-white hover:bg-amber-600"
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {(history || []).length === 0 && (
                  <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-12 backdrop-blur-xl shadow-lg text-center">
                    <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions yet</h3>
                    <p className="text-gray-600">Your adaptive playground sessions will appear here after completion.</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}
