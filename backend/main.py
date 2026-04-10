import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import hashlib
import json
import tempfile
import uuid
from typing import AsyncGenerator

from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from pageindex import page_index_main
from pageindex.retrieve import get_document_structure, get_page_content, get_document
from pageindex.utils import llm_completion, ConfigLoader, remove_fields

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache directory for processed documents
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".pageindex_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# In-memory document store: doc_id -> doc_info
documents: dict = {}

# Processing status: doc_id -> {"status": ..., "nodes": [], "error": None}
processing: dict = {}

# Hash -> doc_id mapping for cache lookup
_hash_to_doc_id: dict = {}


def _cache_path(file_hash: str) -> str:
    return os.path.join(CACHE_DIR, f"{file_hash}.json")


def _load_cache_on_startup():
    """Load all cached documents into memory on startup."""
    for fname in os.listdir(CACHE_DIR):
        if not fname.endswith(".json"):
            continue
        file_hash = fname[:-5]
        try:
            with open(os.path.join(CACHE_DIR, fname), "r", encoding="utf-8") as f:
                cached = json.load(f)
            doc_id = cached["id"]
            documents[doc_id] = cached
            _hash_to_doc_id[file_hash] = doc_id
            print(f"[cache] Loaded: {cached.get('doc_name', '?')} (id={doc_id})")
        except Exception as e:
            print(f"[cache] Failed to load {fname}: {e}")


_load_cache_on_startup()


def _apply_api_key(api_key: Optional[str], provider: Optional[str] = None):
    """Set API key env var from request if provided."""
    if not api_key:
        return
    if provider == "openai":
        os.environ["OPENAI_API_KEY"] = api_key
    else:
        os.environ["GEMINI_API_KEY"] = api_key


def _flatten_nodes(nodes: list, result: list = None) -> list:
    """Flatten nested nodes in BFS order."""
    if result is None:
        result = []
    for node in nodes:
        result.append(node)
        if node.get("nodes"):
            _flatten_nodes(node["nodes"], result)
    return result


def _run_indexing(doc_id: str, pdf_path: str, model: str, file_hash: str = None):
    """Run pageindex synchronously in a thread."""
    try:
        print(f"[indexing] Starting for doc_id={doc_id}")
        processing[doc_id]["status"] = "extracting_structure"
        opt = ConfigLoader().load({"model": model} if model else None)
        print(f"[indexing] Config loaded, model={opt.model}")
        result = page_index_main(pdf_path, opt)
        print(f"[indexing] page_index_main complete")

        # Extract page text with PyMuPDF (better Korean support)
        import pymupdf
        pages = []
        doc_pdf = pymupdf.open(pdf_path)
        for i, page in enumerate(doc_pdf, 1):
            pages.append({"page": i, "content": page.get_text() or ""})
        doc_pdf.close()

        has_text = any(p["content"].strip() for p in pages)
        documents[doc_id] = {
            "id": doc_id,
            "type": "pdf",
            "path": pdf_path,
            "doc_name": result.get("doc_name", ""),
            "doc_description": result.get("doc_description", ""),
            "page_count": len(pages),
            "structure": result["structure"],
            "pages": pages,
            "has_text": has_text,
        }
        processing[doc_id]["status"] = "complete"
        processing[doc_id]["structure"] = result["structure"]
        processing[doc_id]["doc_name"] = result.get("doc_name", "")
        processing[doc_id]["has_text"] = has_text
        # Save to disk cache
        if file_hash:
            try:
                with open(_cache_path(file_hash), "w", encoding="utf-8") as f:
                    json.dump(documents[doc_id], f, ensure_ascii=False)
                _hash_to_doc_id[file_hash] = doc_id
                print(f"[cache] Saved: {result.get('doc_name', '?')}")
            except Exception as ce:
                print(f"[cache] Save failed: {ce}")
    except Exception as e:
        processing[doc_id]["status"] = "error"
        processing[doc_id]["error"] = str(e)


class ValidateKeyRequest(BaseModel):
    provider: str
    model: str


@app.post("/api/validate-key")
async def validate_key(req: ValidateKeyRequest, x_api_key: Optional[str] = Header(default=None)):
    """Validate an API key by making a minimal LLM call."""
    import litellm as _litellm
    _apply_api_key(x_api_key, req.provider)
    model = req.model.removeprefix("litellm/")
    try:
        response = _litellm.completion(
            model=model,
            messages=[{"role": "user", "content": "Say ok"}],
            max_tokens=5,
            timeout=15,
        )
        content = response.choices[0].message.content or ""
        if content:
            return {"valid": True}
        return {"valid": False, "error": "모델이 빈 응답을 반환했습니다"}
    except Exception as e:
        err = str(e)
        # Extract human-readable message from litellm/API errors
        import re as _re
        match = _re.search(r'"message":\s*"([^"]+)"', err)
        if match:
            return {"valid": False, "error": match.group(1)}
        return {"valid": False, "error": err[:150]}


@app.post("/api/process")
async def process_pdf(
    file: UploadFile = File(...),
    model: str = None,
    x_api_key: Optional[str] = Header(default=None),
):
    """Upload a PDF and start indexing. Returns doc_id."""
    _apply_api_key(x_api_key)
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files supported")

    content = await file.read()
    file_hash = hashlib.md5(content).hexdigest()

    # Check cache hit
    if file_hash in _hash_to_doc_id:
        cached_doc_id = _hash_to_doc_id[file_hash]
        if cached_doc_id in documents:
            print(f"[cache] Hit: {file.filename} → doc_id={cached_doc_id}")
            return {"doc_id": cached_doc_id, "filename": file.filename, "cached": True}

    doc_id = str(uuid.uuid4())

    # Save to temp file (keep it for page content retrieval)
    tmp_dir = tempfile.mkdtemp()
    pdf_path = os.path.join(tmp_dir, file.filename)
    with open(pdf_path, "wb") as f:
        f.write(content)

    processing[doc_id] = {
        "status": "starting",
        "structure": None,
        "doc_name": file.filename,
        "error": None,
    }

    # Run indexing in background thread
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _run_indexing, doc_id, pdf_path, model, file_hash)

    return {"doc_id": doc_id, "filename": file.filename}


async def _sse_stream(doc_id: str) -> AsyncGenerator[str, None]:
    """SSE generator: poll processing status and stream progress + nodes."""

    def event(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    # Cache hit: doc already fully processed, stream nodes immediately
    if doc_id in documents and doc_id not in processing:
        yield event({"type": "status", "message": "Loaded from cache"})
        await asyncio.sleep(0.2)
        structure = documents[doc_id]["structure"]
        doc_name = documents[doc_id]["doc_name"]
        all_nodes = _flatten_nodes(structure)
        yield event({"type": "start", "doc_name": doc_name, "total": len(all_nodes)})
        await asyncio.sleep(0.1)
        async def stream_cached(nodes, depth):
            for node in nodes:
                node_copy = {k: v for k, v in node.items() if k != "nodes"}
                node_copy["depth"] = depth
                node_copy["has_children"] = bool(node.get("nodes"))
                yield event({"type": "node", "node": node_copy, "depth": depth})
                await asyncio.sleep(0.05)
                if node.get("nodes"):
                    async for e in stream_cached(node["nodes"], depth + 1):
                        yield e
        async for e in stream_cached(structure, 0):
            yield e
        has_text = documents[doc_id].get("has_text", True)
        yield event({"type": "complete", "doc_id": doc_id, "has_text": has_text})
        return

    # Wait for indexing to start
    yield event({"type": "status", "message": "Starting indexing..."})
    await asyncio.sleep(0.5)

    status_messages = {
        "starting": "Initializing...",
        "extracting_structure": "Analyzing PDF structure with LLM — this may take a minute...",
    }

    last_status = None
    # Poll until done or error
    while True:
        state = processing.get(doc_id)
        if not state:
            yield event({"type": "error", "message": "Document not found"})
            return

        status = state["status"]
        if status != last_status and status in status_messages:
            yield event({"type": "status", "message": status_messages[status]})
            last_status = status

        if status == "error":
            yield event({"type": "error", "message": state.get("error", "Unknown error")})
            return

        if status == "complete":
            break

        await asyncio.sleep(1)

    # Indexing done — stream nodes one by one for visual tree building
    structure = processing[doc_id]["structure"]
    doc_name = processing[doc_id]["doc_name"]

    yield event({"type": "status", "message": "Building tree visualization..."})
    await asyncio.sleep(0.3)

    all_nodes = _flatten_nodes(structure)
    yield event({"type": "start", "doc_name": doc_name, "total": len(all_nodes)})
    await asyncio.sleep(0.2)

    # Stream top-level nodes first, then children — maintaining hierarchy order
    async def stream_nodes(nodes: list, depth: int):
        for node in nodes:
            node_copy = {k: v for k, v in node.items() if k != "nodes"}
            node_copy["depth"] = depth
            node_copy["has_children"] = bool(node.get("nodes"))
            yield event({"type": "node", "node": node_copy, "depth": depth})
            await asyncio.sleep(0.08)
            if node.get("nodes"):
                async for e in stream_nodes(node["nodes"], depth + 1):
                    yield e

    async for e in stream_nodes(structure, 0):
        yield e

    has_text = processing[doc_id].get("has_text", True)
    yield event({"type": "complete", "doc_id": doc_id, "has_text": has_text})


@app.get("/api/progress/{doc_id}")
async def progress_stream(doc_id: str, api_key: Optional[str] = Query(default=None)):
    """SSE endpoint for indexing progress and tree node streaming."""
    _apply_api_key(api_key)
    return StreamingResponse(
        _sse_stream(doc_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/documents")
async def list_documents():
    """Return list of all cached/processed documents."""
    return [
        {
            "doc_id": doc["id"],
            "doc_name": doc["doc_name"],
            "page_count": doc.get("page_count", 0),
            "has_text": doc.get("has_text", True),
        }
        for doc in documents.values()
    ]


@app.get("/api/structure/{doc_id}")
async def get_structure(doc_id: str):
    """Return the full document structure."""
    if doc_id not in documents:
        raise HTTPException(404, "Document not found")
    doc = documents[doc_id]
    return {
        "doc_name": doc["doc_name"],
        "structure": doc["structure"],
    }


class ChatRequest(BaseModel):
    doc_id: str
    question: str


@app.post("/api/chat")
async def chat(req: ChatRequest, x_api_key: Optional[str] = Header(default=None)):
    """RAG chat endpoint: tree search + answer generation."""
    _apply_api_key(x_api_key)
    if req.doc_id not in documents:
        raise HTTPException(404, "Document not found. Please process a PDF first.")

    doc = documents[req.doc_id]
    opt = ConfigLoader().load()
    model = opt.model

    # Step 1: Get structure (without text to save tokens)
    structure_no_text = remove_fields(doc["structure"], fields=["text"])
    structure_str = json.dumps(structure_no_text, ensure_ascii=False)

    # Step 2: Ask LLM which nodes are relevant
    selection_prompt = f"""You are a document navigation assistant.
Given a document's tree structure and a user question, identify the most relevant section node_ids to answer the question.

Document: {doc['doc_name']}
Tree structure:
{structure_str}

Question: {req.question}

Return JSON with:
{{
  "reasoning": "brief explanation of why these sections are relevant",
  "node_ids": ["0001", "0002"],
  "pages": "e.g. 5-7,12"
}}

Select 1-3 most relevant sections. Return only JSON."""

    try:
        selection_response = llm_completion(model=model, prompt=selection_prompt)
        # Parse JSON response
        import re
        json_match = re.search(r'\{.*\}', selection_response, re.DOTALL)
        if json_match:
            selection = json.loads(json_match.group())
        else:
            selection = {"node_ids": [], "pages": "1"}
    except Exception:
        selection = {"node_ids": [], "pages": "1"}

    # Step 3: Get page content for relevant pages
    pages_str = selection.get("pages", "1")
    doc_wrapper = {req.doc_id: doc}
    page_content_json = get_page_content(doc_wrapper, req.doc_id, pages_str)
    page_contents_raw = json.loads(page_content_json)
    # get_page_content returns error dict on failure; fall back to page 1
    if isinstance(page_contents_raw, dict) and "error" in page_contents_raw:
        page_content_json = get_page_content(doc_wrapper, req.doc_id, "1")
        page_contents_raw = json.loads(page_content_json)
    page_contents = page_contents_raw if isinstance(page_contents_raw, list) else []

    context = "\n\n".join(
        f"[Page {p['page']}]\n{p['content']}" for p in page_contents if isinstance(p, dict)
    )

    # Step 4: Generate answer
    answer_prompt = f"""You are an expert document analyst. Answer the question based on the provided document content.

Question: {req.question}

Relevant document sections:
{context}

Provide a clear, accurate answer. If the information is not in the provided sections, say so."""

    answer = llm_completion(model=model, prompt=answer_prompt)

    # Find relevant pages for navigation
    relevant_pages = []
    if page_contents:
        relevant_pages = [p["page"] for p in page_contents]

    return {
        "answer": answer,
        "node_ids": selection.get("node_ids", []),
        "relevant_pages": relevant_pages,
        "reasoning": selection.get("reasoning", ""),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
