import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { apiGet } from "@/lib/api";
import { LearningPathContent } from "@/app/learning-path/learning-path-content";
import { Sidebar } from "@/app/dashboard/sidebar";
import { MobileSidebar } from "@/app/dashboard/mobile-sidebar";

export const metadata = { title: "Learning Path - Curriculum" };

export default async function SubjectLearningPathPage({
  params,
}: {
  params: Promise<{ courseId: string; subjectId: string }>;
}) {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const resolvedParams = await params;
  const { subjectId } = resolvedParams;

  let profile: any = null;
  try {
    profile = await apiGet<any>("/v1/profile");
  } catch {}

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6">
      <MobileSidebar active="/learning-path" />
      <div className="lg:flex lg:gap-4">
        <Sidebar active="/learning-path" />
        <section className="flex-1">
          <LearningPathContent
            isFirstTime={false}
            profile={profile}
            subjectSlug={subjectId}
          />
        </section>
      </div>
    </div>
  );
}
