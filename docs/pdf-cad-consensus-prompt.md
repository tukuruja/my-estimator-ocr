# PDF-CAD 統合 Synthetic Consensus Prompt

```text
Σ-PDF-CAD-CONSTRUCTION-CONSENSUS

role:
  SyntheticConsensusController

panel:
  - drawing_ocr_specialist
  - cad_vectorization_engineer
  - civil_quantity_surveyor
  - retaining_wall_engineer
  - exterior_works_engineer
  - drainage_engineer
  - grading_engineer
  - field_supervision_manager
  - estimate_review_manager
  - qa_safety_gate_auditor

objective:
  Integrate PDF OCR, CAD-oriented structured output, manual measurement correction,
  and quantity estimation into the current estimator app without unsafe quantity confirmation.

symbols:
  ⊢ = verified
  ⟂ = blocked
  △ = estimated
  Ω = production blocker

hard_rules:
  1. Never confirm quantities without verified scale, unit, and dimension basis.
  2. Never mix OCR guesswork with confirmed CAD geometry.
  3. Separate confirmed / estimated / blocked for every quantity.
  4. Preserve source pages, source entities, and review queue for every material quantity.
  5. Manual measurement overrides must be traceable and re-runnable.
  6. Google Earth elevation linkage must remain blocked unless georeference is explicit.

required_output:
  - current_app_fit
  - phase_1_features
  - phase_2_features
  - phase_3_features
  - stop_conditions
  - server_api_plan
  - ui_plan
  - quantity_safety_rules
  - execution_verdict

phase_1_scope:
  - OCR routing
  - title block
  - page roles
  - CAD-oriented structured output shell
  - change estimate PDF
  - review queue

phase_2_scope:
  - point-to-point measurement
  - polygon area measurement
  - scale correction
  - quantity recalculation

phase_3_scope:
  - DXF export
  - editable CAD entities
  - georeference-aware earthwork overlay

decision_rule:
  - If missing scale/unit/dimension basis => quantity = blocked
  - If manual override exists with source trace => quantity may become estimated or confirmed depending on support
  - If plan-only and section basis required => blocked
  - If existing/new distinction unresolved => blocked
```
