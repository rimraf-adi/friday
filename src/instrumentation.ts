export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initCron } = await import("./lib/cron");
    console.log("[Instrumentation] Starting background Forex Factory cron scheduler...");
    initCron();
  }
}
