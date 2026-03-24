from dataclasses import dataclass, field
from typing import Optional
import time


@dataclass
class Turn:
    speaker: str  # "customer" or "salesperson"
    text: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class Session:
    session_id: str
    turns: list[Turn] = field(default_factory=list)
    detected_age_group: Optional[str] = None
    detected_gender: Optional[str] = None
    detected_occupation: Optional[str] = None
    current_phase: Optional[str] = None
    created_at: float = field(default_factory=time.time)

    def add_turn(self, speaker: str, text: str) -> None:
        self.turns.append(Turn(speaker=speaker, text=text))

    def get_recent_turns(self, n: int = 15) -> list[Turn]:
        return self.turns[-n:]

    def format_conversation(self, n: int = 15) -> str:
        turns = self.get_recent_turns(n)
        lines = []
        for turn in turns:
            label = "お客様" if turn.speaker == "customer" else "営業"
            lines.append(f"{label}：{turn.text}")
        return "\n".join(lines)

    def get_turns_by_minutes(self, minutes: int = 10) -> list[Turn]:
        """直近N分のターンを返す。なければ直近10ターンにフォールバック"""
        cutoff = time.time() - minutes * 60
        recent = [t for t in self.turns if t.timestamp >= cutoff]
        return recent if recent else self.turns[-10:]

    def format_recent_conversation(self, minutes: int = 10) -> tuple[str, Optional[str]]:
        """(会話履歴文字列, 最新のお客様発言) を返す"""
        turns = self.get_turns_by_minutes(minutes)
        latest_customer = next(
            (t.text for t in reversed(turns) if t.speaker == "customer"), None
        )
        lines = [
            f"{'お客様' if t.speaker == 'customer' else '営業'}：{t.text}"
            for t in turns
        ]
        return "\n".join(lines), latest_customer


class SessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def get_or_create(self, session_id: str) -> Session:
        if session_id not in self._sessions:
            self._sessions[session_id] = Session(session_id=session_id)
        return self._sessions[session_id]

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


session_manager = SessionManager()
