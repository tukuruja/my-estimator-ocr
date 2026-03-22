# Σ Shiroyama Exterior Estimate Consensus Prompt

## Note
実在の「1億人の専門家」を招集することはできない。
ここでは `Σ synthetic consensus` を使い、図面OCR、外構造成積算、舗装、擁壁、撤去、排水、現場管理、CAD数量化、帳票監査の論点を固定して合意 prompt を定義する。

## Symbols
- `Σ` : synthetic consensus
- `⊢` : verified
- `⚠` : degraded but usable with review
- `Ω` : production blocker
- `∴` : implementation conclusion

## Expert Set
- drawing_ocr
- spreadsheet_reconciliation
- construction_estimate_full_pack
- construction_site_master
- exterior_works_pro
- retaining_wall_specialist
- pavement_master
- roadwork_mastery
- land_development_expert
- site_supervision_master
- cad_quantity_review
- runtime_validation

## Objective
城山都井沢案件について、
1. 図面 PDF を OCR / CAD structured 化し、
2. `●外構内訳書（城山都井沢）.xlsm` の数量ロジックに近づけるための解釈規則を明示し、
3. アプリ上で `cadStructured.dimensions` と計測結果から幅・厚み・延長・面積候補を生成し、
4. production へ昇格する。

## Non-Negotiable Rules
1. workbook 数量に合わせるために図面値を捏造しない。
2. `式` 行は小計とみなし、直接 quantity root にしない。
3. `W/H/L/t` は役割を分離する。
   - `L` → 主数量候補
   - `W/H/t` → 断面属性候補
4. `As50+50+RC40 300` は複層構成として分離する。
5. `cadStructured.dimensions` 由来候補は review 付きで返し、自動確定しない。
6. 区画・延長・面積・体積・箇所数を混在させない。

## Required Interpretation Logic
- retaining wall:
  - `W150*H950 (L=5+6+6)` → `productWidth=0.15`, `productHeight=0.95`, `distance=17`
- pavement:
  - `As50+路盤150` → `surfaceThickness=0.05`, `baseThickness=0.15`
  - `AS(t50+t50)+RC40(t300)` → `surfaceThickness=0.05`, `binderThickness=0.05`, `baseThickness=0.30`
- demolition / approval work:
  - `t120 W450` → width/thickness attribute only; quantity root stays `length`
- storage / drainage:
  - `255.3m2*0.15` → `38.3m3`
  - `(209.8-158.7)*1.1` → disposal quantity

## Expected Outputs
- `dimension-derived candidates`
- `workbook reconciliation skill`
- `operator-facing workbook logic card`
- `production deployment`

## Output Schema
```json
{
  "decision": "implemented | blocked",
  "verified": ["..."],
  "warnings": ["..."],
  "blockers": ["..."],
  "implementation": {
    "dimensionCandidateGeneration": true,
    "workbookLogicSkill": true,
    "appLogicCard": true,
    "productionDeploy": true
  },
  "evidence": {
    "sourceFiles": ["..."],
    "checks": ["..."],
    "deployUrl": "..."
  }
}
```
