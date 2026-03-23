/**
 * OCR Enhancement API — Gemini Vision による図面理解・数量精度向上エンジン
 *
 * エンドポイント:
 *   POST /api/ocr-enhance/analyze    — ページ画像を Gemini Vision で解析
 *   POST /api/ocr-enhance/validate   — 抽出候補を AI で検証・補正
 *   POST /api/ocr-enhance/extract-quantities — 数量表を AI で直接抽出
 *
 * 設計方針:
 *   - RapidOCR で取得した基礎 OCR → Gemini Vision で二次解析
 *   - 建設図面専用プロンプトで精度向上
 *   - 候補の信頼度 + AI理解を組み合わせた最終判定
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

// ─── 型定義 ─────────────────────────────────────────────────────────────────

export interface VisionAnalysisRequest {
  /** Base64エンコードされたページ画像 */
  imageBase64?: string;
  /** または画像ファイルパス（サーバーローカル） */
  imagePath?: string;
  /** OCR で既に抽出されたテキスト行（補助情報） */
  ocrLines?: string[];
  /** 解析モード: secondary_product / retaining_wall / pavement / demolition */
  mode?: string;
  /** ページ番号 */
  pageNumber?: number;
}

export interface VisionAnalysisResult {
  /** 図面の種類（平面図・断面図・数量表・詳細図など） */
  drawingType: string;
  /** 図面から読み取った工種 */
  workTypes: string[];
  /** 図面から読み取った数量データ */
  quantities: Array<{
    item: string;
    value: number;
    unit: string;
    confidence: number;
    location: string;
  }>;
  /** 製品・材料名 */
  products: Array<{
    name: string;
    dimensions: string;
    confidence: number;
  }>;
  /** 寸法データ */
  dimensions: Array<{
    label: string;
    value: number;
    unit: string;
    confidence: number;
  }>;
  /** 図面全体の説明（日本語） */
  summary: string;
  /** AI信頼度スコア (0-1) */
  overallConfidence: number;
}

export interface CandidateValidationRequest {
  candidates: Array<{
    fieldName: string;
    value: string | number;
    sourceText: string;
    confidence: number;
  }>;
  ocrLines: string[];
  mode: string;
}

export interface CandidateValidationResult {
  validatedCandidates: Array<{
    fieldName: string;
    originalValue: string | number;
    correctedValue: string | number | null;
    isValid: boolean;
    confidence: number;
    reason: string;
  }>;
}

export interface QuantityExtractionRequest {
  imageBase64?: string;
  imagePath?: string;
  ocrLines?: string[];
  mode?: string;
}

export interface QuantityExtractionResult {
  quantities: Array<{
    item: string;
    value: number;
    unit: string;
    confidence: number;
    sourceText: string;
    category: string;
  }>;
  tables: Array<{
    title: string;
    headers: string[];
    rows: Array<Record<string, string | number>>;
  }>;
}

// ─── 建設図面専用プロンプト ──────────────────────────────────────────────────

const CONSTRUCTION_DRAWING_SYSTEM_PROMPT = `あなたは日本の土木・外構・建設図面を解析する専門AIです。
以下の能力を持っています：

【図面種別の判定】
- 平面図、断面図、詳細図、数量表、構造図、配筋図、舗装構成図、排水計画図を区別できます
- 各図面の凡例、方位、スケール、工区表示を読み取れます

【数量の読み取り】
- 施工延長 (m)、面積 (m²)、体積 (m³)、本数、段数
- 寸法: 幅 (W), 高さ (H), 厚さ (t), 長さ (L), 深さ (D)
- 表形式の数量表: 品名・規格・数量・単位・単価
- 断面図からの掘削深さ、製品寸法、基礎厚

【建設用語の理解】
- 二次製品（U型側溝、L型擁壁、ボックスカルバートなど）の型式・規格
- 舗装構成（表層、基層、上層路盤、下層路盤、路床）
- 擁壁工（RC擁壁、ブロック積み、重力式、片持ち式）
- 排水工（集水桝、側溝蓋、グレーチング、管渠）
- 土工（切土、盛土、埋戻し、残土処分）

【単位系】
- 長さ: mm, cm, m, km
- 面積: m², ha
- 体積: m³
- 重量: kg, t
- 「延長」は通常 m、「幅」「高さ」は mm または m

回答は必ず JSON 形式で返してください。`;

const VISION_ANALYSIS_PROMPT = `この建設図面画像を詳細に解析してください。

以下の情報を抽出して JSON で返してください：

{
  "drawingType": "図面の種類（平面図/断面図/数量表/詳細図/構造図）",
  "workTypes": ["この図面に含まれる工種（例：側溝工、擁壁工、舗装工）"],
  "quantities": [
    {"item": "品名", "value": 数値, "unit": "単位", "confidence": 0.0-1.0, "location": "図面上の位置"}
  ],
  "products": [
    {"name": "製品名（型式含む）", "dimensions": "寸法表記", "confidence": 0.0-1.0}
  ],
  "dimensions": [
    {"label": "寸法ラベル", "value": 数値, "unit": "単位", "confidence": 0.0-1.0}
  ],
  "summary": "この図面の全体的な説明（100文字以内）",
  "overallConfidence": 0.0-1.0
}

重要ルール：
- 数値が読み取れない場合は confidence を 0.3 以下にしてください
- 寸法線が付いている数値は confidence を 0.8 以上にしてください
- 数量表（表形式）の数値は confidence を 0.9 以上にしてください
- 単位が不明な場合は最も妥当な単位を推定し、confidence を下げてください`;

const CANDIDATE_VALIDATION_PROMPT = `以下はOCRで建設図面から抽出した候補データです。
各候補が正しいかどうかを検証し、誤りがあれば補正してください。

検証ポイント：
1. 数値の桁数・単位の妥当性（例：側溝幅 300mm は妥当、30000mm は異常）
2. 建設用語として意味が通るか
3. OCR誤読の可能性（0↔O、1↔l、6↔8、5↔S、日↔目 など）
4. 前後の文脈との整合性

回答は JSON 配列で返してください：
[
  {
    "fieldName": "フィールド名",
    "originalValue": "元の値",
    "correctedValue": "補正後の値（変更なしならnull）",
    "isValid": true/false,
    "confidence": 0.0-1.0,
    "reason": "判定理由"
  }
]`;

const QUANTITY_EXTRACTION_PROMPT = `この建設図面から数量を正確に抽出してください。

抽出対象：
1. 施工延長（m）
2. 製品の型式・サイズ（幅×高さ×長さ）
3. 掘削・埋戻しの深さ・幅
4. 砕石・ベースコンクリートの厚さ
5. 表形式の数量一覧
6. 断面図から読み取れる各層の厚さ

回答は JSON で返してください：
{
  "quantities": [
    {
      "item": "品目名",
      "value": 数値,
      "unit": "単位",
      "confidence": 0.0-1.0,
      "sourceText": "図面上の元テキスト",
      "category": "カテゴリ（施工延長/製品寸法/地盤/材料厚/数量表/その他）"
    }
  ],
  "tables": [
    {
      "title": "表のタイトル",
      "headers": ["列名1", "列名2"],
      "rows": [{"列名1": "値1", "列名2": "値2"}]
    }
  ]
}

重要：
- 数量表がある場合は全行を漏れなく抽出してください
- 断面図の寸法は寸法線の端から端を正確に読んでください
- 単位が省略されている場合は文脈から推定してください（mm/m の判別に注意）`;

// ─── ユーティリティ ──────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getPathname(req: IncomingMessage): string {
  return new URL(req.url || '/', 'http://localhost').pathname;
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T;
}

async function loadImageBase64(imagePath: string): Promise<string> {
  const buf = await fs.readFile(imagePath);
  return buf.toString('base64');
}

// ─── Gemini Vision API 呼び出し ─────────────────────────────────────────────

async function callGeminiVision(
  systemPrompt: string,
  userPrompt: string,
  imageBase64: string | null,
  imageMimeType: string = 'image/png',
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が未設定です。');
  }

  const model = process.env.GEMINI_VISION_MODEL?.trim() || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // ユーザーコンテンツ: テキスト + 画像（あれば）
  const userParts: Array<Record<string, unknown>> = [
    { text: userPrompt },
  ];

  if (imageBase64) {
    userParts.push({
      inline_data: {
        mime_type: imageMimeType,
        data: imageBase64,
      },
    });
  }

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: userParts }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Vision API エラー: ${response.status} ${errorText.slice(0, 200)}`);
  }

  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini Vision API から回答が返りませんでした。');
  }

  return text;
}

// ─── 建設用語 OCR 補正辞書 ──────────────────────────────────────────────────

const CONSTRUCTION_OCR_CORRECTIONS: Record<string, string> = {
  // よくあるOCR誤読
  '側溝': '側溝', '側濠': '側溝', '側講': '側溝',
  '擁壁': '擁壁', '擁墜': '擁壁', '壁': '壁',
  '舗装': '舗装', '鋪装': '舗装', '歩装': '舗装',
  '砕石': '砕石', '砕右': '砕石', '碎石': '砕石',
  '延長': '延長', '延畏': '延長', '延腸': '延長',
  '掘削': '掘削', '掘出': '掘削', '堀削': '掘削',
  '埋戻': '埋戻', '埋戻し': '埋戻し', '埋戾': '埋戻',
  '路盤': '路盤', '路盃': '路盤', '路般': '路盤',
  '表層': '表層', '表居': '表層',
  '基層': '基層', '基屑': '基層',
  'コンクリート': 'コンクリート', 'コンクリ一ト': 'コンクリート',
  'アスファルト': 'アスファルト', 'アスフアルト': 'アスファルト',
  'ベース': 'ベース', 'ぺ一ス': 'ベース',
  'グレーチング': 'グレーチング', 'グレーテング': 'グレーチング',
  'カルバート': 'カルバート', 'カルバ一ト': 'カルバート',
  'ボックス': 'ボックス', 'ボツクス': 'ボックス',
  // 数字のOCR誤読
  'O': '0', 'o': '0', 'l': '1', 'I': '1',
  'S': '5', 'B': '8', 'Z': '2', 'G': '6',
};

/**
 * OCRテキストに建設用語辞書を適用して補正する
 */
export function applyConstructionDictionary(text: string): string {
  let corrected = text;
  for (const [wrong, right] of Object.entries(CONSTRUCTION_OCR_CORRECTIONS)) {
    if (wrong.length >= 2) {
      // 2文字以上の用語は全体マッチで置換
      corrected = corrected.replace(new RegExp(escapeRegex(wrong), 'g'), right);
    }
  }
  return corrected;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 数値文字列のOCR誤読を補正
 * 例: "1O5.3" → "105.3", "3OO" → "300"
 */
export function correctNumericOcr(text: string): string {
  // 数値コンテキスト内の文字置換
  return text
    .replace(/(?<=\d)[Oo](?=\d)/g, '0')     // 123O45 → 12345 (数字間のO→0)
    .replace(/(?<=\d)[lI](?=\d)/g, '1')      // 12l45 → 12145
    .replace(/^[Oo](?=\d)/g, '0')            // O12 → 012
    .replace(/(?<=\d)[Oo]$/g, '0')           // 12O → 120
    .replace(/[，,](?=\d{3})/g, '')          // 1,000 → 1000
    .replace(/\s+(?=\d)/g, '');               // "12 345" → "12345"
}

// ─── API ハンドラー ─────────────────────────────────────────────────────────

async function handleAnalyze(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<VisionAnalysisRequest>(req);

  let imageBase64 = body.imageBase64 ?? null;
  if (!imageBase64 && body.imagePath) {
    imageBase64 = await loadImageBase64(body.imagePath);
  }

  // OCR テキスト行を補助情報として追加
  let contextPrompt = VISION_ANALYSIS_PROMPT;
  if (body.ocrLines && body.ocrLines.length > 0) {
    const correctedLines = body.ocrLines.map(applyConstructionDictionary);
    contextPrompt += `\n\n【参考: OCR で読み取ったテキスト】\n${correctedLines.slice(0, 100).join('\n')}`;
  }
  if (body.mode) {
    contextPrompt += `\n\n【解析モード: ${body.mode}】`;
  }

  const rawResult = await callGeminiVision(
    CONSTRUCTION_DRAWING_SYSTEM_PROMPT,
    contextPrompt,
    imageBase64,
  );

  try {
    const result = JSON.parse(rawResult) as VisionAnalysisResult;
    sendJson(res, 200, { success: true, result });
  } catch {
    sendJson(res, 200, {
      success: true,
      result: { summary: rawResult, overallConfidence: 0.5, quantities: [], products: [], dimensions: [], drawingType: 'unknown', workTypes: [] },
    });
  }
}

async function handleValidate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<CandidateValidationRequest>(req);

  // OCR テキストに辞書補正を適用
  const correctedLines = (body.ocrLines ?? []).map(applyConstructionDictionary);

  const prompt = `${CANDIDATE_VALIDATION_PROMPT}\n\n` +
    `【解析モード: ${body.mode || 'secondary_product'}】\n\n` +
    `【抽出候補】\n${JSON.stringify(body.candidates, null, 2)}\n\n` +
    `【OCRテキスト（補正済）】\n${correctedLines.slice(0, 80).join('\n')}`;

  const rawResult = await callGeminiVision(
    CONSTRUCTION_DRAWING_SYSTEM_PROMPT,
    prompt,
    null, // テキストのみ（画像なし）
  );

  try {
    const validatedCandidates = JSON.parse(rawResult) as CandidateValidationResult['validatedCandidates'];
    sendJson(res, 200, { success: true, result: { validatedCandidates } });
  } catch {
    sendJson(res, 200, { success: true, result: { validatedCandidates: [] } });
  }
}

async function handleExtractQuantities(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<QuantityExtractionRequest>(req);

  let imageBase64 = body.imageBase64 ?? null;
  if (!imageBase64 && body.imagePath) {
    imageBase64 = await loadImageBase64(body.imagePath);
  }

  let contextPrompt = QUANTITY_EXTRACTION_PROMPT;
  if (body.ocrLines && body.ocrLines.length > 0) {
    const correctedLines = body.ocrLines.map(applyConstructionDictionary);
    contextPrompt += `\n\n【参考: OCR で読み取ったテキスト】\n${correctedLines.slice(0, 100).join('\n')}`;
  }
  if (body.mode) {
    contextPrompt += `\n\n【工種: ${body.mode}】`;
  }

  const rawResult = await callGeminiVision(
    CONSTRUCTION_DRAWING_SYSTEM_PROMPT,
    contextPrompt,
    imageBase64,
  );

  try {
    const result = JSON.parse(rawResult) as QuantityExtractionResult;
    sendJson(res, 200, { success: true, result });
  } catch {
    sendJson(res, 200, { success: true, result: { quantities: [], tables: [] } });
  }
}

// ─── OCR テキスト一括補正エンドポイント ─────────────────────────────────────

async function handleCorrectText(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<{ lines: string[] }>(req);
  const corrected = (body.lines ?? []).map((line) => {
    let result = applyConstructionDictionary(line);
    // 数値部分の補正
    result = result.replace(/[\d.OolISBZG]+/g, (match) => correctNumericOcr(match));
    return result;
  });
  sendJson(res, 200, { success: true, corrected });
}

// ─── ミドルウェアエクスポート ────────────────────────────────────────────────

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

export function createOcrEnhanceApiMiddleware(): Middleware {
  return (req, res, next) => {
    const pathname = getPathname(req);
    const method = req.method?.toUpperCase() ?? 'GET';

    if (method !== 'POST') {
      next();
      return;
    }

    if (pathname === '/api/ocr-enhance/analyze') {
      handleAnalyze(req, res).catch((err) =>
        sendJson(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
      );
      return;
    }

    if (pathname === '/api/ocr-enhance/validate') {
      handleValidate(req, res).catch((err) =>
        sendJson(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
      );
      return;
    }

    if (pathname === '/api/ocr-enhance/extract-quantities') {
      handleExtractQuantities(req, res).catch((err) =>
        sendJson(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
      );
      return;
    }

    if (pathname === '/api/ocr-enhance/correct-text') {
      handleCorrectText(req, res).catch((err) =>
        sendJson(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
      );
      return;
    }

    next();
  };
}
