import pg from 'pg';

const { Pool } = pg;

// The pool is created eagerly but only opens a connection on the first query,
// so importing this module (for tests) does not require a live database.
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // RDS enforces TLS. In this lab we trust the RDS-managed certificate without
  // pinning it. Set DB_SSL=false only for a local Postgres without TLS.
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS photos (
      id UUID PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      s3_key TEXT NOT NULL,
      content_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function listPhotos() {
  const { rows } = await pool.query(
    'SELECT id, description, s3_key, created_at FROM photos ORDER BY created_at DESC'
  );
  return rows;
}

export async function insertPhoto({ id, description, s3Key, contentType }) {
  await pool.query(
    'INSERT INTO photos (id, description, s3_key, content_type) VALUES ($1, $2, $3, $4)',
    [id, description, s3Key, contentType]
  );
}

export { pool };
