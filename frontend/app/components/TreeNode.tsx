"use client";

import { useState } from "react";
import { PageNode } from "@/types";

interface TreeNodeProps {
  node: PageNode;
  depth: number;
  activePage: number;
  onPageSelect: (page: number, nodeId: string) => void;
  activeNodeId: string | null;
  highlightedNodeIds?: string[];
}

export default function TreeNode({
  node,
  depth,
  activePage,
  onPageSelect,
  activeNodeId,
  highlightedNodeIds = [],
}: TreeNodeProps) {
  const hasChildren = node.nodes && node.nodes.length > 0;
  const [expanded, setExpanded] = useState(depth < 2);

  const isActive = node.node_id === activeNodeId;
  const isHighlighted = highlightedNodeIds.includes(node.node_id);
  const isInRange =
    activePage >= node.start_index && activePage <= node.end_index;

  const handleClick = () => {
    onPageSelect(node.start_index, node.node_id);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  };

  return (
    <div className="select-none">
      <div
        className={`group flex items-start gap-1 py-1.5 px-2 rounded-md cursor-pointer transition-all duration-150 ${
          isActive
            ? "bg-blue-50 text-blue-700 border-l-2 border-blue-500"
            : isHighlighted
            ? "bg-amber-50 text-amber-800 border-l-2 border-amber-400"
            : isInRange
            ? "bg-gray-50 text-gray-800"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse toggle */}
        <button
          className={`flex-shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center rounded transition-transform duration-150 ${
            hasChildren ? "hover:bg-gray-200" : "invisible"
          }`}
          onClick={handleToggle}
        >
          {hasChildren && (
            <svg
              className={`w-3 h-3 transition-transform duration-150 ${
                expanded ? "rotate-90" : ""
              } ${isActive ? "text-blue-500" : "text-gray-400"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
        </button>

        {/* Title and page info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-sm leading-snug truncate ${
                isActive ? "font-semibold" : depth === 0 ? "font-medium" : ""
              }`}
            >
              {node.title}
            </span>
            <span
              className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-mono ${
                isActive
                  ? "bg-blue-100 text-blue-600"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {node.start_index === node.end_index
                ? `p.${node.start_index}`
                : `p.${node.start_index}–${node.end_index}`}
            </span>
          </div>

          {/* Summary if available */}
          {isActive && node.summary && (
            <p className="mt-1 text-xs text-blue-600 opacity-80 line-clamp-2">
              {node.summary}
            </p>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {node.nodes!.map((child) => (
            <TreeNode
              key={child.node_id}
              node={child}
              depth={depth + 1}
              activePage={activePage}
              onPageSelect={onPageSelect}
              activeNodeId={activeNodeId}
              highlightedNodeIds={highlightedNodeIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
