import fs from 'node:fs';
import initSqlJs from 'sql.js/dist/sql-asm.js';

const databasePath = process.env.REFERENCE_DATABASE_PATH
  ?? 'C:/Users/nguye/AppData/Roaming/livestreamagent/data/database.db';

function safeKey(key) {
  if (/\S+@\S+\.\S+/.test(key)) return '[dynamic-key]';
  if (/^[a-f0-9-]{16,}$/i.test(key) || /^\d{10,}$/.test(key)) return '[dynamic-key]';
  return key;
}

function describe(value, depth = 0) {
  if (depth >= 6) return typeof value;
  if (value === null) return 'null';
  if (value instanceof Uint8Array) return { type: 'blob', length: value.length };
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      items: value.slice(0, 2).map((item) => describe(item, depth + 1)),
    };
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [safeKey(key), describe(item, depth + 1)]),
    );
  }
  if (typeof value === 'string') {
    try {
      return { type: 'json', shape: describe(JSON.parse(value), depth + 1) };
    } catch {
      return { type: 'string', length: value.length };
    }
  }
  return typeof value;
}

const SQL = await initSqlJs();
const database = new SQL.Database(fs.readFileSync(databasePath));

try {
  const tableResult = database.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const tableNames = (tableResult[0]?.values ?? []).map(([name]) => String(name));
  const tables = [];

  for (const tableName of tableNames) {
    const escapedName = tableName.replace(/"/g, '""');
    const columnResult = database.exec(`PRAGMA table_info("${escapedName}")`);
    const columns = (columnResult[0]?.values ?? []).map((row) => ({
      name: String(row[1]),
      type: String(row[2]),
      nullable: Number(row[3]) === 0,
      primaryKey: Number(row[5]) > 0,
    }));
    const rowResult = database.exec(`SELECT * FROM "${escapedName}" LIMIT 3`);
    const result = rowResult[0];
    const rows = (result?.values ?? []).map((values) => Object.fromEntries(
      values.map((value, index) => [result.columns[index], describe(value)]),
    ));
    tables.push({ name: tableName, columns, rowShapes: rows });
  }

  console.log(JSON.stringify({ database: 'reference-user-data/database.db', tables }, null, 2));
} finally {
  database.close();
}
