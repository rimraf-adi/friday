import { NextRequest, NextResponse } from "next/server";
import { getNewsStore } from "@/lib/storage";
import { getCronStatus } from "@/lib/cron";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const store = getNewsStore();
    const cronStatus = getCronStatus();

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q")?.toLowerCase();
    const source = searchParams.get("source")?.toLowerCase();
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    let filteredStories = [...store.stories];

    // Filter by search query
    if (query) {
      filteredStories = filteredStories.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.preview.toLowerCase().includes(query) ||
          s.source.toLowerCase().includes(query)
      );
    }

    // Filter by source
    if (source) {
      filteredStories = filteredStories.filter((s) =>
        s.source.toLowerCase().includes(source)
      );
    }

    // STRICT DESCENDING ORDER: newest first (highest numericId, then newest publishedAt)
    filteredStories.sort((a, b) => {
      if (b.numericId !== a.numericId) {
        return b.numericId - a.numericId;
      }
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    if (limit && limit > 0) {
      filteredStories = filteredStories.slice(0, limit);
    }

    return NextResponse.json({
      success: true,
      count: filteredStories.length,
      totalCount: store.stories.length,
      meta: store.meta,
      cronStatus,
      stories: filteredStories,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to retrieve news",
      },
      { status: 500 }
    );
  }
}
