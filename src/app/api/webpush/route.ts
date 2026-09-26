import { NextRequest, NextResponse } from "next/server";
import {
  VAPID_PUBLIC_KEY,
  saveSubscription,
  broadcastWebPush,
  getSubscriptions,
} from "@/lib/webpush";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    publicKey: VAPID_PUBLIC_KEY,
    subscribersCount: getSubscriptions().length,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || "subscribe";

    if (action === "subscribe" && body.subscription) {
      saveSubscription(body.subscription);
      return NextResponse.json({
        success: true,
        message: "Web push subscription saved successfully!",
        subscribersCount: getSubscriptions().length,
      });
    }

    if (action === "test_push") {
      const result = await broadcastWebPush({
        title: "🚨 Forex Factory Web Push Test",
        body: `Test notification sent at ${new Date().toLocaleTimeString()}! Web notifications are functioning.`,
        url: "/",
      });

      return NextResponse.json({
        success: true,
        sent: result.sent,
        failed: result.failed,
        totalSubscribers: getSubscriptions().length,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
