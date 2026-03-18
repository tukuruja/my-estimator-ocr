#!/usr/bin/env python3
from __future__ import annotations

import csv
from datetime import datetime, timezone
import json
import sys
from pathlib import Path
from typing import Any

DEFAULT_SOURCE_DIR = Path('/Users/user/Desktop/CODEXスキル/OCR')
DEFAULT_OUTPUT_DIR = Path('/Users/user/work/my-estimator-ocr/server/data/drawing-ocr-pack')
DEFAULT_AI_API_OUTPUT_DIR = Path('/Users/user/work/my-estimator-ocr/ai_api/data/drawing-ocr-pack')

CSV_FILES = [
    'drawing_ocr_sheet_type_master.csv',
    'drawing_ocr_abbreviation_master.csv',
    'drawing_ocr_symbol_seed_master.csv',
    'drawing_ocr_knowledge_master.csv',
    'drawing_ocr_field_dictionary.csv',
    'drawing_ocr_pack_summary.csv',
]
JSON_FILES = [
    'drawing_ocr_prompt_definitions.json',
    'drawing_ocr_skill_pack.json',
]
OPTIONAL_FILES = [
    'drawing_ocr_skill_import.csv',
    'drawing_ocr_prompt_templates.md',
    'drawing_ocr_readme.md',
]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def write_generated_outputs(
    output_dir: Path,
    generated_files: dict[str, str],
    csv_payload: dict[str, list[dict[str, Any]]],
    json_payload: dict[str, Any],
    skill_import_rows: list[dict[str, str]],
    skill_import_fieldnames: list[str],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(output_dir / generated_files['sheet_type_master'], csv_payload['drawing_ocr_sheet_type_master.csv'])
    write_json(output_dir / generated_files['abbreviation_master'], csv_payload['drawing_ocr_abbreviation_master.csv'])
    write_json(output_dir / generated_files['symbol_seed_master'], csv_payload['drawing_ocr_symbol_seed_master.csv'])
    write_json(output_dir / generated_files['knowledge_master'], csv_payload['drawing_ocr_knowledge_master.csv'])
    write_json(output_dir / generated_files['field_dictionary'], csv_payload['drawing_ocr_field_dictionary.csv'])
    write_json(output_dir / generated_files['pack_summary'], csv_payload['drawing_ocr_pack_summary.csv'])
    write_json(output_dir / generated_files['prompt_definitions'], json_payload['drawing_ocr_prompt_definitions.json'])
    write_json(output_dir / generated_files['skill_pack'], json_payload['drawing_ocr_skill_pack.json'])
    write_csv(output_dir / generated_files['skill_import'], skill_import_rows, skill_import_fieldnames)


def parse_json_field(value: str) -> Any:
    text = (value or '').strip()
    if not text:
        return []
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def normalize_csv_rows(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in rows:
        item: dict[str, Any] = {}
        for key, value in row.items():
            if key is None:
                continue
            text = value.strip() if isinstance(value, str) else value
            if key.endswith('_json'):
                item[key] = parse_json_field(text)
            else:
                item[key] = text
        normalized.append(item)
    return normalized


def derive_skill_import_rows(skill_pack: dict[str, Any]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for skill in skill_pack.get('skills', []):
        rows.append({
            'skill_id': str(skill.get('skill_id', '')),
            'skill_name': str(skill.get('skill_name', '')),
            'description': str(skill.get('description', '')),
            'triggers_json': json.dumps(skill.get('triggers', []), ensure_ascii=False),
            'prompt_refs_json': json.dumps(skill.get('prompt_refs', []), ensure_ascii=False),
            'knowledge_categories_json': json.dumps(skill.get('knowledge_categories', []), ensure_ascii=False),
            'required_inputs_json': json.dumps(skill.get('required_inputs', []), ensure_ascii=False),
            'outputs_json': json.dumps(skill.get('outputs', []), ensure_ascii=False),
            'handoff_to_json': json.dumps(skill.get('handoff_to', []), ensure_ascii=False),
            'enabled': 'true' if bool(skill.get('enabled', False)) else 'false',
        })
    return rows


def main() -> int:
    source_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE_DIR
    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT_DIR
    output_dirs = [output_dir, DEFAULT_AI_API_OUTPUT_DIR]
    for directory in output_dirs:
        directory.mkdir(parents=True, exist_ok=True)

    if not source_dir.exists():
        raise SystemExit(f'source directory not found: {source_dir}')

    csv_payload: dict[str, list[dict[str, Any]]] = {}
    json_payload: dict[str, Any] = {}
    missing_optional: list[str] = []

    for name in CSV_FILES:
        path = source_dir / name
        if not path.exists():
            raise SystemExit(f'missing required csv: {path}')
        rows = read_csv(path)
        csv_payload[name] = normalize_csv_rows(rows)

    for name in JSON_FILES:
        path = source_dir / name
        if not path.exists():
            raise SystemExit(f'missing required json: {path}')
        json_payload[name] = json.loads(path.read_text(encoding='utf-8'))

    for name in OPTIONAL_FILES:
        if not (source_dir / name).exists():
            missing_optional.append(name)

    skill_import_rows = derive_skill_import_rows(json_payload['drawing_ocr_skill_pack.json'])
    skill_import_fieldnames = [
        'skill_id',
        'skill_name',
        'description',
        'triggers_json',
        'prompt_refs_json',
        'knowledge_categories_json',
        'required_inputs_json',
        'outputs_json',
        'handoff_to_json',
        'enabled',
    ]

    generated_files = {
        'sheet_type_master': 'sheet_type_master.json',
        'abbreviation_master': 'abbreviation_master.json',
        'symbol_seed_master': 'symbol_seed_master.json',
        'knowledge_master': 'knowledge_master.json',
        'field_dictionary': 'field_dictionary.json',
        'pack_summary': 'pack_summary.json',
        'prompt_definitions': 'prompt_definitions.json',
        'skill_pack': 'skill_pack.json',
        'skill_import': 'drawing_ocr_skill_import.csv',
    }

    for directory in output_dirs:
        write_generated_outputs(
            directory,
            generated_files,
            csv_payload,
            json_payload,
            skill_import_rows,
            skill_import_fieldnames,
        )

    prompt_definitions = json_payload['drawing_ocr_prompt_definitions.json']
    skill_pack = json_payload['drawing_ocr_skill_pack.json']

    manifest = {
        'importedAt': datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
        'sourceDir': str(source_dir),
        'outputDir': str(output_dir),
        'mirroredOutputDirs': [str(directory) for directory in output_dirs],
        'missingOptionalFiles': missing_optional,
        'metrics': {
            'sheetTypeCount': len(csv_payload['drawing_ocr_sheet_type_master.csv']),
            'abbreviationCount': len(csv_payload['drawing_ocr_abbreviation_master.csv']),
            'symbolSeedCount': len(csv_payload['drawing_ocr_symbol_seed_master.csv']),
            'knowledgeCount': len(csv_payload['drawing_ocr_knowledge_master.csv']),
            'fieldDictionaryCount': len(csv_payload['drawing_ocr_field_dictionary.csv']),
            'promptCount': len(prompt_definitions.get('prompts', [])),
            'skillCount': len(skill_pack.get('skills', [])),
            'reviewQueueCount': len(skill_pack.get('review_queues', [])),
        },
        'globalPolicy': skill_pack.get('global_policy', {}),
        'generatedFiles': generated_files,
        'notes': [
            'drawing_ocr_skill_import.csv was derived from drawing_ocr_skill_pack.json because the source file was missing.',
            'CSV columns ending with _json are parsed into arrays/objects in the normalized JSON outputs.',
        ],
    }
    for directory in output_dirs:
      write_json(directory / 'manifest.json', manifest)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
