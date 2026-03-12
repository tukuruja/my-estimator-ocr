from __future__ import annotations

import io
import os
import re
import uuid
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import fitz
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

try:
    from rapidocr import RapidOCR
except ModuleNotFoundError as exc:  # pragma: no cover - compatibility fallback
    if exc.name != "rapidocr":
        raise
    from rapidocr_onnxruntime import RapidOCR  # type: ignore

BASE_DIR = Path(__file__).resolve().parent
STORAGE_DIR = BASE_DIR / "storage"
PREVIEW_DIR = STORAGE_DIR / "previews"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
PRODUCT_MASTER_SOURCE = BASE_DIR.parent / "client" / "src" / "lib" / "priceData.ts"
OCR_REVIEW_SCORE_THRESHOLD = 0.75


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

app = FastAPI(title="my-estimator OCR API", version="0.1.0")
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
    "demolition": (("撤去", "取壊", "はつり", "解体", "撤去工", "処分"), "撤去工"),
}

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


def classify_work_types(ocr_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
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
        scored.append({
            "blockType": block_type,
            "label": label,
            "confidence": round(confidence, 4),
            "reason": f"キーワード一致: {', '.join(matched_texts[:3])}",
            "sourceTexts": matched_texts[:5],
            "requiresReview": False,
        })

    scored.sort(key=lambda item: item["confidence"], reverse=True)
    if len(scored) > 1 and scored[0]["confidence"] - scored[1]["confidence"] < 0.12:
        scored[0]["requiresReview"] = True
        scored[1]["requiresReview"] = True
    return scored


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


def pil_to_numpy(image: Image.Image) -> np.ndarray:
    return np.array(image.convert("RGB"))


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
    raw_result = ocr_engine(pil_to_numpy(image))
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


def build_image_url(request: Request, relative_path: str) -> str:
    return f"{str(request.base_url).rstrip('/')}/files/{relative_path}"


@app.get("/health")
def health() -> dict[str, Any]:
    return {"success": True, "status": "ok"}


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"success": True, "status": "ok"}


@app.post("/api/ocr/parse-drawing")
async def parse_drawing(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Form("secondary_product"),
) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="ファイル名がありません")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="空ファイルは解析できません")
    if len(file_bytes) > 30 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="ファイルサイズが上限を超えています")

    content_type = file.content_type or "application/octet-stream"
    file_type = "pdf" if content_type == "application/pdf" or file.filename.lower().endswith(".pdf") else "image"
    if file_type not in {"pdf", "image"}:
        raise HTTPException(status_code=400, detail="対応していないファイル形式です")

    try:
        pages = render_pdf_pages(file_bytes) if file_type == "pdf" else load_image_pages(file_bytes)
    except Exception as exc:  # pragma: no cover - depends on user input
        raise HTTPException(status_code=422, detail=f"図面の読み込みに失敗しました: {exc}") from exc

    all_ocr_items: list[dict[str, Any]] = []
    page_previews: list[dict[str, Any]] = []

    for index, page_image in enumerate(pages, start=1):
        preview_file_name = save_preview_image(page_image)
        page_previews.append({
            "imageUrl": build_image_url(request, f"previews/{preview_file_name}"),
            "width": page_image.width,
            "height": page_image.height,
            "page": index,
        })
        all_ocr_items.extend(run_ocr_on_page(page_image, index))

    ai_candidates = extract_candidates(all_ocr_items, mode)
    work_type_candidates = classify_work_types(all_ocr_items)

    return {
        "drawingSource": {
            "fileName": file.filename,
            "fileType": file_type,
            "pageCount": len(pages),
        },
        "aiCandidates": ai_candidates,
        "workTypeCandidates": work_type_candidates,
        "ocrLines": [item["text"] for item in all_ocr_items],
        "ocrItems": all_ocr_items,
        "pagePreview": page_previews[0] if page_previews else None,
        "pagePreviews": page_previews,
        "debug": {
            "ocr_line_count": len(all_ocr_items),
            "mode": mode,
        },
    }
