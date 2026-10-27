"""
Persistent Memory Engine for J.A.R.V.I.S.
Stores user profile, preferences, past context, and conversation history in SQLite.
"""

import sqlite3
import os
import json
import time
from typing import List, Dict, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "memory", "jarvis_memory.db")


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
                    updated_at REAL NOT NULL
                )
            """)
            # Conversations history
            cur.execute("""
                CREATE TABLE IF NOT EXISTS conversation (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp REAL NOT NULL
                )
            """)
            # Action logs (e.g. hardware commands)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action_type TEXT NOT NULL,
                    details TEXT NOT NULL,
                    timestamp REAL NOT NULL
                )
            """)
            conn.commit()

    def _ensure_default_profile(self):
        defaults = {
            "user_name": "Rishal",
            "user_title": "Sir",
            "assistant_identity": "J.A.R.V.I.S., the AI assistant designed by Tony Stark, now serving Sir Rishal.",
            "preferred_tone": "Respectful, polite, witty, concise British gentleman.",
            "creator": "Tony Stark / Rishal",
            "base_location": "Stark Workshop / Kerala"
        }
        for k, v in defaults.items():
            if not self.get_fact(k):
                self.save_fact(k, v, "profile")

    def save_fact(self, key: str, value: str, category: str = "general"):
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO facts (key, value, category, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """, (key, value, category, time.time()))
            conn.commit()

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
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO conversation (role, content, timestamp)
                VALUES (?, ?, ?)
            """, (role, content, time.time()))
            conn.commit()

    def get_recent_history(self, limit: int = 10) -> List[Dict[str, str]]:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT role, content FROM conversation
                ORDER BY id DESC LIMIT ?
            """, (limit,))
            rows = cur.fetchall()
            # Return in chronological order
            return [{"role": r[0], "content": r[1]} for r in reversed(rows)]

    def log_action(self, action_type: str, details: str):
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO actions (action_type, details, timestamp)
                VALUES (?, ?, ?)
            """, (action_type, details, time.time()))
            conn.commit()

    def build_memory_context(self) -> str:
        """Constructs a concise memory briefing block for J.A.R.V.I.S.'s prompt."""
        facts = self.get_all_facts()
        lines = ["[LONG-TERM MEMORY & USER PROFILE]"]
        for k, v in facts.items():
            lines.append(f"- {k.replace('_', ' ').title()}: {v}")
        return "\n".join(lines)
