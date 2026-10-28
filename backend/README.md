# Inventory API

The API uses PostgreSQL. The existing `MONGO_URI` value and MongoDB model remain untouched; the PostgreSQL schema is separate and does not migrate or delete MongoDB data.

## Backend structure

```text
src/
  config/       Environment and PostgreSQL connection
  controllers/  Controller modules
  routes/       Inventory API routes
  middleware/   Express middleware and error handling
  models/       Existing Mongoose model
  services/     Business logic modules
  repositories/ Data access modules
  validators/   Request validation modules
  utils/        Shared utilities
  helpers/      Shared helper modules
  constants/    Shared constants
  jobs/         Seed and maintenance jobs
  sockets/      Socket integrations
  app.js        Express app configuration
index.js        HTTP server entry point
```

Run the backend from its directory with `npm run dev`; the server entry point
loads `src/app.js`.

## Configure PostgreSQL

The backend loads `.env` before importing the database pool (`npm run dev`,
`npm start`, and `npm run seed:demo` use Node's `--env-file` option). Configure
these variables in `backend\.env`:

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_NAME=im_db
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

You can use `DATABASE_URL=postgresql://username:password@localhost:5432/im_db`
instead of the `DB_*` variables. The backend also accepts PostgreSQL-standard
`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` aliases.

Keep credentials in `.env`, not in source control. Obtain real credentials
from your PostgreSQL administrator; the project does not include them.
`DB_PASSWORD` may be left empty only if the PostgreSQL server is configured
to allow passwordless authentication for that user.
This API does not use JWT authentication, so it does not require a `JWT_SECRET`.

## Create and migrate the database

Create `im_db` only if it does not already exist. For example, from PowerShell
with a PostgreSQL administrator account configured:

```powershell
psql -h localhost -p 5432 -U your_postgres_user -d postgres -c 'CREATE DATABASE im_db;'
```

Before migrating a database that may contain existing data, inspect its tables
and take a backup. This project has no migration-history table.
`001_inventory.sql` uses `CREATE TABLE/INDEX IF NOT EXISTS`; confirm any existing
tables have compatible columns and constraints before applying it. Inspect the
database with `psql`:

```powershell
psql -h localhost -p 5432 -U your_postgres_user -d im_db -c '\dt'
psql -h localhost -p 5432 -U your_postgres_user -d im_db -c '\d products'
```

Apply the schema migration only when the required schema is absent and existing
objects are compatible. It is additive and does not drop tables or delete
records:

```powershell
psql -h localhost -p 5432 -U your_postgres_user -d im_db -f .\migrations\001_inventory.sql
```

## Seed demo inventory

From the `backend` directory, run:

```powershell
npm run seed:demo
```

The seeder runs `migrations\002_demo_data.sql` in one transaction. It adds five
demo suppliers, five categories, and up to ten products when the database is
empty. Existing demo suppliers and categories are left in place; products with
existing SKUs are skipped. Initial inventory history is inserted only for
products newly inserted by that run, so rerunning the command does not
duplicate products or their initial history.

## Start and check the API

Start the backend from the `backend` directory:

```powershell
npm run dev
```

Check database connectivity. The health endpoint responds HTTP 200 when the
database is healthy and HTTP 503 when the API is running but PostgreSQL is
unavailable:

```powershell
curl.exe -i http://localhost:3000/api/health
```

Verify seeded records through the existing read-only API endpoints:

```powershell
Invoke-RestMethod http://localhost:3000/api/products
Invoke-RestMethod http://localhost:3000/api/categories
Invoke-RestMethod http://localhost:3000/api/suppliers
Invoke-RestMethod http://localhost:3000/api/inventory-history
```

The backend uses `PORT` from the environment or defaults to `3000`.
`FRONTEND_URL` accepts a comma-separated origin allowlist. Uploaded images are
stored under `backend\uploads`.

## API

The API does not implement login, signup, or bearer-token authentication by
design. All API routes are accessible to clients that can reach the server; do
not expose it to an untrusted network without placing it behind an
authentication gateway or firewall. `GET /api/openapi.json` serves the OpenAPI
document, and `GET /api/health` checks API/database connectivity.

The API provides products (search, filters, sorting, pagination, image upload,
CRUD), categories, suppliers, stock-in/out/adjustment, append-only inventory
history, dashboard aggregates, and full-dataset CSV exports. Product deletion
is a soft archive. Stock updates and history inserts share one PostgreSQL
transaction; products are row-locked during movements. Category and supplier
deletion is rejected while products reference them.

The schema migration is intentionally not run automatically. Back up any
existing PostgreSQL database and inspect schema compatibility before applying
it. The demo seed command requires the migration and a working PostgreSQL
connection.
