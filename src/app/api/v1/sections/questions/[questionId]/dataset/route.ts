import { NextRequest, NextResponse } from 'next/server';
import { apiGet } from '@/lib/api';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  let questionId: string | undefined;
  try {
    ({ questionId } = await params);
    if (!questionId) {
      return NextResponse.json(
        { error: 'Question ID is required' },
        { status: 400 }
      );
    }

    console.log(`API dataset route called for question ${questionId}`);

    const data = await apiGet(`/v1/sections/questions/${questionId}/dataset`);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching question dataset:333', error);

    if (error instanceof Error && error.message.includes('404')) {
      console.warn(
        `Dataset missing for question ${questionId ?? 'unknown'} (404 response)`,
      );
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    console.error(
      `Dataset route error for question ${questionId ?? 'unknown'}:`,
      error,
    );

    return NextResponse.json(
      { error: 'Failed to fetch dataset' },
      { status: 500 }
    );
  }
}
