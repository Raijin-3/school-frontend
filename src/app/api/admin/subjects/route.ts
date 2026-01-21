import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("subjects")
      .select("id,title,course_id,order_index")
      .order("title", { ascending: true });
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch subjects" }, { status: 500 });
  }
}
