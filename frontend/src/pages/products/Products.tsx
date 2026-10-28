import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import {
  FiDownload,
  FiEdit2,
  FiEye,
  FiPlus,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
import ConfirmDialog from "../../components/ConfirmDialog";
import CsvProductImportModal from "../../components/CsvProductImportModal";
import {
  api,
  apiOrigin,
  getErrorMessage,
  type NamedResource,
  type PageResult,
  type Product,
} from "../../services/api";

const emptyForm = {
  name: "",
  sku: "",
  description: "",
  categoryId: "",
  supplierId: "",
  quantity: "0",
  unitPrice: "0",
  lowStockThreshold: "5",
  imagePath: "",
};

const Products = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFromUrl = searchParams.get("search") || "";
  const [search, setSearch] = useState(searchFromUrl);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState(searchParams.get("stockStatus") || "");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<NamedResource[]>([]);
  const [suppliers, setSuppliers] = useState<NamedResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageError, setImageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [productResponse, categoryResponse, supplierResponse] =
        await Promise.all([
          api.get<PageResult<Product>>("/products", {
            params: {
              page,
              limit: pageSize,
              search: search || undefined,
              stockStatus: status || undefined,
              categoryId: categoryId || undefined,
              supplierId: supplierId || undefined,
              sortBy,
              sortOrder,
            },
          }),
          api.get<PageResult<NamedResource>>("/categories", {
            params: { limit: 100 },
          }),
          api.get<PageResult<NamedResource>>("/suppliers", {
            params: { limit: 100 },
          }),
        ]);
      setProducts(productResponse.data.data);
      setTotal(productResponse.data.total);
      setCategories(categoryResponse.data.data);
      setSuppliers(supplierResponse.data.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    search,
    status,
    categoryId,
    supplierId,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProducts(), 250);
    return () => window.clearTimeout(timer);
  }, [loadProducts]);

  useEffect(() => {
    setSearch(searchFromUrl);
  }, [searchFromUrl]);

  useEffect(() => {
    setStatus(searchParams.get("stockStatus") || "");
  }, [searchParams]);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);
  const startNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setImageError("");
    setDialog(true);
  };

  const startEdit = (product: Product) => {
    setEditing(product);
    setForm({
      name: product.name,
      sku: product.sku,
      description: product.description || "",
      categoryId: product.category_id ? String(product.category_id) : "",
      supplierId: product.supplier_id ? String(product.supplier_id) : "",
      quantity: String(product.quantity),
      unitPrice: String(product.unit_price),
      lowStockThreshold: String(product.low_stock_threshold),
      imagePath: product.image_path || "",
    });
    setImageFile(null);
    setImageError("");
    setDialog(true);
  };

  const updateForm = (key: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      let imagePath = form.imagePath;
      if (imageFile) {
        const upload = new FormData();
        upload.append("image", imageFile);
        const uploaded = await api.post("/products/image", upload);
        imagePath = uploaded.data.imagePath;
      }
      const payload = {
        ...form,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        imagePath,
      };
      if (editing) {
        const { quantity: _quantity, ...editablePayload } = payload;
        await api.put(`/products/${editing.id}`, editablePayload);
      } else {
        await api.post("/products", payload);
      }
      setDialog(false);
      setNotice(editing ? "Product updated." : "Product created.");
      window.dispatchEvent(new CustomEvent("inventory-updated"));
      await loadProducts();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingProduct) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/products/${deletingProduct.id}`);
      setNotice("Product archived.");
      setDeletingProduct(null);
      window.dispatchEvent(new CustomEvent("inventory-updated"));
      await loadProducts();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectImage = (file?: File) => {
    setImageError("");
    setImageFile(null);
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        file.type,
      )
    ) {
      setImageError("Choose a JPG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be 5 MB or smaller.");
      return;
    }
    setImageFile(file);
  };

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">INVENTORY</p>
          <h1>Products</h1>
          <p className="muted">Manage your catalog and stock thresholds.</p>
        </div>
        <div className="page-actions">
          <button
            className="button button-secondary"
            onClick={() => setCsvImportOpen(true)}
            title="Upload CSV for large data entry"
          >
            <FiUpload /> Import CSV
          </button>
          <button className="button button-primary" onClick={startNew}>
            <FiPlus /> Add product
          </button>
        </div>
      </div>
      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
          <button className="alert-close" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="toolbar panel">
        <input
          aria-label="Search product name or SKU"
          placeholder="Search name or SKU..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
            setSearchParams(
              event.target.value ? { search: event.target.value } : {},
            );
          }}
        />
        <select
          aria-label="Filter category"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter supplier"
          value={supplierId}
          onChange={(event) => {
            setSupplierId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All suppliers</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter stock status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All stock statuses</option>
          <option value="low">Low stock</option>
          <option value="in_stock">stock In</option>
        </select>
        <select
          aria-label="Sort products"
          value={`${sortBy}:${sortOrder}`}
          onChange={(event) => {
            const [field, direction] = event.target.value.split(":");
            setSortBy(field);
            setSortOrder(direction);
          }}
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="name:asc">Name A-Z</option>
          <option value="name:desc">Name Z-A</option>
          <option value="sku:asc">SKU A-Z</option>
          <option value="quantity:asc">Quantity low-high</option>
          <option value="unitPrice:desc">Price high-low</option>
        </select>
        <select
          aria-label="Rows per page"
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
        >
          <option value={20}>20 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>
        <span className="result-count">{total} products</span>
      </div>

      <div className="panel table-panel">
        {loading ? (
          <div className="state-message">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="state-message">
            <strong>No products found</strong>
            <span>Try changing the search or add your first product.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Supplier</th>
                  <th>Quantity</th>
                  <th>Unit price</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="product-cell">
                        {product.image_path ? (
                          <img
                            src={`${apiOrigin}${product.image_path}`}
                            alt=""
                          />
                        ) : (
                          <span className="product-placeholder">▦</span>
                        )}
                        <span>
                          <strong>{product.name}</strong>
                          <small>{product.description || "—"}</small>
                        </span>
                      </div>
                    </td>
                    <td className="sku-cell">{product.sku}</td>
                    <td>{product.category_name || "Uncategorized"}</td>
                    <td>{product.supplier_name || "—"}</td>
                    <td>{product.quantity}</td>
                    <td>
                      {Number(product.unit_price).toLocaleString(undefined, {
                        style: "currency",
                        currency: "USD",
                      })}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${product.quantity <= product.low_stock_threshold ? "status-warning" : "status-good"}`}
                      >
                        {product.quantity <= product.low_stock_threshold
                          ? "Low stock"
                          : "stock In"}
                      </span>
                    </td>
                    <td>{new Date(product.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`View ${product.name}`}
                          onClick={() => setViewing(product)}
                        >
                          <FiEye />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Edit ${product.name}`}
                          onClick={() => startEdit(product)}
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          className="icon-button danger-icon"
                          aria-label={`Archive ${product.name}`}
                          onClick={() => setDeletingProduct(product)}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            Page {page} of {totalPages}
          </span>
          <div>
            <button
              className="button button-secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <button
              className="button button-secondary"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {dialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialog(false);
          }}
        >
          <section
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">
                  {editing ? "PRODUCT DETAILS" : "NEW ITEM"}
                </p>
                <h2 id="product-modal-title">
                  {editing ? "Edit product" : "Add product"}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setDialog(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <form className="form-grid" onSubmit={saveProduct}>
              <label>
                Product name
                <input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  required
                  maxLength={200}
                />
              </label>
              <label>
                SKU
                <input
                  value={form.sku}
                  onChange={(event) => updateForm("sku", event.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Category
                <select
                  value={form.categoryId}
                  onChange={(event) =>
                    updateForm("categoryId", event.target.value)
                  }
                >
                  <option value="">Uncategorized</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Supplier
                <select
                  value={form.supplierId}
                  onChange={(event) =>
                    updateForm("supplierId", event.target.value)
                  }
                >
                  <option value="">No supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              {!editing && (
                <label>
                  Initial quantity
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.quantity}
                    onChange={(event) =>
                      updateForm("quantity", event.target.value)
                    }
                    required
                  />
                </label>
              )}
              <label>
                Unit price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unitPrice}
                  onChange={(event) =>
                    updateForm("unitPrice", event.target.value)
                  }
                  required
                />
              </label>
              <label>
                Low-stock threshold
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.lowStockThreshold}
                  onChange={(event) =>
                    updateForm("lowStockThreshold", event.target.value)
                  }
                  required
                />
              </label>
              <label className="form-wide">
                Description
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                  maxLength={2000}
                />
              </label>
              <label className="form-wide upload-label">
                <FiUpload /> Product image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => selectImage(event.target.files?.[0])}
                />
                {imageFile && <small>{imageFile.name}</small>}
              </label>
              {imageError && (
                <div className="alert alert-error form-wide">{imageError}</div>
              )}
              {(previewUrl || form.imagePath) && (
                <img
                  className="image-preview form-wide"
                  src={previewUrl || `${apiOrigin}${form.imagePath}`}
                  alt="Product preview"
                />
              )}
              <div className="modal-actions form-wide">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setDialog(false)}
                >
                  Cancel
                </button>
                <button className="button button-primary" disabled={saving}>
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Save changes"
                      : "Create product"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {viewing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewing(null);
          }}
        >
          <section
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-view-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">PRODUCT RECORD</p>
                <h2 id="product-view-title">{viewing.name}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setViewing(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <dl className="product-details">
              <div>
                <dt>SKU</dt>
                <dd>{viewing.sku}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{viewing.category_name || "Uncategorized"}</dd>
              </div>
              <div>
                <dt>Supplier</dt>
                <dd>{viewing.supplier_name || "—"}</dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>{viewing.quantity}</dd>
              </div>
              <div>
                <dt>Unit price</dt>
                <dd>
                  {Number(viewing.unit_price).toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD",
                  })}
                </dd>
              </div>
              <div>
                <dt>Low-stock threshold</dt>
                <dd>{viewing.low_stock_threshold}</dd>
              </div>
              <div className="detail-wide">
                <dt>Description</dt>
                <dd>{viewing.description || "—"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{new Date(viewing.created_at).toLocaleString()}</dd>
              </div>
            </dl>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() => setViewing(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
      <ConfirmDialog
        isOpen={Boolean(deletingProduct)}
        title="Archive Product"
        message={
          deletingProduct ? (
            <>
              Are you sure you want to archive{" "}
              <strong>{deletingProduct.name}</strong> (
              <code>{deletingProduct.sku}</code>)?
              <span
                style={{
                  display: "block",
                  marginTop: "8px",
                  fontSize: "12px",
                  color: "var(--soft-color)",
                }}
              >
                Inventory history and movement records will be retained.
              </span>
            </>
          ) : null
        }
        confirmLabel="Archive"
        cancelLabel="Cancel"
        isDanger
        isLoading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) setDeletingProduct(null);
        }}
      />
      <CsvProductImportModal
        isOpen={csvImportOpen}
        onClose={() => setCsvImportOpen(false)}
        onSuccess={() => {
          setNotice("Bulk product import completed successfully.");
          void loadProducts();
        }}
        categories={categories}
        suppliers={suppliers}
      />
    </section>
  );
};

export default Products;
