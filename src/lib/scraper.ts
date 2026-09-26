import * as cheerio from "cheerio";
import { ForexNewsStory } from "@/types/news";
import { mergeStories } from "./storage";

export function parseRelativeTimeToIso(timeAgoStr: string): string {
  const now = new Date();
  const trimmed = timeAgoStr.trim().toLowerCase();

  let minutesSubtract = 0;

  const hrMatch = trimmed.match(/(\d+)\s*(?:hr|hour|hours)/);
  if (hrMatch) {
    minutesSubtract += parseInt(hrMatch[1], 10) * 60;
  }

  const minMatch = trimmed.match(/(\d+)\s*(?:min|minute|minutes)/);
  if (minMatch) {
    minutesSubtract += parseInt(minMatch[1], 10);
  }

  const dayMatch = trimmed.match(/(\d+)\s*(?:day|days)/);
  if (dayMatch) {
    minutesSubtract += parseInt(dayMatch[1], 10) * 1440;
  }

  if (minutesSubtract > 0) {
    const published = new Date(now.getTime() - minutesSubtract * 60 * 1000);
    return published.toISOString();
  }

  // Fallback: check if it's like "Sep 25"
  const dateParsed = Date.parse(timeAgoStr);
  if (!isNaN(dateParsed)) {
    return new Date(dateParsed).toISOString();
  }

  return now.toISOString();
}

function parseStoryFromElement(
  $: cheerio.CheerioAPI,
  el: any,
  isLatestWidget: boolean
): ForexNewsStory | null {
  const item = $(el);
  const titleLink = item.find(".news-block__title a");
  const title = titleLink.text().trim();
  const rawHref = titleLink.attr("href") || "";

  if (!title || !rawHref) {
    return null;
  }

  const idMatch = rawHref.match(/\/news\/(\d+)/);
  const id = idMatch ? idMatch[1] : `${Date.now()}`;
  const numericId = idMatch ? parseInt(idMatch[1], 10) : 0;

  const url = rawHref.startsWith("http")
    ? rawHref
    : `https://www.forexfactory.com${rawHref.startsWith("/") ? "" : "/"}${rawHref}`;

  const detailsEl = item.find(".news-block__details");
  const sourceEl = detailsEl.find("a").first();
  const sourceRaw = sourceEl.text().trim();
  const source = sourceRaw.replace(/^From\s+/i, "");

  const sourceRawHref = sourceEl.attr("href") || "";
  const sourceUrl = sourceRawHref.startsWith("http")
    ? sourceRawHref
    : sourceRawHref
    ? `https://www.forexfactory.com${sourceRawHref.startsWith("/") ? "" : "/"}${sourceRawHref}`
    : url;

  const timeAgo = detailsEl.find("span.nowrap").text().trim() || detailsEl.text().match(/(\d+\s*(?:hr|min|day)[^|]*ago)/i)?.[1] || "";
  const publishedAt = parseRelativeTimeToIso(timeAgo);

  const commentsEl = detailsEl.find("a[data-comments-link]");
  const commentsText = commentsEl.text().trim();
  const commentsMatch = commentsText.match(/(\d+)/);
  const commentsCount = commentsMatch ? parseInt(commentsMatch[1], 10) : 0;

  const preview = item.find(".news-block__preview").text().replace(/\s+/g, " ").trim();
  const image = item.find(".news-block__image img").attr("src") || "";

  const icons: string[] = [];
  item.find(".news-block__title-icons img, .news-block__title-icons span").each((_, icon) => {
    const cls = $(icon).attr("class") || $(icon).attr("alt") || "";
    if (cls) icons.push(cls);
  });

  const now = new Date().toISOString();

  return {
    id,
    numericId,
    title,
    url,
    source,
    sourceUrl,
    timeAgo,
    publishedAt,
    commentsCount,
    commentsText,
    preview,
    image,
    icons,
    isLatestStoriesWidget: isLatestWidget,
    firstScrapedAt: now,
    lastScrapedAt: now,
  };
}

export async function scrapeForexFactoryNews(): Promise<{
  success: boolean;
  newCount: number;
  totalCount: number;
  scrapedCount: number;
  error?: string;
}> {
  const targetUrl = "https://www.forexfactory.com/";
  console.log(`[Scraper] Starting scrape for ${targetUrl}...`);

  try {
    const { gotScraping } = await import("got-scraping");
    const response = await gotScraping({
      url: targetUrl,
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
      headerGeneratorOptions: {
        browsers: [{ name: "chrome" }],
      },
      timeout: {
        request: 15000,
      },
    });

    if (response.statusCode !== 200) {
      throw new Error(`Failed with HTTP status ${response.statusCode}`);
    }

    const $ = cheerio.load(response.body);
    const scrapedStories: ForexNewsStory[] = [];

    // 1. Locate the "News / Latest Stories" widget from the screenshot
    const latestStoriesHeader = $("h2:contains(\"Latest Stories\")");
    const latestWidgetBlock = latestStoriesHeader.closest(".news-block");
    
    if (latestWidgetBlock.length > 0) {
      latestWidgetBlock.find(".news-block__item").each((_, el) => {
        const story = parseStoryFromElement($, el, true);
        if (story) scrapedStories.push(story);
      });
    }

    // 2. Also check if there are other news blocks on the page
    $(".news-block__items .news-block__item").each((_, el) => {
      const story = parseStoryFromElement($, el, false);
      if (story && !scrapedStories.some((s) => s.id === story.id)) {
        scrapedStories.push(story);
      }
    });

    console.log(`[Scraper] Successfully parsed ${scrapedStories.length} stories from ${targetUrl}`);

    // Merge stories and record metadata
    const result = mergeStories(scrapedStories, {
      lastRunAt: new Date().toISOString(),
      status: "success",
      lastError: null,
      lastScrapedUrl: targetUrl,
    });

    // Notify Telegram and Web Push ONLY if there are brand-new stories
    if (result.newlyAddedStories && result.newlyAddedStories.length > 0) {
      try {
        const { notifyNewStories } = await import("./telegram");
        const { saveNewsStore } = await import("./storage");
        const { notifyNewStoryWebPush } = await import("./webpush");

        // Web push to all subscribed browsers
        for (const story of result.newlyAddedStories) {
          await notifyNewStoryWebPush(story);
        }

        const notifyResult = await notifyNewStories(result.newlyAddedStories);
        console.log(`[Telegram] Sent ${notifyResult.sentCount} new story notifications.`);
        saveNewsStore({ meta: result.meta, stories: result.stories });
      } catch (tgErr: any) {
        console.error("[Notification] Trigger error:", tgErr.message || tgErr);
      }
    }

    return {
      success: true,
      newCount: result.newCount,
      totalCount: result.totalCount,
      scrapedCount: scrapedStories.length,
    };
  } catch (error: any) {
    console.error("[Scraper] Scrape failed:", error.message || error);
    mergeStories([], {
      lastRunAt: new Date().toISOString(),
      status: "error",
      lastError: error.message || String(error),
      lastScrapedUrl: targetUrl,
    });

    return {
      success: false,
      newCount: 0,
      totalCount: 0,
      scrapedCount: 0,
      error: error.message || String(error),
    };
  }
}
