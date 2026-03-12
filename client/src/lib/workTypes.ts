import type { BlockType } from './types';

export const WORK_TYPE_OPTIONS: Array<{ value: BlockType; label: string; shortLabel: string }> = [
  { value: 'secondary_product', label: '二次製品工', shortLabel: '二次製品' },
  { value: 'retaining_wall', label: '擁壁工', shortLabel: '擁壁' },
  { value: 'pavement', label: '舗装工', shortLabel: '舗装' },
  { value: 'demolition', label: '撤去工', shortLabel: '撤去' },
];

export function getWorkTypeLabel(blockType: BlockType): string {
  return WORK_TYPE_OPTIONS.find((item) => item.value === blockType)?.label ?? blockType;
}

export function getInputRoute(blockType: BlockType): string {
  switch (blockType) {
    case 'retaining_wall':
      return '/retaining-wall-input';
    case 'pavement':
      return '/pavement-input';
    case 'demolition':
      return '/demolition-input';
    case 'secondary_product':
    default:
      return '/';
  }
}

export function getEstimateRoute(blockType: BlockType): string {
  switch (blockType) {
    case 'retaining_wall':
      return '/estimates/retaining-wall';
    case 'pavement':
      return '/estimates/pavement';
    case 'demolition':
      return '/estimates/demolition';
    case 'secondary_product':
    default:
      return '/estimates/secondary-product';
  }
}
