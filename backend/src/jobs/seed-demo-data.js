import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateEnv } from "../config/env.js";
import pool from "../config/database.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const seedSql = await fs.readFile(path.join(scriptDirectory, "../../migrations/002_demo_data.sql"), "utf8");

let client;

try {
  validateEnv();
  client = await pool.connect();
  await client.query("BEGIN");
  await client.query(seedSql);

  const { rows: [summary] } = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM suppliers WHERE email = ANY($1::text[])) AS suppliers,
       (SELECT COUNT(*)::int FROM categories WHERE name = ANY($2::text[])) AS categories,
       (SELECT COUNT(*)::int FROM products WHERE sku = ANY($3::text[]) AND deleted_at IS NULL) AS products`,
    [
      [
        "maya@northstar.example.com",
        "evan@circuithaven.example.com",
        "ava@summitsafety.example.com",
        "noah@greenline.example.com",
        "lena@vertextools.example.com",
      ],
      ["Office Supplies", "Electronics", "Tools & Hardware", "Safety & Packaging", "Furniture"],
      [
        "OFF-PAPER-001",
        "OFF-TONER-002",
        "ELEC-INPUT-001",
        "ELEC-HUB-002",
        "ELEC-LAMP-003",
        "TOOL-DRILL-001",
        "SAFE-GLASS-001",
        "PACK-BOX-002",
        "PACK-TAPE-003",
        "FURN-CHAIR-001",
      ],
    ],
  );
  await client.query("COMMIT");
  console.log(
    `Demo catalog ready: ${summary.suppliers} suppliers, ${summary.categories} categories, ${summary.products} products.`,
  );
} catch (error) {
  if (client) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(`Demo data rollback failed: ${rollbackError.message}`);
    }
  }
  console.error(`Demo data seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
