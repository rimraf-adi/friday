export interface ForexNewsStory {
  id: string; // e.g. "1428658"
  numericId: number; // sequential article ID for reliable descending sort
  title: string;
  url: string;
  source: string; // e.g. "channelnewsasia.com", "@NodeWire", "@realDonaldTrump"
  sourceUrl: string;
  timeAgo: string; // e.g. "2 hr 50 min ago"
  publishedAt: string; // ISO datetime string estimated from timeAgo or scrape time
  commentsCount: number;
  commentsText: string;
  preview: string;
  image: string;
  icons: string[];
  isLatestStoriesWidget: boolean;
  firstScrapedAt: string;
  lastScrapedAt: string;
  notifiedViaTelegram?: boolean;
}

export interface ScraperMeta {
  lastRunAt: string | null;
  nextRunAt: string | null;
  status: "idle" | "running" | "success" | "error";
  lastError: string | null;
  totalStories: number;
  newStoriesLastRun: number;
  cronSchedule: string;
  lastScrapedUrl: string;
  telegramChatId?: string | null;
  telegramNotificationsSent?: number;
}

export interface NewsStore {
  meta: ScraperMeta;
  stories: ForexNewsStory[];
}
