"use client";

import { PageIndexDocument, PageNode } from "@/types";
import TreeNode from "./TreeNode";

export interface BuildingNode extends PageNode {
  depth: number;
  has_children: boolean;
  animating?: boolean;
}

interface DocListItem {
  doc_id: string;
  doc_name: string;
  page_count: number;
}

interface SidebarProps {
  document: PageIndexDocument | null;
  buildingNodes: BuildingNode[];
  isBuilding: boolean;
  buildStatus: string;
  activePage: number;
  activeNodeId: string | null;
  highlightedNodeIds: string[];
  onPageSelect: (page: number, nodeId: string) => void;
  onDownloadJson?: () => void;
  docList?: DocListItem[];
  currentDocId?: string | null;
  onLoadDocument?: (docId: string) => void;
  hasText?: boolean;
}

export default function Sidebar({
  document,
  buildingNodes,
  isBuilding,
  buildStatus,
  activePage,
  activeNodeId,
  highlightedNodeIds,
  onPageSelect,
  onDownloadJson,
  docList = [],
  currentDocId,
  onLoadDocument,
  hasText = true,
}: SidebarProps) {
  const showBuilding = isBuilding || (buildingNodes.length > 0 && !document);

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Structure
          </h2>
          {!showBuilding && (
            <div className="flex items-center gap-1">
              {document && onDownloadJson && (
                <button
                  onClick={onDownloadJson}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
                  title="Download structure JSON"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  JSON
                </button>
              )}
            </div>
          )}
        </div>

        {(document || showBuilding) && (
          <div className="bg-gray-50 rounded-md px-3 py-2">
            <p className="text-xs text-gray-400 mb-0.5">Document</p>
            <p className="text-sm font-medium text-gray-700 truncate">
              {document?.doc_name ?? buildingNodes[0]?.title ?? "Processing..."}
            </p>
            {isBuilding && (
              <div className="flex items-center gap-2 mt-1.5">
                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <p className="text-xs text-blue-500 truncate">{buildStatus}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scanned PDF warning */}
      {!hasText && !isBuilding && (document || buildingNodes.length > 0) && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-start gap-2">
          <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>이미지 기반 PDF입니다. 텍스트를 추출할 수 없어 요약이 제공되지 않습니다.</span>
        </div>
      )}

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto p-2">
        {document ? (
          /* Normal mode: full document loaded */
          document.structure.map((node) => (
            <TreeNode
              key={node.node_id}
              node={node}
              depth={0}
              activePage={activePage}
              onPageSelect={onPageSelect}
              activeNodeId={activeNodeId}
              highlightedNodeIds={highlightedNodeIds}
            />
          ))
        ) : showBuilding ? (
          /* Building mode: nodes streaming in */
          <div className="space-y-0.5">
            {buildingNodes.map((node, i) => (
              <div
                key={`${node.node_id}-${i}`}
                className="animate-fadeSlideIn"
                style={{ animationDelay: "0ms" }}
              >
                <div
                  className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer ${
                    node.depth === 0
                      ? "bg-blue-50 border border-blue-100 hover:bg-blue-100"
                      : "hover:bg-gray-50"
                  }`}
                  style={{ paddingLeft: `${node.depth * 14 + 8}px` }}
                  onClick={() => onPageSelect(node.start_index, node.node_id)}
                >
                  {node.has_children && (
                    <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                  {!node.has_children && <div className="w-3 h-3 flex-shrink-0" />}
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${node.depth === 0 ? "font-medium text-blue-700" : "text-gray-600"}`}>
                      {node.title}
                    </span>
                    <span className="flex-shrink-0 text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      p.{node.start_index}{node.start_index !== node.end_index ? `–${node.end_index}` : ""}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {isBuilding && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                <span>Discovering sections...</span>
              </div>
            )}
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">
              PDF를 업로드하면 자동으로 구조를 분석합니다
            </p>
          </div>
        )}
      </div>
      {/* Document history */}
      {docList.length > 0 && (
        <div className="flex-shrink-0 border-t border-gray-100">
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">처리된 문서</p>
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {docList.map((item) => (
                <button
                  key={item.doc_id}
                  onClick={() => onLoadDocument?.(item.doc_id)}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors truncate ${
                    item.doc_id === currentDocId
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="truncate block">{item.doc_name.replace(/\.pdf$/i, "")}</span>
                  <span className="text-gray-400">{item.page_count}p</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
