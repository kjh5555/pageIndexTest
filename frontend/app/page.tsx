"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Sidebar, { BuildingNode } from "./components/Sidebar";
import PdfViewer from "./components/PdfViewer";
import ChatPanel from "./components/ChatPanel";
import ApiKeyModal from "./components/ApiKeyModal";
import { PageIndexDocument } from "@/types";

import { BACKEND_URL as BACKEND } from "@/app/lib/config";
const API_KEY_STORAGE = "pageindex_api_key";
const API_PROVIDER_STORAGE = "pageindex_provider";
const API_MODEL_STORAGE = "pageindex_model";

export default function Home() {
  const [document, setDocument] = useState<PageIndexDocument | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiProvider, setApiProvider] = useState("gemini");
  const [apiModel, setApiModel] = useState("gemini/gemini-2.5-flash");
  const [showApiModal, setShowApiModal] = useState(false);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [targetPage, setTargetPage] = useState(0);

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);

  const [buildingNodes, setBuildingNodes] = useState<BuildingNode[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);

  const sseRef = useRef<EventSource | null>(null);
  const apiKeyRef = useRef<string>("");
  const apiModelRef = useRef<string>("gemini/gemini-2.5-flash");

  // Load API key/provider/model from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE);
    if (stored) { setApiKey(stored); apiKeyRef.current = stored; }
    const storedProvider = localStorage.getItem(API_PROVIDER_STORAGE);
    if (storedProvider) setApiProvider(storedProvider);
    const storedModel = localStorage.getItem(API_MODEL_STORAGE);
    if (storedModel) { setApiModel(storedModel); apiModelRef.current = storedModel; }
  }, []);

  const handleSaveApiKey = useCallback((key: string, provider: string, model: string) => {
    setApiKey(key);
    apiKeyRef.current = key;
    setApiProvider(provider);
    setApiModel(model);
    apiModelRef.current = model;
    localStorage.setItem(API_KEY_STORAGE, key);
    localStorage.setItem(API_PROVIDER_STORAGE, provider);
    localStorage.setItem(API_MODEL_STORAGE, model);
  }, []);

  const apiHeaders = useCallback(
    (): Record<string, string> =>
      apiKeyRef.current ? { "x-api-key": apiKeyRef.current } : {},
    []
  );

  const handlePdfUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      if (!apiKeyRef.current) {
        alert("API 키를 먼저 설정하고 검증해주세요.\n우측 상단 'Set API Key' 버튼을 눌러주세요.");
        return;
      }

      const url = URL.createObjectURL(file);
      setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      setTargetPage(1);
      setActivePage(1);
      setDocument(null);
      setDocId(null);
      setBuildingNodes([]);
      setActiveNodeId(null);
      setHighlightedNodeIds([]);
      setIsProcessing(true);
      setIsBuilding(true);
      setBuildStatus("Uploading PDF...");

      const form = new FormData();
      form.append("file", file);
      let newDocId: string;
      try {
        if (apiModelRef.current) form.append("model", apiModelRef.current);
        const res = await fetch(`${BACKEND}/api/process`, { method: "POST", body: form, headers: apiHeaders() });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        newDocId = data.doc_id;
        setDocId(newDocId);
      } catch (err: any) {
        setIsProcessing(false);
        setIsBuilding(false);
        setBuildStatus("");
        alert(
          "Backend error: " + err.message +
          "\n\nMake sure the backend is running:\ncd PageIndex && python3 -m backend.main"
        );
        return;
      }

      sseRef.current?.close();
      const keyParam = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : "";
      const es = new EventSource(`${BACKEND}/api/progress/${newDocId}${keyParam}`);
      sseRef.current = es;

      es.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "status") {
          setBuildStatus(msg.message);
        } else if (msg.type === "start") {
          setBuildStatus(`Building tree (${msg.total} sections found)...`);
        } else if (msg.type === "node") {
          setBuildingNodes((prev) => [...prev, msg.node as BuildingNode]);
        } else if (msg.type === "complete") {
          setIsBuilding(false);
          setIsProcessing(false);
          setBuildStatus("Complete!");
          es.close();
          fetch(`${BACKEND}/api/structure/${newDocId}`, { headers: apiHeaders() })
            .then((r) => {
              if (!r.ok) throw new Error(`Structure fetch failed: ${r.status}`);
              return r.json();
            })
            .then((data) => {
              if (data?.structure?.length > 0) {
                setDocument({ doc_name: data.doc_name, structure: data.structure });
                setBuildingNodes([]);
              } else {
                setBuildStatus("Warning: Empty structure returned");
              }
            })
            .catch((err) => {
              console.error("Failed to load structure:", err);
              setBuildStatus("Error loading structure: " + err.message);
              // Keep buildingNodes visible as fallback
            });
        } else if (msg.type === "error") {
          setIsBuilding(false);
          setIsProcessing(false);
          setBuildStatus("Error: " + msg.message);
          es.close();
        }
      };

      es.onerror = () => {
        setIsBuilding(false);
        setIsProcessing(false);
        es.close();
      };
    },
    []
  );

  const handleJsonUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          setDocument(data);
          setBuildingNodes([]);
          setActiveNodeId(null);
          setHighlightedNodeIds([]);
        } catch {
          alert("Invalid JSON file");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    []
  );

  const handlePageSelect = useCallback((page: number, nodeId: string) => {
    setTargetPage(page);
    setActiveNodeId(nodeId);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setActivePage(page);
  }, []);

  const handleDownloadJson = useCallback(() => {
    if (!document) return;
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = document.doc_name.replace(/\.pdf$/i, "_structure.json");
    a.click();
    URL.revokeObjectURL(url);
  }, [document]);

  const handleChatNavigate = useCallback((page: number, nodeIds: string[]) => {
    setTargetPage(page);
    setHighlightedNodeIds(nodeIds);
  }, []);

  const docName = document?.doc_name ?? (isBuilding || buildingNodes.length > 0 ? "Processing..." : null);

  return (
    <div className="flex flex-col h-full bg-white">
      <ApiKeyModal
        open={showApiModal}
        onClose={() => setShowApiModal(false)}
        onSave={handleSaveApiKey}
        currentKey={apiKey}
        currentProvider={apiProvider}
        currentModel={apiModel}
      />
      <header className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span className="font-semibold text-gray-800">PageIndex Viewer</span>
        </div>

        {docName && (
          <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200">
            <span className="text-sm text-gray-500 truncate max-w-xs">{docName}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* API Key button */}
          <button
            onClick={() => setShowApiModal(true)}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
              apiKey ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-red-50 text-red-600 hover:bg-red-100"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            {apiKey ? "API Key ✓" : "Set API Key"}
          </button>

          {/* Chat toggle */}
          <button
            onClick={() => setChatOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
              chatOpen ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Chat
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 flex-shrink-0 overflow-hidden">
          <Sidebar
            document={document}
            buildingNodes={buildingNodes}
            isBuilding={isBuilding}
            buildStatus={buildStatus}
            activePage={activePage}
            activeNodeId={activeNodeId}
            highlightedNodeIds={highlightedNodeIds}
            onPageSelect={handlePageSelect}
            onJsonUpload={handleJsonUpload}
            onDownloadJson={handleDownloadJson}
          />
        </div>

        <div className="flex-1 flex flex-row overflow-hidden">
          <div className={chatOpen ? "w-[60%] overflow-hidden" : "flex-1 overflow-hidden"}>
            <PdfViewer
              pdfUrl={pdfUrl}
              targetPage={targetPage}
              onPageChange={handlePageChange}
              onPdfUpload={handlePdfUpload}
              isProcessing={isProcessing}
            />
          </div>

          {chatOpen && (
            <div className="w-[40%] flex-shrink-0 border-l border-gray-200 overflow-hidden">
              <ChatPanel docId={docId} docName={document?.doc_name ?? null} onNavigate={handleChatNavigate} apiKey={apiKey} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
