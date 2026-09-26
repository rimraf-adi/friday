import fs from "fs";
import path from "path";
import { ForexNewsStory } from "@/types/news";

const BUNDLED_CONFIG_FILE = path.join(process.cwd(), "data", "telegram-config.json");
const TMP_CONFIG_FILE = path.join("/tmp", "telegram-config.json");
const DEFAULT_TOKEN = "8978565848:AAEejpO6KDR689DXm9BCWUl95nGb_9zfOv0";

const globalForTelegram = global as unknown as {
  __activeTelegramChatId?: string | null;
};

export function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || DEFAULT_TOKEN;
}

export function getStoredChatId(): string | null {
  if (process.env.TELEGRAM_CHAT_ID) {
    return process.env.TELEGRAM_CHAT_ID.trim();
  }
  if (globalForTelegram.__activeTelegramChatId) {
    return globalForTelegram.__activeTelegramChatId;
  }
  // Try /tmp first
  try {
    if (fs.existsSync(TMP_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(TMP_CONFIG_FILE, "utf-8"));
      if (data.chatId) {
        globalForTelegram.__activeTelegramChatId = data.chatId;
        return data.chatId;
      }
    }
  } catch (err) {
    console.warn("[Telegram] Error reading /tmp/telegram-config.json:", err);
  }
  // Try bundled data/ file
  try {
    if (fs.existsSync(BUNDLED_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(BUNDLED_CONFIG_FILE, "utf-8"));
      if (data.chatId) {
        globalForTelegram.__activeTelegramChatId = data.chatId;
        return data.chatId;
      }
    }
  } catch (err) {
    console.warn("[Telegram] Error reading bundled telegram-config.json:", err);
  }
  return null;
}

export function saveStoredChatId(chatId: string): void {
  const cleanId = chatId.trim();
  globalForTelegram.__activeTelegramChatId = cleanId;

  // 1. Write to /tmp (always writable on Vercel)
  try {
    fs.writeFileSync(TMP_CONFIG_FILE, JSON.stringify({ chatId: cleanId }, null, 2), "utf-8");
  } catch (e) {
    console.warn("[Telegram] Failed writing to /tmp:", e);
  }

  // 2. Try writing to local data/ (safe fallback)
  try {
    const dir = path.dirname(BUNDLED_CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BUNDLED_CONFIG_FILE, JSON.stringify({ chatId: cleanId }, null, 2), "utf-8");
  } catch {
    // Expected on Vercel
  }
}

/**
 * Checks Telegram getUpdates to automatically discover the chatId of the user or group
 * who sent a message to @demoooforexBot
 */
export async function autoDiscoverChatId(): Promise<string | null> {
  const token = getBotToken();
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
      method: "GET",
      cache: "no-store",
    });
    const data = await res.json();
    if (!data.ok || !data.result || data.result.length === 0) {
      return null;
    }

    // Get the most recent update that contains a message
    for (let i = data.result.length - 1; i >= 0; i--) {
      const update = data.result[i];
      const chat = update.message?.chat || update.channel_post?.chat || update.my_chat_member?.chat;
      if (chat && chat.id) {
        const foundId = String(chat.id);
        saveStoredChatId(foundId);
        return foundId;
      }
    }
  } catch (err) {
    console.error("[Telegram] Auto-discover chat_id failed:", err);
  }
  return null;
}

export async function getActiveChatId(): Promise<string | null> {
  let chatId = getStoredChatId();
  if (!chatId) {
    chatId = await autoDiscoverChatId();
  }
  return chatId;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendTelegramMessage(
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML"
): Promise<{ success: boolean; error?: string }> {
  const token = getBotToken();
  const chatId = await getActiveChatId();

  if (!chatId) {
    const msg = "No Telegram chat_id configured. Please send a message to @demoooforexBot first, or set TELEGRAM_CHAT_ID.";
    console.warn(`[Telegram] ${msg}`);
    return { success: false, error: msg };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: false,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || "Failed to send message to Telegram");
    }

    return { success: true };
  } catch (err: any) {
    console.error("[Telegram] Failed to send notification:", err.message || err);
    return { success: false, error: err.message || String(err) };
  }
}

export function formatStoryMessage(story: ForexNewsStory): string {
  const title = escapeHtml(story.title);
  const source = escapeHtml(story.source || "Forex Factory");
  const time = escapeHtml(story.timeAgo || "Just now");
  const preview = story.preview ? escapeHtml(story.preview.slice(0, 280)) : "";

  let msg = `🚨 <b>FOREX FACTORY — NEW STORY</b>\n\n`;
  msg += `📰 <b><a href="${story.url}">${title}</a></b>\n\n`;
  msg += `📌 <b>Source:</b> ${source}\n`;
  msg += `🕒 <b>Time:</b> ${time}\n`;
  if (story.commentsText) {
    msg += `💬 <b>Comments:</b> ${escapeHtml(story.commentsText)}\n`;
  }
  if (preview) {
    msg += `\n<i>${preview}...</i>\n`;
  }
  msg += `\n🔗 <a href="${story.url}">Open on Forex Factory</a>`;

  return msg;
}

/**
 * Sends notifications ONLY for newly discovered stories.
 * Strictly avoids spamming old news or duplicate alerts.
 */
export async function notifyNewStories(
  stories: ForexNewsStory[]
): Promise<{ sentCount: number; errors: string[] }> {
  const unnotified = stories.filter((s) => !s.notifiedViaTelegram);

  if (unnotified.length === 0) {
    console.log("[Telegram] No new stories to notify. Zero spam policy maintained.");
    return { sentCount: 0, errors: [] };
  }

  const chatId = await getActiveChatId();
  if (!chatId) {
    console.warn(
      `[Telegram] Found ${unnotified.length} new stories, but no chat_id found yet. Send /start to @demoooforexBot to link your chat.`
    );
    return {
      sentCount: 0,
      errors: ["Waiting for user to send /start to @demoooforexBot"],
    };
  }

  console.log(`[Telegram] Sending notifications for ${unnotified.length} new stories...`);
  let sentCount = 0;
  const errors: string[] = [];

  // Send newest stories first (descending)
  for (const story of unnotified) {
    const text = formatStoryMessage(story);
    const res = await sendTelegramMessage(text);
    if (res.success) {
      story.notifiedViaTelegram = true;
      sentCount++;
    } else {
      errors.push(`Story #${story.id}: ${res.error}`);
    }

    // Rate limit delay between notifications (300ms)
    await new Promise((r) => setTimeout(r, 300));
  }

  return { sentCount, errors };
}
