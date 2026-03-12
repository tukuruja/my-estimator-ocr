import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

const MASTER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS price_master_items (
  id TEXT PRIMARY KEY,
  master_type TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  source_name TEXT NOT NULL,
  source_version TEXT NOT NULL,
  source_page TEXT NULL,
  vendor TEXT NOT NULL,
  region TEXT NOT NULL,
  notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_master_items_master_type ON price_master_items (master_type);
CREATE INDEX IF NOT EXISTS idx_price_master_items_effective_from_to ON price_master_items (effective_from, effective_to);
`;

let pool: Pool | null = null;
let readyPromise: Promise<void> | null = null;

function hasConnectionConfig(): boolean {
  return Boolean(
    process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.PGHOST
    || process.env.PGDATABASE
    || process.env.PGUSER,
  );
}

function createPool(): Pool {
  if (!hasConnectionConfig()) {
    throw new Error('PostgreSQL接続情報が未設定です。DATABASE_URL または PGHOST/PGDATABASE/PGUSER を設定してください。');
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    max: 10,
    idleTimeoutMillis: 10000,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });
}

export function getPostgresPool(): Pool {
  if (!pool) {
    pool = createPool();
    pool.on('error', (error) => {
      console.error('PostgreSQL pool error:', error);
    });
  }
  return pool;
}

export async function ensurePostgresReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const currentPool = getPostgresPool();
      await currentPool.query(MASTER_SCHEMA_SQL);
    })();
  }
  return readyPromise;
}

export async function withPgClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensurePostgresReady();
  const client = await getPostgresPool().connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function withPgTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  return withPgClient(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
  await ensurePostgresReady();
  return getPostgresPool().query<T>(sql, params);
}
