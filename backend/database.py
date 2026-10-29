"""
ATLASYN AI — SQLite Persistence Layer
Handles conversations, message history, and long-term semantic memory.
"""

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_PATH = Path(__file__).parent / "atlasyn_ai.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                model TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                metadata TEXT,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC)")
    conn.close()


def create_conversation(title: str = "New Conversation", model: str = "qwen2.5:3b") -> str:
    conv_id = f"conv_{uuid.uuid4().hex[:12]}"
    now = datetime.utcnow().isoformat()
    conn = get_db()
    with conn:
        conn.execute(
            "INSERT INTO conversations (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (conv_id, title, model, now, now)
        )
    conn.close()
    return conv_id


def get_conversations() -> List[Dict[str, Any]]:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
               COUNT(m.id) as message_count,
               (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY c.id
        ORDER BY c.updated_at DESC
    """)
    rows = cur.fetchall()
    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "title": r["title"],
            "model": r["model"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "message_count": r["message_count"],
            "last_message": r["last_message"] or ""
        })
    conn.close()
    return result


def get_conversation(conv_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return None
    conv = {
        "id": row["id"],
        "title": row["title"],
        "model": row["model"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"]
    }
    conn.close()
    return conv


def update_conversation_title(conv_id: str, title: str):
    now = datetime.utcnow().isoformat()
    conn = get_db()
    with conn:
        conn.execute("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?", (title, now, conv_id))
    conn.close()


def touch_conversation(conv_id: str):
    now = datetime.utcnow().isoformat()
    conn = get_db()
    with conn:
        conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conv_id))
    conn.close()


def delete_conversation(conv_id: str):
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
        conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.close()


def add_message(conv_id: str, role: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> str:
    msg_id = f"msg_{uuid.uuid4().hex[:12]}"
    now = datetime.utcnow().isoformat()
    meta_json = json.dumps(metadata) if metadata else None
    conn = get_db()
    with conn:
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)",
            (msg_id, conv_id, role, content, now, meta_json)
        )
        conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conv_id))
    conn.close()
    return msg_id


def get_messages(conv_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, conversation_id, role, content, created_at, metadata
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT ?
    """, (conv_id, limit))
    rows = cur.fetchall()
    messages = []
    for r in rows:
        meta = json.loads(r["metadata"]) if r["metadata"] else {}
        messages.append({
            "id": r["id"],
            "conversation_id": r["conversation_id"],
            "role": r["role"],
            "content": r["content"],
            "created_at": r["created_at"],
            "metadata": meta
        })
    conn.close()
    return messages


def add_memory(key: str, value: str, category: str = "general") -> str:
    mem_id = f"mem_{uuid.uuid4().hex[:8]}"
    now = datetime.utcnow().isoformat()
    conn = get_db()
    with conn:
        conn.execute(
            "INSERT INTO memories (id, key, value, category, created_at) VALUES (?, ?, ?, ?, ?)",
            (mem_id, key, value, category, now)
        )
    conn.close()
    return mem_id


def get_memories() -> List[Dict[str, Any]]:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, key, value, category, created_at FROM memories ORDER BY created_at DESC")
    rows = cur.fetchall()
    memories = [{"id": r["id"], "key": r["key"], "value": r["value"], "category": r["category"], "created_at": r["created_at"]} for r in rows]
    conn.close()
    return memories


def delete_memory(mem_id: str):
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM memories WHERE id = ?", (mem_id,))
    conn.close()


def search_memories(query: str) -> List[Dict[str, Any]]:
    """Simple keyword/substring matching across memories for context injection"""
    conn = get_db()
    cur = conn.cursor()
    keywords = query.lower().split()
    if not keywords:
        conn.close()
        return []
    
    cur.execute("SELECT id, key, value, category, created_at FROM memories")
    all_memories = cur.fetchall()
    conn.close()
    
    matches = []
    for m in all_memories:
        text = f"{m['key']} {m['value']} {m['category']}".lower()
        if any(kw in text for kw in keywords if len(kw) > 3):
            matches.append({"id": m["id"], "key": m["key"], "value": m["value"], "category": m["category"]})
    return matches
