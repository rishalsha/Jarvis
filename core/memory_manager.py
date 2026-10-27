"""
Persistent Memory & RAG Retrieval Engine for J.A.R.V.I.S.
Stores every user speech, fact, preference, and action in SQLite with FTS5 BM25 index
for instantaneous, accurate information recall on demand.
"""

import sqlite3
import os
import re
import time
from datetime import datetime
from typing import List, Dict, Optional, Tuple

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "memory", "jarvis_memory.db")

STOP_WORDS = {
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
    'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
    'between', 'both', 'but', 'by', 'could', 'did', 'do', 'does', 'doing', 'down',
    'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
    'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
    'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me',
    'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on',
    'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
    'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
    'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
    'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were',
    'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
    'you', 'your', 'yours', 'yourself', 'yourselves', 'tell', 'gave', 'give', 'said'
}


class MemoryManager:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()
        self._ensure_default_profile()

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._get_conn() as conn:
            cur = conn.cursor()
            # User profile & key-value facts
            cur.execute("""
                CREATE TABLE IF NOT EXISTS facts (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    category TEXT DEFAULT 'general',
                    updated_at REAL NOT NULL,
                    datetime_str TEXT
                )
            """)

            # Core conversation history with human-readable timestamps
            cur.execute("""
                CREATE TABLE IF NOT EXISTS conversation (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    datetime_str TEXT NOT NULL
                )
            """)

            # Action logs
            cur.execute("""
                CREATE TABLE IF NOT EXISTS actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action_type TEXT NOT NULL,
                    details TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    datetime_str TEXT NOT NULL
                )
            """)

            # Ensure schema migrations for existing databases
            try:
                cur.execute("ALTER TABLE facts ADD COLUMN datetime_str TEXT")
            except Exception:
                pass
            try:
                cur.execute("ALTER TABLE conversation ADD COLUMN datetime_str TEXT")
            except Exception:
                pass
            try:
                cur.execute("ALTER TABLE actions ADD COLUMN datetime_str TEXT")
            except Exception:
                pass

            # FTS5 Full-Text Search virtual table for Instant RAG Retrieval
            cur.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
                    content,
                    role,
                    datetime_str,
                    content='conversation',
                    content_rowid='id'
                )
            """)

            # Triggers to keep FTS5 in real-time sync with conversation table
            cur.execute("""
                CREATE TRIGGER IF NOT EXISTS trg_conversation_ai AFTER INSERT ON conversation BEGIN
                    INSERT INTO memory_fts(rowid, content, role, datetime_str)
                    VALUES (new.id, new.content, new.role, new.datetime_str);
                END;
            """)
            cur.execute("""
                CREATE TRIGGER IF NOT EXISTS trg_conversation_ad AFTER DELETE ON conversation BEGIN
                    INSERT INTO memory_fts(memory_fts, rowid, content, role, datetime_str)
                    VALUES ('delete', old.id, old.content, old.role, old.datetime_str);
                END;
            """)
            conn.commit()

    def _ensure_default_profile(self):
        defaults = {
            "user_name": "Rishal",
            "user_title": "Sir",
            "assistant_identity": "J.A.R.V.I.S., the AI assistant created by Tony Stark, now serving Sir Rishal.",
            "preferred_tone": "Respectful, polite, witty, concise British gentleman.",
            "creator": "Tony Stark / Rishal",
            "workshop_location": "Stark Workshop / Kerala"
        }
        for k, v in defaults.items():
            if not self.get_fact(k):
                self.save_fact(k, v, "profile")

    def save_fact(self, key: str, value: str, category: str = "general"):
        now = time.time()
        now_str = datetime.now().strftime("%b %d, %Y %I:%M %p")
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO facts (key, value, category, updated_at, datetime_str)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET 
                    value=excluded.value, 
                    updated_at=excluded.updated_at,
                    datetime_str=excluded.datetime_str
            """, (key, value, category, now, now_str))
            conn.commit()

    def store_fact(self, key: str, value: str, category: str = "general") -> Dict[str, Any]:
        """Wrapper for LLM tool call remember_fact."""
        self.save_fact(key, value, category)
        return {"status": "success", "message": f"Stored into memory vault: {key} = {value}"}

    def get_fact(self, key: str) -> Optional[str]:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT value FROM facts WHERE key = ?", (key,))
            row = cur.fetchone()
            return row[0] if row else None

    def get_all_facts(self) -> Dict[str, str]:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT key, value FROM facts")
            return {row[0]: row[1] for row in cur.fetchall()}

    def add_message(self, role: str, content: str):
        """Immediately stores speech content into SQLite and updates FTS5 RAG index."""
        now = time.time()
        now_str = datetime.now().strftime("%b %d, %I:%M %p")
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO conversation (role, content, timestamp, datetime_str)
                VALUES (?, ?, ?, ?)
            """, (role, content, now, now_str))
            conn.commit()

        # If user shared direct information or facts, automatically extract and index
        if role == "user":
            self._auto_extract_facts(content)

    def _auto_extract_facts(self, text: str):
        """Extracts structured key facts from user speech patterns."""
        clean = text.strip()
        lower = clean.lower()

        # Pattern: "Remember that X is Y" or "Note that X is Y"
        match = re.search(r'\b(?:remember that|note that|keep in mind that)\s+(.+)', lower)
        if match:
            fact_statement = match.group(1).strip()
            self.save_fact(f"note_{int(time.time())}", fact_statement, "user_note")
            return

        # Pattern: "My X is Y"
        match = re.search(r'\bmy\s+([a-zA-Z0-9_\s]{2,25})\s+(?:is|are)\s+(.+)', clean, re.IGNORECASE)
        if match:
            k = match.group(1).strip().lower().replace(" ", "_")
            v = match.group(2).strip()
            self.save_fact(k, v, "personal_info")
            return

        # Pattern: "The X is Y"
        match = re.search(r'\bthe\s+([a-zA-Z0-9_\s]{2,25})\s+(?:is|are)\s+(.+)', clean, re.IGNORECASE)
        if match:
            k = match.group(1).strip().lower().replace(" ", "_")
            v = match.group(2).strip()
            # Ignore transient states like "light is on"
            if v.lower() not in ["on", "off", "working", "ready"]:
                self.save_fact(k, v, "entity_info")
                return

    def search_rag_memories(self, query: str, limit: int = 4) -> List[Dict[str, str]]:
        """
        Retrieves past speeches, statements, and facts matching Sir's query using BM25 RAG.
        Returns relevant memory excerpts with timestamps.
        """
        clean = query.strip()
        if not clean:
            return []

        # Extract search keywords
        raw_words = re.findall(r'[a-zA-Z0-9_]{2,}', clean.lower())
        keywords = [w for w in raw_words if w not in STOP_WORDS]

        results = []
        seen_contents = set()

        # 1. First, search facts table
        with self._get_conn() as conn:
            cur = conn.cursor()
            for kw in keywords:
                cur.execute("""
                    SELECT key, value, datetime_str FROM facts
                    WHERE key LIKE ? OR value LIKE ?
                    LIMIT ?
                """, (f"%{kw}%", f"%{kw}%", limit))
                for row in cur.fetchall():
                    key_clean = row[0].replace("_", " ").title()
                    fact_str = f"Fact Record: {key_clean} = {row[1]}"
                    if fact_str not in seen_contents:
                        seen_contents.add(fact_str)
                        results.append({
                            "type": "fact",
                            "source": "Persistent Memory",
                            "content": f"{key_clean}: {row[1]}",
                            "timestamp": row[2] or "Recorded"
                        })

        # 2. Second, search FTS5 Full-Text Conversation Index with BM25 ranking
        if keywords:
            fts_query = " OR ".join([f'"{k}"*' for k in keywords])
            try:
                with self._get_conn() as conn:
                    cur = conn.cursor()
                    cur.execute("""
                        SELECT role, content, datetime_str, bm25(memory_fts) as rank
                        FROM memory_fts
                        WHERE memory_fts MATCH ?
                        ORDER BY rank
                        LIMIT ?
                    """, (fts_query, limit * 2))
                    rows = cur.fetchall()
                    for r in rows:
                        role, content, dt, _ = r
                        # Skip if exact same query as current input
                        if content.strip().lower() == clean.lower():
                            continue
                        speaker = "Sir" if role == "user" else "J.A.R.V.I.S."
                        summary = f"{speaker} stated: '{content}'"
                        if summary not in seen_contents:
                            seen_contents.add(summary)
                            results.append({
                                "type": "conversation",
                                "source": speaker,
                                "content": content,
                                "timestamp": dt
                            })
            except Exception as e:
                pass

        return results[:limit]

    def get_recent_history(self, limit: int = 8) -> List[Dict[str, str]]:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT role, content FROM conversation
                ORDER BY id DESC LIMIT ?
            """, (limit,))
            rows = cur.fetchall()
            
            def sanitize(text: str) -> str:
                t = re.sub(r'\bmy\s+boy\b', 'sir', text, flags=re.IGNORECASE)
                t = re.sub(r'\bsir\s+rishal\b', 'sir', t, flags=re.IGNORECASE)
                return t

            return [{"role": r[0], "content": sanitize(r[1]) if r[0] == "assistant" else r[1]} for r in reversed(rows)]

    def log_action(self, action_type: str, details: str):
        now = time.time()
        now_str = datetime.now().strftime("%b %d, %I:%M %p")
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO actions (action_type, details, timestamp, datetime_str)
                VALUES (?, ?, ?, ?)
            """, (action_type, details, now, now_str))
            conn.commit()

    def build_memory_context(self, current_query: str = "") -> str:
        """
        Builds the unified memory prompt:
        - Injects RAG-recalled past memories specific to current query
        - Injects core user profile facts
        """
        lines = []

        # RAG Recall
        if current_query:
            recalled = self.search_rag_memories(current_query, limit=5)
            if recalled:
                lines.append("[RECALLED MEMORIES & PAST STATEMENTS (RAG)]:")
                for r in recalled:
                    if r["type"] == "fact":
                        lines.append(f"- [Memory Vault] {r['content']} ({r['timestamp']})")
                    else:
                        lines.append(f"- [{r['timestamp']}] {r['source']} previously said: \"{r['content']}\"")
                lines.append("")

        # Core User Profile
        facts = self.get_all_facts()
        lines.append("[CORE USER PROFILE & WORKSHOP DIRECTIVES]:")
        for k, v in facts.items():
            if not k.startswith("note_"):
                lines.append(f"- {k.replace('_', ' ').title()}: {v}")

        return "\n".join(lines)
