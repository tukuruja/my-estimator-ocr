import type { BlockType } from './types';

export const WORK_TYPE_OPTIONS: Array<{ value: BlockType; label: string; shortLabel: string }> = [
  { value: 'secondary_product', label: '二次製品工', shortLabel: '二次製品' },
  { value: 'retaining_wall', label: '擁壁工', shortLabel: '擁壁' },
  { value: 'exterior_work', label: '外構工', shortLabel: '外構' },
  { value: 'formwork', label: '型枠工', shortLabel: '型枠' },
  { value: 'concrete_slab', label: '土間コンクリート工', shortLabel: '土間コン' },
  { value: 'fence', label: 'フェンス工', shortLabel: 'フェンス' },
  { value: 'block_installation', label: 'ブロック積工', shortLabel: 'ブロック' },
  { value: 'formwork_block', label: '型枠ブロック工', shortLabel: '型枠ブロック' },
  { value: 'structure_installation', label: '構造物設置工', shortLabel: '構造物' },
  { value: 'self_funded_work', label: '自費工事', shortLabel: '自費' },
  { value: 'cut_fill', label: '切盛土工', shortLabel: '切盛土' },
  { value: 'pavement', label: '舗装工', shortLabel: '舗装' },
  { value: 'demolition', label: '撤去工', shortLabel: '撤去' },
  { value: 'count_structure', label: '街渠桝・接続桝工', shortLabel: '桝・接続桝' },
  { value: 'material_takeoff', label: '材料数量監査', shortLabel: '材料監査' },
];

export function getWorkTypeLabel(blockType: BlockType): string {
  return WORK_TYPE_OPTIONS.find((item) => item.value === blockType)?.label ?? blockType;
}

export function getInputRoute(blockType: BlockType): string {
  switch (blockType) {
    case 'retaining_wall':
      return '/retaining-wall-input';
    case 'exterior_work':
      return '/exterior-work-input';
    case 'formwork':
      return '/formwork-input';
    case 'concrete_slab':
      return '/concrete-slab-input';
    case 'fence':
      return '/fence-input';
    case 'block_installation':
      return '/block-installation-input';
    case 'formwork_block':
      return '/formwork-block-input';
    case 'structure_installation':
      return '/structure-installation-input';
    case 'self_funded_work':
      return '/self-funded-work-input';
    case 'cut_fill':
      return '/cut-fill-input';
    case 'pavement':
      return '/pavement-input';
    case 'demolition':
      return '/demolition-input';
    case 'count_structure':
      return '/count-structure-input';
    case 'material_takeoff':
      return '/material-takeoff-input';
    case 'secondary_product':
    default:
      return '/';
  }
}

export function getEstimateRoute(blockType: BlockType): string {
  switch (blockType) {
    case 'retaining_wall':
      return '/estimates/retaining-wall';
    case 'exterior_work':
      return '/estimates/exterior-work';
    case 'formwork':
      return '/estimates/formwork';
    case 'concrete_slab':
      return '/estimates/concrete-slab';
    case 'fence':
      return '/estimates/fence';
    case 'block_installation':
      return '/estimates/block-installation';
    case 'formwork_block':
      return '/estimates/formwork-block';
    case 'structure_installation':
      return '/estimates/structure-installation';
    case 'self_funded_work':
      return '/estimates/self-funded-work';
    case 'cut_fill':
      return '/estimates/cut-fill';
    case 'pavement':
      return '/estimates/pavement';
    case 'demolition':
      return '/estimates/demolition';
    case 'count_structure':
      return '/estimates/count-structure';
    case 'material_takeoff':
      return '/estimates/material-takeoff';
    case 'secondary_product':
    default:
      return '/estimates/secondary-product';
  }
}
