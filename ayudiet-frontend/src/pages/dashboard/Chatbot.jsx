import { useEffect, useMemo, useRef, useState } from "react";
import { chatWithBackend } from "../../services/plan.service";
import BackNavLink from "../../components/common/BackNavLink";

const CHATBOT_HISTORY_KEY = "dashboard:chatbot:history";
const CHATBOT_SESSION_KEY = "dashboard:chatbot:session";
const BOT_GREETING =
  "Hello Doctor. I am here to support your clinical decision-making. Please ask any question, and I will respond clearly.";
const AI_REPLY_TIMEOUT_MS = 20000;

const defaultMessages = [{ id: 1, role: "assistant", text: BOT_GREETING }];

const buildLocalBotReply = (message = "") => {
  const input = String(message || "").toLowerCase();
  const compact = input.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

  if (["hi", "hii", "hello", "hey", "yo"].includes(compact)) {
    return "Hello Doctor. Please share your concern, and I will assist you step by step.";
  }

  if (compact.includes("who are you")) {
    return "I am your AyuDiet assistant. I can help with patient follow-up decisions, plan changes, and interpretation of progress signals.";
  }

  if (
    compact.includes("best one") ||
    compact.includes("are u best") ||
    compact.includes("are you best")
  ) {
    return "I am designed to provide clear and practical clinical guidance. You may ask about workflows, plan decisions, or patient communication.";
  }

  if (compact.includes("speciality") || compact.includes("specialty")) {
    return "My specialty is helping doctors with nutrition follow-ups: adherence problems, symptom pattern review, digestion/energy trends, and next-step planning.";
  }

  if (
    compact.includes("today date") ||
    compact.includes("todays date") ||
    compact.includes("what is date") ||
    compact === "date"
  ) {
    return `Today's date is ${new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })}.`;
  }

  if (compact.includes("thank")) {
    return "You are welcome. Please share the next case whenever you are ready.";
  }

  if (input.includes("adherence")) {
    return "For low adherence, start small: simplify meals, reduce prep steps, and keep fixed timings for one week before making bigger changes.";
  }

  if (input.includes("digestion")) {
    return "For digestion issues, keep meals warm and cooked, avoid heavy late dinners, and watch digestion detail daily so we can find patterns.";
  }

  if (input.includes("weight")) {
    return "For weight analysis, compare 7-day trend with same-time measurements instead of reacting to one-day fluctuation.";
  }

  if (input.includes("trend") || input.includes("stable")) {
    return "If trend is stable but symptoms are high, check adherence quality, digestion detail, sleep, and stress before changing the whole plan.";
  }

  if (input.includes("plan")) {
    return "Before updating an active plan, review effectiveness trend, primary issue, and latest logs. Usually one focused change works better than many changes together.";
  }

  if (input.includes("patient")) {
    return "For patient decisions, check latest logs first, identify one dominant issue, then pick one targeted intervention and re-evaluate in a few days.";
  }

  return "I understand. Share patient goal, key symptoms, and recent adherence/energy/digestion values. I will suggest a clear next step.";
};

const withTimeout = (promise, timeoutMs) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AI response timeout")), timeoutMs)
    ),
  ]);

const buildAssistantReply = async (message, sessionId) => {
  try {
    let response = await withTimeout(chatWithBackend({ message, sessionId }), AI_REPLY_TIMEOUT_MS);

    // One retry for slow cold starts on hosted LLM services.
    if (!String(response?.reply || "").trim()) {
      response = await withTimeout(chatWithBackend({ message, sessionId }), AI_REPLY_TIMEOUT_MS);
    }

    const reply = String(response?.reply || "").trim();
    return {
      text: reply || buildLocalBotReply(message),
      sessionId: response?.sessionId || sessionId || null,
    };
  } catch {
    return {
      text: buildLocalBotReply(message),
      sessionId: sessionId || null,
    };
  }
};

function Chatbot() {
  const [message, setMessage] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [sessionId, setSessionId] = useState(() => {
    try {
      const existing = localStorage.getItem(CHATBOT_SESSION_KEY);
      return existing || `session_${Date.now()}`;
    } catch {
      return `session_${Date.now()}`;
    }
  });
  const [messages, setMessages] = useState(() => {
    try {
      const raw = localStorage.getItem(CHATBOT_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) && parsed.length ? parsed : defaultMessages;
    } catch {
      return defaultMessages;
    }
  });
  const nextIdRef = useRef(2);
  const scrollAnchorRef = useRef(null);
  const canSend = useMemo(() => Boolean(message.trim()) && !isThinking, [message, isThinking]);

  useEffect(() => {
    try {
      localStorage.setItem(CHATBOT_SESSION_KEY, sessionId);
    } catch {
      // Ignore storage failures
    }
  }, [sessionId]);

  useEffect(() => {
    try {
      localStorage.setItem(CHATBOT_HISTORY_KEY, JSON.stringify(messages));
    } catch {
      // Ignore storage failures
    }
  }, [messages]);

  useEffect(() => {
    const maxId = messages.reduce((max, item) => {
      const value = Number(item?.id);
      return Number.isFinite(value) && value > max ? value : max;
    }, 0);
    nextIdRef.current = Math.max(maxId + 1, 2);
  }, [messages]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isThinking]);

  const sendMessage = async (rawText) => {
    const trimmed = String(rawText || "").trim();
    if (!trimmed || isThinking) return;

    const userMessage = {
      id: nextIdRef.current++,
      role: "user",
      text: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setMessage("");
    setIsThinking(true);

    const { text: reply, sessionId: nextSessionId } = await buildAssistantReply(
      trimmed,
      sessionId
    );
    if (nextSessionId && nextSessionId !== sessionId) {
      setSessionId(nextSessionId);
    }
    const botMessage = {
      id: nextIdRef.current++,
      role: "assistant",
      text: reply,
    };
    setMessages((current) => [...current, botMessage]);
    setIsThinking(false);
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(message);
    }
  };

  const clearChat = () => {
    setMessages(defaultMessages);
    setMessage("");
    setIsThinking(false);
    const freshSessionId = `session_${Date.now()}`;
    setSessionId(freshSessionId);
    try {
      localStorage.removeItem(CHATBOT_HISTORY_KEY);
      localStorage.setItem(CHATBOT_SESSION_KEY, freshSessionId);
    } catch {
      // Ignore storage failures
    }
  };

  return (
    <div className="space-y-5">
      <BackNavLink to="/dashboard" label="Back to Dashboard" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            Clinical Assistant
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">AyuDiet Chat</h1>
          <p className="mt-1 text-sm text-gray-600">
            Ask in natural language. The assistant will provide clear, conversational guidance for your next clinical action.
          </p>
        </div>
        <button
          type="button"
          onClick={clearChat}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 transition hover:bg-black hover:text-white"
        >
          Clear Chat
        </button>
      </div>

      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md">
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-gray-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Assistant is ready.
          </div>
        </div>

        <div className="h-[52vh] space-y-4 overflow-y-auto bg-white p-5 sm:h-[58vh]">
          {messages.map((item) => {
            const isUser = item.role === "user";
            return (
              <div key={item.id} className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                {!isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                    AI
                  </div>
                )}
                <div
                  className={`max-w-[92%] break-words rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] ${
                    isUser
                      ? "bg-gray-900 text-white"
                      : "border border-gray-200 bg-white text-gray-800 shadow-sm"
                  }`}
                >
                  {item.text}
                </div>
                {isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                    DR
                  </div>
                )}
              </div>
            );
          })}

          {isThinking && (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                AI
              </div>
              <div className="inline-flex max-w-[85%] items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 shadow-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                Processing your query...
              </div>
            </div>
          )}

          <div ref={scrollAnchorRef} />
        </div>

        <div className="border-t border-gray-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            className="w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-400"
            placeholder="Type naturally, for example: Doctor, patient is improving in weight but symptoms are still high, what should I do?"
          />
          <button
            type="button"
            onClick={() => sendMessage(message)}
            disabled={!canSend}
            className="w-full rounded-md bg-yellow-400 px-6 py-3 text-sm font-semibold text-black transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            Send
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

export default Chatbot;
