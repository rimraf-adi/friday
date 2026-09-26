"use client";

import { useEffect, useState, useRef } from "react";
import {
  RefreshCw,
  Clock,
  ExternalLink,
  MessageSquare,
  Flame,
  ArrowDownWideNarrow,
  CheckCircle2,
  AlertCircle,
  Play,
  Search,
  Filter,
  Newspaper,
  Calendar,
  Send,
  Bell,
  BellOff,
  ShieldCheck,
  Check,
  Zap,
  Globe,
  Radio,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ForexNewsStory, ScraperMeta } from "@/types/news";
import { playNotificationTone, NotificationTone } from "@/lib/audio";

export default function Home() {
  const [stories, setStories] = useState<ForexNewsStory[]>([]);
  const [meta, setMeta] = useState<ScraperMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeNotice, setScrapeNotice] = useState<string | null>(null);

  // Web Notification & Push State
  const [webNotificationPermission, setWebNotificationPermission] =
    useState<NotificationPermission>("default");
  const [isWebPushSubscribed, setIsWebPushSubscribed] = useState(false);
  const [is10sWebTestActive, setIs10sWebTestActive] = useState(false);
  const [webTestCount, setWebTestCount] = useState(0);
  const [activeToast, setActiveToast] = useState<{
    title: string;
    body: string;
    url?: string;
  } | null>(null);
  const [selectedTone, setSelectedTone] = useState<NotificationTone>("chime");
  const testIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Telegram state
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [isDetectingTelegram, setIsDetectingTelegram] = useState(false);
  const [isSendingPing, setIsSendingPing] = useState(false);
  const [telegramNotice, setTelegramNotice] = useState<string | null>(null);
  const [customChatIdInput, setCustomChatIdInput] = useState("");

  const safeJsonFetch = async (url: string, options?: RequestInit) => {
    const res = await fetch(url, options);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        res.ok
          ? "Invalid response from server"
          : `Server error (${res.status}): ${text.slice(0, 100)}`
      );
    }
  };

  const fetchNews = async () => {
    try {
      setLoading(true);
      const data = await safeJsonFetch("/api/news");
      if (data && data.success) {
        setStories(data.stories || []);
        setMeta(data.meta || null);
      }
    } catch (err: any) {
      console.error("Failed to load news:", err.message || err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTelegramStatus = async () => {
    try {
      const data = await safeJsonFetch("/api/telegram");
      if (data && data.success && data.chatId) {
        setTelegramChatId(data.chatId);
      }
    } catch (err: any) {
      console.warn("Telegram status check:", err.message || err);
    }
  };

  // Register Service Worker, check notification permission, and load tone
  useEffect(() => {
    fetchNews();
    fetchTelegramStatus();

    if (typeof window !== "undefined") {
      const savedTone = localStorage.getItem("forex_notif_tone") as NotificationTone;
      if (savedTone) setSelectedTone(savedTone);

      if ("Notification" in window) {
        setWebNotificationPermission(Notification.permission);

        if ("serviceWorker" in navigator) {
          navigator.serviceWorker
            .register("/sw.js")
            .then(async (reg) => {
              const sub = await reg.pushManager.getSubscription();
              if (sub) {
                setIsWebPushSubscribed(true);
              }
            })
            .catch((err) => console.log("SW register error:", err));
        }
      }
    }

    return () => {
      if (testIntervalRef.current) {
        clearInterval(testIntervalRef.current);
      }
    };
  }, []);

  const handleToneChange = (tone: NotificationTone) => {
    setSelectedTone(tone);
    if (typeof window !== "undefined") {
      localStorage.setItem("forex_notif_tone", tone);
    }
    playNotificationTone(tone);
  };

  const requestWebNotifications = async () => {
    if (!("Notification" in window)) {
      alert("This browser does not support desktop notifications.");
      return;
    }
    const perm = await Notification.requestPermission();
    setWebNotificationPermission(perm);

    if (perm === "granted" && "serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const res = await fetch("/api/webpush");
        const { publicKey } = await res.json();

        if (publicKey) {
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
          await fetch("/api/webpush", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "subscribe", subscription: sub }),
          });
          setIsWebPushSubscribed(true);
        }
      } catch (e) {
        console.error("Push subscribe error:", e);
      }
    }
  };

  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Web notification trigger helper
  const triggerWebNotification = (title: string, body: string, url: string = "/") => {
    // 0. Play audible notification tone
    playNotificationTone(selectedTone);

    // 1. Native Desktop / Browser notification
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
        });
      } catch (e) {
        console.log("Native notification blocked, using in-app alert");
      }
    }

    // 2. In-app live banner alert
    setActiveToast({ title, body, url });
    setTimeout(() => {
      setActiveToast((curr) => (curr?.title === title ? null : curr));
    }, 6000);
  };

  // Toggle 10-Second Web Notification Spam Test
  const toggle10sWebTest = async () => {
    if (is10sWebTestActive) {
      // STOP
      if (testIntervalRef.current) {
        clearInterval(testIntervalRef.current);
        testIntervalRef.current = null;
      }
      setIs10sWebTestActive(false);
      setScrapeNotice("✓ 10-second web notification test stopped.");
      return;
    }

    // START
    if (Notification.permission !== "granted") {
      await requestWebNotifications();
    }

    setIs10sWebTestActive(true);
    let count = 1;
    setWebTestCount(1);
    setScrapeNotice("⚡ Web notification test started! Sending alerts every 10 seconds (Web only, 0 Telegram).");

    const fireTest = () => {
      const story = stories[(count - 1) % (stories.length || 1)];
      const title = `🚨 [TEST #${count}] Forex Factory Alert`;
      const body = story
        ? `"${story.title}"\nFrom ${story.source} • ${story.timeAgo || "Just now"}`
        : `Simulated live Forex news update at ${new Date().toLocaleTimeString()}`;

      triggerWebNotification(title, body, story?.url || "/");
      setWebTestCount(count);
      count++;
    };

    fireTest();
    testIntervalRef.current = setInterval(fireTest, 10000);
  };

  const handleManualScrape = async () => {
    setIsScraping(true);
    setScrapeNotice(null);
    try {
      const data = await safeJsonFetch("/api/cron", { method: "POST" });
      if (data && data.success) {
        setScrapeNotice(
          `✓ Scraped successfully: ${data.scrapedCount} parsed, ${data.newCount} new added!`
        );
        fetchNews();
      } else {
        setScrapeNotice(`✗ Scrape notice: ${data?.error || "Unable to complete scrape"}`);
      }
    } catch (err: any) {
      setScrapeNotice(`✗ Request failed: ${err.message}`);
    } finally {
      setIsScraping(false);
    }
  };

  const handleAutoDetectTelegram = async () => {
    setIsDetectingTelegram(true);
    setTelegramNotice(null);
    try {
      const data = await safeJsonFetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discover" }),
      });
      if (data && data.success && data.chatId) {
        setTelegramChatId(data.chatId);
        setTelegramNotice(`✓ Connected! Chat ID: ${data.chatId}`);
      } else {
        setTelegramNotice(`✗ ${data?.error || "Could not detect chat"}`);
      }
    } catch (err: any) {
      setTelegramNotice(`✗ Detection failed: ${err.message}`);
    } finally {
      setIsDetectingTelegram(false);
    }
  };

  const handleSaveCustomChatId = async () => {
    if (!customChatIdInput.trim()) return;
    try {
      const data = await safeJsonFetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_chat_id",
          chatId: customChatIdInput.trim(),
        }),
      });
      if (data && data.success) {
        setTelegramChatId(data.chatId);
        setTelegramNotice(`✓ Chat ID saved: ${data.chatId}`);
        setCustomChatIdInput("");
      }
    } catch (err: any) {
      setTelegramNotice(`✗ Error saving chat ID: ${err.message}`);
    }
  };

  const handleSendTestPing = async () => {
    setIsSendingPing(true);
    setTelegramNotice(null);
    try {
      const data = await safeJsonFetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_ping" }),
      });
      if (data && data.success) {
        setTelegramNotice("✓ Test alert sent to Telegram! Check your chat.");
      } else {
        setTelegramNotice(`✗ Failed to send alert: ${data?.error}`);
      }
    } catch (err: any) {
      setTelegramNotice(`✗ Network error: ${err.message}`);
    } finally {
      setIsSendingPing(false);
    }
  };

  // Filtered stories (strictly maintained in descending order)
  const sources = Array.from(new Set(stories.map((s) => s.source))).filter(Boolean);
  const filteredStories = stories.filter((story) => {
    const matchesSearch =
      search === "" ||
      story.title.toLowerCase().includes(search.toLowerCase()) ||
      story.preview.toLowerCase().includes(search.toLowerCase()) ||
      story.source.toLowerCase().includes(search.toLowerCase());

    const matchesSource =
      selectedSource === "all" ||
      story.source.toLowerCase() === selectedSource.toLowerCase();

    return matchesSearch && matchesSource;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans relative">
      {/* In-App Toast Popup for Web Notifications */}
      {activeToast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-slate-950 border border-blue-500/80 rounded-xl p-4 shadow-2xl animate-bounce space-y-1.5 backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-rose-500 animate-ping" />
              {activeToast.title}
            </span>
            <button
              onClick={() => setActiveToast(null)}
              className="text-slate-400 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-slate-200 line-clamp-3 whitespace-pre-line leading-relaxed">
            {activeToast.body}
          </p>
          {activeToast.url && activeToast.url !== "/" && (
            <a
              href={activeToast.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-blue-400 hover:underline inline-flex items-center gap-1 pt-1"
            >
              Open story <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              FF
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
                Forex Factory Scraper
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Next.js 1-Min Cron
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Latest News & Stories • Strict Descending Order
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleManualScrape}
              disabled={isScraping}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium shadow-sm transition"
            >
              {isScraping ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Trigger Scrape Now
                </>
              )}
            </button>
            <button
              onClick={fetchNews}
              title="Refresh local view"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Scrape Notification */}
        {scrapeNotice && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
              scrapeNotice.startsWith("✓")
                ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                : "bg-blue-950/40 border-blue-800 text-blue-300"
            }`}
          >
            {scrapeNotice.startsWith("✓") ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{scrapeNotice}</span>
          </div>
        )}

        {/* WEB NOTIFICATIONS TESTER BANNER */}
        <div className="bg-gradient-to-r from-indigo-950/70 via-slate-900 to-slate-900 border border-indigo-700/50 rounded-xl p-4 sm:p-5 shadow-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 font-semibold text-sm text-white">
                  <span>Web & Desktop Notifications</span>
                  {webNotificationPermission === "granted" ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <Check className="h-2.5 w-2.5" />
                      Browser Notifications Enabled
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Permission: {webNotificationPermission}
                    </span>
                  )}
                  {is10sWebTestActive && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse flex items-center gap-1">
                      <Zap className="h-2.5 w-2.5" />
                      Testing Loop Active ({webTestCount} sent)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Receive instant desktop & PWA push alerts on your screen when new Forex stories drop.
                </p>
              </div>
            </div>

            {/* Web Controls */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {webNotificationPermission !== "granted" && (
                <button
                  onClick={requestWebNotifications}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
                >
                  <Bell className="h-3.5 w-3.5" />
                  Enable Web Alerts
                </button>
              )}

              {/* 10-Second Test Toggle */}
              <button
                onClick={toggle10sWebTest}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  is10sWebTestActive
                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30"
                }`}
              >
                {is10sWebTestActive ? (
                  <>
                    <BellOff className="h-3.5 w-3.5" />
                    Stop 10s Web Test
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5 fill-current" />
                    Test Web Alerts (Every 10s)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Notification Tone Selector Toolbar */}
          <div className="pt-2 border-t border-indigo-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-indigo-400 shrink-0" />
              <span className="text-slate-300 font-medium">Alert Tone:</span>
              <select
                value={selectedTone}
                onChange={(e) => handleToneChange(e.target.value as NotificationTone)}
                className="bg-slate-900 border border-indigo-800/80 rounded-lg px-2.5 py-1 text-xs text-indigo-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer"
              >
                <option value="chime">🔔 Elegant Chime (Default)</option>
                <option value="trader">🚨 Trader Alert (Urgent 3-Beep)</option>
                <option value="glass">💎 Crystal Glass Ping</option>
                <option value="bloomberg">⚡ Bloomberg Terminal Beep</option>
                <option value="pop">🫧 Modern Bubble Pop</option>
                <option value="silent">🔇 Silent (No Sound)</option>
              </select>
            </div>

            <button
              onClick={() => playNotificationTone(selectedTone)}
              disabled={selectedTone === "silent"}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition disabled:opacity-40"
            >
              <Play className="h-3 w-3 fill-current text-indigo-400" />
              Preview Tone
            </button>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-950/50 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
            <span>
              ℹ️ <b>Web Only Testing:</b> When testing is activated, alerts with your chosen tone play strictly on your browser every 10 seconds. Telegram notifications remain <b>silent</b> and will only alert on genuine new Forex news.
            </span>
          </div>
        </div>

        {/* Telegram Notifications Integration Banner */}
        <div className="bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-900 border border-blue-800/40 rounded-xl p-4 sm:p-5 shadow-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 font-semibold text-sm text-white">
                  <span>Telegram Alerts</span>
                  <a
                    href="https://t.me/demoooforexBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-blue-400 hover:underline flex items-center gap-1"
                  >
                    @demoooforexBot
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {telegramChatId ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <Check className="h-2.5 w-2.5" />
                      Connected (ID: {telegramChatId})
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Not Linked Yet
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>
                    Zero-Spam Active: Instant notifications fire <b>only</b> for newly published stories in descending order. Existing news is never re-alerted.
                  </span>
                </p>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={handleAutoDetectTelegram}
                disabled={isDetectingTelegram}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition"
              >
                <Bell className="h-3.5 w-3.5" />
                {isDetectingTelegram ? "Detecting..." : "Connect / Detect Chat"}
              </button>

              {telegramChatId && (
                <button
                  onClick={handleSendTestPing}
                  disabled={isSendingPing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                >
                  <Send className="h-3.5 w-3.5 text-blue-400" />
                  {isSendingPing ? "Sending..." : "Send Test Alert"}
                </button>
              )}
            </div>
          </div>

          {/* Telegram Linking Notice */}
          {telegramNotice && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                telegramNotice.startsWith("✓")
                  ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-300"
                  : "bg-amber-950/40 border-amber-800/80 text-amber-300"
              }`}
            >
              {telegramNotice.startsWith("✓") ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{telegramNotice}</span>
            </div>
          )}
        </div>

        {/* Status & Cron Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Cron Schedule</span>
              <Clock className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <div className="text-lg font-semibold text-white">
              {meta?.cronSchedule || "* * * * *"}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Runs automatically every 1 min
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Last Scraped</span>
              <Calendar className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <div className="text-lg font-semibold text-white">
              {meta?.lastRunAt
                ? new Date(meta.lastRunAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "Not yet"}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {meta?.lastRunAt
                ? new Date(meta.lastRunAt).toLocaleDateString()
                : "Waiting for first run"}
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Archived</span>
              <Newspaper className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <div className="text-lg font-semibold text-white">
              {stories.length} stories
            </div>
            <div className="text-[11px] text-emerald-400 mt-1">
              +{meta?.newStoriesLastRun ?? 0} new on last cycle
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Sort Order</span>
              <ArrowDownWideNarrow className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <div className="text-lg font-semibold text-white">Descending</div>
            <div className="text-[11px] text-slate-400 mt-1">
              Newest published on top
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search headline, text, or source..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Sources ({stories.length})</option>
              {sources.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* The Forex Factory Widget Replica (News / Latest Stories) */}
        <div className="rounded-xl overflow-hidden border border-slate-700/80 shadow-2xl bg-slate-900">
          {/* Forex Factory Classic Widget Header */}
          <div className="bg-[#2c4e78] text-white px-4 py-2.5 flex items-center justify-between border-b border-blue-900/60">
            <div className="flex items-center gap-2 font-bold text-sm tracking-wide">
              <span>News / Latest Stories</span>
              <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-200 border border-blue-400/30">
                Descending Order
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-blue-200">
              <span className="flex items-center gap-1 text-[11px]">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Live Stream
              </span>
            </div>
          </div>

          {/* Stories List */}
          {loading && stories.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-400" />
              Loading latest news stories...
            </div>
          ) : filteredStories.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              No news stories match your filter criteria.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {filteredStories.map((story, index) => (
                <article
                  key={story.id}
                  className="p-4 hover:bg-slate-800/40 transition group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1.5">
                      {/* Title & Document Icon */}
                      <div className="flex items-start gap-2">
                        <span className="mt-1 text-slate-500 text-xs font-mono shrink-0">
                          #{index + 1}
                        </span>
                        <Newspaper className="h-4 w-4 mt-0.5 text-blue-400 shrink-0" />
                        <a
                          href={story.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-sm sm:text-base text-blue-300 hover:text-blue-200 hover:underline leading-snug flex items-center gap-1.5"
                        >
                          {story.title}
                          <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition text-slate-400 shrink-0" />
                        </a>
                      </div>

                      {/* Metadata bar: Source, Time, Comments */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400 pl-6">
                        {story.source && (
                          <a
                            href={story.sourceUrl || story.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-300 hover:text-blue-300 hover:underline font-medium"
                          >
                            From {story.source}
                          </a>
                        )}

                        <span className="text-slate-600">•</span>

                        <span className="inline-flex items-center gap-1 text-slate-300">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {story.timeAgo ||
                            new Date(story.publishedAt).toLocaleTimeString()}
                        </span>

                        {story.commentsText && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <MessageSquare className="h-3 w-3" />
                              {story.commentsText}
                            </span>
                          </>
                        )}

                        <span className="text-slate-600">•</span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          ID: {story.numericId}
                        </span>
                      </div>

                      {/* Preview Text */}
                      {story.preview && (
                        <p className="text-xs text-slate-300/90 pl-6 pt-1 leading-relaxed line-clamp-3">
                          {story.preview}
                        </p>
                      )}
                    </div>

                    {/* Thumbnail Image if present */}
                    {story.image && (
                      <div className="shrink-0 w-20 h-16 sm:w-24 sm:h-20 rounded-lg overflow-hidden bg-slate-800 border border-slate-700/60">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={story.image}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Widget Footer */}
          <div className="bg-slate-950/60 px-4 py-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing {filteredStories.length} of {stories.length} items (Newest first)
            </span>
            <a
              href="https://www.forexfactory.com/news"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline flex items-center gap-1"
            >
              View More on ForexFactory.com
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
