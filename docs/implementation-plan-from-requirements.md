# 要件定義書ベース実装計画

## 目的
`建設図面ocr積算aiアプリ_完全要件定義書_v_1.md` を、現在の `my-estimator-ocr` に段階的に落とし込む。

## 実装方針
- 既存の二次製品 UI と計算ロジックは捨てずに再利用する
- 先に OCR と候補反映の流れを二次製品だけで完成させる
- その後、案件/DB/監査へ広げる
- 擁壁、舗装、撤去工事は Phase 2 以降で展開する

## Phase A: 現行 app の再土台化
目的:
- 現在のローカル見積アプリを、OCR対応のための器に変える

作業:
- `Project` 型を追加
- `Drawing` 型を追加
- `EstimateBlock` に `projectId`, `drawingId`, `blockType` を追加
- ルーティングを「案件 -> 図面 -> 入力」に再整理
- localStorage 保存構造を案件単位に変更

対象候補ファイル:
- `client/src/lib/types.ts`
- `client/src/lib/storage.ts`
- `client/src/App.tsx`
- `client/src/pages/Home.tsx`

## Phase B: OCR基盤
目的:
- PDF/画像を取り込み、OCR結果と preview を返せるようにする

作業:
- FastAPI サービス追加
- `POST /api/ocr/parse-drawing` 実装
- PDF -> PNG preview 生成
- OCR line と bbox を JSON 返却
- preview static 配信

対象候補ファイル:
- `ai_api/main.py`
- `ai_api/requirements.txt`
- `client/src/lib/api.ts`

完了条件:
- PDF を 1 枚アップロードできる
- page image と OCR items が返る

## Phase C: OCR確認画面
目的:
- 画像、OCR行、bbox を可視化する

作業:
- OCR確認画面新設
- 画像上に bbox オーバーレイ表示
- OCR行一覧表示
- 行クリックで bbox 強調
- bbox クリックで行選択

対象候補ファイル:
- `client/src/pages/OcrReview.tsx`
- `client/src/components/OcrCanvas.tsx`
- `client/src/components/OcrLineList.tsx`

完了条件:
- OCR行と bbox が双方向で連動する

## Phase D: AI候補生成と反映
目的:
- OCR結果から二次製品入力候補を生成し、フォームへ反映する

作業:
- AICandidate 型追加
- 二次製品向け rule-based extractor 実装
- 候補カード UI 実装
- hover/click で根拠 bbox に連動
- 個別反映/一括反映
- `requiresReview` 判定

対象候補ファイル:
- `client/src/lib/types.ts`
- `client/src/components/CandidatePanel.tsx`
- `client/src/pages/Home.tsx`
- `ai_api/main.py`

完了条件:
- `distance`, `currentHeight`, `plannedHeight`, `stages`, `productWidth`, `productHeight`, `productLength` の候補が返る

## Phase E: 計算APIと警告
目的:
- 計算ロジックを API 応答可能な形にする

作業:
- `calculate` の warning 出力を追加
- `POST /api/estimate/calculate` 実装
- `requiresReviewFields` を返却

対象候補ファイル:
- `client/src/lib/calculations.ts`
- `server/index.ts` または新API

完了条件:
- 計算結果に警告欄が出る
- AI候補反映後に計算更新できる

## Phase F: DB化
目的:
- localStorage を卒業し、案件・図面・結果を永続化する

作業:
- PostgreSQL schema 作成
- `projects`, `drawings`, `drawing_pages`, `ocr_items`, `ai_candidates`, `estimate_blocks`, `estimate_results` を先行実装
- 単価マスタを `masters` へ移行

完了条件:
- 案件を跨いでもデータが保持される

## Phase G: 監査と学習
目的:
- 実務で使える説明責任を持たせる

作業:
- `audit_logs` 保存
- `feedback_logs` 保存
- 承認フロー追加
- 修正差分の保存

## 直近の実装着手点
最初に着手すべきなのは Phase B である。

理由:
- 要件定義書の中核は OCR + bbox + AI候補
- 現在の repo に最も足りないのはここ
- ここが無いと要件の主目的に近づかない

## 直近の 1 スプリントでやるべき範囲
1. `ai_api` 追加
2. PDF 1ページ OCR
3. preview 画像保存
4. OCR items 返却
5. OCR確認画面追加
6. 二次製品フォームと OCR確認画面を並列表示

## 完了の定義
二次製品工種について、以下が通れば要件の Phase 1 完了と見なせる。
- PDF/画像をアップロードできる
- OCR bbox が見える
- AI候補が一覧で見える
- 候補の根拠 bbox が追える
- 候補をフォームへ反映できる
- 計算結果が更新される
