const firstConfiguredValue = (...values) =>
  values.find((value) => typeof value === "string" && value.trim())?.trim();

const databaseUrl = firstConfiguredValue(process.env.DATABASE_URL);

const env = {
  PORT: Number(process.env.PORT) || 3000,
  DATABASE_URL: databaseUrl,
  DB_HOST: firstConfiguredValue(process.env.DB_HOST, process.env.PGHOST) || "localhost",
  DB_PORT: Number(process.env.DB_PORT || process.env.PGPORT) || 5432,
  DB_NAME: firstConfiguredValue(process.env.DB_NAME, process.env.PGDATABASE),
  DB_USER: firstConfiguredValue(process.env.DB_USER, process.env.PGUSER),
  DB_PASSWORD: process.env.DB_PASSWORD ?? process.env.PGPASSWORD,
  FRONTEND_URL:
    firstConfiguredValue(process.env.FRONTEND_URL, process.env.CLIENT_URL) ||
    "http://localhost:5173",
  NODE_ENV: process.env.NODE_ENV || "development",
};

function validateEnv() {
  if (env.DATABASE_URL) {
    let databaseUrl;
    try {
      databaseUrl = new URL(env.DATABASE_URL);
    } catch {
      throw Object.assign(new Error("DATABASE_URL must be a valid PostgreSQL connection URL."), {
        code: "INVALID_DATABASE_URL",
      });
    }

    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
      throw Object.assign(new Error("DATABASE_URL must use the postgres or postgresql protocol."), {
        code: "INVALID_DATABASE_URL",
      });
    }
    return;
  }

  const requiredVariables = ["DB_NAME", "DB_USER"];
  const missingVariables = requiredVariables.filter((variable) => !env[variable]);

  if (missingVariables.length > 0) {
    throw Object.assign(
      new Error(
        `Missing database settings: ${missingVariables.join(", ")}. Set DATABASE_URL or configure DB_NAME and DB_USER (DB_HOST and DB_PORT default to localhost:5432; DB_PASSWORD is optional when your PostgreSQL server permits passwordless authentication).`,
      ),
      { code: "MISSING_ENV" },
    );
  }
}

export { env, validateEnv };
