# 見積ロジック確立プロトコル

## 目的
- 図面が読めない担当者でも、停止条件付きの手順で見積を前進させる
- 図面根拠、施工判断、単価根拠、要確認を一つの Logic に固定する

## 核心
1. 工種を一つに固定する
2. 図面を OCR で構造化する
3. OCR 候補は bbox と sourceText を見て採否する
4. 必須数量が不足していれば stop する
5. warning は review_required、critical は stop とする
6. 見積書、単価根拠表、要確認一覧を同時に出す

## 運用原則
- 推測で埋めない
- review queue が残っている間は自動確定しない
- 単価根拠の有効日と資料名が無い行を確定しない
- 未確認の現場条件は要確認一覧に送る

## サイト統合
- 公開ページ: `/ai-estimation-logic`
- API:
  - `GET /api/ai/estimation-logic/blueprint`
  - `POST /api/ai/estimation-logic/preview-request`
- shared 正本: `shared/estimationLogic.ts`
