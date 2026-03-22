import type {
  DrawingMeasurementPoint,
  DrawingPage,
  DrawingPolygonMeasurement,
  DrawingResolvedUnits,
} from './types';

function resolvePaperMillimetersPerPixel(page: DrawingPage): number | null {
  if (!page.width || !page.height) return null;
  if (typeof page.physicalWidthMm === 'number' && page.physicalWidthMm > 0) {
    return page.physicalWidthMm / page.width;
  }
  if (typeof page.physicalHeightMm === 'number' && page.physicalHeightMm > 0) {
    return page.physicalHeightMm / page.height;
  }
  return null;
}

function resolveRealMillimetersPerPixel(page: DrawingPage, resolvedUnits?: DrawingResolvedUnits): number | null {
  const paperMmPerPixel = resolvePaperMillimetersPerPixel(page);
  const sheetScaleRatio = resolvedUnits?.sheetScaleRatio ?? null;
  if (!paperMmPerPixel || !sheetScaleRatio) return null;
  return paperMmPerPixel * sheetScaleRatio;
}

export function calculateDistancePixels(
  start: DrawingMeasurementPoint,
  end: DrawingMeasurementPoint,
): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function calculatePolygonAreaPixels(points: DrawingMeasurementPoint[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += (current.x * next.y) - (next.x * current.y);
  }
  return Math.abs(area) / 2;
}

export function convertDistancePixelsToMeters(
  pixelLength: number,
  page: DrawingPage,
  resolvedUnits?: DrawingResolvedUnits,
): number | null {
  const mmPerPixel = resolveRealMillimetersPerPixel(page, resolvedUnits);
  if (!mmPerPixel) return null;
  return Number(((pixelLength * mmPerPixel) / 1000).toFixed(4));
}

export function convertAreaPixelsToSquareMeters(
  pixelArea: number,
  page: DrawingPage,
  resolvedUnits?: DrawingResolvedUnits,
): number | null {
  const mmPerPixel = resolveRealMillimetersPerPixel(page, resolvedUnits);
  if (!mmPerPixel) return null;
  const squareMeters = (pixelArea * mmPerPixel * mmPerPixel) / 1_000_000;
  return Number(squareMeters.toFixed(4));
}

export function describeDistanceMeasurement(
  pixelLength: number,
  page: DrawingPage,
  resolvedUnits?: DrawingResolvedUnits,
): { value: string; note: string } {
  const meters = convertDistancePixelsToMeters(pixelLength, page, resolvedUnits);
  if (meters !== null) {
    return {
      value: `${meters} m`,
      note: 'ページ実寸と図面縮尺から換算',
    };
  }
  return {
    value: `${pixelLength.toFixed(1)} px`,
    note: '縮尺またはページ実寸が不足しているためピクセル表示',
  };
}

export function describePolygonMeasurement(
  pixelArea: number,
  page: DrawingPage,
  resolvedUnits?: DrawingResolvedUnits,
): { value: string; note: string } {
  const squareMeters = convertAreaPixelsToSquareMeters(pixelArea, page, resolvedUnits);
  if (squareMeters !== null) {
    return {
      value: `${squareMeters} m²`,
      note: 'ページ実寸と図面縮尺から換算',
    };
  }
  return {
    value: `${pixelArea.toFixed(1)} px²`,
    note: '縮尺またはページ実寸が不足しているためピクセル表示',
  };
}

export function buildPolygonMeasurementName(count: number): string {
  return `面積計測 ${count}`;
}

export function buildDistanceMeasurementName(count: number): string {
  return `距離計測 ${count}`;
}

export function polygonMeasurementToPath(points: DrawingPolygonMeasurement['points'], zoom: number): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * zoom} ${point.y * zoom}`).join(' ');
}
