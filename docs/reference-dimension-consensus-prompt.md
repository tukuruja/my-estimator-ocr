# Σ Reference Dimension And CAD Quantity Consensus Prompt

## Note
実在の「1億人の専門家招集」は不可能です。
この文書では、その代替として `synthetic consensus` を使います。
つまり、図面OCR、土木積算、施工管理、外構、品質、CAD、UI/UX、監査の論点を固定し、全員分の反証圧をかける形で合意プロンプトを定義します。

## Symbols
- `Σ` : synthetic consensus
- `⊢` : verified and acceptable
- `⚠` : degraded but usable with review
- `Ω` : production blocker
- `∴` : resulting implementation decision

## Expert Panel
- drawing_ocr
- civil_engineering_field
- construction_estimate_full_pack
- construction_site_master
- exterior_works_pro
- retaining_wall_specialist
- pavement_master
- roadwork_mastery
- site_supervision_master
- cad_quantity_review
- frontend_ux
- runtime_validation

## Objective
縮尺不明図面でも、ユーザーが `基準寸法 1 本` を指定すれば、そのページの手動計測を実長換算できるようにする。
さらに `cadStructured` と手動計測結果を使って、見積入力にそのまま反映可能な数量候補を自動生成する。

## Hard Rules
1. 縮尺不明のまま自動で実長確定しない。
2. 実長換算は `ページ実寸 + 図面縮尺` もしくは `基準寸法 1 本` があるときだけ許可する。
3. `GL/FH/EL` や callout と同様に、数量候補にも根拠ページ、根拠bbox、理由、review可否を必ず残す。
4. 手動計測由来と CAD structured 由来を区別して UI に表示する。
5. 候補再構築時は、古い自動候補を残さず、最新の calibration / measurement / cadStructured に同期する。
6. ユーザーの適用操作なしに block 値を勝手に書き換えない。
7. 確証の弱い候補は `requiresReview=true` にする。

## Required Inputs
- drawing.pages[].physicalWidthMm / physicalHeightMm
- drawing.resolvedUnits.sheetScaleRatio
- drawing.manualMeasurements[]
- drawing.measurementCalibrations[]
- drawing.cadStructured.quantities[]
- block.blockType
- price masters for canonical name resolution

## Required Outputs
- `measurement calibration` state per page
- `manual_measurement` candidates derived from calibrated measurements
- `cad_structured` candidates derived from `cadStructured.quantities`
- clear operator guidance in OCR screen
- audit-ready explanation of why each candidate exists

## Decision Procedure
1. If `sheetScaleRatio` exists and page physical size exists, use sheet-based real-world conversion.
2. Else if page calibration exists, use calibration-based real-world conversion.
3. Else keep measurement in `px / px²` and do not emit real-world quantity candidates from that measurement.
4. Always rebuild derived candidates after:
   - OCR upload
   - block field changes affecting formula
   - measurement save
   - calibration save
5. For strings tied to masters, canonicalize against effective-date master list.
6. For calibrated distance measurements:
   - emit `distance` candidate from the strongest measurement
7. For calibrated polygon measurements:
   - if pavement width exists, derive `distance`
   - if pavement distance exists, derive `pavementWidth`
   - if demolition width exists, derive `distance`
   - if demolition distance exists, derive `demolitionWidth`
8. For `cadStructured.quantities`:
   - emit direct structured candidates
   - preserve requiresReview from OCR pipeline
   - canonicalize master-linked strings

## Output Schema
```json
{
  "decision": "implemented | blocked",
  "verified": ["..."],
  "warnings": ["..."],
  "blockers": ["..."],
  "implementation": {
    "referenceDimensionCalibration": true,
    "measurementDerivedCandidates": true,
    "cadStructuredQuantityCandidates": true,
    "operatorUiGuidance": true
  },
  "evidence": {
    "files": ["..."],
    "checks": ["pnpm check", "pnpm build"]
  }
}
```

## Expected Result
`∴` ユーザーは縮尺不明図面でも、基準寸法 1 本を指定することで実長換算を開始できる。
`∴` 計測値と cadStructured の両方から数量候補が自動生成される。
`∴` 候補は UI 上で origin を区別して確認できる。
