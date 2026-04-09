export interface PageNode {
  title: string;
  start_index: number;
  end_index: number;
  node_id: string;
  summary?: string;
  text?: string;
  description?: string;
  nodes?: PageNode[];
}

export interface PageIndexDocument {
  doc_name: string;
  description?: string;
  structure: PageNode[];
}
