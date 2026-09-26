import { NextRequest, NextResponse } from "next/server";
import { runScrapeJobNow, getCronStatus } from "@/lib/cron";
import { getNewsStore } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleScrape(request: NextRequest) {
  // Optional security check if CRON_SECRET is configured
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const urlSecret = request.nextUrl.searchParams.get("key");
    if (urlSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runScrapeJobNow();
  const store = getNewsStore();
  const cronStatus = getCronStatus();

  return NextResponse.json({
    success: result.success,
    newCount: result.newCount,
    scrapedCount: result.scrapedCount,
    totalCount: result.totalCount,
    error: result.error,
    meta: store.meta,
    cronStatus,
    // Return latest 5 stories in descending order
    latestStories: store.stories.slice(0, 5),
  });
}

export async function GET(request: NextRequest) {
  return handleScrape(request);
}

export async function POST(request: NextRequest) {
  return handleScrape(request);
}
