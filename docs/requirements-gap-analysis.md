# 建設図面OCR積算AIアプリ 要件差分分析

## 元資料
- 要件定義書: `/Users/user/Library/Mobile Documents/com~apple~CloudDocs/Downloads/建設図面ocr積算aiアプリ_完全要件定義書_v_1.md`
- 版数: v1.0
- 作成日: 2026-03-12

## 現在の実装位置
現在のアプリは、要件定義書にある「SCR-008 二次製品入力」と「SCR-012 見積結果」のごく初期版に相当する。

### すでにあるもの
- 二次製品向けの入力フォーム
- 二次製品向けの計算ロジック
- 見積ブロックの切替
- 単価表の編集UI
- ローカル保存
- 日本語UIの基本文言
- Vercel preview 用のビルド設定

### 実装済みファイルの中心
- `client/src/pages/Home.tsx`
- `client/src/components/InputForm.tsx`
- `client/src/components/CalculationResults.tsx`
- `client/src/components/EstimateList.tsx`
- `client/src/pages/PriceTable.tsx`
- `client/src/lib/calculations.ts`
- `client/src/lib/calculationsV2.ts`
- `client/src/lib/priceData.ts`
- `client/src/lib/storage.ts`
- `server/index.ts`

## 要件との主な差分

### 1. 案件管理
要件:
- 案件一覧
- 案件作成/編集/削除
- 案件検索
- 案件ごとの図面一覧

現状:
- 見積ブロック切替のみ
- `project` 概念なし
- DB なし

不足:
- projects モデル
- 案件一覧画面
- 案件単位の保存先

### 2. 図面管理
要件:
- PDF/画像アップロード
- 複数ファイル対応
- 図面番号/タイトル/版番号管理
- 差し替え登録

現状:
- 図面アップロード機能なし
- ファイルストレージなし

不足:
- drawing/upload API
- ファイル保存先
- drawing metadata テーブル

### 3. OCR処理
要件:
- PDF画像化
- OCR実行
- OCR bbox保存
- OCR結果一覧表示

現状:
- OCR処理なし
- bbox 表示なし

不足:
- FastAPI もしくは OCR 用 backend サービス
- `POST /api/ocr/parse-drawing`
- preview 画像生成
- OCR item 保存

### 4. AI候補生成
要件:
- AI候補生成
- confidence
- sourceText/sourceBox
- requiresReview
- 候補採用/却下

現状:
- AI候補機能なし

不足:
- AICandidate 型
- 候補カード UI
- 候補反映 API
- 要確認ルール

### 5. OCR可視化と双方向確認
要件:
- ページ画像表示
- OCR bboxオーバーレイ
- OCR行クリックで bbox 強調
- 候補クリックで根拠 bbox 強調

現状:
- 結果テーブルのみ
- 図面プレビューなし

不足:
- OCR確認画面
- bbox 描画コンポーネント
- hover/click 同期

### 6. 工種拡張
要件:
- 擁壁
- 舗装
- 撤去工事

現状:
- プレースホルダのみ

不足:
- 入力項目定義
- 計算ロジック
- バリデーション
- AI候補マッピング

### 7. 単価マスタ
要件:
- DB 化
- 標準コード
- 有効期間
- 仕入先/地域
- 更新履歴

現状:
- `priceData.ts` の静的配列
- 一部 localStorage 編集

不足:
- masters テーブル
- master_aliases
- 更新履歴と監査

### 8. 承認・監査・版管理
要件:
- 承認フロー
- 監査ログ
- 版差分
- append-only ログ

現状:
- なし

不足:
- audit_logs テーブル
- approvals テーブル
- drawing revision 比較

### 9. 学習フィードバック
要件:
- AI候補と確定値の差分保存
- feedback API
- 再学習素材化

現状:
- なし

不足:
- feedback_logs テーブル
- 操作ログ UI
- 差分保存処理

### 10. 技術基盤
要件:
- React/Vite 継続可
- FastAPI
- PostgreSQL
- オブジェクトストレージ
- Redis

現状:
- React/Vite + Express
- localStorage
- 単一 Node server

不足:
- API 分離方針
- 永続DB
- ストレージ
- 非同期ジョブ

## 現在の app をどう位置づけるべきか
この repo は「本番要件のごく手前にある、二次製品見積のローカル試算 UI」である。

要件定義書のスコープで言うと、以下だけが部分的に入っている。
- SCR-008 二次製品入力
- SCR-012 見積結果
- SCR-013 単価マスタ一覧の簡易版

逆に、要件の中核である以下は未着手と見なすべき。
- 案件管理
- 図面管理
- OCR
- AI候補
- bbox根拠表示
- 監査
- 権限
- DB
- 学習フィードバック

## 実装優先度

### 最優先
1. OCRバックエンド基盤
2. OCR確認画面
3. AI候補データ型と候補カード
4. 二次製品フォームへの候補反映
5. 計算API化

### 次点
1. 案件/図面モデル
2. 単価マスタDB化
3. 監査ログ
4. 擁壁・舗装・撤去工事への横展開

### 後続
1. 原価連携
2. 承認フロー
3. 版差分
4. 学習フィードバック

## 結論
この要件定義書を基準にするなら、現在の repo は作り直しではなく「Phase 1 の UI土台」として再利用するのが妥当である。

ただし、今のまま feature を積み増すと `project / drawing / ocr / candidate / audit` の概念が入らないため、次の実装からはデータ構造を案件中心に切り替える必要がある。
