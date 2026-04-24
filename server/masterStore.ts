import fs from 'node:fs/promises';
import path from 'node:path';

import { createSeedMasterItems } from '../client/src/lib/masterData';
import type { PriceMasterItem } from '../client/src/lib/types';
import { pgQuery, withPgTransaction } from './postgres';

const LEGACY_MASTER_FILE = path.resolve(process.cwd(), 'server', 'data', 'master-items.json');
let seedPromise: Promise<void> | null = null;

interface MasterItemRow {
  id: string;
  master_type: string;
  code: string;
  name: string;
  aliases: string[];
  unit_price: number;
  unit: string;
  effective_from: string;
  effective_to: string | null;
  source_name: string;
  source_version: string;
  source_page: string | null;
  vendor: string;
  region: string;
  notes: string;
}

async function loadLegacyMasterItems(): Promise<PriceMasterItem[] | null> {
  try {
    const raw = await fs.readFile(LEGACY_MASTER_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as { items?: PriceMasterItem[] };
    return Array.isArray(parsed.items) ? parsed.items : null;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function toRow(item: PriceMasterItem): unknown[] {
  return [
    item.id,
    item.masterType,
    item.code,
    item.name,
    item.aliases,
    item.unitPrice,
    item.unit,
    item.effectiveFrom,
    item.effectiveTo,
    item.sourceName,
    item.sourceVersion,
    item.sourcePage,
    item.vendor,
    item.region,
    item.notes,
  ];
}

function mapRow(row: MasterItemRow): PriceMasterItem {
  return {
    id: row.id,
    masterType: row.master_type as PriceMasterItem['masterType'],
    code: row.code,
    name: row.name,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    unitPrice: Number(row.unit_price),
    unit: row.unit,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    sourceName: row.source_name,
    sourceVersion: row.source_version,
    sourcePage: row.source_page,
    vendor: row.vendor,
    region: row.region,
    notes: row.notes,
  };
}

async function insertMasterItems(items: PriceMasterItem[]): Promise<void> {
  if (items.length === 0) return;

  await withPgTransaction(async (client) => {
    for (const item of items) {
      await client.query(
        `
          INSERT INTO price_master_items (
            id, master_type, code, name, aliases, unit_price, unit,
            effective_from, effective_to, source_name, source_version, source_page,
            vendor, region, notes, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5::text[], $6, $7,
            $8::date, $9::date, $10, $11, $12,
            $13, $14, $15, NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            master_type = EXCLUDED.master_type,
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            aliases = EXCLUDED.aliases,
            unit_price = EXCLUDED.unit_price,
            unit = EXCLUDED.unit,
            effective_from = EXCLUDED.effective_from,
            effective_to = EXCLUDED.effective_to,
            source_name = EXCLUDED.source_name,
            source_version = EXCLUDED.source_version,
            source_page = EXCLUDED.source_page,
            vendor = EXCLUDED.vendor,
            region = EXCLUDED.region,
            notes = EXCLUDED.notes,
            updated_at = NOW()
        `,
        toRow(item),
      );
    }
  });
}

async function syncSeedMasterItems(items: PriceMasterItem[]): Promise<void> {
  if (items.length === 0) return;

  await withPgTransaction(async (client) => {
    for (const item of items) {
      await client.query(
        `
          INSERT INTO price_master_items (
            id, master_type, code, name, aliases, unit_price, unit,
            effective_from, effective_to, source_name, source_version, source_page,
            vendor, region, notes, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5::text[], $6, $7,
            $8::date, $9::date, $10, $11, $12,
            $13, $14, $15, NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            aliases = ARRAY(
              SELECT DISTINCT alias
              FROM unnest(price_master_items.aliases || EXCLUDED.aliases) AS alias
            ),
            notes = CASE
              WHEN COALESCE(price_master_items.notes, '') = '' THEN EXCLUDED.notes
              ELSE price_master_items.notes
            END,
            updated_at = NOW()
        `,
        toRow(item),
      );
    }
  });
}

async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const countResult = await pgQuery<{ count: string }>('SELECT COUNT(*)::text AS count FROM price_master_items');
      const existingCount = Number(countResult.rows[0]?.count ?? '0');

      if (existingCount === 0) {
        const legacyItems = await loadLegacyMasterItems();
        const initialItems = legacyItems && legacyItems.length > 0 ? legacyItems : createSeedMasterItems();
        await insertMasterItems(initialItems);
      }

      await syncSeedMasterItems(createSeedMasterItems());
    })();
  }
  return seedPromise;
}

export async function listMasterItems(query?: { masterType?: string | null; keyword?: string | null; effectiveDate?: string | null }): Promise<PriceMasterItem[]> {
  await ensureSeeded();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query?.masterType) {
    params.push(query.masterType);
    conditions.push(`master_type = $${params.length}`);
  }

  if (query?.keyword?.trim()) {
    params.push(`%${query.keyword.trim()}%`);
    conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length} OR EXISTS (SELECT 1 FROM unnest(aliases) AS alias WHERE alias ILIKE $${params.length}))`);
  }

  if (query?.effectiveDate?.trim()) {
    params.push(query.effectiveDate.trim());
    const position = params.length;
    conditions.push(`effective_from <= $${position}::date AND (effective_to IS NULL OR effective_to >= $${position}::date)`);
  }

  const sql = `
    SELECT
      id, master_type, code, name, aliases, unit_price, unit,
      effective_from::text, effective_to::text, source_name, source_version, source_page,
      vendor, region, notes
    FROM price_master_items
    ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY master_type, name, effective_from DESC
  `;

  const result = await pgQuery<MasterItemRow>(sql, params);
  return result.rows.map(mapRow);
}

export async function getMasterItemById(masterId: string): Promise<PriceMasterItem | null> {
  await ensureSeeded();
  const result = await pgQuery<MasterItemRow>(
    `
      SELECT
        id, master_type, code, name, aliases, unit_price, unit,
        effective_from::text, effective_to::text, source_name, source_version, source_page,
        vendor, region, notes
      FROM price_master_items
      WHERE id = $1
      LIMIT 1
    `,
    [masterId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function replaceMasterItems(items: PriceMasterItem[]): Promise<PriceMasterItem[]> {
  await ensureSeeded();
  await withPgTransaction(async (client) => {
    await client.query('DELETE FROM price_master_items');
    for (const item of items) {
      await client.query(
        `
          INSERT INTO price_master_items (
            id, master_type, code, name, aliases, unit_price, unit,
            effective_from, effective_to, source_name, source_version, source_page,
            vendor, region, notes, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5::text[], $6, $7,
            $8::date, $9::date, $10, $11, $12,
            $13, $14, $15, NOW()
          )
        `,
        toRow(item),
      );
    }
  });
  return listMasterItems();
}

export async function upsertMasterItem(item: PriceMasterItem): Promise<PriceMasterItem> {
  await ensureSeeded();
  await insertMasterItems([item]);
  return (await getMasterItemById(item.id)) ?? item;
}
