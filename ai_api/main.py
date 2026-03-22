from __future__ import annotations

import io
import json
import os
import re
import uuid
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import fitz
import numpy as np
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, ImageStat

try:
    from rapidocr import RapidOCR
except ModuleNotFoundError as exc:  # pragma: no cover - compatibility fallback
    if exc.name != "rapidocr":
        raise
    from rapidocr_onnxruntime import RapidOCR  # type: ignore

BASE_DIR = Path(__file__).resolve().parent
STORAGE_DIR = BASE_DIR / "storage"
PREVIEW_DIR = STORAGE_DIR / "previews"
JOB_DIR = STORAGE_DIR / "jobs"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
JOB_DIR.mkdir(parents=True, exist_ok=True)
PRODUCT_MASTER_SOURCE = BASE_DIR.parent / "client" / "src" / "lib" / "priceData.ts"
OCR_REVIEW_SCORE_THRESHOLD = 0.75


PACK_DIR_CANDIDATES = [
    BASE_DIR / "data" / "drawing-ocr-pack",
    BASE_DIR.parent / "server" / "data" / "drawing-ocr-pack",
]


def resolve_pack_dir() -> Path | None:
    for candidate in PACK_DIR_CANDIDATES:
        if candidate.exists():
            return candidate
    return None


OCR_PACK_DIR = resolve_pack_dir()


def load_pack_json(name: str, default: Any) -> Any:
    if OCR_PACK_DIR is None:
        return default
    path = OCR_PACK_DIR / name
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def load_local_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


SHEET_TYPE_MASTER = load_pack_json("sheet_type_master.json", [])
ABBREVIATION_MASTER = load_pack_json("abbreviation_master.json", [])
SYMBOL_SEED_MASTER = load_pack_json("symbol_seed_master.json", [])
KNOWLEDGE_MASTER = load_pack_json("knowledge_master.json", [])
PROMPT_DEFINITIONS = load_pack_json("prompt_definitions.json", {"prompts": []})
SKILL_PACK = load_pack_json("skill_pack.json", {"review_queues": []})
ARCHIVED_OCR_SKILL_PROFILE = load_local_json(BASE_DIR / "data" / "archived_ocr_skill_profile.json", {})

KNOWN_REVIEW_QUEUES = set(SKILL_PACK.get("review_queues", []))
ABBREVIATION_INDEX = {
    str(row.get("abbreviation", "")).upper(): row
    for row in ABBREVIATION_MASTER
    if str(row.get("abbreviation", "")).strip()
}
SHEET_TYPE_ROWS = [row for row in SHEET_TYPE_MASTER if isinstance(row, dict)]


def parse_cors_origins() -> tuple[list[str], str | None]:
    default_origins = [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]
    env_origins = [
        origin.strip()
        for origin in os.getenv("CORS_ALLOW_ORIGINS", "").split(",")
        if origin.strip()
    ]
    allow_origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX") or None
    return list(dict.fromkeys(default_origins + env_origins)), allow_origin_regex


cors_origins, cors_origin_regex = parse_cors_origins()

app = FastAPI(title="my-estimator OCR API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/files", StaticFiles(directory=str(STORAGE_DIR)), name="files")

ocr_engine = RapidOCR()

FIELD_LABELS = {
    "secondaryProduct": "対象名",
    "distance": "施工延長",
    "currentHeight": "現況高",
    "plannedHeight": "計画高",
    "stages": "据付段数",
    "productWidth": "製品幅 / 底版幅",
    "productHeight": "製品高さ / 擁壁高",
    "productLength": "製品長さ",
    "baseThickness": "ベース厚 / 路盤厚",
    "crushedStoneThickness": "砕石厚 / 下層路盤厚",
    "pavementWidth": "舗装幅",
    "surfaceThickness": "表層厚",
    "binderThickness": "基層厚",
    "demolitionWidth": "撤去幅",
    "demolitionThickness": "撤去厚",
}

SECONDARY_PRODUCT_HINT_PATTERN = re.compile(
    r"U字溝|側溝|暗渠|コネクトホール|マンホール|街渠|縁塊|桝|ブロック|歩車道|地先|リブロック|ピンコロ",
    flags=re.IGNORECASE,
)

WORK_TYPE_PATTERNS: dict[str, tuple[tuple[str, ...], str]] = {
    "secondary_product": (("U字溝", "側溝", "暗渠", "コネクトホール", "街渠", "縁塊", "桝", "マンホール"), "二次製品工"),
    "retaining_wall": (("擁壁", "L型", "重力式", "逆T", "控長", "根入れ", "水抜き"), "擁壁工"),
    "pavement": (("舗装", "路盤", "表層", "基層", "アスファルト", "切削", "不陸整正"), "舗装工"),
    "demolition": (("撤去", "取壊", "はつり", "解体", "撤去工", "殻撤去", "取壊し"), "撤去工"),
}

BUSINESS_DOCUMENT_RULES: tuple[dict[str, Any], ...] = (
    {
        "documentType": "estimate",
        "label": "見積書",
        "title_keywords": ("見積書", "御見積", "御見積書"),
        "body_keywords": ("見積金額", "御見積金額", "有効期限", "御中", "単価", "金額", "消費税"),
    },
    {
        "documentType": "invoice",
        "label": "請求書",
        "title_keywords": ("請求書", "御請求書"),
        "body_keywords": ("請求金額", "請求書", "振込先", "支払期限", "消費税", "御中"),
    },
    {
        "documentType": "cover_letter",
        "label": "通信文",
        "title_keywords": ("通信文", "送付状", "案内文"),
        "body_keywords": ("下記の通り", "送付", "ご確認", "御中"),
    },
)

FULL_WIDTH_TRANS = str.maketrans({
    "０": "0",
    "１": "1",
    "２": "2",
    "３": "3",
    "４": "4",
    "５": "5",
    "６": "6",
    "７": "7",
    "８": "8",
    "９": "9",
    "．": ".",
    "－": "-",
    "ー": "-",
    "＋": "+",
    "Ｌ": "L",
    "ｍ": "m",
    "Ｍ": "M",
    "×": "x",
    "Ｘ": "X",
    "＊": "*",
    "：": ":",
    "　": " ",
})


def normalize_text(text: str) -> str:
    return text.translate(FULL_WIDTH_TRANS).replace("＝", "=").replace("，", ",").strip()


def normalize_product_key(text: str) -> str:
    normalized = normalize_text(text).upper()
    normalized = normalized.replace("NO.", "NO").replace("№", "NO").replace("φ", "")
    return re.sub(r"[\s\-_=:：/.,・()（）\[\]{}]+", "", normalized)


def normalize_token(text: str) -> str:
    return re.sub(r"\s+", "", normalize_text(text)).upper()


ROLE_TEXT_REPLACEMENTS = (
    ("详", "詳"),
    ("圖", "図"),
    ("图", "図"),
    ("區", "図"),
    ("区", "図"),
    ("现", "現"),
    ("况", "況"),
    ("計畫", "計画"),
    ("计画", "計画"),
    ("參", "参"),
)


def normalize_role_text(text: str) -> str:
    normalized = normalize_token(text)
    for source, target in ROLE_TEXT_REPLACEMENTS:
        normalized = normalized.replace(source, target)
    return normalized


def is_dimension_like_text(text: str) -> bool:
    compact = normalize_text(text).replace(" ", "")
    return bool(re.fullmatch(r"[\d.xX×*]+", compact))


def load_secondary_product_master_names() -> list[str]:
    if not PRODUCT_MASTER_SOURCE.exists():
        return []

    source_text = PRODUCT_MASTER_SOURCE.read_text(encoding="utf-8")
    return sorted(set(re.findall(r"\{\s*name:\s*'([^']+)'", source_text)))


SECONDARY_PRODUCT_MASTER_NAMES = load_secondary_product_master_names()


def flatten_box(points: Any) -> list[float]:
    if isinstance(points, np.ndarray):
        points = points.tolist()
    if not isinstance(points, (list, tuple)):
        raise ValueError("Invalid OCR box format")
    if len(points) == 8:
        return [float(value) for value in points]
    if len(points) == 4 and all(isinstance(point, (list, tuple)) and len(point) >= 2 for point in points):
        flattened: list[float] = []
        for point in points:
            flattened.extend([float(point[0]), float(point[1])])
        return flattened
    raise ValueError(f"Unsupported OCR box format: {points!r}")


def extract_numeric_value(text: str, pattern: str) -> float | None:
    match = re.search(pattern, normalize_text(text), flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def normalize_meters(value: float) -> float:
    return round(value, 4)


def normalize_maybe_millimeters(value: float) -> float:
    if value >= 10:
        return round(value / 1000, 4)
    return round(value, 4)


def should_require_review(score: float, source_box: list[float], base_requires_review: bool = False) -> bool:
    return base_requires_review or score < OCR_REVIEW_SCORE_THRESHOLD or len(source_box) != 8


def match_secondary_product(source_text: str) -> tuple[str | None, float, bool]:
    normalized_text = normalize_product_key(source_text)
    if not normalized_text or not SECONDARY_PRODUCT_MASTER_NAMES:
        return None, 0.0, True

    scored: list[tuple[float, str]] = []
    for master_name in SECONDARY_PRODUCT_MASTER_NAMES:
        normalized_master = normalize_product_key(master_name)
        if not normalized_master:
            continue

        ratio = SequenceMatcher(None, normalized_text, normalized_master).ratio()
        if normalized_text in normalized_master or normalized_master in normalized_text:
            ratio = max(ratio, min(len(normalized_text), len(normalized_master)) / max(len(normalized_text), len(normalized_master)))

        scored.append((ratio, master_name))

    if not scored:
        return None, 0.0, True

    scored.sort(key=lambda item: item[0], reverse=True)
    best_score, best_name = scored[0]
    second_score = scored[1][0] if len(scored) > 1 else 0.0

    if best_score < 0.55:
        return None, best_score, True

    is_ambiguous = second_score >= best_score - 0.04
    return best_name, best_score, is_ambiguous


def choose_candidate(existing: dict[str, Any] | None, candidate: dict[str, Any]) -> dict[str, Any]:
    if not existing:
        return candidate
    if existing.get("value") != candidate.get("value"):
        winner = candidate if candidate["confidence"] >= existing["confidence"] else existing
        winner = dict(winner)
        winner["requiresReview"] = True
        winner["reason"] = f"候補衝突あり: {existing.get('sourceText')} / {candidate.get('sourceText')}"
        winner["confidence"] = min(existing["confidence"], candidate["confidence"])
        return winner
    if candidate["confidence"] > existing["confidence"]:
        return candidate
    return existing


def build_candidate(field_name: str, source_text: str, source_page: int, source_box: list[float], value: str | float, reason: str, confidence: float, requires_review: bool) -> dict[str, Any]:
    value_type = "number" if isinstance(value, (int, float)) else "string"
    payload: dict[str, Any] = {
        "label": FIELD_LABELS.get(field_name, field_name),
        "confidence": confidence,
        "sourceText": source_text,
        "sourcePage": source_page,
        "sourceBox": source_box,
        "reason": reason,
        "requiresReview": requires_review,
        "valueType": value_type,
    }
    if value_type == "number":
        payload["value"] = float(value)
        payload["valueNumber"] = float(value)
    else:
        payload["value"] = str(value)
        payload["valueText"] = str(value)
    return payload


def classify_work_types(
    ocr_items: list[dict[str, Any]],
    drawing_discipline: str | None = None,
    business_document: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    if business_document and business_document.get("isBusinessDocument"):
        return []

    scored: list[dict[str, Any]] = []
    searchable_texts = [normalize_text(item["text"]) for item in ocr_items]

    for block_type, (keywords, label) in WORK_TYPE_PATTERNS.items():
        matched_texts: list[str] = []
        match_score = 0.0
        for item, normalized in zip(ocr_items, searchable_texts):
            item_matches = [keyword for keyword in keywords if keyword.lower() in normalized.lower()]
            if item_matches:
                matched_texts.append(item["text"])
                match_score += max(0.35, min(item["score"], 1.0))

        if not matched_texts:
            continue

        confidence = min(0.98, 0.45 + (match_score / max(len(keywords), 1)) * 0.5)
        requires_review = False
        if drawing_discipline and drawing_discipline not in {"civil", "共通", "common", "unknown"}:
            confidence = min(confidence, 0.72)
            requires_review = True

        scored.append({
            "blockType": block_type,
            "label": label,
            "confidence": round(confidence, 4),
            "reason": f"キーワード一致: {', '.join(matched_texts[:3])}",
            "sourceTexts": matched_texts[:5],
            "requiresReview": requires_review,
        })

    scored.sort(key=lambda item: item["confidence"], reverse=True)
    if len(scored) > 1 and scored[0]["confidence"] - scored[1]["confidence"] < 0.12:
        scored[0]["requiresReview"] = True
        scored[1]["requiresReview"] = True
    return scored


def page_box_to_flat(x0: float, y0: float, x1: float, y1: float) -> list[float]:
    return [float(x0), float(y0), float(x1), float(y0), float(x1), float(y1), float(x0), float(y1)]


def extract_pdf_text_probe(file_bytes: bytes) -> dict[str, Any]:
    document = fitz.open(stream=file_bytes, filetype="pdf")
    text_word_count = 0
    for page in document:
        words = page.get_text("words")
        text_word_count += len(words)
    page_count = max(len(document), 1)
    return {
        "has_text_layer": text_word_count > 0,
        "text_word_count": text_word_count,
        "avg_words_per_page": round(text_word_count / page_count, 2),
    }


def extract_pdf_vector_probe(file_bytes: bytes) -> dict[str, Any]:
    document = fitz.open(stream=file_bytes, filetype="pdf")
    drawing_count = 0
    for page in document:
        try:
            drawing_count += len(page.get_drawings())
        except Exception:
            continue
    page_count = max(len(document), 1)
    return {
        "drawing_count": drawing_count,
        "avg_drawings_per_page": round(drawing_count / page_count, 2),
    }


def extract_pdf_text_items(file_bytes: bytes) -> list[dict[str, Any]]:
    document = fitz.open(stream=file_bytes, filetype="pdf")
    items: list[dict[str, Any]] = []
    for page_index, page in enumerate(document, start=1):
        words = page.get_text("words")
        for word in words:
            if len(word) < 5:
                continue
            x0, y0, x1, y1, text, *_rest = word
            text = str(text).strip()
            if not text:
                continue
            items.append({
                "text": text,
                "score": 0.99,
                "box": page_box_to_flat(x0, y0, x1, y1),
                "page": page_index,
            })
    return items


def estimate_preprocess_flags(image: Image.Image) -> list[str]:
    flags: list[str] = []
    grayscale = image.convert("L")
    stat = ImageStat.Stat(grayscale)
    contrast = stat.stddev[0] if stat.stddev else 0.0
    if contrast < 40:
        flags.append("contrast_boost")
    if image.width < 1400 or image.height < 900:
        flags.append("binarize")
    return flags


def determine_media_route(file_name: str, file_type: str, file_bytes: bytes, page_images: list[Image.Image]) -> dict[str, Any]:
    lowered_name = file_name.lower()
    if lowered_name.endswith(".ifc"):
        return {
            "sourceMediaType": "ifc",
            "preferredPipeline": "manual_review",
            "pageRotationDeg": 0,
            "sheetSplitRequired": False,
            "preprocessFlags": [],
            "confidence": 0.95,
        }
    if lowered_name.endswith((".dwg", ".dxf", ".jww", ".jwc")):
        return {
            "sourceMediaType": "cad",
            "preferredPipeline": "manual_review",
            "pageRotationDeg": 0,
            "sheetSplitRequired": False,
            "preprocessFlags": [],
            "confidence": 0.95,
        }

    preprocess_flags: list[str] = []
    for page_image in page_images[:2]:
        preprocess_flags.extend(estimate_preprocess_flags(page_image))
    preprocess_flags = list(dict.fromkeys(preprocess_flags))

    if file_type == "pdf":
        text_probe = extract_pdf_text_probe(file_bytes)
        vector_probe = extract_pdf_vector_probe(file_bytes)
        has_text = bool(text_probe["has_text_layer"])
        avg_words = float(text_probe["avg_words_per_page"])
        avg_drawings = float(vector_probe["avg_drawings_per_page"])

        if has_text and avg_words >= 12:
            return {
                "sourceMediaType": "vector_pdf",
                "preferredPipeline": "direct_text",
                "pageRotationDeg": 0,
                "sheetSplitRequired": False,
                "preprocessFlags": preprocess_flags,
                "confidence": 0.95,
            }
        if avg_drawings >= 10:
            return {
                "sourceMediaType": "vector_pdf",
                "preferredPipeline": "ocr_cv",
                "pageRotationDeg": 0,
                "sheetSplitRequired": False,
                "preprocessFlags": preprocess_flags,
                "confidence": 0.78,
            }
        return {
            "sourceMediaType": "raster_pdf",
            "preferredPipeline": "ocr_cv",
            "pageRotationDeg": 0,
            "sheetSplitRequired": False,
            "preprocessFlags": preprocess_flags,
            "confidence": 0.88,
        }

    return {
        "sourceMediaType": "image",
        "preferredPipeline": "ocr_cv",
        "pageRotationDeg": 0,
        "sheetSplitRequired": False,
        "preprocessFlags": preprocess_flags,
        "confidence": 0.9,
    }


def render_pdf_pages(file_bytes: bytes) -> list[Image.Image]:
    document = fitz.open(stream=file_bytes, filetype="pdf")
    pages: list[Image.Image] = []
    for page in document:
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        pages.append(Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("RGB"))
    return pages


def load_image_pages(file_bytes: bytes) -> list[Image.Image]:
    image = Image.open(io.BytesIO(file_bytes))
    return [ImageOps.exif_transpose(image).convert("RGB")]


def run_ocr_on_page(image: Image.Image, page_no: int) -> list[dict[str, Any]]:
    raw_result = ocr_engine(np.array(image.convert("RGB")))
    items: list[dict[str, Any]] = []

    if hasattr(raw_result, "boxes") and hasattr(raw_result, "txts"):
        boxes_attr = getattr(raw_result, "boxes", None)
        texts_attr = getattr(raw_result, "txts", None)
        scores_attr = getattr(raw_result, "scores", None)
        boxes = list(boxes_attr) if boxes_attr is not None else []
        texts = list(texts_attr) if texts_attr is not None else []
        scores = list(scores_attr) if scores_attr is not None else []
        entries = zip(boxes, texts, scores)
    elif isinstance(raw_result, tuple) and raw_result:
        legacy_entries = raw_result[0]
        entries = legacy_entries or []
    else:
        entries = []

    for entry in entries:
        if isinstance(entry, tuple) and len(entry) == 3 and not hasattr(raw_result, "boxes"):
            box_data, text_data, score_data = entry
        else:
            try:
                box_data, text_data, score_data = entry
            except (TypeError, ValueError):
                continue
        try:
            box = flatten_box(box_data)
        except ValueError:
            continue
        text = str(text_data).strip()
        if not text:
            continue
        score = float(score_data) if score_data is not None else 0.0
        items.append({
            "text": text,
            "score": round(score, 4),
            "box": box,
            "page": page_no,
        })
    return items


def save_preview_image(image: Image.Image) -> str:
    file_name = f"{uuid.uuid4().hex}.png"
    file_path = PREVIEW_DIR / file_name
    image.save(file_path, format="PNG")
    return file_name


def build_image_url_from_base(base_url: str, relative_path: str) -> str:
    return f"{base_url.rstrip('/')}/files/{relative_path.lstrip('/')}"


def build_image_url(request: Request, relative_path: str) -> str:
    return build_image_url_from_base(str(request.base_url), relative_path)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_upload(file_name: str | None, file_bytes: bytes, content_type: str | None) -> str:
    if not file_name:
        raise HTTPException(status_code=400, detail="ファイル名がありません")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="空ファイルは解析できません")
    if len(file_bytes) > 30 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="ファイルサイズが上限を超えています")

    file_type = "pdf" if content_type == "application/pdf" or file_name.lower().endswith(".pdf") else "image"
    if file_type not in {"pdf", "image"}:
        raise HTTPException(status_code=400, detail="対応していないファイル形式です")
    return file_type


def page_items(ocr_items: list[dict[str, Any]], page_no: int) -> list[dict[str, Any]]:
    return [item for item in ocr_items if item["page"] == page_no]


def select_titleblock_texts(ocr_items: list[dict[str, Any]], page_preview: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not page_preview:
        return page_items(ocr_items, 1)
    width = float(page_preview["width"])
    height = float(page_preview["height"])
    candidates = []
    for item in page_items(ocr_items, 1):
        xs = [item["box"][0], item["box"][2], item["box"][4], item["box"][6]]
        ys = [item["box"][1], item["box"][3], item["box"][5], item["box"][7]]
        cx = sum(xs) / 4
        cy = sum(ys) / 4
        if cx >= width * 0.55 or cy >= height * 0.72:
            candidates.append(item)
    return candidates or page_items(ocr_items, 1)


def find_first_pattern(texts: list[str], patterns: list[str]) -> str | None:
    for text in texts:
        normalized = normalize_text(text)
        for pattern in patterns:
            match = re.search(pattern, normalized, flags=re.IGNORECASE)
            if match:
                return match.group(1).strip() if match.groups() else match.group(0).strip()
    return None


def infer_discipline(texts: list[str]) -> str:
    joined = "\n".join(texts)
    if re.search(r"道路|造成|排水|擁壁|測点|縦断|横断|舗装|法面", joined):
        return "civil"
    if re.search(r"配筋|柱|梁|杭|基礎配筋|鉄骨", joined):
        return "structural"
    if re.search(r"照明|動力|単線|火報|弱電|コンセント|分電盤", joined):
        return "electrical"
    if re.search(r"空調|換気|給排水|衛生|ダクト|配管|消火", joined):
        return "mechanical"
    if re.search(r"平面図|立面図|断面図|配置図|建具表|仕上表|天井伏図", joined):
        return "architectural"
    return "unknown"


def detect_business_document(titleblock_meta: dict[str, Any], ocr_items: list[dict[str, Any]]) -> dict[str, Any]:
    title = normalize_text(str(titleblock_meta.get("drawingTitle") or ""))
    first_page_texts = [normalize_text(item["text"]) for item in page_items(ocr_items, 1)]
    joined = "\n".join(first_page_texts)

    best_document_type = "drawing"
    best_label = "図面"
    best_score = 0.0
    best_reasons: list[str] = []

    for rule in BUSINESS_DOCUMENT_RULES:
        score = 0.0
        reasons: list[str] = []

        for keyword in rule["title_keywords"]:
            if keyword in title:
                score += 0.7
                reasons.append(f"表題一致: {keyword}")

        for keyword in rule["body_keywords"]:
            if keyword in joined:
                score += 0.12
                reasons.append(f"本文一致: {keyword}")

        if score > best_score:
            best_score = score
            best_document_type = str(rule["documentType"])
            best_label = str(rule["label"])
            best_reasons = reasons[:5]

    is_business_document = best_score >= 0.72
    return {
        "isBusinessDocument": is_business_document,
        "documentType": best_document_type if is_business_document else "drawing",
        "label": best_label if is_business_document else "図面",
        "confidence": round(min(best_score, 0.98), 4),
        "reasons": best_reasons if is_business_document else [],
    }


def extract_titleblock_meta(ocr_items: list[dict[str, Any]], page_preview: dict[str, Any] | None) -> dict[str, Any]:
    texts = [item["text"] for item in select_titleblock_texts(ocr_items, page_preview)]
    fallback_texts = texts + [item["text"] for item in page_items(ocr_items, 1)]
    drawing_title = find_first_pattern(fallback_texts, [
        r"(?:図面名|図\s*名)\s*[=:：]?\s*(.+)$",
        r"((?:配置図|平面図|立面図|断面図|詳細図|縦断図|横断図|舗装構成図|擁壁詳細図|排水施設図).*)$",
    ])
    sheet_scale = find_first_pattern(fallback_texts, [r"(?:縮尺|SCALE|S)\s*[=:：]?\s*(1[:/]\d+)", r"(1[:/]\d+)"])
    drawing_no = find_first_pattern(fallback_texts, [
        r"(?:図面番号|図番|DRAWING\s*NO\.?|NO\.)\s*[=:：]?\s*([A-Za-z0-9\-_/]+)",
        r"\b([A-Za-z]{1,3}[\-_/]?[0-9]{1,4}[A-Za-z0-9\-_/]*)\b",
    ])
    revision = find_first_pattern(fallback_texts, [r"(?:改訂|REV\.?|Revision)\s*[=:：]?\s*([A-Za-z0-9\-]+)"])
    project_name = find_first_pattern(fallback_texts, [r"(?:工事名|案件名|PROJECT)\s*[=:：]?\s*(.+)$"])
    building_name = find_first_pattern(fallback_texts, [r"(?:棟名|建物名|BUILDING)\s*[=:：]?\s*(.+)$"])
    zone_name = find_first_pattern(fallback_texts, [r"(?:工区|ゾーン|ZONE)\s*[=:：]?\s*(.+)$"])
    discipline = infer_discipline(fallback_texts)

    filled = [drawing_no, drawing_title, sheet_scale, project_name, discipline if discipline != "unknown" else None]
    confidence = round(sum(1 for value in filled if value) / max(len(filled), 1), 4)

    return {
        "drawingNo": drawing_no,
        "drawingTitle": drawing_title,
        "sheetScale": sheet_scale,
        "revision": revision,
        "projectName": project_name,
        "buildingName": building_name,
        "zoneName": zone_name,
        "discipline": discipline,
        "confidence": confidence,
    }


def classify_sheet_type(
    ocr_items: list[dict[str, Any]],
    titleblock_meta: dict[str, Any],
    business_document: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if business_document and business_document.get("isBusinessDocument"):
        return {
            "sheetTypeId": f"document_{business_document['documentType']}",
            "sheetTypeName": f"{business_document['label']}（帳票）",
            "discipline": "common",
            "classificationReasons": business_document.get("reasons", []) or ["帳票文書を検出"],
            "confidence": business_document.get("confidence", 0.0),
        }

    title = normalize_text(titleblock_meta.get("drawingTitle") or "")
    discipline_hint = titleblock_meta.get("discipline") or "unknown"
    searchable = "\n".join(normalize_text(item["text"]) for item in page_items(ocr_items, 1))

    best_row: dict[str, Any] | None = None
    best_score = 0.0
    best_reasons: list[str] = []

    for row in SHEET_TYPE_ROWS:
        sheet_type_name = str(row.get("sheet_type_name", ""))
        canonical_key = str(row.get("canonical_key", ""))
        row_discipline = str(row.get("discipline", ""))
        keywords = row.get("keywords_json", []) or []
        score = 0.0
        reasons: list[str] = []

        if sheet_type_name and sheet_type_name in title:
            score += 0.65
            reasons.append(f"図面名一致: {sheet_type_name}")
        if canonical_key and canonical_key in searchable.lower():
            score += 0.15
            reasons.append(f"正規キー一致: {canonical_key}")
        for keyword in keywords:
            if isinstance(keyword, str) and keyword and keyword in searchable:
                score += 0.08
                reasons.append(f"キーワード一致: {keyword}")

        if discipline_hint != "unknown":
            discipline_match = (
                (discipline_hint == "civil" and row_discipline == "土木")
                or (discipline_hint == "architectural" and row_discipline == "建築")
                or (discipline_hint == "structural" and row_discipline == "構造")
                or (discipline_hint == "electrical" and row_discipline == "電気")
                or (discipline_hint == "mechanical" and row_discipline == "機械")
                or row_discipline == "共通"
            )
            if discipline_match:
                score += 0.1

        if score > best_score:
            best_score = score
            best_row = row
            best_reasons = reasons[:4]

    if not best_row:
        return {
            "sheetTypeId": "unknown",
            "sheetTypeName": "未分類",
            "discipline": discipline_hint,
            "classificationReasons": ["分類ルールに一致するシート種別がありません"],
            "confidence": 0.0,
        }

    return {
        "sheetTypeId": best_row.get("sheet_type_id", "unknown"),
        "sheetTypeName": best_row.get("sheet_type_name", "未分類"),
        "discipline": best_row.get("discipline", discipline_hint),
        "classificationReasons": best_reasons or ["キーワード一致"],
        "confidence": round(min(best_score, 0.98), 4),
    }


def parse_scale_ratio(scale_text: str | None) -> int | None:
    if not scale_text:
        return None
    match = re.search(r"1[:/](\d+)", scale_text)
    if not match:
        return None
    return int(match.group(1))


def resolve_units_and_view(titleblock_meta: dict[str, Any], sheet_classification: dict[str, Any]) -> dict[str, Any]:
    discipline = str(sheet_classification.get("discipline") or titleblock_meta.get("discipline") or "unknown")
    sheet_type_name = normalize_text(str(sheet_classification.get("sheetTypeName") or ""))
    if discipline in {"土木", "civil"}:
        length_unit = "m"
        elevation_unit = "m"
    else:
        length_unit = "mm"
        elevation_unit = "mm"

    view_direction = "unknown"
    if "天井伏図" in sheet_type_name:
        view_direction = "bottom_up"
    elif any(token in sheet_type_name for token in ["平面図", "配置図", "基礎伏図"]):
        view_direction = "top_down"
    elif any(token in sheet_type_name for token in ["立面図"]):
        view_direction = "elevation"
    elif any(token in sheet_type_name for token in ["断面図", "縦断図"]):
        view_direction = "sectional"
    elif any(token in sheet_type_name for token in ["横断"]):
        view_direction = "cross_section"

    return {
        "lengthUnit": length_unit,
        "elevationUnit": elevation_unit,
        "sheetScaleRatio": parse_scale_ratio(titleblock_meta.get("sheetScale")),
        "viewDirection": view_direction,
        "readingOrder": "left_to_right",
    }


def resolve_legend_and_abbreviations(ocr_items: list[dict[str, Any]]) -> dict[str, Any]:
    legend_dictionary: list[dict[str, Any]] = []
    normalized_terms: list[dict[str, Any]] = []
    unknown_terms: list[str] = []
    seen_normalized: set[tuple[str, str, str]] = set()
    seen_unknown: set[str] = set()

    for item in ocr_items:
        text = normalize_text(item["text"])
        if not text:
            continue

        legend_match = re.match(r"([^=:：]{1,20})\s*[:=：]\s*(.{1,40})$", text)
        if legend_match:
            raw = legend_match.group(1).strip()
            canonical = legend_match.group(2).strip()
            legend_dictionary.append({"raw": raw, "canonical": canonical, "domain": "sheet_legend"})

        tokens = re.findall(r"[A-Za-z]{1,6}[\-]?[A-Za-z0-9]{0,6}", text)
        for token in tokens:
            token_key = normalize_token(token)
            row = ABBREVIATION_INDEX.get(token_key)
            if row:
                key = (token, str(row.get("canonical_label", "")), "abbr")
                if key not in seen_normalized:
                    seen_normalized.add(key)
                    normalized_terms.append({
                        "raw": token,
                        "canonical": row.get("canonical_label", token),
                        "type": "abbr",
                    })
            elif token_key and len(token_key) <= 6 and token_key not in seen_unknown:
                seen_unknown.add(token_key)
                unknown_terms.append(token)

    return {
        "legendDictionary": legend_dictionary[:20],
        "normalizedTerms": normalized_terms[:40],
        "unknownTerms": unknown_terms[:20],
    }


def build_page_role_alias_map(page_role_keywords: dict[str, Any]) -> dict[str, list[str]]:
    alias_map: dict[str, list[str]] = {}
    extra_aliases = {
        "plan": ["平面", "配置", "計画平面", "伏図"],
        "section": ["断面", "横断", "縦断", "SECTION"],
        "detail": ["詳細", "構造", "基礎詳細", "標準断面"],
        "spec": ["仕様", "特記仕様", "標準図", "数量表", "材料表"],
        "legend": ["凡例", "記号", "略号"],
    }

    for role, keywords in page_role_keywords.items():
        aliases: set[str] = set()
        for keyword in keywords:
            if not isinstance(keyword, str) or not keyword.strip():
                continue
            normalized = normalize_role_text(keyword)
            aliases.add(normalized)
            if normalized.endswith("図"):
                aliases.add(normalized[:-1])
        for keyword in extra_aliases.get(role, []):
            aliases.add(normalize_role_text(keyword))
        alias_map[role] = sorted(alias for alias in aliases if alias)
    return alias_map


def infer_roles_from_text(text: str, role_alias_map: dict[str, list[str]]) -> list[dict[str, Any]]:
    normalized = normalize_role_text(text)
    roles: list[dict[str, Any]] = []
    for role, aliases in role_alias_map.items():
        matches = [alias for alias in aliases if alias in normalized]
        if matches:
            roles.append({
                "role": role,
                "keywords": matches[:5],
                "confidence": round(min(0.95, 0.45 + len(matches) * 0.12), 4),
            })
    return sorted(roles, key=lambda entry: entry["confidence"], reverse=True)


def extract_callout_key(text: str) -> str | None:
    normalized = normalize_role_text(text)

    multi_segment_match = re.search(r"([A-Z0-9]{1,8}(?:\s*[-ー–]\s*[A-Z0-9]{1,8}){1,4})", normalized, flags=re.IGNORECASE)
    if multi_segment_match:
        parts = [segment for segment in re.split(r"\s*[-ー–]\s*", multi_segment_match.group(1).upper()) if segment]
        if len(parts) >= 2:
            return "-".join(parts)

    detail_match = re.search(r"(?:詳細(?:図)?|DETAIL)\s*[-ー–]?\s*(?:NO\.?|№)?\s*([0-9A-Z]{1,6})", normalized, flags=re.IGNORECASE)
    if detail_match:
        return f"DETAIL-{detail_match.group(1).upper()}"

    return None


def normalize_learning_context(raw_value: str | None) -> dict[str, Any]:
    if not raw_value:
        return {"planSectionLinks": []}
    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError:
        return {"planSectionLinks": []}
    if not isinstance(parsed, dict):
        return {"planSectionLinks": []}
    plan_section_links = parsed.get("planSectionLinks", [])
    if not isinstance(plan_section_links, list):
        plan_section_links = []
    return {
        "planSectionLinks": [entry for entry in plan_section_links if isinstance(entry, dict)],
    }


def build_learning_link_index(learning_context: dict[str, Any] | None) -> dict[str, list[dict[str, Any]]]:
    if not learning_context:
        return {}
    indexed: dict[str, list[dict[str, Any]]] = {}
    for entry in learning_context.get("planSectionLinks", []):
        callout = extract_callout_key(str(entry.get("normalizedCallout") or entry.get("callout") or ""))
        if not callout:
            continue
        indexed.setdefault(callout, []).append(entry)
    return indexed


def find_page_anchor_item(
    ocr_items: list[dict[str, Any]],
    page_no: int,
    preferred_terms: list[str] | None = None,
) -> dict[str, Any] | None:
    page_items = [item for item in ocr_items if int(item["page"]) == page_no]
    if not page_items:
        return None

    normalized_terms = [normalize_role_text(term) for term in (preferred_terms or []) if isinstance(term, str) and term.strip()]
    if normalized_terms:
        for item in sorted(page_items, key=lambda entry: entry["score"], reverse=True):
            normalized_text = normalize_role_text(str(item["text"]))
            if any(term and term in normalized_text for term in normalized_terms):
                return item

    return max(page_items, key=lambda entry: entry["score"])


def infer_plan_section_links(
    ocr_items: list[dict[str, Any]],
    page_roles: list[dict[str, Any]],
    role_alias_map: dict[str, list[str]],
    learning_context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    role_map = {
        page_role["pageNo"]: [entry["role"] for entry in page_role.get("roles", [])]
        for page_role in page_roles
    }
    callout_candidates: dict[str, list[dict[str, Any]]] = {}
    learning_index = build_learning_link_index(learning_context)

    for item in ocr_items:
        callout = extract_callout_key(item["text"])
        if not callout:
            continue
        page_no = int(item["page"])
        item_roles = [entry["role"] for entry in infer_roles_from_text(item["text"], role_alias_map)]
        roles = item_roles or role_map.get(page_no, [])
        if not roles:
            continue
        primary_role = roles[0]
        callout_candidates.setdefault(callout, []).append({
            "pageNo": page_no,
            "role": primary_role,
            "text": item["text"],
            "box": item["box"],
            "confidence": item["score"],
        })

    for page_role in page_roles:
        page_no = int(page_role["pageNo"])
        for role_entry in page_role.get("roles", []):
            role_name = str(role_entry.get("role") or "")
            for keyword in role_entry.get("keywords", []):
                callout = extract_callout_key(str(keyword))
                if not callout:
                    continue
                anchor_item = find_page_anchor_item(ocr_items, page_no, [str(keyword), callout, role_name])
                if not anchor_item:
                    continue
                existing_entries = callout_candidates.setdefault(callout, [])
                existing_key = {
                    (entry["pageNo"], entry["role"], tuple(entry["box"]))
                    for entry in existing_entries
                }
                candidate_key = (page_no, role_name, tuple(anchor_item["box"]))
                if candidate_key in existing_key:
                    continue
                existing_entries.append({
                    "pageNo": page_no,
                    "role": role_name,
                    "text": str(keyword),
                    "box": anchor_item["box"],
                    "confidence": min(0.88, float(anchor_item["score"]) + 0.08),
                })

    links: list[dict[str, Any]] = []
    for callout, entries in callout_candidates.items():
        plan_entries = [entry for entry in entries if entry["role"] == "plan"]
        target_entries = [entry for entry in entries if entry["role"] in {"section", "detail"}]
        for plan_entry in plan_entries:
            for target_entry in target_entries:
                if plan_entry["pageNo"] == target_entry["pageNo"] and plan_entry["box"] == target_entry["box"]:
                    continue
                same_page_bonus = -0.04 if plan_entry["pageNo"] == target_entry["pageNo"] else 0.0
                learned_entries = learning_index.get(callout, [])
                learned_role_match = any(
                    str(entry.get("sourceRole")) == plan_entry["role"]
                    and str(entry.get("targetRole")) == target_entry["role"]
                    for entry in learned_entries
                )
                learned_callout_bonus = 0.08 if learned_role_match else (0.04 if learned_entries else 0.0)
                confidence = round(
                    min(0.98, 0.58 + min(plan_entry["confidence"], target_entry["confidence"]) * 0.3 + same_page_bonus + learned_callout_bonus),
                    4,
                )
                reasons = [
                    (
                        f"plan page {plan_entry['pageNo']} と {target_entry['role']} page {target_entry['pageNo']}"
                        if plan_entry["pageNo"] != target_entry["pageNo"]
                        else f"page {plan_entry['pageNo']} 内で plan と {target_entry['role']}"
                    )
                    + f" の同一 callout {callout} を検出",
                ]
                if learned_entries:
                    reasons.append(
                        "過去に採用した図面リンク履歴を反映"
                        if learned_role_match
                        else "同一 callout の過去採用履歴を参考"
                    )
                links.append({
                    "id": f"{callout}-{plan_entry['pageNo']}-{target_entry['pageNo']}-{target_entry['role']}",
                    "callout": callout,
                    "sourcePageNo": plan_entry["pageNo"],
                    "sourceRole": plan_entry["role"],
                    "sourceText": plan_entry["text"],
                    "sourceBox": plan_entry["box"],
                    "targetPageNo": target_entry["pageNo"],
                    "targetRole": target_entry["role"],
                    "targetText": target_entry["text"],
                    "targetBox": target_entry["box"],
                    "confidence": confidence,
                    "reasons": reasons,
                })

        if links and any(link["callout"] == callout for link in links):
            continue

        learned_entries = learning_index.get(callout, [])
        for learned_entry in learned_entries:
            source_page_no = int(learned_entry.get("sourcePageNo") or 0)
            target_page_no = int(learned_entry.get("targetPageNo") or 0)
            source_role = str(learned_entry.get("sourceRole") or "plan")
            target_role = str(learned_entry.get("targetRole") or "section")
            source_anchor = find_page_anchor_item(
                ocr_items,
                source_page_no,
                [str(learned_entry.get("sourceText") or ""), callout, source_role, "配置", "平面"],
            )
            target_anchor = find_page_anchor_item(
                ocr_items,
                target_page_no,
                [str(learned_entry.get("targetText") or ""), callout, target_role, "断面", "詳細"],
            )
            if not source_anchor or not target_anchor:
                continue
            if source_page_no == target_page_no and source_anchor["box"] == target_anchor["box"]:
                continue
            links.append({
                "id": f"{callout}-{source_page_no}-{target_page_no}-{target_role}-learned",
                "callout": callout,
                "sourcePageNo": source_page_no,
                "sourceRole": source_role,
                "sourceText": str(learned_entry.get("sourceText") or callout),
                "sourceBox": source_anchor["box"],
                "targetPageNo": target_page_no,
                "targetRole": target_role,
                "targetText": str(learned_entry.get("targetText") or callout),
                "targetBox": target_anchor["box"],
                "confidence": round(min(0.92, 0.48 + min(float(source_anchor["score"]), float(target_anchor["score"])) * 0.22), 4),
                "reasons": [
                    f"過去に採用した callout {callout} の図面リンク履歴を再利用",
                    f"page {source_page_no} -> page {target_page_no} の学習済み参照を補完",
                ],
            })

    links.sort(key=lambda item: item["confidence"], reverse=True)
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[int, int, str, str]] = set()
    for link in links:
        key = (link["sourcePageNo"], link["targetPageNo"], link["callout"], link["targetRole"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(link)
    return deduped[:40]


def extract_structured_ocr_signals(ocr_items: list[dict[str, Any]], learning_context: dict[str, Any] | None = None) -> dict[str, Any]:
    watch_pairs = ARCHIVED_OCR_SKILL_PROFILE.get("ocrWatchPairs", [])
    level_tokens = [normalize_token(token) for token in ARCHIVED_OCR_SKILL_PROFILE.get("levelTokens", [])]
    unit_patterns = ARCHIVED_OCR_SKILL_PROFILE.get("unitPatterns", [])
    page_role_keywords = ARCHIVED_OCR_SKILL_PROFILE.get("pageRoleKeywords", {})
    role_alias_map = build_page_role_alias_map(page_role_keywords)

    parsed_text_blocks: list[dict[str, Any]] = []
    numeric_candidates: list[dict[str, Any]] = []
    unit_candidates: list[dict[str, Any]] = []
    level_candidates: list[dict[str, Any]] = []
    dimension_candidates: list[dict[str, Any]] = []
    table_candidates: list[dict[str, Any]] = []
    low_confidence_candidates: list[dict[str, Any]] = []
    ambiguous_candidates: list[dict[str, Any]] = []

    texts_by_page: dict[int, list[str]] = {}

    for item in ocr_items:
        text = str(item["text"])
        normalized = normalize_text(text)
        token = normalize_token(text)
        texts_by_page.setdefault(item["page"], []).append(normalized)

        parsed_text_blocks.append({
            "pageNo": item["page"],
            "text": text,
            "normalizedText": normalized,
            "bbox": item["box"],
            "confidence": item["score"],
        })

        for number in re.findall(r"[-+]?\d+(?:\.\d+)?", normalized):
            numeric_candidates.append({
                "pageNo": item["page"],
                "text": text,
                "value": number,
                "bbox": item["box"],
                "confidence": item["score"],
            })

        for entry in unit_patterns:
            unit = entry.get("unit")
            for pattern in entry.get("patterns", []):
                if isinstance(pattern, str) and pattern and pattern.lower() in normalized.lower():
                    unit_candidates.append({
                        "pageNo": item["page"],
                        "text": text,
                        "unit": unit,
                        "matchedPattern": pattern,
                        "bbox": item["box"],
                        "confidence": item["score"],
                    })
                    break

        for raw_token in level_tokens:
            if raw_token and raw_token in token:
                level_match = re.search(r"([-+]?\d+(?:\.\d+)?)", normalized)
                level_candidates.append({
                    "pageNo": item["page"],
                    "text": text,
                    "token": raw_token,
                    "value": level_match.group(1) if level_match else None,
                    "bbox": item["box"],
                    "confidence": item["score"],
                })
                break

        dimension_match = re.search(r"(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*(?:[xX×*]\s*(\d+(?:\.\d+)?))?", normalized)
        if dimension_match:
            dimension_candidates.append({
                "pageNo": item["page"],
                "text": text,
                "values": [value for value in dimension_match.groups() if value is not None],
                "bbox": item["box"],
                "confidence": item["score"],
            })

        if len(re.findall(r"[-+]?\d+(?:\.\d+)?", normalized)) >= 2 or any(keyword in normalized for keyword in ["数量", "単価", "金額", "合計"]):
            table_candidates.append({
                "pageNo": item["page"],
                "text": text,
                "bbox": item["box"],
                "confidence": item["score"],
            })

        if item["score"] < OCR_REVIEW_SCORE_THRESHOLD:
            low_confidence_candidates.append({
                "pageNo": item["page"],
                "text": text,
                "bbox": item["box"],
                "confidence": item["score"],
            })

        for group in watch_pairs:
            normalized_group = [normalize_token(str(term)) for term in group if str(term).strip()]
            if any(term and term in token for term in normalized_group):
                ambiguous_candidates.append({
                    "pageNo": item["page"],
                    "text": text,
                    "watchGroup": list(group),
                    "bbox": item["box"],
                    "confidence": item["score"],
                })
                break

    page_roles: list[dict[str, Any]] = []
    for page_no, page_texts in sorted(texts_by_page.items()):
        joined = "\n".join(page_texts)
        roles = infer_roles_from_text(joined, role_alias_map)
        page_roles.append({
            "pageNo": page_no,
            "roles": sorted(roles, key=lambda role: role["confidence"], reverse=True),
        })

    plan_section_links = infer_plan_section_links(ocr_items, page_roles, role_alias_map, learning_context)
    learning_index = build_learning_link_index(learning_context)
    learning_matches = [
        {
            "callout": callout,
            "adoptionCount": sum(int(entry.get("adoptionCount", 1)) for entry in learning_index.get(callout, [])),
            "matchedLinks": sum(1 for link in plan_section_links if link["callout"] == callout),
        }
        for callout in sorted(learning_index.keys())
        if any(link["callout"] == callout for link in plan_section_links)
    ]

    unresolved_items: list[dict[str, Any]] = []
    if level_candidates and ambiguous_candidates:
        unresolved_items.append({
            "target": "基準高ラベル",
            "reason": "GL/FH/EL 系の OCR 競合が残っています。",
            "recommendedCheck": "原図と断面図の高さラベルを確認してください。",
        })
    if numeric_candidates and not unit_candidates:
        unresolved_items.append({
            "target": "単位未確定の数値",
            "reason": "数値候補はありますが、単位文脈が弱いです。",
            "recommendedCheck": "m / mm / m2 / m3 の単位表記を図面から再確認してください。",
        })
    plan_pages = [page_role for page_role in page_roles if any(role["role"] == "plan" for role in page_role.get("roles", []))]
    section_or_detail_pages = [page_role for page_role in page_roles if any(role["role"] in {"section", "detail"} for role in page_role.get("roles", []))]
    if plan_pages and section_or_detail_pages and not plan_section_links:
        unresolved_items.append({
            "target": "平面図と断面図/詳細図のリンク",
            "reason": "pageRoles は抽出できていますが、callout ベースの図面リンクが見つかっていません。",
            "recommendedCheck": "A-A/B-B や詳細番号の参照記号を図面間で確認してください。",
        })

    return {
        "parsedTextBlocks": parsed_text_blocks[:200],
        "numericCandidates": numeric_candidates[:120],
        "unitCandidates": unit_candidates[:80],
        "levelCandidates": level_candidates[:80],
        "dimensionCandidates": dimension_candidates[:80],
        "tableCandidates": table_candidates[:80],
        "lowConfidenceCandidates": low_confidence_candidates[:80],
        "ambiguousCandidates": ambiguous_candidates[:80],
        "pageRoles": page_roles,
        "planSectionLinks": plan_section_links,
        "learningMatches": learning_matches[:40],
        "unresolvedItems": unresolved_items,
        "skillSources": ARCHIVED_OCR_SKILL_PROFILE.get("sourceSkills", []),
    }


def build_review_item(queue: str, severity: str, title: str, detail: str, source_text: str | None = None, source_page: int | None = None, field_name: str | None = None) -> dict[str, Any]:
    queue_name = queue if queue in KNOWN_REVIEW_QUEUES else queue
    payload = {
        "queue": queue_name,
        "severity": severity,
        "title": title,
        "detail": detail,
    }
    if source_text:
        payload["sourceText"] = source_text
    if source_page is not None:
        payload["sourcePage"] = source_page
    if field_name:
        payload["fieldName"] = field_name
    return payload


def build_review_queue(
    media_route: dict[str, Any],
    titleblock_meta: dict[str, Any],
    sheet_classification: dict[str, Any],
    resolved_units: dict[str, Any],
    legend_resolution: dict[str, Any],
    work_type_candidates: list[dict[str, Any]],
    ocr_items: list[dict[str, Any]],
    business_document: dict[str, Any] | None = None,
    ocr_structured: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    review_queue: list[dict[str, Any]] = []

    if business_document and business_document.get("isBusinessDocument"):
        review_queue.append(build_review_item(
            "sheet_classification_review",
            "critical",
            "図面ではなく帳票文書を検出",
            f"{business_document.get('label', '帳票文書')} の可能性が高いため、図面OCRとしての工種判定を停止しました。",
        ))

    if media_route["preferredPipeline"] == "manual_review" or media_route["confidence"] < 0.85:
        review_queue.append(build_review_item(
            "ocr_router_review",
            "warning",
            "媒体判定を要確認",
            f"媒体判定の確信度が低いか、直接処理できない媒体です。 route={media_route['preferredPipeline']}",
        ))

    missing_titleblock_fields = [
        key for key in ["drawingNo", "drawingTitle", "sheetScale"]
        if not titleblock_meta.get(key)
    ]
    if len(missing_titleblock_fields) >= 2 or titleblock_meta.get("confidence", 0) < 0.75:
        review_queue.append(build_review_item(
            "titleblock_review",
            "critical",
            "表題欄の主要項目が不足",
            f"不足項目: {', '.join(missing_titleblock_fields) or '複数項目未確定'}",
        ))

    if sheet_classification.get("sheetTypeId") == "unknown" or sheet_classification.get("confidence", 0) < 0.75:
        review_queue.append(build_review_item(
            "sheet_classification_review",
            "critical",
            "シート分類が未確定",
            "図面種別の特定が弱く、工種別抽出へ進む前に確認が必要です。",
        ))

    if resolved_units.get("lengthUnit") == "unknown" or resolved_units.get("elevationUnit") == "unknown" or resolved_units.get("sheetScaleRatio") is None:
        review_queue.append(build_review_item(
            "unit_scale_review",
            "warning",
            "単位または縮尺が未解決",
            "数量拾いに必要な単位系または縮尺が確定していません。",
        ))

    if legend_resolution.get("unknownTerms"):
        review_queue.append(build_review_item(
            "legend_review",
            "warning",
            "未登録の略号または記号があります",
            f"未解決語: {', '.join(legend_resolution['unknownTerms'][:5])}",
        ))

    if ocr_structured:
        ambiguous_candidates = ocr_structured.get("ambiguousCandidates", [])
        page_roles = ocr_structured.get("pageRoles", [])
        plan_section_links = ocr_structured.get("planSectionLinks", [])
        unresolved_items = ocr_structured.get("unresolvedItems", [])
        if ambiguous_candidates:
            review_queue.append(build_review_item(
                "ocr_router_review",
                "warning",
                "OCR watchlist に該当する候補あり",
                f"GL/GI/FH などの競合候補が {len(ambiguous_candidates)} 件あります。",
            ))
        if not business_document or not business_document.get("isBusinessDocument"):
            if page_roles and all(not page_role.get("roles") for page_role in page_roles):
                review_queue.append(build_review_item(
                    "sheet_classification_review",
                    "warning",
                    "図面役割の抽出が弱い",
                    "平面図・断面図・詳細図・凡例の役割候補が弱いため、後段の数量判定を慎重に扱ってください。",
                ))
            elif not plan_section_links:
                review_queue.append(build_review_item(
                    "sheet_classification_review",
                    "warning",
                    "平面図と断面図/詳細図のリンクが未解決",
                    "pageRoles は抽出できていますが、参照記号ベースの図面リンクが未解決です。",
                ))
        if unresolved_items:
            review_queue.append(build_review_item(
                "unit_scale_review",
                "warning",
                "未解決 OCR 項目があります",
                " / ".join(str(item.get("target")) for item in unresolved_items[:3]),
            ))

    low_confidence_item = next((item for item in ocr_items if item["score"] < OCR_REVIEW_SCORE_THRESHOLD), None)
    if low_confidence_item:
        review_queue.append(build_review_item(
            "ocr_router_review",
            "warning",
            "低信頼 OCR 行があります",
            "重要な項目に低信頼 OCR が含まれている可能性があります。",
            source_text=low_confidence_item["text"],
            source_page=low_confidence_item["page"],
        ))

    if work_type_candidates and work_type_candidates[0].get("requiresReview"):
        review_queue.append(build_review_item(
            "sheet_classification_review",
            "warning",
            "工種候補が競合しています",
            work_type_candidates[0].get("reason", "工種候補を確定できません。"),
        ))

    return review_queue


def extract_candidates(ocr_items: list[dict[str, Any]], mode: str) -> dict[str, Any]:
    candidates: dict[str, Any] = {}

    for item in ocr_items:
        source_text = item["text"]
        normalized = normalize_text(source_text)
        source_box = item["box"]
        source_page = item["page"]

        def add_candidate(field_name: str, value: str | float | int, reason: str, confidence: float, requires_review: bool) -> None:
            candidates[field_name] = choose_candidate(
                candidates.get(field_name),
                build_candidate(
                    field_name,
                    source_text,
                    source_page,
                    source_box,
                    value,
                    reason,
                    confidence,
                    should_require_review(item["score"], source_box, requires_review),
                ),
            )

        distance_match = (
            re.search(r"(?:施工延長|延長)\s*[=:：-]?\s*(-?\d+(?:\.\d+)?)\s*(?:m)?", normalized, flags=re.IGNORECASE)
            or re.search(r"(?:^|[^A-Za-z])L\s*[=:]?\s*(-?\d+(?:\.\d+)?)\s*m\b", normalized, flags=re.IGNORECASE)
        )
        if distance_match:
            add_candidate("distance", normalize_meters(float(distance_match.group(1))), "施工延長の表記を抽出", min(0.97, item["score"]), False)

        current_height = extract_numeric_value(normalized, r"(?:現況|現況高|GL|既設高)\s*[=:：-]?\s*(-?\d+(?:\.\d+)?)")
        if current_height is not None:
            add_candidate("currentHeight", normalize_meters(current_height), "現況高候補を抽出", min(0.88, item["score"]), False)

        planned_height = extract_numeric_value(normalized, r"(?:計画|計画高|FH|計画GL)\s*[=:：-]?\s*(-?\d+(?:\.\d+)?)")
        if planned_height is not None:
            add_candidate("plannedHeight", normalize_meters(planned_height), "計画高候補を抽出", min(0.88, item["score"]), False)

        base_thickness = (
            extract_numeric_value(normalized, r"(?:ベース厚|基礎厚|ベースコン(?:クリート)?厚?)\s*[=:：tT-]?\s*(\d+(?:\.\d+)?)")
            or extract_numeric_value(normalized, r"(?:ベース|基礎)\s*[=:：-]?\s*t\s*[=:：-]?\s*(\d+(?:\.\d+)?)")
        )
        if base_thickness is not None:
            add_candidate("baseThickness", normalize_maybe_millimeters(base_thickness), "ベース厚表記を抽出", min(0.86, item["score"]), False)

        crushed_stone_thickness = (
            extract_numeric_value(normalized, r"(?:砕石厚|砕石厚さ|基礎砕石(?:厚)?|下層路盤(?:厚)?)\s*[=:：tT-]?\s*(\d+(?:\.\d+)?)")
            or extract_numeric_value(normalized, r"(?:砕石|RC-40|C-40)\s*[=:：-]?\s*t\s*[=:：-]?\s*(\d+(?:\.\d+)?)")
        )
        if crushed_stone_thickness is not None:
            add_candidate("crushedStoneThickness", normalize_maybe_millimeters(crushed_stone_thickness), "砕石厚表記を抽出", min(0.86, item["score"]), False)

        if mode == "secondary_product":
            stages = extract_numeric_value(normalized, r"(\d+)\s*段")
            if stages is None:
                stages = extract_numeric_value(normalized, r"^\s*(\d+)\s*[xX×]\s*$")
            if stages is None:
                stages = extract_numeric_value(normalized, r"(\d+)\s*連")
            if stages is not None:
                stage_requires_review = "段" not in normalized
                add_candidate("stages", int(stages), "段数表記を抽出", min(0.92, item["score"]), stage_requires_review)

            dimension_match = re.search(r"(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)", normalized)
            labeled_dimension_match = re.search(
                r"(?:B|W)\s*[=:]?\s*(\d+(?:\.\d+)?)\D+(?:H)\s*[=:]?\s*(\d+(?:\.\d+)?)\D+(?:L)\s*[=:]?\s*(\d+(?:\.\d+)?)",
                normalized,
            )
            dimension_source = labeled_dimension_match or dimension_match
            if dimension_source:
                width, height, length = [normalize_maybe_millimeters(float(value)) for value in dimension_source.groups()]
                dimension_requires_review = labeled_dimension_match is None
                add_candidate("productWidth", width, "寸法表記から製品幅を推定", min(0.82, item["score"]), dimension_requires_review)
                add_candidate("productHeight", height, "寸法表記から製品高さを推定", min(0.82, item["score"]), dimension_requires_review)
                add_candidate("productLength", f"{length:g}", "寸法表記から製品長さを推定", min(0.82, item["score"]), dimension_requires_review)

            if "productLength" not in candidates:
                standalone_length = extract_numeric_value(normalized, r"(?:製品長(?:さ)?|L)\s*[=:：-]?\s*(\d+(?:\.\d+)?)")
                if standalone_length is not None and "m" not in normalized.lower():
                    normalized_length = normalize_maybe_millimeters(standalone_length)
                    add_candidate("productLength", f"{normalized_length:g}", "製品長さ表記を抽出", min(0.8, item["score"]), True)

            product_name, master_score, ambiguous_master = match_secondary_product(source_text)
            has_name_signal = bool(re.search(r"[A-Za-z一-龯ぁ-んァ-ヶ]", normalize_text(source_text)))
            can_use_master_match = bool(product_name and master_score >= 0.86 and has_name_signal and not is_dimension_like_text(source_text))
            if SECONDARY_PRODUCT_HINT_PATTERN.search(source_text) or can_use_master_match:
                product_value = product_name or source_text.strip()
                product_confidence = min(item["score"], max(master_score, 0.62)) if product_name else min(0.72, item["score"])
                product_reason = f"製品マスタ照合で {product_name} を候補化" if product_name else "製品名らしい文字列を抽出"
                add_candidate("secondaryProduct", product_value, product_reason, product_confidence, ambiguous_master or not product_name)

        elif mode == "retaining_wall":
            wall_height = (
                extract_numeric_value(normalized, r"(?:擁壁高|壁高|H)\s*[=:：-]?\s*(\d+(?:\.\d+)?)")
                or extract_numeric_value(normalized, r"(?:GL差|高低差)\s*[=:：-]?\s*(\d+(?:\.\d+)?)")
            )
            if wall_height is not None:
                add_candidate("productHeight", normalize_maybe_millimeters(wall_height), "擁壁高表記を抽出", min(0.9, item["score"]), False)

            wall_width = (
                extract_numeric_value(normalized, r"(?:底版幅|基礎幅|B)\s*[=:：-]?\s*(\d+(?:\.\d+)?)")
                or extract_numeric_value(normalized, r"(?:底版|基礎)\s*[=:：-]?\s*W\s*[=:：-]?\s*(\d+(?:\.\d+)?)")
            )
            if wall_width is not None:
                add_candidate("productWidth", normalize_maybe_millimeters(wall_width), "底版幅を抽出", min(0.88, item["score"]), False)

            if re.search(r"擁壁|L型|逆T|重力式", normalized, flags=re.IGNORECASE) and not is_dimension_like_text(source_text):
                add_candidate("secondaryProduct", source_text.strip(), "擁壁種別らしい文字列を抽出", min(0.85, item["score"]), False)

        elif mode == "pavement":
            pavement_width = (
                extract_numeric_value(normalized, r"(?:舗装幅|車道幅|歩道幅|W)\s*[=:：-]?\s*(\d+(?:\.\d+)?)")
                or extract_numeric_value(normalized, r"(?:幅員)\s*[=:：-]?\s*(\d+(?:\.\d+)?)")
            )
            if pavement_width is not None:
                add_candidate("pavementWidth", normalize_meters(pavement_width), "舗装幅表記を抽出", min(0.9, item["score"]), False)

            surface = extract_numeric_value(normalized, r"(?:表層|密粒度|再生密粒度)\s*(?:As)?\s*(?:t\s*[=:：-]?)?\s*(\d+(?:\.\d+)?)")
            if surface is not None:
                add_candidate("surfaceThickness", normalize_maybe_millimeters(surface), "表層厚表記を抽出", min(0.88, item["score"]), False)

            binder = extract_numeric_value(normalized, r"(?:基層)\s*(?:t\s*[=:：-]?)?\s*(\d+(?:\.\d+)?)")
            if binder is not None:
                add_candidate("binderThickness", normalize_maybe_millimeters(binder), "基層厚表記を抽出", min(0.88, item["score"]), False)

            road_base = extract_numeric_value(normalized, r"(?:上層路盤|路盤)\s*(?:t\s*[=:：-]?)?\s*(\d+(?:\.\d+)?)")
            if road_base is not None:
                add_candidate("baseThickness", normalize_maybe_millimeters(road_base), "路盤厚表記を抽出", min(0.86, item["score"]), False)

            if re.search(r"舗装|路盤|アスファルト|表層|基層", normalized, flags=re.IGNORECASE) and not is_dimension_like_text(source_text):
                add_candidate("secondaryProduct", source_text.strip(), "舗装種別らしい文字列を抽出", min(0.78, item["score"]), True)

        elif mode == "demolition":
            demo_width = extract_numeric_value(normalized, r"(?:撤去幅|取壊幅|解体幅|W)\s*[=:：-]?\s*(\d+(?:\.\d+)?)")
            if demo_width is not None:
                add_candidate("demolitionWidth", normalize_meters(demo_width), "撤去幅表記を抽出", min(0.9, item["score"]), False)

            demo_thickness = (
                extract_numeric_value(normalized, r"(?:撤去厚|取壊厚|解体厚)\s*[=:：tT-]?\s*(\d+(?:\.\d+)?)")
                or extract_numeric_value(normalized, r"(?:撤去|取壊|解体)\s*(?:t\s*[=:：-]?)\s*(\d+(?:\.\d+)?)")
            )
            if demo_thickness is not None:
                add_candidate("demolitionThickness", normalize_maybe_millimeters(demo_thickness), "撤去厚表記を抽出", min(0.9, item["score"]), False)

            if re.search(r"撤去|取壊|はつり|解体", normalized, flags=re.IGNORECASE) and not is_dimension_like_text(source_text):
                add_candidate("secondaryProduct", source_text.strip(), "撤去対象らしい文字列を抽出", min(0.82, item["score"]), False)

    return candidates


def resolve_job_dir(job_id: str) -> Path:
    normalized_job_id = re.sub(r"[^a-zA-Z0-9_-]", "", job_id)
    if not normalized_job_id:
        raise HTTPException(status_code=404, detail="OCRジョブが見つかりません")
    return JOB_DIR / normalized_job_id


def read_job_state(job_id: str) -> dict[str, Any]:
    job_dir = resolve_job_dir(job_id)
    state_path = job_dir / "state.json"
    if not state_path.exists():
        raise HTTPException(status_code=404, detail="OCRジョブが見つかりません")
    return json.loads(state_path.read_text(encoding="utf-8"))


def write_job_state(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    job_dir = resolve_job_dir(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    state_path = job_dir / "state.json"
    state_path.write_text(f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    return payload


def process_drawing_payload(
    *,
    base_url: str,
    file_name: str,
    file_type: str,
    file_bytes: bytes,
    mode: str,
    learning_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        pages = render_pdf_pages(file_bytes) if file_type == "pdf" else load_image_pages(file_bytes)
    except Exception as exc:  # pragma: no cover - depends on user input
        raise HTTPException(status_code=422, detail=f"図面の読み込みに失敗しました: {exc}") from exc

    media_route = determine_media_route(file_name, file_type, file_bytes, pages)
    all_ocr_items: list[dict[str, Any]] = []
    page_previews: list[dict[str, Any]] = []

    for index, page_image in enumerate(pages, start=1):
        preview_file_name = save_preview_image(page_image)
        page_previews.append({
            "imageUrl": build_image_url_from_base(base_url, f"previews/{preview_file_name}"),
            "width": page_image.width,
            "height": page_image.height,
            "page": index,
        })

    if file_type == "pdf" and media_route["preferredPipeline"] == "direct_text":
        all_ocr_items = extract_pdf_text_items(file_bytes)
    else:
        for index, page_image in enumerate(pages, start=1):
            all_ocr_items.extend(run_ocr_on_page(page_image, index))

    titleblock_meta = extract_titleblock_meta(all_ocr_items, page_previews[0] if page_previews else None)
    business_document = detect_business_document(titleblock_meta, all_ocr_items)
    sheet_classification = classify_sheet_type(all_ocr_items, titleblock_meta, business_document)
    resolved_units = resolve_units_and_view(titleblock_meta, sheet_classification)
    legend_resolution = resolve_legend_and_abbreviations(all_ocr_items)
    ocr_structured = extract_structured_ocr_signals(all_ocr_items, learning_context)
    ai_candidates = extract_candidates(all_ocr_items, mode)
    work_type_candidates = classify_work_types(all_ocr_items, sheet_classification.get("discipline"), business_document)
    review_queue = build_review_queue(
        media_route,
        titleblock_meta,
        sheet_classification,
        resolved_units,
        legend_resolution,
        work_type_candidates,
        all_ocr_items,
        business_document,
        ocr_structured,
    )

    return {
        "drawingSource": {
            "fileName": file_name,
            "fileType": file_type,
            "pageCount": len(pages),
        },
        "mediaRoute": media_route,
        "titleBlock": titleblock_meta,
        "sheetClassification": sheet_classification,
        "resolvedUnits": resolved_units,
        "legendResolution": legend_resolution,
        "ocrStructured": ocr_structured,
        "reviewQueue": review_queue,
        "aiCandidates": ai_candidates,
        "workTypeCandidates": work_type_candidates,
        "ocrLines": [item["text"] for item in all_ocr_items],
        "ocrItems": all_ocr_items,
        "pagePreview": page_previews[0] if page_previews else None,
        "pagePreviews": page_previews,
        "debug": {
            "ocr_line_count": len(all_ocr_items),
            "mode": mode,
            "ocr_pack_loaded": OCR_PACK_DIR is not None,
            "prompt_count": len(PROMPT_DEFINITIONS.get("prompts", [])),
            "knowledge_count": len(KNOWLEDGE_MASTER),
            "symbol_seed_count": len(SYMBOL_SEED_MASTER),
            "business_document": business_document,
        },
    }


def run_ocr_job(job_id: str, input_path: str, file_name: str, file_type: str, mode: str, base_url: str, learning_context: dict[str, Any] | None = None) -> None:
    state = read_job_state(job_id)
    state["status"] = "processing"
    state["progressMessage"] = "OCR解析中です。ページ変換と候補抽出を実行しています。"
    state["updatedAt"] = utc_now_iso()
    write_job_state(job_id, state)

    try:
        file_bytes = Path(input_path).read_bytes()
        result = process_drawing_payload(
            base_url=base_url,
            file_name=file_name,
            file_type=file_type,
            file_bytes=file_bytes,
            mode=mode,
            learning_context=learning_context,
        )
        state["status"] = "completed"
        state["progressMessage"] = "OCR解析が完了しました。"
        state["result"] = result
        state.pop("error", None)
    except HTTPException as exc:
        state["status"] = "failed"
        state["progressMessage"] = "OCR解析ジョブが失敗しました。"
        state["error"] = {"message": str(exc.detail)}
    except Exception as exc:  # pragma: no cover - runtime safety
        state["status"] = "failed"
        state["progressMessage"] = "OCR解析ジョブが失敗しました。"
        state["error"] = {"message": f"OCR解析に失敗しました: {exc}"}

    state["updatedAt"] = utc_now_iso()
    write_job_state(job_id, state)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"success": True, "status": "ok"}


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {
        "success": True,
        "status": "ok",
        "ocrPackLoaded": OCR_PACK_DIR is not None,
        "sheetTypeCount": len(SHEET_TYPE_ROWS),
        "promptCount": len(PROMPT_DEFINITIONS.get("prompts", [])),
    }


@app.post("/api/ocr/jobs")
async def create_parse_drawing_job(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    mode: str = Form("secondary_product"),
    learningContext: str = Form(""),
) -> dict[str, Any]:
    file_bytes = await file.read()
    file_type = validate_upload(file.filename, file_bytes, file.content_type)

    job_id = uuid.uuid4().hex
    job_dir = resolve_job_dir(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    source_suffix = ".pdf" if file_type == "pdf" else ".bin"
    source_path = job_dir / f"source{source_suffix}"
    source_path.write_bytes(file_bytes)

    state = {
        "jobId": job_id,
        "status": "queued",
        "progressMessage": "OCRジョブを登録しました。解析待ちです。",
        "createdAt": utc_now_iso(),
        "updatedAt": utc_now_iso(),
        "fileName": file.filename,
        "fileType": file_type,
        "mode": mode,
    }
    write_job_state(job_id, state)
    learning_context = normalize_learning_context(learningContext)
    background_tasks.add_task(
        run_ocr_job,
        job_id,
        str(source_path),
        file.filename or "drawing",
        file_type,
        mode,
        str(request.base_url),
        learning_context,
    )
    return state


@app.get("/api/ocr/jobs/{job_id}")
def get_parse_drawing_job(job_id: str) -> dict[str, Any]:
    return read_job_state(job_id)


@app.post("/api/ocr/parse-drawing")
async def parse_drawing(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Form("secondary_product"),
    learningContext: str = Form(""),
) -> dict[str, Any]:
    file_bytes = await file.read()
    file_type = validate_upload(file.filename, file_bytes, file.content_type)
    return process_drawing_payload(
        base_url=str(request.base_url),
        file_name=file.filename or "drawing",
        file_type=file_type,
        file_bytes=file_bytes,
        mode=mode,
        learning_context=normalize_learning_context(learningContext),
    )
