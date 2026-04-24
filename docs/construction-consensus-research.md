# 建設現場合意エンジン 研究結果

## 前提
- 「1億人の専門家を実際に招集する」は実行不能
- 代替として、積算・施工・地質・仮設・図面・原価・監査・AI安全を分離した `synthetic consensus` を採用する
- 目的は `完全自動化` ではなく `未確定を止めつつ確定可能な部分だけを強くすること`
- 数量拾いでは、ユーザーが指定した現場系知識パックを全件評価し、どの pack がどの field に効いたかを監査可能に残す

## 最終合意
1. 数量拾いと施工判断は分ける
2. 地質、交通、埋設物、搬入、処分条件は未確認なら停止する
3. OCR候補は根拠 bbox と confidence を必須化する
4. 単価は有効日、資料名、版、ページを必須化する
5. 出力は `見積書 / 単価根拠表 / 要確認一覧` を同時生成する

## expert panel
- 積算統括
- 現場代理人
- 地質責任者
- 仮設計画
- 測量CAD
- OCR根拠監査
- 原価管理
- 品質法令
- 発注者視点
- AI安全統制

## knowledge packs
数量拾いで全件評価する knowledge pack:
- Civil Engineering Field
- 建設積算フルパック
- 建設現場統合
- Construction Supreme Management
- Exterior Works Pro
- Land Development Expert
- マンション工事 見積入力
- Pavement Master
- Rebar Craftsman
- Retaining Wall Specialist
- Roadwork Mastery
- Site Supervision Master
- Fence Professional
- Foreman Expertise
- Formwork Precision

それぞれの pack は `direct / guardrail / future_scope` のどれかで効く。
- `direct`: adoptedValue に直接効く
- `guardrail`: 数量を変えず、停止条件・要確認・誤工種流入を監視する
- `future_scope`: 現行アプリ未対応の数量として隔離し、勝手に埋めない

## 数量拾いプロトコル
1. OCR候補、図面候補、工種候補をフィールド単位で集約する
2. knowledge pack を全件走査し、field ごとに direct / guardrail / future_scope を決める
3. direct の pack で adoptedValue 候補を絞る
4. guardrail の pack で stop / review_required の判定をかける
5. future_scope の pack は `futureScopeIsolation` へ送る
6. `quantityReviewMatrix` に field ごとの判定痕跡を残す

## AI prompt の役割
- OCR結果、図面候補、単価根拠、現場条件を一つの JSON に束ねる
- unknown を推測で埋めず `blockingQuestions` に送る
- knowledge pack selection を全件評価させる
- 結果を `ready / conditional / review_required / stop` で分類する

## JSON schema の役割
- workInterpretation
- activatedKnowledgePacks
- constructionPlan
- quantityAdjustments
- quantityReviewMatrix
- priceAdjustments
- riskFlags
- blockingQuestions
- futureScopeIsolation
- executableNextActions
- auditTrail
- summary

## この repo での統合位置
- `client/src/pages/Home.tsx`
- `server/reportApi.ts`
- `server/masterStore.ts`
- `client/src/pages/ConsensusBlueprintPage.tsx`
- `server/consensusApi.ts`
- `shared/constructionConsensus.ts`

## 検証方法
1. `GET /api/ai/consensus/blueprint`
2. `POST /api/ai/consensus/preview-request`
3. current project / block で preview request を生成
4. `selectedKnowledgePacks` と `quantityExtractionProtocol` が返ることを確認する
5. その結果を `/ai-consensus` ページで可視化する

## OpenAI 統合時の使い方
- `shared/constructionConsensus.ts` の `buildConstructionConsensusOpenAiRequest()` をそのまま送る
- 応答は JSON schema で固定し、自由文を禁止する
- 実行前に OCR・単価・site conditions を必ず束ねる
- 結果側では `activatedKnowledgePacks` と `quantityReviewMatrix` の空配列返却を禁止する
