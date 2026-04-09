"use client";

import { useState, useRef, useEffect } from "react";
import { BACKEND_URL } from "../lib/config";

interface Message {
  role: "user" | "assistant";
  content: string;
  nodeIds?: string[];
  pages?: number[];
  reasoning?: string;
}

interface ChatPanelProps {
  docId: string | null;
  docName?: string | null;
  onNavigate: (page: number, nodeIds: string[]) => void;
  apiKey?: string;
}

export default function ChatPanel({ docId, docName, onNavigate, apiKey }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || !docId || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ doc_id: docId, question: q }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Request failed");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          nodeIds: data.node_ids,
          pages: data.relevant_pages,
          reasoning: data.reasoning,
        },
      ]);

      // Navigate to first relevant page
      if (data.relevant_pages?.length > 0) {
        onNavigate(data.relevant_pages[0], data.node_ids ?? []);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-t border-gray-200">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-sm font-semibold text-gray-700 truncate">
          {docName ? `「${docName.replace(/\.pdf$/i, "")}」에 대해 질문하기` : "문서 질문"}
        </span>
        {!docId && (
          <span className="text-xs text-gray-400 ml-auto">PDF를 먼저 업로드하세요</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400">
              {docId
                ? "문서에 대해 질문해보세요"
                : "PDF를 먼저 처리해야 채팅이 가능합니다"}
            </p>
            {docId && (
              <div className="mt-3 flex flex-wrap gap-2 justify-center">
                {["이 문서는 어떤 내용인가요?", "핵심 내용을 요약해주세요", "주요 섹션은 무엇인가요?"].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="text-xs px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-tr-sm"
                  : "bg-gray-100 text-gray-800 rounded-tl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {/* Source navigation */}
              {msg.role === "assistant" && msg.pages && msg.pages.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">참조 페이지:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.pages.map((page) => (
                      <button
                        key={page}
                        onClick={() => onNavigate(page, msg.nodeIds ?? [])}
                        className="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded-full hover:bg-blue-50 hover:border-blue-300 text-gray-600 hover:text-blue-600 transition-colors"
                      >
                        p.{page}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!docId || loading}
            placeholder={docId ? "질문을 입력하세요... (Enter로 전송)" : "PDF를 먼저 처리하세요"}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400 max-h-32 overflow-y-auto"
            style={{ height: "auto" }}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 128) + "px";
            }}
          />
          <button
            onClick={handleSend}
            disabled={!docId || !input.trim() || loading}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
