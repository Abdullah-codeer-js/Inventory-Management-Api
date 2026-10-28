import app from "./src/app.js";
import pool from "./src/config/database.js";
import { env } from "./src/config/env.js";

const server = app.listen(env.PORT, () => {
  console.log(`Inventory API listening on http://localhost:${env.PORT}`);
});

const shutdown = async () => {
  server.close();
  await pool.end();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
