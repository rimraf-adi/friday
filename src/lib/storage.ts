import fs from "fs";
import path from "path";
import { ForexNewsStory, NewsStore, ScraperMeta } from "@/types/news";
import seedNewsData from "./seed-news.json";

const BUNDLED_DIR = path.join(process.cwd(), "data");
const BUNDLED_FILE = path.join(BUNDLED_DIR, "forex-news.json");

// /tmp is the only writable directory in AWS Lambda / Vercel Serverless
const TMP_FILE = path.join("/tmp", "forex-news.json");

const defaultMeta: ScraperMeta = {
  lastRunAt: null,
  nextRunAt: null,
  status: "idle",
  lastError: null,
  totalStories: 0,
  newStoriesLastRun: 0,
  cronSchedule: "* * * * *", // every 1 minute
  lastScrapedUrl: "https://www.forexfactory.com/",
};

// Global in-memory cache for warm lambda executions
const globalForStore = global as unknown as {
  __newsStoreCache?: NewsStore;
};

export function getNewsStore(): NewsStore {
  // 1. Check in-memory cache
  if (globalForStore.__newsStoreCache && globalForStore.__newsStoreCache.stories.length > 0) {
    return globalForStore.__newsStoreCache;
  }

  let data: NewsStore | null = null;

  // 2. Check /tmp/forex-news.json (serverless writable store)
  try {
    if (fs.existsSync(TMP_FILE)) {
      const raw = fs.readFileSync(TMP_FILE, "utf-8");
      data = JSON.parse(raw);
    }
  } catch (err) {
    console.warn("[Storage] Error reading from /tmp/forex-news.json:", err);
  }

  // 3. Fallback to bundled seed data (guaranteed inside lambda bundle)
  if (!data || !data.stories || data.stories.length === 0) {
    try {
      data = JSON.parse(JSON.stringify(seedNewsData));
    } catch {
      data = { meta: { ...defaultMeta }, stories: [] };
    }
  }

  const storeData: NewsStore = data || { meta: { ...defaultMeta }, stories: [] };

  // Guarantee strict descending order (newest first by numericId and publishedAt)
  if (Array.isArray(storeData.stories)) {
    storeData.stories.sort((a, b) => {
      if (b.numericId !== a.numericId) {
        return b.numericId - a.numericId;
      }
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  } else {
    storeData.stories = [];
  }

  globalForStore.__newsStoreCache = storeData;
  return storeData;
}

export function saveNewsStore(store: NewsStore): void {
  // Always sort descending before saving
  store.stories.sort((a, b) => {
    if (b.numericId !== a.numericId) {
      return b.numericId - a.numericId;
    }
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  store.meta.totalStories = store.stories.length;

  // 1. Update in-memory cache immediately
  globalForStore.__newsStoreCache = store;

  const content = JSON.stringify(store, null, 2);

  // 2. Write to /tmp (always writable on Vercel and local)
  try {
    fs.writeFileSync(TMP_FILE, content, "utf-8");
  } catch (tmpErr) {
    console.warn("[Storage] Could not write to /tmp:", tmpErr);
  }

  // 3. Attempt write to local data/ directory (succeeds locally, safely ignored on Vercel read-only FS)
  try {
    if (!fs.existsSync(BUNDLED_DIR)) {
      fs.mkdirSync(BUNDLED_DIR, { recursive: true });
    }
    fs.writeFileSync(BUNDLED_FILE, content, "utf-8");
  } catch {
    // Expected on Vercel read-only file system
  }
}

export function mergeStories(
  incomingStories: ForexNewsStory[],
  metaUpdates: Partial<ScraperMeta>
): {
  newCount: number;
  newlyAddedStories: ForexNewsStory[];
  totalCount: number;
  meta: ScraperMeta;
  stories: ForexNewsStory[];
} {
  const store = getNewsStore();
  const existingMap = new Map<string, ForexNewsStory>();

  for (const story of store.stories) {
    existingMap.set(story.id, story);
  }

  let newCount = 0;
  const now = new Date().toISOString();
  const newlyAddedStories: ForexNewsStory[] = [];

  for (const incoming of incomingStories) {
    if (!existingMap.has(incoming.id)) {
      newCount++;
      const item: ForexNewsStory = {
        ...incoming,
        firstScrapedAt: now,
        lastScrapedAt: now,
        notifiedViaTelegram: false,
      };
      existingMap.set(incoming.id, item);
      newlyAddedStories.push(item);
    } else {
      const existing = existingMap.get(incoming.id)!;
      existingMap.set(incoming.id, {
        ...existing,
        ...incoming,
        firstScrapedAt: existing.firstScrapedAt || now,
        lastScrapedAt: now,
      });
    }
  }

  const mergedStories = Array.from(existingMap.values());

  // Strictly enforce descending order
  mergedStories.sort((a, b) => {
    if (b.numericId !== a.numericId) {
      return b.numericId - a.numericId;
    }
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const updatedMeta: ScraperMeta = {
    ...store.meta,
    ...metaUpdates,
    totalStories: mergedStories.length,
    newStoriesLastRun: newCount,
  };

  const updatedStore: NewsStore = {
    meta: updatedMeta,
    stories: mergedStories,
  };

  saveNewsStore(updatedStore);

  return {
    newCount,
    newlyAddedStories,
    totalCount: mergedStories.length,
    meta: updatedMeta,
    stories: mergedStories,
  };
}
