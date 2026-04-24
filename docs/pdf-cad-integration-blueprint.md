# PDF-CAD 統合ブループリント

## 前提
- 参照元:
  - `/Users/user/Downloads/pdf_cad_skills_complete/pdf-cad-orchestrator/SKILL.md`
  - `/Users/user/Downloads/pdf_cad_skills_complete/pdf-cad-exterior/SKILL.md`
  - `/Users/user/Downloads/pdf_cad_skills_complete/pdf-cad-grading/SKILL.md`
  - `/Users/user/Downloads/pdf_cad_skills_complete/pdf-cad-retaining-wall/SKILL.md`
  - `/Users/user/Downloads/pdf_cad_skills_complete/pdf-cad-drainage/SKILL.md`
  - `/Users/user/Downloads/pdf_cad_skills_complete/calc_engine.md`
  - `/Users/user/Downloads/pdf_cad_skills_complete/safety_gate.md`
- 実在の「1億人の専門家合意」は不可能なので、ここでは `synthetic consensus` として役割別論点を統合する。

## このアプリに入れるべき中核
1. OCR
- 既存の `drawing-ocr` と `ai_api/main.py` を入口にする
- 返却値へ `cad_entities`, `dimensions`, `objects`, `quantities`, `stop_reasons`, `missing_information` を段階追加する

2. CAD データ化
- PDF から即 `完全CAD` ではなく、まず `CAD-oriented structured output` を正本にする
- 最小正本:
  - `vector lines`
  - `polylines`
  - `closed polygons`
  - `dimension chains`
  - `callouts`
  - `sheet links`
- これを DXF/JWW エクスポートの入力にする

3. 数量拾い
- `calc_engine.md` の discipline formula をそのまま安全ゲート付きで使う
- confirmed / estimated / blocked を必須にする
- 数量は「数が出た」ではなく「根拠が残る」ことを優先する

4. アプリ上の手動補正
- OCR 読み取り不能箇所は手動で `point-to-point` 指定
- 必要機能:
  - 任意2点距離計測
  - 縮尺変更
  - 手動 polyline / polygon 作成
  - 既存寸法の差し替え
  - 図面ページへの根拠リンク
- 変更時は `quantities` を即再計算する

5. Google Earth / 地表高
- これは地理参照が無い図面では直接確定できない
- 条件:
  - 図面座標系と地図座標系の対応
  - 測点または基準点
  - 高さ基準（TP / GL / FH）
- したがって Phase 1 では入れない
- Phase 3 以降で `elevation-overlay` として追加する

## 実装フェーズ
### Phase 1: 既存アプリへ直結
- OCR 出力へ `cad_entities`, `dimensions`, `objects` の箱を追加
- 変更見積書、根拠ページ、手動採用、review queue を既存 UI に接続
- これは今の構成にそのまま載る

### Phase 2: 計測レイヤ
- 図面画像上で
  - 点追加
  - 線分距離
  - 面積 polygon
  - 縮尺再設定
- 結果を `manual geometry` として保存
- OCR 読み取り不能箇所の補正導線に使う

### Phase 3: CAD-oriented 編集
- `cad_entities` を UI 上で表示
- レイヤ on/off
- オブジェクト選択
- DXF 出力
- JWW は後段

### Phase 4: 標高・土量
- 基準点がある案件に限り
  - GL/FH/EL
  - 現況/計画
  - 切土/盛土
- `grading` quantity を confirmed/estimated/blocked で返す

## このアプリへ追加すべき API
1. `POST /api/ocr/cad-extract`
- OCR と CAD-oriented structured output を返す

2. `POST /api/cad/manual-measurements`
- 手動点、線、面を保存

3. `POST /api/cad/recalculate-quantities`
- 手動補正後の数量再計算

4. `POST /api/reports/change-estimate.pdf`
- 既に実装済み

## Hard Stop
- scale 未確認
- unit 未確認
- dimension 未確認
- section/detail 未確認なのに体積を出そうとする
- existing/new 不明
- OCR 数字曖昧

## 結論
- `OCR -> CAD-oriented structured output -> 数量 -> 手動補正 -> 再計算` が現実路線
- `PDF -> 完全CAD -> 完全自動見積` を最初のゴールにしない
- このアプリでは Phase 1 と 変更見積書 PDF を先に固め、次に計測レイヤへ進むのが妥当
