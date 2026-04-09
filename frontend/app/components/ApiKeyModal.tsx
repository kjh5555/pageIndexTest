"use client";

import { useState, useEffect } from "react";

interface ApiKeyModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (key: string) => void;
  currentKey: string;
}

export default function ApiKeyModal({ open, onClose, onSave, currentKey }: ApiKeyModalProps) {
  const [value, setValue] = useState(currentKey);

  useEffect(() => {
    setValue(currentKey);
  }, [currentKey, open]);

  if (!open) return null;

  const handleSave = () => {
    onSave(value.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-800">API Key Settings</h2>
            <p className="text-xs text-gray-400">Google Gemini API Key</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            GEMINI_API_KEY
          </label>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="AIza..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            autoFocus
          />
          <p className="text-xs text-gray-400 mt-1.5">
            Get your key at{" "}
            <span className="text-blue-500">aistudio.google.com/apikey</span>
            {" "}· Stored in browser only
          </p>
        </div>

        {currentKey && (
          <div className="flex items-center gap-1.5 mb-4 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            API key is set
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
