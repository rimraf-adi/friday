import fs from "fs";
import path from "path";
import { ForexNewsStory, NewsStore, ScraperMeta } from "@/types/news";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "forex-news.json");

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

export function getNewsStore(): NewsStore {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { meta: { ...defaultMeta }, stories: [] };
    }
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const data: NewsStore = JSON.parse(raw);

    // Guarantee descending order (newest first by numericId and publishedAt)
    data.stories.sort((a, b) => {
      if (b.numericId !== a.numericId) {
        return b.numericId - a.numericId;
      }
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return data;
  } catch (error) {
    console.error("Error reading news store:", error);
    return { meta: { ...defaultMeta }, stories: [] };
  }
}

export function saveNewsStore(store: NewsStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Always sort descending before saving
    store.stories.sort((a, b) => {
      if (b.numericId !== a.numericId) {
        return b.numericId - a.numericId;
      }
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    store.meta.totalStories = store.stories.length;

    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), "utf-8");
    fs.renameSync(tempFile, DATA_FILE);
  } catch (error) {
    console.error("Error saving news store:", error);
    throw error;
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
