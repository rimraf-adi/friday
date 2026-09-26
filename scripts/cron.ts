import { scrapeForexFactoryNews } from "../src/lib/scraper";
import { getNewsStore } from "../src/lib/storage";

async function main() {
  console.log("==========================================");
  console.log("Forex Factory Scraper - Standalone Cron Runner");
  console.log("Target: https://www.forexfactory.com/");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log("==========================================");

  const result = await scrapeForexFactoryNews();

  if (result.success) {
    console.log(`\n✓ Scrape succeeded!`);
    console.log(`- Scraped items this run: ${result.scrapedCount}`);
    console.log(`- New items added: ${result.newCount}`);
    console.log(`- Total archived items: ${result.totalCount}`);

    const store = getNewsStore();
    console.log("\n--- Latest 5 Stories (Descending Order) ---");
    store.stories.slice(0, 5).forEach((story, idx) => {
      console.log(
        `#${idx + 1} [ID: ${story.numericId}] ${story.title}\n   Source: ${story.source} | Time: ${story.timeAgo} | Comments: ${story.commentsText || "0"}\n   URL: ${story.url}\n`
      );
    });
  } else {
    console.error(`\n✗ Scrape failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
