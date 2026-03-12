# API定義

## OCR API
### POST `/api/ocr/parse-drawing`
- Content-Type: `multipart/form-data`
- fields:
  - `file`
  - `mode`
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
