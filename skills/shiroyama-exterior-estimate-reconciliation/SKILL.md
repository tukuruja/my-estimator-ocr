---
name: shiroyama-exterior-estimate-reconciliation
description: Reconcile OCR/CAD-derived quantities against the 城山都井沢 external works workbook. Use when Codex needs to match retaining wall, paving, demolition, drainage, and exterior quantities to the workbook logic, derive conservative formulas from `W/H/L/t` notation, or explain why OCR quantities do or do not align with the workbook.
---

# 城山都井沢 外構見積一致スキル

## Use This When
- PDF 図面の OCR 数量を `●外構内訳書（城山都井沢）.xlsm` に近づけたい
- `W/H/L/t` の読み方を retaining wall / pavement / demolition の候補へ落としたい
- 数量が workbook と一致しない理由を整理したい

## Workflow
1. まず [references/workbook_logic.md](references/workbook_logic.md) を読む。
2. 行単位の元データが必要なら [references/workbook_rows.tsv](references/workbook_rows.tsv) を grep する。
3. 解釈は必ず以下の順で行う。
   - `延長加算`
   - `面積×厚み`
   - `差し引き体積`
   - `箇所数/本数`
4. `W/H/L/t` から field 候補へ落とすときは、confirmed にせず review 付き候補として返す。
5. 図面だけで不足するものは `blocked` にして、workbook の数量を逆算根拠にしない。

## Hard Rules
- workbook 数量に合わせるために図面値を捏造しない。
- `As50+50+RC40 300` のような複層厚は、層を分けて保持する。
- 擁壁は `W/H` を断面属性、`L` を主数量として分ける。
- 撤去は対象ごとに `m` と `m2` を分ける。

## References
- [references/workbook_logic.md](references/workbook_logic.md)
- [references/workbook_rows.tsv](references/workbook_rows.tsv)
