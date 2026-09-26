import cron, { ScheduledTask } from "node-cron";
import { scrapeForexFactoryNews } from "./scraper";
import { getNewsStore, saveNewsStore } from "./storage";

interface CronState {
  task: ScheduledTask | null;
  isScrapingInProgress: boolean;
  schedulePattern: string;
}

const globalForCron = global as unknown as {
  __forexCronState?: CronState;
};

const cronState: CronState = globalForCron.__forexCronState || {
  task: null,
  isScrapingInProgress: false,
  schedulePattern: process.env.CRON_SCHEDULE || "* * * * *", // default: every 1 minute
};

if (process.env.NODE_ENV !== "production") {
  globalForCron.__forexCronState = cronState;
}

export function getNextCronRun(cronPattern: string): string {
  const now = new Date();
  const match = cronPattern.match(/\*\/(\d+)/);
  if (match) {
    const minutes = parseInt(match[1], 10);
    const currentMin = now.getMinutes();
    const nextMin = (Math.floor(currentMin / minutes) + 1) * minutes;
    const next = new Date(now);
    next.setMinutes(nextMin, 0, 0);
    return next.toISOString();
  }
  // Default to +1 minute for * * * * *
  return new Date(now.getTime() + 60 * 1000).toISOString();
}

export async function runScrapeJobNow(): Promise<{
  success: boolean;
  newCount: number;
  totalCount: number;
  scrapedCount: number;
  error?: string;
}> {
  if (cronState.isScrapingInProgress) {
    console.log("[Cron] A scrape job is already in progress, skipping trigger.");
    const store = getNewsStore();
    return {
      success: false,
      newCount: 0,
      totalCount: store.stories.length,
      scrapedCount: 0,
      error: "Scrape job is currently in progress",
    };
  }

  cronState.isScrapingInProgress = true;
  try {
    const res = await scrapeForexFactoryNews();
    const store = getNewsStore();
    store.meta.nextRunAt = getNextCronRun(cronState.schedulePattern);
    saveNewsStore(store);
    return res;
  } finally {
    cronState.isScrapingInProgress = false;
  }
}

export function initCron(schedulePattern = cronState.schedulePattern): void {
  cronState.schedulePattern = schedulePattern;

  if (cronState.task) {
    console.log("[Cron] Stopping existing cron schedule...");
    cronState.task.stop();
    cronState.task = null;
  }

  if (!cron.validate(schedulePattern)) {
    console.error(`[Cron] Invalid cron expression: "${schedulePattern}"`);
    return;
  }

  console.log(`[Cron] Initializing cron job for Forex Factory scraper (${schedulePattern})...`);

  // Update nextRunAt in storage
  const store = getNewsStore();
  store.meta.cronSchedule = schedulePattern;
  store.meta.nextRunAt = getNextCronRun(schedulePattern);
  saveNewsStore(store);

  cronState.task = cron.schedule(schedulePattern, async () => {
    console.log(`[Cron] Scheduled trigger fired at ${new Date().toISOString()}`);
    await runScrapeJobNow();
  });

  // Run an initial scrape on launch if never scraped
  if (!store.meta.lastRunAt || store.stories.length === 0) {
    console.log("[Cron] Performing initial baseline scrape...");
    runScrapeJobNow().catch((err) => {
      console.error("[Cron] Initial scrape error:", err);
    });
  }
}

export function getCronStatus() {
  const store = getNewsStore();
  return {
    isActive: !!cronState.task,
    isScrapingInProgress: cronState.isScrapingInProgress,
    schedule: cronState.schedulePattern,
    nextRunAt: store.meta.nextRunAt,
    lastRunAt: store.meta.lastRunAt,
    lastError: store.meta.lastError,
    totalStories: store.stories.length,
  };
}
