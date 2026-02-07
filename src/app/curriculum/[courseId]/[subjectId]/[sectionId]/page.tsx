import { redirect } from "next/navigation";
import { apiGet } from "@/lib/api";
import { supabaseServer } from "@/lib/supabase-server";
import { Sidebar } from "../../../../dashboard/sidebar";
import { MobileSidebar } from "../../../../dashboard/mobile-sidebar";
import { CurriculumSectionSidebar } from "@/components/curriculum-section-sidebar";

type Track = any;

export const metadata = { title: "Section | Curriculum" };

export default async function SectionPage({ params }: { params: Promise<{ courseId: string; subjectId: string; sectionId: string }> }) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { courseId, subjectId, sectionId } = await params;
  const track: Track = await apiGet(`/v1/curriculum/${courseId}`).catch(() => null as any);
  const modules = Array.isArray(track?.modules) ? track.modules : [];
  const subjectModules = modules.filter((m: any) => m.subjectId === subjectId);
  const section = modules.flatMap((m: any) => m.sections || []).find((s: any) => s.id === sectionId);
  if (!section) redirect(`/curriculum/${courseId}/${subjectId}`);
  const { data: notificationData, error: notificationError } = await sb
    .from("student_notification")
    .select("id, section_id, action_label, message, metadata, created_at")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (notificationError) {
    console.error("Failed to load student notifications", notificationError);
  }
  const notifications = notificationData ?? [];

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6">
      <MobileSidebar active="/curriculum" />
      <div className="lg:flex lg:gap-4">
        <Sidebar active="/curriculum" />
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
          <main className="rounded-xl border border-border bg-white/70 p-4 backdrop-blur">
            <h1 className="text-xl font-semibold">{section.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{section.overview || 'Section overview'}</p>

            {/* Actions removed per design */}
          </main>
          <aside>
            <CurriculumSectionSidebar
              courseId={courseId}
              subjectId={subjectId}
              sectionId={sectionId}
              modules={subjectModules}
              notifications={notifications}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
