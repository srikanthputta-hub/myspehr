import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, UserRound } from "lucide-react";
import { sectionColors } from "@/components/spehr-ui";
import { useProviders } from "@/features/providers";
import { useActiveMrn } from "@/features/_shared/use-active-mrn";
import { CHAT_STORAGE_PREFIX } from "@/lib/chat-storage";

export const Route = createFileRoute("/messages/$providerId")({
  head: () => ({ meta: [{ title: "Chat — My SPEHR Link" }] }),
  component: ChatPage,
});

interface ChatMsg {
  id: string;
  from: "patient" | "provider";
  text: string;
  at: string;
}

function loadChat(key: string): ChatMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as ChatMsg[]) : [];
  } catch {
    return [];
  }
}

function saveChat(key: string, msgs: ChatMsg[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAT_STORAGE_PREFIX + key, JSON.stringify(msgs));
  } catch {
    /* ignore */
  }
}

function ChatPage() {
  const { providerId } = Route.useParams();
  const { providers } = useProviders();
  const mrn = useActiveMrn();
  const provider = providers.find((p) => p.id === providerId);
  const storageKey = `${mrn ?? "anon"}:${providerId}`;

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadChat(storageKey));
  }, [storageKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const next: ChatMsg[] = [
      ...messages,
      { id: crypto.randomUUID(), from: "patient", text, at: new Date().toISOString() },
    ];
    setMessages(next);
    saveChat(storageKey, next);
    setDraft("");
  };

  return (
    <main className="flex flex-col h-[100dvh] bg-background">
      <header
        className="px-4 py-3 flex items-center gap-3 border-b border-white/[0.06] text-primary-foreground"
        style={{ background: "var(--gradient-hero)" }}
      >
        <Link to="/messages" className="p-1 -ml-1 text-white/80 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div
          className="w-9 h-9 rounded-xl shrink-0 grid place-items-center"
          style={{
            backgroundColor: `color-mix(in oklab, ${sectionColors.records} 22%, transparent)`,
            border: `1px solid color-mix(in oklab, ${sectionColors.records} 35%, transparent)`,
          }}
        >
          <UserRound className="w-4 h-4" style={{ color: sectionColors.records }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate text-white">
            {provider?.name ?? "Provider"}
          </p>
          {provider?.role && (
            <p className="text-[11px] text-white/60 truncate">{provider.role}</p>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200/90">
          <span className="font-semibold">Coming soon:</span> two-way secure messaging with your
          care team. Messages you send here are stored locally on this device only and are not
          yet delivered to your provider.
        </div>
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground mt-8">
            Start the conversation with {provider?.name ?? "your provider"}.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.from === "patient" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                  m.from === "patient"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-white/[0.06] text-foreground"
                }`}
              >
                <p>{m.text}</p>
                <p
                  className={`text-[10px] mt-1 ${
                    m.from === "patient" ? "text-primary-foreground/70" : "text-muted-foreground"
                  }`}
                >
                  {new Date(m.at).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-white/[0.06] bg-card px-3 py-3 flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 h-11 px-4 rounded-full bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="h-11 w-11 grid place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </main>
  );
}
