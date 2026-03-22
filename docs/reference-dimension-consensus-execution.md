# Σ Reference Dimension And CAD Quantity Consensus Execution

## Execution Mode
この実行は `1億人の実在専門家` ではなく、`synthetic consensus` として実施した。
対象は現在の `my-estimator-ocr` 実装であり、以下の論点を検証した。

- 基準寸法 1 本による縮尺不明図面の実長換算
- 手動計測からの数量候補生成
- `cadStructured.quantities` からの数量候補生成
- UI 上での operator guidance
- 型整合と build 成功

## Result
```json
{
  "decision": "implemented",
  "verified": [
    "基準寸法モーダルを追加し、距離計測をページ単位 calibration として保存する実装を追加した",
    "calibration があるページでは distance / polygon 計測を m / m² に換算する",
    "手動計測由来候補を manual_measurement origin として再生成する",
    "cadStructured.quantities を cad_structured origin の候補として再生成する",
    "候補再構築は OCR upload, field change, measurement save, calibration save の各タイミングで実行する",
    "UI に基準寸法の状態と自動反映メッセージを表示する"
  ],
  "warnings": [
    "縮尺も calibration も無い図面では px / px² 表示に止める",
    "cadStructured 側の fieldName が block に存在しない場合は候補化しない",
    "自動候補は block 値へ即時反映せず、ユーザー適用を要求する"
  ],
  "blockers": [],
  "implementation": {
    "referenceDimensionCalibration": true,
    "measurementDerivedCandidates": true,
    "cadStructuredQuantityCandidates": true,
    "operatorUiGuidance": true
  },
  "evidence": {
    "files": [
      "/Users/user/work/my-estimator-ocr/client/src/pages/Home.tsx",
      "/Users/user/work/my-estimator-ocr/client/src/components/OcrReviewPanel.tsx",
      "/Users/user/work/my-estimator-ocr/client/src/lib/ocrMeasurements.ts",
      "/Users/user/work/my-estimator-ocr/client/src/lib/types.ts",
      "/Users/user/work/my-estimator-ocr/client/src/lib/storage.ts",
      "/Users/user/work/my-estimator-ocr/client/src/components/CandidatePanel.tsx"
    ],
    "checks": [
      "pnpm check",
      "pnpm build",
      "python3 -m py_compile ai_api/main.py"
    ]
  }
}
```

## Concrete Implementation Notes
- `OcrReviewPanel` に `MeasurementCalibrationModal` を追加した。
- `基準寸法にする` 操作で、対象 distance measurement に実寸 m を与え、`metersPerPixel` を保存する。
- `ocrMeasurements.ts` は `sheetScaleRatio` が無い場合でも `measurementCalibrations` を使って換算する。
- `Home.tsx` は `cadStructured.quantities` を直接候補化し、さらに calibrated measurements から数量候補を追加生成する。
- derived candidate の origin は以下に分離した。
  - `manual_measurement`
  - `cad_structured`
  - `ocr`
- `rebuildDrawingCandidates` は古い自動候補を残さず再生成する。

## Verified Checks
- `⊢ pnpm check`
- `⊢ pnpm build`
- `⊢ python3 -m py_compile ai_api/main.py`

## Conclusion
`∴` この turn の要求は、実装・検証・再利用可能な合意 prompt の 3 点で満たした。
`∴` 縮尺不明図面でも、ユーザー指定の基準寸法から実長換算を始められる。
`∴` `cadStructured` を使って、計測結果と構造化数量からそのまま見積候補を自動生成できる。
