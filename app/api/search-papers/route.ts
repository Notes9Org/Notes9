import { NextRequest, NextResponse } from 'next/server';
import { searchPapers } from '@/lib/paper-search';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    const results = await searchPapers(query);

    return NextResponse.json({
      papers: results,
      totalCount: results.length,
    });
  } catch (error) {
    console.error('Paper search API error:', error);
    return NextResponse.json(
      { error: 'Failed to search papers' },
      { status: 500 }
    );
  }
}
