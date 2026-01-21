import { NextRequest, NextResponse } from "next/server";
import { apiGet, apiPost } from "@/lib/api";

export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ exerciseId: string; questionId: string }>;
  },
) {
  try {
    const { exerciseId, questionId } = await params;
    const data = await apiGet(
      `/v1/sections/exercises/${exerciseId}/questions/${questionId}/chat`,
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching mentor chat session:", error);
    return NextResponse.json(
      { error: "Failed to fetch mentor chat session." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ exerciseId: string; questionId: string }>;
  },
) {
  try {
    const { exerciseId, questionId } = await params;
    const payload = await request.json();
    const message = typeof payload?.message === "string" ? payload.message : "";

    const data = await apiPost(
      `/v1/sections/exercises/${exerciseId}/questions/${questionId}/chat`,
      { message },
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error sending mentor chat message:", error);
    return NextResponse.json(
      { error: "Failed to send mentor chat message." },
      { status: 500 },
    );
  }
}
