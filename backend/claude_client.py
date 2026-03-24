import json
import anthropic
from knowledge_base import KNOWLEDGE_BASE

_client = anthropic.Anthropic()

SYSTEM_PROMPT = f"""あなたはキャリドラの営業支援AIアシスタント「道場くん」です。
無料カウンセリングのZoom商談中に、営業マンに対してリアルタイムでアドバイスを提供します。

以下のナレッジベースを必ず参照して、お客様の発言・状況に応じた最適なアドバイスを出してください。

---
{KNOWLEDGE_BASE}
---

【重要なルール】
1. 営業マンに見せる提案なので、簡潔・具体的・すぐ使える内容にする
2. 会話の流れを読み、現在の商談フェーズを判断する
3. お客様の発言からシグナルを読み取り、属性（年齢層・性別・職種）を推測する
4. 地雷になりそうな発言・行動を積極的に警告する
5. 提案は3つ以内に絞る（多すぎると使えない）

【出力フォーマット】
必ず以下のJSON形式のみで返答してください。説明文は不要です。

{{
  "detected_attributes": {{
    "age_group": "20代前半 / 20代後半 / 30代 / 不明",
    "gender": "女性（推測） / 男性（推測） / 不明",
    "occupation": "営業職 / 事務職 / 看護師 / 工場勤務 / 教師 / 施工管理 / その他 / 不明",
    "mode": "今の痛み深掘り型 / 失敗したくない型 / 危機感型 / ファシリ型 / 承認先行型 / 標準"
  }},
  "current_phase": "ステップ1: 関係構築 / ステップ2: 転職活動の必要性 / ステップ3: 一人での限界 / ステップ4: プロと一緒に / ステップ5: サービス説明",
  "signal_detected": "今の発言から読み取れるシグナルを1文で。例：先延ばしバイアス発言、違和感シグナル、親ブロック予兆 など",
  "suggestions": [
    {{
      "type": "question / appeal / warning",
      "label": "次に聞く / 訴求する / 地雷注意",
      "content": "具体的なトーク例や行動指針"
    }}
  ]
}}
"""


def get_suggestion(conversation: str, latest_utterance: str) -> dict:
    user_message = f"""【会話履歴（直近）】
{conversation}

【最新の発言】
お客様：「{latest_utterance}」

この状況で、営業マンが次に何をすべきか教えてください。"""

    message = _client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = message.content[0].text.strip()

    # JSONブロックが```json ... ```で囲まれている場合に対応
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1])

    return json.loads(raw)
