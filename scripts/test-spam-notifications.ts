import { sendTelegramMessage, formatStoryMessage, getActiveChatId } from "../src/lib/telegram";
import { getNewsStore } from "../src/lib/storage";

async function run() {
  const chatId = await getActiveChatId();
  console.log(`[Notification Tester] Starting 10s notification cycle to chat ID: ${chatId}`);

  let cycle = 1;
  const store = getNewsStore();
  const stories = store.stories;

  // Function to run every 10 seconds
  const sendAlert = async () => {
    try {
      const storyIndex = (cycle - 1) % (stories.length || 1);
      const story = stories[storyIndex];

      if (story) {
        const titleEscaped = story.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const msg = `🚨 <b>[TEST ALERT #${cycle}] FOREX FACTORY NEWS</b>\n\n` +
          `📰 <b><a href="${story.url}">${titleEscaped}</a></b>\n\n` +
          `📌 <b>Source:</b> ${story.source}\n` +
          `🕒 <b>Time:</b> ${story.timeAgo}\n` +
          `💬 <b>Comments:</b> ${story.commentsText || "None"}\n` +
          `⚡ <b>Test Frequency:</b> Every 10 seconds (Cycle #${cycle})\n\n` +
          `🔗 <a href="${story.url}">Read story on Forex Factory</a>`;

        console.log(`[Notification Tester] Sending alert #${cycle} for: "${story.title}"...`);
        const res = await sendTelegramMessage(msg);
        if (res.success) {
          console.log(`✓ Alert #${cycle} delivered successfully!`);
        } else {
          console.error(`✗ Alert #${cycle} failed:`, res.error);
        }
      } else {
        const msg = `🚨 <b>[TEST ALERT #${cycle}] FOREX FACTORY TEST NOTIFICATION</b>\n\n` +
          `Testing live alert delivery every 10 seconds.\n\n` +
          `🕒 <b>Timestamp:</b> ${new Date().toLocaleTimeString()}\n` +
          `⚡ <b>Status:</b> Active verification loop`;
        await sendTelegramMessage(msg);
      }
    } catch (e: any) {
      console.error("[Notification Tester] Error in loop:", e.message || e);
    }
    cycle++;
  };

  // Immediate first alert
  await sendAlert();

  // Send every 10 seconds
  const interval = setInterval(sendAlert, 10000);

  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log("[Notification Tester] Stopped.");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    clearInterval(interval);
    console.log("[Notification Tester] Stopped.");
    process.exit(0);
  });
}

run().catch((e) => {
  console.error("Fatal error:", e);
});
