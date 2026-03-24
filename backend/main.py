from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from session_manager import session_manager
from claude_client import get_suggestion

app = FastAPI(title="Sales Doseki-kun API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番では Zoom Apps のドメインに限定する
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranscriptRequest(BaseModel):
    speaker: str  # "customer" or "salesperson"
    text: str


class SuggestRequest(BaseModel):
    minutes: int = 10  # 直近何分を対象にするか


class SuggestionResponse(BaseModel):
    detected_attributes: dict
    current_phase: str
    signal_detected: str
    suggestions: list[dict]


@app.post("/session/{session_id}/transcript")
async def add_transcript(session_id: str, body: TranscriptRequest) -> dict:
    """文字起こしをセッションに追加するだけ（提案は生成しない）"""
    if body.speaker not in ("customer", "salesperson"):
        raise HTTPException(status_code=400, detail="speaker must be 'customer' or 'salesperson'")

    session = session_manager.get_or_create(session_id)
    session.add_turn(body.speaker, body.text)
    return {"status": "ok", "turn_count": len(session.turns)}


@app.post("/session/{session_id}/analyze", response_model=SuggestionResponse)
async def analyze(session_id: str, body: TranscriptRequest) -> SuggestionResponse:
    """文字起こしを追加し、AIの提案を返す（お客様の発言時のみ呼び出す）"""
    if body.speaker not in ("customer", "salesperson"):
        raise HTTPException(status_code=400, detail="speaker must be 'customer' or 'salesperson'")

    session = session_manager.get_or_create(session_id)
    session.add_turn(body.speaker, body.text)

    conversation = session.format_conversation(n=14)  # 最新発言の直前まで
    result = get_suggestion(conversation, body.text)

    # 推測属性をセッションに保存（次回以降の精度向上のため）
    attrs = result.get("detected_attributes", {})
    if attrs.get("age_group") != "不明":
        session.detected_age_group = attrs.get("age_group")
    if attrs.get("gender") != "不明":
        session.detected_gender = attrs.get("gender")
    if attrs.get("occupation") != "不明":
        session.detected_occupation = attrs.get("occupation")

    return SuggestionResponse(**result)


@app.post("/session/{session_id}/suggest", response_model=SuggestionResponse)
async def suggest(session_id: str, body: SuggestRequest) -> SuggestionResponse:
    """直近N分の会話からAI提案を生成（新規発言は追加しない）"""
    session = session_manager.get_or_create(session_id)
    conversation, latest_customer = session.format_recent_conversation(body.minutes)
    if not latest_customer:
        raise HTTPException(status_code=400, detail="お客様の発言がまだありません")
    result = get_suggestion(conversation, latest_customer)
    attrs = result.get("detected_attributes", {})
    if attrs.get("age_group") != "不明":
        session.detected_age_group = attrs.get("age_group")
    if attrs.get("gender") != "不明":
        session.detected_gender = attrs.get("gender")
    if attrs.get("occupation") != "不明":
        session.detected_occupation = attrs.get("occupation")
    return SuggestionResponse(**result)


@app.delete("/session/{session_id}")
async def end_session(session_id: str) -> dict:
    """商談終了時にセッションを削除する"""
    session_manager.delete(session_id)
    return {"status": "ok"}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
