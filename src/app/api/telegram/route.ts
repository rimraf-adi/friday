import { NextRequest, NextResponse } from "next/server";
import {
  getBotToken,
  getActiveChatId,
  autoDiscoverChatId,
  saveStoredChatId,
  sendTelegramMessage,
} from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = getBotToken();
    let chatId = await getActiveChatId();

    return NextResponse.json({
      success: true,
      botUsername: "demoooforexBot",
      chatId: chatId || null,
      isConfigured: !!chatId,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || "discover";

    if (action === "set_chat_id" && body.chatId) {
      saveStoredChatId(String(body.chatId));
      return NextResponse.json({
        success: true,
        message: `Saved chatId: ${body.chatId}`,
        chatId: String(body.chatId),
      });
    }

    if (action === "discover") {
      const detectedId = await autoDiscoverChatId();
      if (!detectedId) {
        return NextResponse.json({
          success: false,
          error:
            "No recent messages found from Telegram. Please open @demoooforexBot and send /start or any message first!",
        });
      }
      return NextResponse.json({
        success: true,
        message: `Linked Telegram Chat ID: ${detectedId}`,
        chatId: detectedId,
      });
    }

    if (action === "test_ping") {
      const chatId = await getActiveChatId();
      if (!chatId) {
        return NextResponse.json({
          success: false,
          error: "No Telegram chat ID linked yet. Please message @demoooforexBot first.",
        });
      }
      const testMsg = `🔔 <b>Forex Factory Alert Test</b>\n\nBot is successfully connected to your chat! You will receive instant notifications in descending order whenever a <b>new story</b> is published on Forex Factory.\n\n🛡 <i>Zero-spam active: Old news will never be resent.</i>`;
      const res = await sendTelegramMessage(testMsg);
      return NextResponse.json(res);
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
