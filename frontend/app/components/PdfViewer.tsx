"use client";

import { useEffect, useRef, useState } from "react";

interface PdfViewerProps {
  pdfUrl: string | null;
  targetPage: number;
  onPageChange: (page: number) => void;
  onPdfUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isProcessing?: boolean;
}

export default function PdfViewer({
  pdfUrl,
  targetPage,
  onPageChange,
  onPdfUpload,
  isProcessing = false,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const renderTaskRef = useRef<any>(null);

  // Load PDF.js dynamically
  useEffect(() => {
    const loadPdfJs = async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    };
    loadPdfJs();
  }, []);

  // Load PDF when URL changes
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    let loadingTask: any = null;
    const loadPdf = async () => {
      setLoading(true);
      try {
        const pdfjsLib = await import("pdfjs-dist");
        loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          cMapUrl: "/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/standard_fonts/",
        });
        const doc = await loadingTask.promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        setPdfDoc((prev: any) => {
          if (prev && typeof prev.destroy === "function") prev.destroy();
          return doc;
        });
        setNumPages(doc.numPages);
        setCurrentPage(1);
      } catch (err) {
        if (!cancelled) console.error("Failed to load PDF:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadPdf();
    return () => {
      cancelled = true;
      if (loadingTask && typeof loadingTask.destroy === "function") {
        try { loadingTask.destroy(); } catch {}
      }
    };
  }, [pdfUrl]);

  // Destroy PDF doc on unmount
  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
      setPdfDoc((prev: any) => {
        if (prev && typeof prev.destroy === "function") prev.destroy();
        return null;
      });
    };
  }, []);

  // Jump to target page when it changes
  useEffect(() => {
    if (targetPage > 0 && targetPage !== currentPage) {
      setCurrentPage(targetPage);
    }
  }, [targetPage]);

  // Render page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      // Cancel any ongoing render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      setLoading(true);
      try {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderTask = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        onPageChange(currentPage);
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error("Render error:", err);
        }
      } finally {
        setLoading(false);
      }
    };

    renderPage();
  }, [pdfDoc, currentPage, scale]);

  const goToPrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNext = () => setCurrentPage((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(3, s + 0.2));
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.2));

  const handlePageInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const val = parseInt((e.target as HTMLInputElement).value);
      if (!isNaN(val) && val >= 1 && val <= numPages) {
        setCurrentPage(val);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-2">
          {/* PDF upload */}
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={onPdfUpload}
            />
            <span className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${isProcessing ? "bg-amber-500 text-white cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Load PDF
                </>
              )}
            </span>
          </label>
        </div>

        {pdfDoc && (
          <div className="flex items-center gap-3">
            {/* Page navigation */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={goToPrev}
                disabled={currentPage <= 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex items-center gap-1 text-sm text-gray-600">
                <input
                  type="number"
                  defaultValue={currentPage}
                  key={currentPage}
                  onKeyDown={handlePageInput}
                  className="w-12 text-center border border-gray-200 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  min={1}
                  max={numPages}
                />
                <span className="text-gray-400">/ {numPages}</span>
              </div>

              <button
                onClick={goToNext}
                disabled={currentPage >= numPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Divider */}
            <div className="h-5 w-px bg-gray-200" />

            {/* Zoom controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={zoomOut}
                className="p-1.5 rounded hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="text-sm text-gray-500 w-12 text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={zoomIn}
                className="p-1.5 rounded hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PDF Canvas area */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        {pdfUrl ? (
          <div className="flex justify-center py-6 px-4 min-h-full">
            <div className="relative">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-70 z-10 rounded">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <canvas
                ref={canvasRef}
                className="shadow-lg rounded bg-white"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-base font-medium text-gray-500 mb-1">No PDF loaded</h3>
            <p className="text-sm text-gray-400">Click "Load PDF" to open a PDF file</p>
          </div>
        )}
      </div>
    </div>
  );
}
