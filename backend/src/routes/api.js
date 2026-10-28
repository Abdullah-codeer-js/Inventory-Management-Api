import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import pool from "../config/database.js";
import { validateEnv } from "../config/env.js";

const app = express.Router();
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.join(currentDirectory, "..", "..", "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncRoute = (handler) => (request, response, next) =>
  Promise.resolve(handler(request, response, next)).catch(next);

const parseId = (value) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new HttpError(400, "A valid ID is required.");
  }
  return id;
};

const requiredText = (value, label, maximum = 200) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum
  ) {
    throw new HttpError(
      400,
      `${label} is required and must be at most ${maximum} characters.`,
    );
  }
  return value.trim();
};

const optionalText = (value, label, maximum = 2000) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > maximum) {
    throw new HttpError(400, `${label} must be at most ${maximum} characters.`);
  }
  return value.trim();
};

const nonNegativeNumber = (value, label, integer = false) => {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < 0 ||
    (integer && !Number.isInteger(number))
  ) {
    throw new HttpError(
      400,
      `${label} must be a non-negative${integer ? " integer" : " number"}.`,
    );
  }
  return number;
};

const dateOnly = (value, label) => {
  const text = requiredText(value, label, 10);
  const parsed = Date.parse(`${text}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== text
  ) {
    throw new HttpError(
      400,
      `${label} must be a valid date in YYYY-MM-DD format.`,
    );
  }
  return text;
};

const pagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(query.limit, 10) || 20),
  );
  return { page, limit, offset: (page - 1) * limit };
};

const sendPage = (response, rows, total, page, limit) =>
  response.json({
    data: rows,
    total: Number(total),
    page,
    limit,
    pages: Math.ceil(Number(total) / limit),
  });

const imageStorage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadDirectory),
  filename: (_request, file, callback) => {
    const extensionByType = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    callback(
      null,
      `${crypto.randomUUID()}${extensionByType[file.mimetype] || ""}`,
    );
  },
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const allowedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
    callback(
      allowedTypes.has(file.mimetype)
        ? null
        : new HttpError(400, "Use a JPG, PNG, WebP, or GIF image."),
      allowedTypes.has(file.mimetype),
    );
  },
});
const verifyImageContent = (request, _response, next) => {
  if (!request.file) return next();
  fs.promises
    .readFile(request.file.path)
    .then((content) => {
      const isJpeg =
        content.length >= 3 &&
        content[0] === 0xff &&
        content[1] === 0xd8 &&
        content[2] === 0xff;
      const isPng = content
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const isGif = content
        .subarray(0, 6)
        .toString("ascii")
        .match(/^GIF8[79]a$/);
      const isWebp =
        content.subarray(0, 4).toString("ascii") === "RIFF" &&
        content.subarray(8, 12).toString("ascii") === "WEBP";
      const matchesMime =
        (request.file.mimetype === "image/jpeg" && isJpeg) ||
        (request.file.mimetype === "image/png" && isPng) ||
        (request.file.mimetype === "image/gif" && isGif) ||
        (request.file.mimetype === "image/webp" && isWebp);
      if (!matchesMime) {
        return fs.promises
          .unlink(request.file.path)
          .then(() =>
            next(
              new HttpError(
                400,
                "The uploaded file is not a valid supported image.",
              ),
            ),
          );
      }
      return next();
    })
    .catch(next);
};

const productSortFields = {
  name: "p.name",
  sku: "p.sku",
  quantity: "p.quantity",
  unitPrice: "p.unit_price",
  createdAt: "p.created_at",
};
const entitySortFields = { name: "name", createdAt: "created_at" };

app.get(
  "/api/health",
  asyncRoute(async (_request, response) => {
    try {
      validateEnv();
      await pool.query("SELECT 1");
      return response.json({ status: "ok", database: "connected" });
    } catch (error) {
      console.error(
        `Database health check failed (${error.code || error.name || "unknown error"}).`,
      );
      return response.status(503).json({
        status: "unavailable",
        database: "disconnected",
        error: "Database connection unavailable.",
      });
    }
  }),
);

app.get("/api/openapi.json", (_request, response) => {
  response.json({
    openapi: "3.0.3",
    info: { title: "Inventory Management API", version: "1.0.0" },
    servers: [{ url: "/api" }],
    paths: {
      "/products": {
        get: { summary: "Search and paginate products" },
        post: { summary: "Create a product" },
      },
      "/categories": {
        get: { summary: "List categories" },
        post: { summary: "Create a category" },
      },
      "/suppliers": {
        get: { summary: "List suppliers" },
        post: { summary: "Create a supplier" },
      },
      "/stock/in": { post: { summary: "Receive stock" } },
      "/stock/out": { post: { summary: "Record stock outflow" } },
      "/stock/adjust": { post: { summary: "Set adjusted stock quantity" } },
      "/inventory-history": { get: { summary: "Search inventory history" } },
      "/dashboard/summary": { get: { summary: "Get inventory summary" } },
    },
  });
});

app.use("/api", (_request, response, next) => {
  try {
    validateEnv();
    next();
  } catch (error) {
    console.error(
      `API configuration check failed (${error.code || error.name || "unknown error"}).`,
    );
    response.status(503).json({
      error: error.message,
    });
  }
});

app.get(
  "/api/dashboard/summary",
  asyncRoute(async (_request, response) => {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total_products,
        COUNT(*) FILTER (WHERE quantity <= low_stock_threshold)::int AS low_stock_items,
        COALESCE(SUM(quantity * unit_price), 0)::numeric(14, 2) AS total_stock_value,
        (SELECT COUNT(*)::int FROM suppliers) AS total_suppliers
      FROM products WHERE deleted_at IS NULL
    `);
    response.json(rows[0]);
  }),
);

app.get(
  "/api/dashboard/stock-movement",
  asyncRoute(async (_request, response) => {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(days.day, 'Dy') AS day,
        COALESCE(SUM(quantity_change) FILTER (WHERE movement_type = 'stock_in'), 0)::int AS stock_in,
        ABS(COALESCE(SUM(quantity_change) FILTER (WHERE movement_type = 'stock_out'), 0))::int AS stock_out,
        COALESCE(SUM(quantity_change) FILTER (WHERE movement_type = 'adjustment'), 0)::int AS adjustments
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS days(day)
      LEFT JOIN inventory_history h ON h.created_at::date = day::date
      GROUP BY days.day ORDER BY days.day
    `);
    response.json({ data: rows });
  }),
);

app.get(
  "/api/dashboard/category-distribution",
  asyncRoute(async (_request, response) => {
    const { rows } = await pool.query(`
      SELECT COALESCE(c.name, 'Uncategorized') AS name, COALESCE(SUM(p.quantity), 0)::int AS quantity
      FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.deleted_at IS NULL GROUP BY c.name ORDER BY quantity DESC LIMIT 10
    `);
    response.json({ data: rows });
  }),
);

app.get(
  "/api/dashboard/low-stock",
  asyncRoute(async (_request, response) => {
    const { rows } = await pool.query(`
      SELECT id, name, sku, quantity, low_stock_threshold
      FROM products WHERE deleted_at IS NULL AND quantity <= low_stock_threshold
      ORDER BY quantity ASC, name ASC LIMIT 10
    `);
    response.json({ data: rows });
  }),
);

app.get(
  "/api/dashboard/recent-activity",
  asyncRoute(async (_request, response) => {
    const { rows } = await pool.query(`
      SELECT h.id, p.name AS product_name, p.sku, h.movement_type,
        h.quantity_change, h.previous_quantity, h.new_quantity, h.reason,
        h.reference_number, h.actor_name, h.created_at
      FROM inventory_history h
      JOIN products p ON p.id = h.product_id
      ORDER BY h.created_at DESC LIMIT 8
    `);
    response.json({ data: rows });
  }),
);

app.get(
  "/api/products",
  asyncRoute(async (request, response) => {
    const { page, limit, offset } = pagination(request.query);
    const conditions = ["p.deleted_at IS NULL"];
    const values = [];
    const search =
      typeof request.query.search === "string"
        ? request.query.search.trim().slice(0, 100)
        : "";
    if (search) {
      values.push(`%${search}%`, `%${search}%`);
      conditions.push(
        `(p.name ILIKE $${values.length - 1} OR p.sku ILIKE $${values.length})`,
      );
    }
    if (request.query.categoryId) {
      values.push(parseId(request.query.categoryId));
      conditions.push(`p.category_id = $${values.length}`);
    }
    if (request.query.supplierId) {
      values.push(parseId(request.query.supplierId));
      conditions.push(`p.supplier_id = $${values.length}`);
    }
    if (request.query.stockStatus === "low")
      conditions.push("p.quantity <= p.low_stock_threshold");
    if (request.query.stockStatus === "in_stock")
      conditions.push("p.quantity > p.low_stock_threshold");
    const where = conditions.join(" AND ");
    const sortColumn =
      productSortFields[request.query.sortBy] || "p.created_at";
    const sortDirection = request.query.sortOrder === "asc" ? "ASC" : "DESC";
    const params = [...values, limit, offset];
    const [items, count] = await Promise.all([
      pool.query(
        `SELECT p.id, p.name, p.sku, p.description, p.category_id, p.supplier_id,
          c.name AS category_name, s.name AS supplier_name, p.quantity,
          p.unit_price, p.low_stock_threshold, p.image_path, p.created_at, p.updated_at
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE ${where} ORDER BY ${sortColumn} ${sortDirection}
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        params,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM products p WHERE ${where}`,
        values,
      ),
    ]);
    sendPage(response, items.rows, count.rows[0].total, page, limit);
  }),
);

app.post(
  "/api/products/image",
  imageUpload.single("image"),
  verifyImageContent,
  (request, response) => {
    if (!request.file) throw new HttpError(400, "Choose an image to upload.");
    response
      .status(201)
      .json({ imagePath: `/uploads/${request.file.filename}` });
  },
);

app.get(
  "/api/products/:id",
  asyncRoute(async (request, response) => {
    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [parseId(request.params.id)],
    );
    if (!rows.length) throw new HttpError(404, "Product not found.");
    response.json(rows[0]);
  }),
);

app.post(
  "/api/products",
  asyncRoute(async (request, response) => {
    const name = requiredText(request.body.name, "Product name");
    const sku = requiredText(request.body.sku, "SKU", 100);
    const description = optionalText(request.body.description, "Description");
    const quantity = nonNegativeNumber(
      request.body.quantity ?? 0,
      "Quantity",
      true,
    );
    const unitPrice = nonNegativeNumber(
      request.body.unitPrice ?? 0,
      "Unit price",
    );
    const lowStockThreshold = nonNegativeNumber(
      request.body.lowStockThreshold ?? 5,
      "Low-stock threshold",
      true,
    );
    const categoryId = request.body.categoryId
      ? parseId(request.body.categoryId)
      : null;
    const supplierId = request.body.supplierId
      ? parseId(request.body.supplierId)
      : null;
    const imagePath =
      optionalText(request.body.imagePath, "Image path", 500) || null;
    if (
      imagePath &&
      !/^\/uploads\/[A-Za-z0-9-]+\.(jpg|png|webp|gif)$/i.test(imagePath)
    ) {
      throw new HttpError(400, "Image path must point to an uploaded image.");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO products (name, sku, description, category_id, supplier_id, quantity,
          unit_price, low_stock_threshold, image_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          name,
          sku,
          description,
          categoryId,
          supplierId,
          quantity,
          unitPrice,
          lowStockThreshold,
          imagePath,
        ],
      );
      if (quantity > 0) {
        await client.query(
          `INSERT INTO inventory_history (product_id, movement_type, quantity_change,
            previous_quantity, new_quantity, reason)
           VALUES ($1, 'stock_in', $2, 0, $2, 'Initial stock')`,
          [rows[0].id, quantity],
        );
      }
      await client.query("COMMIT");
      response.status(201).json(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.post(
  "/api/products/bulk",
  asyncRoute(async (request, response) => {
    const products = request.body?.products;

    if (!Array.isArray(products) || products.length === 0) {
      throw new HttpError(400, "At least one product is required.");
    }
    if (products.length > 5000) {
      throw new HttpError(400, "A maximum of 5,000 products can be imported.");
    }

    const normalizedProducts = products.map((product, index) => {
      if (!product || typeof product !== "object") {
        throw new HttpError(400, `Product ${index + 1} is invalid.`);
      }

      return {
        name: requiredText(product.name, `Product ${index + 1} name`),
        sku: requiredText(product.sku, `Product ${index + 1} SKU`, 100),
        description: optionalText(
          product.description,
          `Product ${index + 1} description`,
        ),
        quantity: nonNegativeNumber(
          product.quantity ?? 0,
          `Product ${index + 1} quantity`,
          true,
        ),
        unitPrice: nonNegativeNumber(
          product.unitPrice ?? 0,
          `Product ${index + 1} unit price`,
        ),
        lowStockThreshold: nonNegativeNumber(
          product.lowStockThreshold ?? 5,
          `Product ${index + 1} low-stock threshold`,
          true,
        ),
        categoryId: product.categoryId ? parseId(product.categoryId) : null,
        supplierId: product.supplierId ? parseId(product.supplierId) : null,
      };
    });

    const seenSkus = new Set();
    for (const product of normalizedProducts) {
      const normalizedSku = product.sku.toLowerCase();
      if (seenSkus.has(normalizedSku)) {
        throw new HttpError(400, `Duplicate SKU "${product.sku}" in import.`);
      }
      seenSkus.add(normalizedSku);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const imported = [];
      for (const product of normalizedProducts) {
        const { rows } = await client.query(
          `INSERT INTO products (name, sku, description, category_id, supplier_id, quantity,
            unit_price, low_stock_threshold)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            product.name,
            product.sku,
            product.description,
            product.categoryId,
            product.supplierId,
            product.quantity,
            product.unitPrice,
            product.lowStockThreshold,
          ],
        );
        imported.push(rows[0]);

        if (product.quantity > 0) {
          await client.query(
            `INSERT INTO inventory_history (product_id, movement_type, quantity_change,
              previous_quantity, new_quantity, reason)
             VALUES ($1, 'stock_in', $2, 0, $2, 'Initial stock')`,
            [rows[0].id, product.quantity],
          );
        }
      }

      await client.query("COMMIT");
      response.status(201).json({
        message: `Successfully imported ${imported.length} products.`,
        imported: imported.length,
        data: imported,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error?.code === "23505") {
        throw new HttpError(409, "One or more SKUs already exist.");
      }
      if (error?.code === "23503") {
        throw new HttpError(400, "A selected category or supplier was not found.");
      }
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.put(
  "/api/products/:id",
  asyncRoute(async (request, response) => {
    const id = parseId(request.params.id);
    const name = requiredText(request.body.name, "Product name");
    const sku = requiredText(request.body.sku, "SKU", 100);
    const unitPrice = nonNegativeNumber(request.body.unitPrice, "Unit price");
    const lowStockThreshold = nonNegativeNumber(
      request.body.lowStockThreshold,
      "Low-stock threshold",
      true,
    );
    const categoryId = request.body.categoryId
      ? parseId(request.body.categoryId)
      : null;
    const supplierId = request.body.supplierId
      ? parseId(request.body.supplierId)
      : null;
    const imagePath =
      optionalText(request.body.imagePath, "Image path", 500) || null;
    if (
      imagePath &&
      !/^\/uploads\/[A-Za-z0-9-]+\.(jpg|png|webp|gif)$/i.test(imagePath)
    ) {
      throw new HttpError(400, "Image path must point to an uploaded image.");
    }
    const { rows } = await pool.query(
      `UPDATE products SET name = $1, sku = $2, description = $3, category_id = $4,
        supplier_id = $5, unit_price = $6, low_stock_threshold = $7, image_path = $8,
        updated_at = NOW()
       WHERE id = $9 AND deleted_at IS NULL
       RETURNING *`,
      [
        name,
        sku,
        optionalText(request.body.description, "Description"),
        categoryId,
        supplierId,
        unitPrice,
        lowStockThreshold,
        imagePath,
        id,
      ],
    );
    if (!rows.length) throw new HttpError(404, "Product not found.");
    response.json(rows[0]);
  }),
);

app.delete(
  "/api/products/:id",
  asyncRoute(async (request, response) => {
    const { rowCount } = await pool.query(
      "UPDATE products SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
      [parseId(request.params.id)],
    );
    if (!rowCount) throw new HttpError(404, "Product not found.");
    response.status(204).end();
  }),
);

const registerSimpleResource = ({
  route,
  table,
  sortFields,
  fields,
  searchColumns,
  selectColumns = "*",
}) => {
  app.get(
    `/api/${route}`,
    asyncRoute(async (request, response) => {
      const { page, limit, offset } = pagination(request.query);
      const conditions = [];
      const values = [];
      const search =
        typeof request.query.search === "string"
          ? request.query.search.trim().slice(0, 100)
          : "";
      if (search) {
        const searchConditions = searchColumns.map(
          (column) => `${column} ILIKE $${values.length + 1}`,
        );
        values.push(`%${search}%`);
        conditions.push(`(${searchConditions.join(" OR ")})`);
      }
      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      const sortColumn = sortFields[request.query.sortBy] || sortFields.name;
      const direction = request.query.sortOrder === "asc" ? "ASC" : "DESC";
      const [items, count] = await Promise.all([
        pool.query(
          `SELECT ${selectColumns} FROM ${table} ${where} ORDER BY ${sortColumn} ${direction}
           LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, limit, offset],
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total FROM ${table} ${where}`,
          values,
        ),
      ]);
      sendPage(response, items.rows, count.rows[0].total, page, limit);
    }),
  );

  app.post(
    `/api/${route}`,
    asyncRoute(async (request, response) => {
      const values = fields.map(
        ({ key, label, required = false, maximum = 2000 }) => {
          const value = request.body[key];
          const normalized = required
            ? requiredText(value, label, maximum)
            : optionalText(value, label, maximum);
          if (
            key === "email" &&
            normalized &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
          ) {
            throw new HttpError(400, "Enter a valid email address.");
          }
          return normalized;
        },
      );
      const columns = fields.map(({ column }) => column);
      const placeholders = values.map((_, index) => `$${index + 1}`);
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
        values,
      );
      response.status(201).json(rows[0]);
    }),
  );

  app.put(
    `/api/${route}/:id`,
    asyncRoute(async (request, response) => {
      const values = fields.map(
        ({ key, label, required = false, maximum = 2000 }) => {
          const value = request.body[key];
          const normalized = required
            ? requiredText(value, label, maximum)
            : optionalText(value, label, maximum);
          if (
            key === "email" &&
            normalized &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
          ) {
            throw new HttpError(400, "Enter a valid email address.");
          }
          return normalized;
        },
      );
      const assignments = fields.map(
        ({ column }, index) => `${column} = $${index + 1}`,
      );
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${assignments.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length + 1} RETURNING *`,
        [...values, parseId(request.params.id)],
      );
      if (!rows.length)
        throw new HttpError(404, `${route.slice(0, -1)} not found.`);
      response.json(rows[0]);
    }),
  );

  app.delete(
    `/api/${route}/:id`,
    asyncRoute(async (request, response) => {
      const id = parseId(request.params.id);
      if (table === "categories") {
        const { rows } = await pool.query(
          "SELECT COUNT(*)::int AS count FROM products WHERE category_id = $1 AND deleted_at IS NULL",
          [id],
        );
        if (rows[0].count > 0) {
          throw new HttpError(
            409,
            "Cannot delete category while active products are assigned to it.",
          );
        }
        await pool.query(
          "UPDATE products SET category_id = NULL WHERE category_id = $1 AND deleted_at IS NOT NULL",
          [id],
        );
      } else if (table === "suppliers") {
        const { rows } = await pool.query(
          "SELECT COUNT(*)::int AS count FROM products WHERE supplier_id = $1 AND deleted_at IS NULL",
          [id],
        );
        if (rows[0].count > 0) {
          throw new HttpError(
            409,
            "Cannot delete supplier while active products are assigned to it.",
          );
        }
        await pool.query(
          "UPDATE products SET supplier_id = NULL WHERE supplier_id = $1 AND deleted_at IS NOT NULL",
          [id],
        );
      }
      const { rowCount } = await pool.query(
        `DELETE FROM ${table} WHERE id = $1`,
        [id],
      );
      if (!rowCount)
        throw new HttpError(404, `${route.slice(0, -1)} not found.`);
      response.status(204).end();
    }),
  );
};

registerSimpleResource({
  route: "categories",
  table: "categories",
  sortFields: entitySortFields,
  searchColumns: ["name", "description"],
  selectColumns: `categories.*,
    (SELECT COUNT(*)::int FROM products p
     WHERE p.category_id = categories.id AND p.deleted_at IS NULL) AS product_count`,
  fields: [
    {
      key: "name",
      column: "name",
      label: "Category name",
      required: true,
      maximum: 200,
    },
    { key: "description", column: "description", label: "Description" },
  ],
});

registerSimpleResource({
  route: "suppliers",
  table: "suppliers",
  sortFields: entitySortFields,
  searchColumns: ["name", "contact_person", "email", "phone"],
  selectColumns: `suppliers.*,
    (SELECT COUNT(*)::int FROM products p
     WHERE p.supplier_id = suppliers.id AND p.deleted_at IS NULL) AS product_count`,
  fields: [
    {
      key: "name",
      column: "name",
      label: "Supplier name",
      required: true,
      maximum: 200,
    },
    {
      key: "contactPerson",
      column: "contact_person",
      label: "Contact person",
      maximum: 200,
    },
    { key: "email", column: "email", label: "Email", maximum: 320 },
    { key: "phone", column: "phone", label: "Phone", maximum: 50 },
    { key: "address", column: "address", label: "Address", maximum: 1000 },
  ],
});

app.get(
  "/api/stock/low",
  asyncRoute(async (_request, response) => {
    const { rows } = await pool.query(
      `SELECT id, name, sku, quantity, low_stock_threshold FROM products
       WHERE deleted_at IS NULL AND quantity <= low_stock_threshold ORDER BY quantity, name`,
    );
    response.json({ data: rows });
  }),
);

const recordStockMovement = (movementType) =>
  asyncRoute(async (request, response) => {
    const productId = parseId(request.body.productId);
    const quantity = nonNegativeNumber(request.body.quantity, "Quantity", true);
    if (movementType !== "adjustment" && quantity < 1) {
      throw new HttpError(400, "Movement quantity must be greater than zero.");
    }
    const reason = optionalText(request.body.reason, "Reason", 1000);
    const referenceNumber = optionalText(
      request.body.referenceNumber,
      "Reference number",
      100,
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: products } = await client.query(
        "SELECT id, quantity FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [productId],
      );
      if (!products.length) throw new HttpError(404, "Product not found.");
      const previousQuantity = products[0].quantity;
      const newQuantity =
        movementType === "stock_in"
          ? previousQuantity + quantity
          : movementType === "stock_out"
            ? previousQuantity - quantity
            : quantity;
      if (newQuantity < 0)
        throw new HttpError(400, "Stock out exceeds the current quantity.");
      await client.query(
        "UPDATE products SET quantity = $1, updated_at = NOW() WHERE id = $2",
        [newQuantity, productId],
      );
      const { rows } = await client.query(
        `INSERT INTO inventory_history
          (product_id, movement_type, quantity_change, previous_quantity, new_quantity, reason, reference_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          productId,
          movementType,
          newQuantity - previousQuantity,
          previousQuantity,
          newQuantity,
          reason,
          referenceNumber,
        ],
      );
      await client.query("COMMIT");
      response.status(201).json(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

app.post("/api/stock/in", recordStockMovement("stock_in"));
app.post("/api/stock/out", recordStockMovement("stock_out"));
app.post("/api/stock/adjust", recordStockMovement("adjustment"));

app.get(
  "/api/inventory-history",
  asyncRoute(async (request, response) => {
    const { page, limit, offset } = pagination(request.query);
    const conditions = [];
    const values = [];
    const whereParam = (condition, value) => {
      values.push(value);
      conditions.push(condition.replace("?", `$${values.length}`));
    };
    if (request.query.productId)
      whereParam("h.product_id = ?", parseId(request.query.productId));
    if (
      ["stock_in", "stock_out", "adjustment"].includes(
        request.query.movementType,
      )
    ) {
      whereParam("h.movement_type = ?", request.query.movementType);
    }
    const fromDate = request.query.from
      ? dateOnly(request.query.from, "From date")
      : "";
    const toDate = request.query.to
      ? dateOnly(request.query.to, "To date")
      : "";
    if (fromDate && toDate && fromDate > toDate)
      throw new HttpError(
        400,
        "From date must be earlier than or equal to the To date.",
      );
    if (fromDate) whereParam("h.created_at >= ?::date", fromDate);
    if (toDate)
      whereParam("h.created_at < (?::date + INTERVAL '1 day')", toDate);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const historySortFields = {
      timestamp: "h.created_at",
      product: "p.name",
      movement: "h.movement_type",
    };
    const sortColumn =
      historySortFields[request.query.sortBy] || "h.created_at";
    const sortDirection = request.query.sortOrder === "asc" ? "ASC" : "DESC";
    const [items, count] = await Promise.all([
      pool.query(
        `SELECT h.id, h.product_id, p.name AS product_name, p.sku, h.movement_type,
          h.quantity_change, h.previous_quantity, h.new_quantity, h.reason,
          h.reference_number, h.actor_name, h.created_at
         FROM inventory_history h JOIN products p ON p.id = h.product_id
         ${where}
         ORDER BY ${sortColumn} ${sortDirection} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM inventory_history h ${where}`,
        values,
      ),
    ]);
    sendPage(response, items.rows, count.rows[0].total, page, limit);
  }),
);

const csvCell = (value) => {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

const sendCsv = (response, filename, headers, rows) => {
  const content = [headers, ...rows.map((row) => Object.values(row))]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  response.send(`\uFEFF${content}`);
};

app.get(
  "/api/reports/products.csv",
  asyncRoute(async (request, response) => {
    const conditions = ["p.deleted_at IS NULL"];
    const values = [];
    const addFilter = (sql, value) => {
      values.push(value);
      conditions.push(sql.replace("?", `$${values.length}`));
    };
    const search =
      typeof request.query.search === "string"
        ? request.query.search.trim().slice(0, 100)
        : "";
    if (search) {
      values.push(`%${search}%`);
      values.push(`%${search}%`);
      conditions.push(
        `(p.name ILIKE $${values.length - 1} OR p.sku ILIKE $${values.length})`,
      );
    }
    if (request.query.categoryId)
      addFilter("p.category_id = ?", parseId(request.query.categoryId));
    if (request.query.supplierId)
      addFilter("p.supplier_id = ?", parseId(request.query.supplierId));
    if (request.query.stockStatus === "low")
      conditions.push("p.quantity <= p.low_stock_threshold");
    if (request.query.stockStatus === "in_stock")
      conditions.push("p.quantity > p.low_stock_threshold");
    const { rows } = await pool.query(
      `SELECT p.name, p.sku, COALESCE(c.name, ''), COALESCE(s.name, ''),
        p.quantity, p.unit_price, p.low_stock_threshold, p.created_at
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY p.name`,
      values,
    );
    sendCsv(
      response,
      "products.csv",
      [
        "Name",
        "SKU",
        "Category",
        "Supplier",
        "Quantity",
        "Unit price",
        "Low-stock threshold",
        "Created at",
      ],
      rows,
    );
  }),
);

app.get(
  "/api/reports/inventory-history.csv",
  asyncRoute(async (request, response) => {
    const conditions = [];
    const values = [];
    const filter = (sql, value) => {
      values.push(value);
      conditions.push(sql.replace("?", `$${values.length}`));
    };
    if (request.query.productId)
      filter("h.product_id = ?", parseId(request.query.productId));
    if (
      ["stock_in", "stock_out", "adjustment"].includes(
        request.query.movementType,
      )
    )
      filter("h.movement_type = ?", request.query.movementType);
    const fromDate = request.query.from
      ? dateOnly(request.query.from, "From date")
      : "";
    const toDate = request.query.to
      ? dateOnly(request.query.to, "To date")
      : "";
    if (fromDate && toDate && fromDate > toDate)
      throw new HttpError(
        400,
        "From date must be earlier than or equal to the To date.",
      );
    if (fromDate) filter("h.created_at >= ?::date", fromDate);
    if (toDate) filter("h.created_at < (?::date + INTERVAL '1 day')", toDate);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT p.name, p.sku, h.movement_type, h.quantity_change, h.previous_quantity,
        h.new_quantity, h.reason, h.reference_number, COALESCE(h.actor_name, ''), h.created_at
       FROM inventory_history h JOIN products p ON p.id = h.product_id
       ${where} ORDER BY h.created_at DESC`,
      values,
    );
    sendCsv(
      response,
      "inventory-history.csv",
      [
        "Product",
        "SKU",
        "Movement",
        "Quantity change",
        "Previous quantity",
        "New quantity",
        "Reason",
        "Reference",
        "User",
        "Timestamp",
      ],
      rows,
    );
  }),
);

export default app;
