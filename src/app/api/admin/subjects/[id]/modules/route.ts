import { NextResponse } from "next/server";
import { apiPost } from "@/lib/api";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  
  try {
    const body = await req.json().catch(() => ({}));
    const { id } = await params;
    const data = await apiPost(`/v1/subjects/${id}/modules`, body);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to add module" }, { status: 500 });
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("modules")
      .select("id,title,subject_id,order_index")
      .eq("subject_id", id)
      .order("order_index", { ascending: true });
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch modules" }, { status: 500 });
  }
}
