import fs from "fs";
import path from "path";
import webpush from "web-push";
import { ForexNewsStory } from "@/types/news";

const BUNDLED_SUBSCRIPTIONS = path.join(process.cwd(), "data", "webpush-subscriptions.json");
const TMP_SUBSCRIPTIONS = path.join("/tmp", "webpush-subscriptions.json");

const globalForWebPush = global as unknown as {
  __webPushSubscriptions?: any[];
};

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
  if (globalForWebPush.__webPushSubscriptions && globalForWebPush.__webPushSubscriptions.length > 0) {
    return globalForWebPush.__webPushSubscriptions;
  }

  // 1. Try /tmp
  try {
    if (fs.existsSync(TMP_SUBSCRIPTIONS)) {
      const data = JSON.parse(fs.readFileSync(TMP_SUBSCRIPTIONS, "utf-8"));
      if (Array.isArray(data)) {
        globalForWebPush.__webPushSubscriptions = data;
        return data;
      }
    }
  } catch (err) {
    console.warn("[WebPush] Error reading /tmp/webpush-subscriptions.json:", err);
  }

  // 2. Try bundled data/
  try {
    if (fs.existsSync(BUNDLED_SUBSCRIPTIONS)) {
      const data = JSON.parse(fs.readFileSync(BUNDLED_SUBSCRIPTIONS, "utf-8"));
      if (Array.isArray(data)) {
        globalForWebPush.__webPushSubscriptions = data;
        return data;
      }
    }
  } catch (err) {
    console.warn("[WebPush] Error reading bundled subscriptions:", err);
  }

  return [];
}

export function saveSubscription(sub: any): void {
  const existing = getSubscriptions();
  const isDuplicate = existing.some((s) => s.endpoint === sub.endpoint);
  if (!isDuplicate) {
    existing.push(sub);
    globalForWebPush.__webPushSubscriptions = existing;

    const content = JSON.stringify(existing, null, 2);

    // Write to /tmp (always writable on Vercel)
    try {
      fs.writeFileSync(TMP_SUBSCRIPTIONS, content, "utf-8");
    } catch (e) {
      console.warn("[WebPush] Failed writing to /tmp:", e);
    }

    // Safe fallback to data/
    try {
      const dir = path.dirname(BUNDLED_SUBSCRIPTIONS);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(BUNDLED_SUBSCRIPTIONS, content, "utf-8");
    } catch {
      // Expected on Vercel
    }
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
    globalForWebPush.__webPushSubscriptions = validSubscriptions;
    try {
      fs.writeFileSync(TMP_SUBSCRIPTIONS, JSON.stringify(validSubscriptions, null, 2), "utf-8");
    } catch {}
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
