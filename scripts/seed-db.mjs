import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

async function seedDatabase() {
  const password = (process.env.PASSWORD || 'guduashis@123').trim();
  const host = 'db.tcrlqxyvesuivyulirsl.supabase.co';
  const port = 5432;
  const user = 'postgres';
  const database = 'postgres';

  console.log(`Connecting to Postgres at ${host}:${port}...`);
  const client = new Client({
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });

  try {
    await client.connect();
    console.log('Connected to database successfully!');

    const seedSqlPath = path.resolve(process.cwd(), 'supabase', 'seed.sql');
    const sql = fs.readFileSync(seedSqlPath, 'utf8');

    console.log('Executing seed.sql...');
    await client.query(sql);
    console.log('Seed SQL executed successfully!');

    // Check counts
    const res = await client.query(`
      select o.name as org_name, count(a.id) as analyses_count
      from organizations o
      left join analyses a on a.org_id = o.id
      group by o.name;
    `);

    console.log('Counts per organization:');
    console.table(res.rows);
  } catch (err) {
    console.error('Failed to seed database:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedDatabase();
