# Drawing OCR Skill Pack 統合メモ

## 取り込み元
- `/Users/user/Desktop/CODEXスキル/OCR`

## 正本ファイル
- `drawing_ocr_knowledge_master.csv`
- `drawing_ocr_skill_pack.json`
- `drawing_ocr_prompt_definitions.json`
- `drawing_ocr_sheet_type_master.csv`
- `drawing_ocr_abbreviation_master.csv`
- `drawing_ocr_symbol_seed_master.csv`
- `drawing_ocr_field_dictionary.csv`
- `drawing_ocr_pack_summary.csv`
- `drawing_ocr_prompt_templates.md`
- `drawing_ocr_readme.md`

## 欠落していたファイル
- `drawing_ocr_skill_import.csv`

このファイルは元フォルダに存在しなかったため、`drawing_ocr_skill_pack.json` の `skills` 配列から派生生成している。
生成先:
- `server/data/drawing-ocr-pack/drawing_ocr_skill_import.csv`

## 生成物
- `server/data/drawing-ocr-pack/manifest.json`
- `server/data/drawing-ocr-pack/knowledge_master.json`
- `server/data/drawing-ocr-pack/sheet_type_master.json`
- `server/data/drawing-ocr-pack/abbreviation_master.json`
- `server/data/drawing-ocr-pack/symbol_seed_master.json`
- `server/data/drawing-ocr-pack/field_dictionary.json`
- `server/data/drawing-ocr-pack/pack_summary.json`
- `server/data/drawing-ocr-pack/prompt_definitions.json`
- `server/data/drawing-ocr-pack/skill_pack.json`
- `server/data/drawing-ocr-pack/drawing_ocr_skill_import.csv`

## 取り込みコマンド
```bash
/Users/user/work/my-estimator-ocr/scripts/import_drawing_ocr_pack.py
```

## API
- `GET /api/ocr-pack/manifest`
- `GET /api/ocr-pack/knowledge`
  - query: `category`, `pipelineStage`, `priority`
- `GET /api/ocr-pack/skills`
- `GET /api/ocr-pack/prompts`
- `GET /api/ocr-pack/dictionaries`

## 現時点の件数
- knowledge: 69
- sheet types: 56
- abbreviations: 90
- symbol seeds: 38
- prompts: 15
- skills: 15
- review queues: 15

## 現在の意味
この統合で、建設図面 OCR 用の辞書・知識・プロンプト・レビューキュー定義をアプリ内の API から参照できる。
ただし、まだ `ai_api/main.py` の実 OCR ルーティングには直結していない。

## 次にやるべきこと
1. `ai_api/main.py` の媒体判定・シート分類・凡例解決を、この pack の `prompt_definitions` と `knowledge_master` に寄せる
2. `ConsensusBlueprintPage` か `Home` に OCR パック件数と review queue を表示する
3. `POST /api/ai/consensus/run` の前処理として、この pack を prompt router に使う
