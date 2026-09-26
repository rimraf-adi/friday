import fs from "fs";
import path from "path";
import webpush from "web-push";
import { ForexNewsStory } from "@/types/news";

const SUBSCRIPTIONS_FILE = path.join(process.cwd(), "data", "webpush-subscriptions.json");

export const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BN8lEgfMhqPpcCPgL9dCCjAjjQoWqMgJpWHFhNZ_I5FWmgyTgM6uRcTRELLfzVY3xKt4Ok-O6vVW8evDLSIAh5Y";

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "G5zJ6o3T9IxqoFG7e5LO2s768Ne0Jv8fcSVuysbNrfk";

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:admin@forexfactory-alerts.local";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export function getSubscriptions(): any[] {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, "utf-8"));
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.error("[WebPush] Error reading subscriptions:", err);
  }
  return [];
}

export function saveSubscription(sub: any): void {
  try {
    const dir = path.dirname(SUBSCRIPTIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const existing = getSubscriptions();
    const isDuplicate = existing.some((s) => s.endpoint === sub.endpoint);
    if (!isDuplicate) {
      existing.push(sub);
      fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(existing, null, 2), "utf-8");
      console.log(`[WebPush] Stored new browser subscription (${existing.length} total)`);
    }
  } catch (err) {
    console.error("[WebPush] Error saving subscription:", err);
  }
}

export async function broadcastWebPush(payload: {
  title: string;
  body: string;
  url?: string;
}): Promise<{ sent: number; failed: number }> {
  const subscriptions = getSubscriptions();
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const validSubscriptions: any[] = [];

  const jsonPayload = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, jsonPayload);
      sent++;
      validSubscriptions.push(sub);
    } catch (err: any) {
      failed++;
      console.warn(`[WebPush] Delivery failed for ${sub.endpoint?.slice(0, 30)}:`, err.statusCode || err.message);
      // If subscription expired/unsubscribed (404/410), do not re-add to valid list
      if (err.statusCode !== 404 && err.statusCode !== 410) {
        validSubscriptions.push(sub);
      }
    }
  }

  // Update subscriptions file if any were pruned
  if (validSubscriptions.length !== subscriptions.length) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(validSubscriptions, null, 2), "utf-8");
  }

  return { sent, failed };
}

export async function notifyNewStoryWebPush(story: ForexNewsStory) {
  return broadcastWebPush({
    title: `🚨 ${story.title.slice(0, 60)}...`,
    body: `${story.source ? `From ${story.source} • ` : ""}${story.timeAgo || "Just now"}\n${story.preview.slice(0, 100)}...`,
    url: story.url,
  });
}
