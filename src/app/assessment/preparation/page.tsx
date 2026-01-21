import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

export const metadata = { title: "Prepare for Assessment - Jarvis" };

const guidancePoints: Array<{ title: string; detail: string }> = [
  {
    title: "What this assessment is",
    detail: "A short diagnostic that maps your current understanding so the platform can guide you better.",
  },
  {
    title: "Why it matters",
    detail: "Results shape personalized paths, not grades—so answers can be honest and thoughtful.",
  },
  {
    title: "Subject focus",
    detail: "It evaluates the subjects you choose next, so pick ones you want to be evaluated.",
  },
  {
    title: "Need a fresh start?",
    detail: "If you want to learn a topic from scratch, don’t select it now—we will build you up from the basics.",
  },
  // {
  //   title: "Next step",
  //   detail: "Confirm you understand this guidance, then move to subject selection to unlock your path.",
  // },
];

export default async function AssessmentPreparationPage() {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/60 to-teal-50/80 py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/90 p-8 shadow-2xl shadow-slate-200">
          <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(59,130,246,0.12),_transparent_55%)] pointer-events-none" />
          <div className="relative z-10 space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
              Assessment prep
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                Get ready before you pick your subjects
              </h1>
              <p className="mt-3 text-lg text-slate-600">
                This short guide explains how the assessment works, what it measures, and how to show up with confidence. Every tip below ensures you make the most of this diagnostic moment.
              </p>
            </div>
            <div className="space-y-4">
              {guidancePoints.map((point) => (
                <div
                  key={point.title}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-800"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
                    {point.title}
                  </p>
                  <p className="mt-2 text-base text-slate-900">{point.detail}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-600">
              <p>
                Plan for a ~30-minute experience where every answer helps us understand how to craft a learning journey just for you.
                Stay calm, trust your instincts, and remember that the goal is progress—not perfection.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-500">
                Ready when you are — once you tap the button below we'll guide you to choose the subjects that matter most.
              </p>
              <Link
                href="/subjects"
                className="rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-400/30 transition hover:scale-[1.01]"
              >
                I’m ready to choose subjects
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
