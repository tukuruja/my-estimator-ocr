# PDF-CAD 統合 Synthetic Consensus 実行結果

## 実行条件
- prompt: [pdf-cad-consensus-prompt.md](/Users/user/work/my-estimator-ocr/docs/pdf-cad-consensus-prompt.md)
- 参照:
  - `/Users/user/Downloads/pdf_cad_skills_complete/*`
  - 既存 app:
    - `client/src/lib/reporting.ts`
    - `client/src/pages/Home.tsx`
    - `ai_api/main.py`

## 判定
- `current_app_fit`: ⊢
- `phase_1_features`: ⊢
- `phase_2_features`: △
- `phase_3_features`: ⟂

## current_app_fit
- 既存アプリは
  - OCR review
  - review queue
  - 工種候補
  - 変更見積書
  - 区画別配賦
  - 単価根拠
  を既に持つ
- したがって `Phase 1` は現行構成へ追加可能

## phase_1_features
- OCR -> CAD-oriented structured output shell
- change estimate PDF
- zone metadata
- review queue
- title block / page role / link resolution

## phase_2_features
- 次に必要なのは `手動計測`
- 必要 UI:
  - 2点距離
  - polyline
  - polygon
  - 縮尺変更
  - manual override save
- これは今の `OcrCanvas` 拡張で実装可能

## phase_3_features
- DXF/JWW を実編集可能にするには別レイヤが必要
- 今のアプリに即入れると責務が混ざる
- したがって `Phase 3` は別モジュールとして切る

## stop_conditions
- scale 未確認
- unit 未確認
- dimension 未確認
- section/detail 不足
- existing/new 不明
- 地理参照不明なのに地表高を当て込む

## server_api_plan
1. `POST /api/ocr/cad-extract`
2. `POST /api/cad/manual-measurements`
3. `POST /api/cad/recalculate-quantities`
4. `POST /api/reports/change-estimate.pdf`

## ui_plan
1. OCR確認画面
  - CAD entity overlay
  - dimension basis
  - blocked reasons
2. 計測画面
  - 点追加
  - 線距離
  - 面積
  - 縮尺修正
3. 数量確認画面
  - confirmed / estimated / blocked
  - source pages
  - source entities
  - manual override trace

## quantity_safety_rules
- confirmed:
  - scale_verified
  - unit_verified
  - dimension_verified
  - geometry_complete
- estimated:
  - basis disclosed
  - user review still required
- blocked:
  - any critical basis missing

## execution_verdict
- このアプリへ今すぐ載せるべきは
  - OCR 強化
  - 変更見積書 PDF
  - zone metadata
  - 次段の計測レイヤ設計
- まだ載せてはいけないのは
  - 根拠の薄い CAD 自動化
  - 地理参照なしの土量確定
