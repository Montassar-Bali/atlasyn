"""
ATLASYN AI — Ollama LLM Client
Direct streaming client communicating with local Ollama instance on port 11434.
Supports streaming, context injection, model listing, and title generation.
"""

import json
import logging
import os
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx

logger = logging.getLogger("atlasyn_ollama")

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")

SYSTEM_PROMPT = """You are an advanced, intelligent, helpful AI assistant. Your goal is to provide accurate, thoughtful, context-aware, and natural responses.

Understand the user's intent before answering. Maintain relevant conversational context, adapt explanations to the user's knowledge level, and provide useful solutions.

For programming tasks, write clean, functional code. For mathematical tasks, reason carefully and verify calculations. For educational questions, explain concepts clearly with examples.

Communicate naturally in the user's preferred language. Be concise for simple questions and detailed for complex ones.

Never fabricate information, claim capabilities you do not have, or pretend to use tools that were not executed.

Prioritize accuracy, clarity, usefulness, and user experience."""


class OllamaClient:
    def __init__(self, base_url: str = OLLAMA_HOST):
        self.base_url = base_url.rstrip("/")

    async def get_status(self) -> Dict[str, Any]:
        """Check if Ollama is running and list available models"""
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("name") for m in data.get("models", [])]
                    return {
                        "online": True,
                        "host": self.base_url,
                        "models": models,
                        "active_model": DEFAULT_MODEL if DEFAULT_MODEL in models else (models[0] if models else DEFAULT_MODEL)
                    }
                return {"online": False, "error": f"Ollama HTTP {res.status_code}", "models": []}
        except Exception as e:
            return {"online": False, "error": str(e), "models": []}

    async def list_models(self) -> List[Dict[str, Any]]:
        """List detailed installed models in Ollama"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    models_data = res.json().get("models", [])
                    return [
                        {
                            "name": m.get("name"),
                            "size_gb": round(m.get("size", 0) / (1024**3), 2),
                            "modified_at": m.get("modified_at"),
                            "family": m.get("details", {}).get("family", "unknown"),
                            "parameter_size": m.get("details", {}).get("parameter_size", "")
                        }
                        for m in models_data
                    ]
        except Exception as e:
            logger.warning(f"Failed to list models: {e}")
        return []

    async def stream_chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        custom_system: Optional[str] = None,
        context_memories: Optional[List[Dict[str, str]]] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream response tokens from Ollama chat API"""
        target_model = model or DEFAULT_MODEL
        
        # Build prompt payload
        system_content = custom_system or SYSTEM_PROMPT
        if context_memories:
            memory_block = "\n".join([f"- {m['key']}: {m['value']}" for m in context_memories])
            system_content += f"\n\n[Relevant Long-term User Context]:\n{memory_block}"

        payload_messages = [{"role": "system", "content": system_content}]
        
        # Append conversation messages
        for msg in messages:
            payload_messages.append({"role": msg["role"], "content": msg["content"]})

        payload = {
            "model": target_model,
            "messages": payload_messages,
            "stream": True,
            "options": {
                "temperature": temperature,
                "top_p": 0.9,
            }
        }

        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            try:
                async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        yield {
                            "error": f"Ollama error ({response.status_code}): {err_text.decode('utf-8', errors='ignore')}",
                            "done": True
                        }
                        return

                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = json.loads(line)
                            message = data.get("message", {})
                            content = message.get("content", "")
                            is_done = data.get("done", False)

                            yield {
                                "token": content,
                                "done": is_done,
                                "eval_count": data.get("eval_count"),
                                "eval_duration": data.get("eval_duration"),
                            }
                            if is_done:
                                break
                        except json.JSONDecodeError:
                            continue
            except httpx.ConnectError:
                yield {
                    "error": "Could not connect to Ollama on http://127.0.0.1:11434. Please ensure Ollama is running (`ollama serve`).",
                    "done": True
                }
            except Exception as e:
                yield {
                    "error": f"Inference stream failed: {str(e)}",
                    "done": True
                }

    async def generate_title(self, prompt: str, model: Optional[str] = None) -> str:
        """Generate a short 3-5 word title for a conversation based on the first prompt"""
        target_model = model or DEFAULT_MODEL
        summary_prompt = (
            f"Generate a concise 3 to 5 word title summarizing this question or topic. "
            f"Do not include quotes, periods, or intro text. Return ONLY the title.\n\nPrompt: {prompt}"
        )
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": target_model,
                        "prompt": summary_prompt,
                        "stream": False,
                        "options": {"temperature": 0.3}
                    }
                )
                if res.status_code == 200:
                    title = res.json().get("response", "").strip().strip('"').strip("'")
                    if title and len(title) < 50:
                        return title
        except Exception:
            pass
        
        words = prompt.split()[:4]
        return " ".join(words).capitalize() if words else "Conversation"
