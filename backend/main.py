"""
ATLASYN AI — FastAPI Backend Application
Powers local LLM streaming, persistent conversations, and semantic memory.
No OpenAI API, no paid services, 100% private and local via Ollama.
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from database import (
    add_memory,
    add_message,
    create_conversation,
    delete_conversation,
    delete_memory,
    get_conversation,
    get_conversations,
    get_memories,
    get_messages,
    init_db,
    search_memories,
    update_conversation_title,
)
from ollama_client import OllamaClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("atlasyn_api")

ollama = OllamaClient()
active_model = "qwen2.5:3b"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("ATLASYN SQLite database initialized.")
    status = await ollama.get_status()
    if status.get("online"):
        models = status.get("models", [])
        logger.info(f"Ollama connected. Available models: {models}")
    else:
        logger.warning(f"Ollama is offline or unreachable: {status.get('error')}")
    yield


app = FastAPI(
    title="ATLASYN AI Core",
    description="Private local LLM orchestration engine for ATLASYN Insight",
    version="1.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ──
class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str = Field(..., min_length=1)
    model: Optional[str] = None
    temperature: Optional[float] = 0.7


class CreateConversationRequest(BaseModel):
    title: Optional[str] = "New Conversation"
    model: Optional[str] = None


class RenameConversationRequest(BaseModel):
    title: str = Field(..., min_length=1)


class ModelSelectRequest(BaseModel):
    model: str = Field(..., min_length=1)


class MemoryCreateRequest(BaseModel):
    key: str = Field(..., min_length=1)
    value: str = Field(..., min_length=1)
    category: Optional[str] = "user_preference"


# ── Endpoints ──

@app.get("/api/health")
async def health_check():
    """Verify backend and local Ollama connectivity"""
    ollama_status = await ollama.get_status()
    return {
        "status": "healthy",
        "service": "ATLASYN AI Core v1.2",
        "ollama": ollama_status,
        "active_model": active_model,
    }


@app.get("/api/models")
async def get_models():
    """List all available models in local Ollama"""
    models = await ollama.list_models()
    return {
        "models": models,
        "active_model": active_model,
        "default": "qwen2.5:3b"
    }


@app.post("/api/models/select")
async def select_model(req: ModelSelectRequest):
    """Switch the current active LLM"""
    global active_model
    active_model = req.model
    return {"status": "success", "active_model": active_model}


@app.get("/api/conversations")
async def list_conversations():
    """List all saved conversations ordered by recency"""
    convs = get_conversations()
    return {"conversations": convs}


@app.post("/api/conversations")
async def create_conv(req: CreateConversationRequest):
    """Start a fresh conversation thread"""
    model = req.model or active_model
    conv_id = create_conversation(title=req.title or "New Conversation", model=model)
    return {"id": conv_id, "title": req.title or "New Conversation", "model": model}


@app.get("/api/conversations/{conv_id}")
async def get_conv(conv_id: str):
    """Retrieve full conversation details and message history"""
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = get_messages(conv_id, limit=100)
    return {"conversation": conv, "messages": messages}


@app.delete("/api/conversations/{conv_id}")
async def remove_conversation(conv_id: str):
    """Delete a conversation and its messages"""
    delete_conversation(conv_id)
    return {"status": "deleted", "id": conv_id}


@app.patch("/api/conversations/{conv_id}")
async def rename_conv(conv_id: str, req: RenameConversationRequest):
    """Rename a conversation title"""
    update_conversation_title(conv_id, req.title)
    return {"status": "updated", "id": conv_id, "title": req.title}


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest, request: Request):
    """
    Main token-by-token SSE streaming endpoint.
    Retrieves previous turns, injects memories, invokes local Ollama LLM,
    persists tokens, and automatically titles new threads.
    """
    model_name = req.model or active_model

    # 1. Resolve or create conversation
    conv_id = req.conversation_id
    is_new = False
    if not conv_id:
        conv_id = create_conversation(title="New Conversation", model=model_name)
        is_new = True
    else:
        existing = get_conversation(conv_id)
        if not existing:
            conv_id = create_conversation(title="New Conversation", model=model_name)
            is_new = True

    # 2. Record User Message
    add_message(conv_id=conv_id, role="user", content=req.message)

    # 3. Retrieve context history (last 16 messages for context window management)
    history = get_messages(conv_id, limit=16)
    formatted_history = [{"role": m["role"], "content": m["content"]} for m in history]

    # 4. Retrieve semantic memories relevant to the prompt
    matched_memories = search_memories(req.message)

    # 5. Generator for SSE Streaming
    async def event_generator():
        accumulated_response = []
        try:
            # Send initial event with conversation ID and metadata
            yield {
                "event": "meta",
                "data": json.dumps({"conversation_id": conv_id, "model": model_name})
            }

            stream_iter = ollama.stream_chat(
                messages=formatted_history,
                model=model_name,
                temperature=req.temperature or 0.7,
                context_memories=matched_memories,
            )

            async for chunk in stream_iter:
                # Client disconnected?
                if await request.is_disconnected():
                    logger.info("Client disconnected during inference stream.")
                    break

                if "error" in chunk:
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": chunk["error"]})
                    }
                    return

                token = chunk.get("token", "")
                if token:
                    accumulated_response.append(token)
                    yield {
                        "event": "token",
                        "data": json.dumps({"token": token})
                    }

                if chunk.get("done"):
                    break

            # 6. Save Assistant response to Database
            full_reply = "".join(accumulated_response)
            msg_id = add_message(conv_id=conv_id, role="assistant", content=full_reply)

            # 7. Generate a concise conversation title if this is the first turn
            new_title = None
            if is_new or len(history) <= 2:
                new_title = await ollama.generate_title(req.message, model=model_name)
                update_conversation_title(conv_id, new_title)

            # Send done event with message ID and updated title
            yield {
                "event": "done",
                "data": json.dumps({
                    "message_id": msg_id,
                    "conversation_id": conv_id,
                    "title": new_title or "",
                    "done": True
                })
            }

        except Exception as e:
            logger.error(f"Error during stream generation: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())


# ── Long-term Memory Endpoints ──

@app.get("/api/memories")
async def list_memories():
    """Retrieve all stored user memories"""
    memories = get_memories()
    return {"memories": memories}


@app.post("/api/memories")
async def create_mem(req: MemoryCreateRequest):
    """Store a piece of persistent knowledge/preference"""
    mem_id = add_memory(key=req.key, value=req.value, category=req.category or "general")
    return {"id": mem_id, "key": req.key, "value": req.value, "category": req.category}


@app.delete("/api/memories/{mem_id}")
async def remove_memory(mem_id: str):
    """Delete a memory item"""
    delete_memory(mem_id)
    return {"status": "deleted", "id": mem_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
