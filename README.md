# 道場くん - リアルタイム営業支援AI Bot

Zoom商談中に、お客様の発言をリアルタイムで分析し、営業マンに最適なヒアリング・訴求・問いかけを提案するAI Botです。

---

## 構成

```
sales-doseki-kun/
├── backend/          # Python FastAPI + Claude API
│   ├── main.py
│   ├── claude_client.py
│   ├── session_manager.py
│   ├── knowledge_base.py
│   └── requirements.txt
└── frontend/         # React + Zoom Apps SDK
    └── src/
        ├── App.jsx   # メインUI
        └── App.css
```

---

## セットアップ手順

### 1. バックエンド

```bash
cd backend

# 仮想環境を作成
python3 -m venv .venv
source .venv/bin/activate

# 依存パッケージをインストール
pip install -r requirements.txt

# 環境変数を設定
cp .env.example .env
# .env を開いて ANTHROPIC_API_KEY を設定する
```

### 2. フロントエンド

```bash
cd frontend

# 環境変数を設定
cp .env.example .env
# 本番では VITE_API_BASE をデプロイ先のURLに変更する
```

---

## 起動方法（ローカル開発）

### バックエンドを起動

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

### フロントエンドを起動

```bash
cd frontend
npm run dev
# → http://localhost:3000 で起動
```

ブラウザで http://localhost:3000 を開くと、Zoom外のテスト用UIが表示されます。
画面下部の入力欄でお客様の発言を入力して動作確認できます。

---

## Zoom Apps として使う手順

### 前提
- Zoom Enterprise アカウント
- [Zoom Marketplace](https://marketplace.zoom.us/) でのアプリ登録

### 手順

1. **ngrok でHTTPS URLを取得**（開発時）
   ```bash
   ngrok http 3000
   # → https://xxxx.ngrok.io のURLをメモ
   ```

2. **Zoom Marketplace でアプリ登録**
   - [marketplace.zoom.us/develop/create](https://marketplace.zoom.us/develop/create) にアクセス
   - 「Zoom App」を選択して作成
   - 「Home URL」に ngrok URL を設定（例：`https://xxxx.ngrok.io`）
   - 「Redirect URL」に `https://xxxx.ngrok.io` を設定

3. **ミーティングでアプリを開く**
   - Zoom デスクトップクライアントでミーティングを開始
   - 上部メニュー「Apps」→ 作成したアプリをクリック
   - サイドバーに道場くんが表示される

4. **自動文字起こしを有効化**
   - ミーティング中に「CC」（字幕）ボタン → 「有効にする」
   - 言語を「日本語」に設定

---

## API仕様

### POST /session/{session_id}/analyze
お客様の発言を分析してAI提案を返す

**リクエスト**
```json
{
  "speaker": "customer",
  "text": "もう少し考えてから決めたいと思っています"
}
```

**レスポンス**
```json
{
  "detected_attributes": {
    "age_group": "20代後半",
    "gender": "不明",
    "occupation": "不明",
    "mode": "失敗したくない型"
  },
  "current_phase": "ステップ2: 転職活動の必要性",
  "signal_detected": "先延ばしバイアス発言",
  "suggestions": [
    {
      "type": "question",
      "label": "次に聞く",
      "content": "「そう思うのは本気で考えてる証拠ですよ」と正当化してから「一番引っかかっているのはどこですか？」と具体化させる"
    },
    {
      "type": "appeal",
      "label": "訴求する",
      "content": "第三者トーク：「同じように悩んで先延ばしにされた方がいて…」でリスクを見せる"
    },
    {
      "type": "warning",
      "label": "地雷注意",
      "content": "「今すぐやらないとヤバいですよ！」は20代後半には重すぎる→NG"
    }
  ]
}
```

### POST /session/{session_id}/transcript
営業マンの発言を記録する（提案は生成しない）

### DELETE /session/{session_id}
商談終了時にセッションを削除する
