# 建設現場合意エンジン 統合手順

## 1. いま追加したもの
- `shared/constructionConsensus.ts`
- `server/consensusApi.ts`
- `client/src/pages/ConsensusBlueprintPage.tsx`
- `GET /api/ai/consensus/blueprint`
- `POST /api/ai/consensus/preview-request`
- `/ai-consensus`

## 2. 現在の検証範囲
- 設計思想
- expert panel
- system prompt
- JSON schema
- current project / block から OpenAI request body を生成するところまで

## 3. 次に実装する本番化ポイント

### A. site conditions 入力UI
- 地質
- 湧水
- 交通規制
- 施工ヤード
- 埋設物
- 処分条件

### B. OpenAI 呼び出し endpoint
- `POST /api/ai/consensus/run`
- `OPENAI_API_KEY` 必須
- `preview-request` を Responses API に送信

### C. 見積反映
- quantityAdjustments を block へ反映
- priceAdjustments を evidenceRows と照合
- blockingQuestions を reviewIssues に変換

## 4. UI 統合案

### Home
- OCR確認画面の下に `AI合意レビュー` を追加
- current block の `decision` を表示

### EstimateReportPage
- 帳票生成時に `blockingQuestions` を上段警告として表示
- `auditTrail` を根拠欄へ表示

### PriceTable
- 採用単価と master 有効日を合意エンジンから逆参照できるようにする

## 5. 停止条件
- 図面未連携
- 単価有効日不明
- 地質未確認
- OCR候補競合
- 見積行と工種候補が不一致
