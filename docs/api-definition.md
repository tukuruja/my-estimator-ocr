# API定義

## OCR API
### POST `/api/ocr/parse-drawing`
- Content-Type: `multipart/form-data`
- fields:
  - `file`
  - `mode`
- `mode`:
  - `secondary_product`
  - `retaining_wall`
  - `pavement`
  - `demolition`
- response:
  - `drawingSource`
  - `aiCandidates`
  - `workTypeCandidates`
  - `ocrLines`
  - `ocrItems`
  - `pagePreview`
  - `pagePreviews`
  - `debug`

## 案件保存 API
### GET `/api/app-state`
- response:
  - `schemaVersion`
  - `updatedAt`
  - `projects`

### PUT `/api/app-state`
- request:
  - `projects`
- response:
  - `schemaVersion`
  - `updatedAt`
  - `projects`

### GET `/api/projects`
- response:
  - `Project[]`

### POST `/api/projects`
- request:
  - `Project`
- response:
  - 保存後 `Project`

### GET `/api/projects/{projectId}`
- response:
  - `Project`

### PUT `/api/projects/{projectId}`
- request:
  - `Project`
- response:
  - 保存後 `Project`

### DELETE `/api/projects/{projectId}`
- response:
  - `deleted`
  - `projectId`

### GET `/api/projects/{projectId}/drawings`
- response:
  - `Drawing[]`

## 単価マスタ API
### 概要
- 正本は PostgreSQL `price_master_items` テーブルです。
- `effectiveDate` 指定時は、その有効日に使える単価のみ返します。

### GET `/api/masters`
- query:
  - `masterType`
  - `keyword`
  - `effectiveDate`
- response:
  - `PriceMasterItem[]`

### PUT `/api/masters`
- request:
  - `items: PriceMasterItem[]`
- response:
  - 保存後 `PriceMasterItem[]`

### POST `/api/masters`
- request:
  - `PriceMasterItem`
- response:
  - 保存後 `PriceMasterItem`

### GET `/api/masters/{masterId}`
- response:
  - `PriceMasterItem`

### PUT `/api/masters/{masterId}`
- request:
  - `PriceMasterItem`
- response:
  - 保存後 `PriceMasterItem`

## 帳票生成 API
### POST `/api/reports/generate`
- request:
  - 方式A: `project`, `block`, `drawing`, `effectiveDate`
  - 方式B: `projectId`, `blockId`, `drawingId`, `effectiveDate`
- response:
  - `GeneratedReportBundle`
    - `estimateRows`
    - `unitPriceEvidenceRows`
    - `reviewIssues`
    - `summary`

### 備考
- 帳票生成時の単価は PostgreSQL から `effectiveDate` 基準で取得します。
- フロントは入力中のスナップショットを `POST /api/reports/generate` に送ることで、未保存の変更も帳票へ反映できます。
