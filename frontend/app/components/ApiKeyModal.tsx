"use client";

import { useState, useEffect } from "react";

const MODELS: Record<string, { label: string; value: string }[]> = {
  gemini: [
    { label: "Gemini 2.5 Flash (추천)", value: "gemini/gemini-2.5-flash" },
    { label: "Gemini 2.5 Pro", value: "gemini/gemini-2.5-pro" },
  ],
  openai: [
    { label: "GPT-4o", value: "gpt-4o" },
    { label: "GPT-4o Mini (추천)", value: "gpt-4o-mini" },
    { label: "GPT-4 Turbo", value: "gpt-4-turbo" },
    { label: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" },
  ],
};

interface ApiKeyModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (key: string, provider: string, model: string) => void;
  currentKey?: string;
  currentProvider?: string;
  currentModel?: string;
}

export default function ApiKeyModal({
  open,
  onClose,
  onSave,
  currentKey = "",
  currentProvider = "gemini",
  currentModel = "gemini/gemini-2.5-flash",
}: ApiKeyModalProps) {
  const [provider, setProvider] = useState(currentProvider);
  const [model, setModel] = useState(currentModel);
  const [key, setKey] = useState(currentKey);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (open) {
      setProvider(currentProvider);
      setModel(currentModel);
      setKey(currentKey);
      setValidationResult(null);
    }
  }, [open, currentKey, currentProvider, currentModel]);

  // When provider changes, reset model to first option
  const handleProviderChange = (p: string) => {
    setProvider(p);
    setModel(MODELS[p][0].value);
    setValidationResult(null);
  };

  const handleValidate = async () => {
    if (!key.trim()) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch("http://localhost:8000/api/validate-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key.trim(),
        },
        body: JSON.stringify({ provider, model }),
      });
      const data = await res.json();
      if (data.valid) {
        setValidationResult({ ok: true, msg: "유효한 API 키입니다." });
      } else {
        setValidationResult({ ok: false, msg: data.error || "유효하지 않은 키입니다." });
      }
    } catch (e: any) {
      setValidationResult({ ok: false, msg: "검증 중 오류: " + e.message });
    } finally {
      setValidating(false);
    }
  };

  const handleSave = () => {
    onSave(key.trim(), provider, model);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">API 키 설정</h2>
          <p className="text-xs text-gray-500 mt-0.5">PDF 처리 및 채팅에 사용할 API 키를 설정하세요</p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Provider selection */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">제공사</label>
            <div className="flex gap-2">
              {[
                { id: "gemini", label: "Google Gemini" },
                { id: "openai", label: "OpenAI" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    provider === p.id
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model selection */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">모델</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {MODELS[provider].map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* API Key input */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">API 키</label>
            <input
              type="password"
              value={key}
              onChange={(e) => { setKey(e.target.value); setValidationResult(null); }}
              placeholder={provider === "gemini" ? "AIza..." : "sk-..."}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
            />
          </div>

          {/* Validate button + result */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleValidate}
              disabled={!key.trim() || validating}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {validating ? "검증 중..." : "키 검증"}
            </button>
            {validationResult && (
              <span className={`text-xs font-medium ${validationResult.ok ? "text-green-600" : "text-red-500"}`}>
                {validationResult.ok ? "✓ " : "✗ "}{validationResult.msg}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!key.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
