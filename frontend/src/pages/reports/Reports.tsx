import { useEffect, useState } from "react";
import { FiDownload } from "react-icons/fi";
import { api, getErrorMessage, type NamedResource, type PageResult, type Product } from "../../services/api";

const Reports = () => {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [stockStatus, setStockStatus] = useState("");
  const [productId, setProductId] = useState("");
  const [movementType, setMovementType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categories, setCategories] = useState<NamedResource[]>([]);
  const [suppliers, setSuppliers] = useState<NamedResource[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<PageResult<NamedResource>>("/categories", { params: { limit: 100 } }),
      api.get<PageResult<NamedResource>>("/suppliers", { params: { limit: 100 } }),
      api.get<PageResult<Product>>("/products", { params: { limit: 100 } }),
    ]).then(([categoryResult, supplierResult, productResult]) => {
      setCategories(categoryResult.data.data);
      setSuppliers(supplierResult.data.data);
      setProducts(productResult.data.data);
    }).catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  const download = async (kind: "products" | "inventory-history") => {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      const { data } = await api.get(`/reports/${kind}.csv`, {
        params: kind === "products"
          ? { search: search || undefined, categoryId: categoryId || undefined, supplierId: supplierId || undefined, stockStatus: stockStatus || undefined }
          : { productId: productId || undefined, movementType: movementType || undefined, from: from || undefined, to: to || undefined },
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = kind === "products" ? "products.csv" : "inventory-history.csv";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(`${kind === "products" ? "Products" : "Inventory history"} export downloaded.`);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="page">
      <div className="page-heading"><div><p className="eyebrow">DATA & INSIGHTS</p><h1>Reports & export</h1><p className="muted">Download complete matching datasets as CSV files.</p></div></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      <div className="report-grid">
        <article className="panel report-card"><h2>Product catalog</h2><p className="muted">Export product names, SKUs, supplier and category, stock levels, thresholds, and unit prices.</p><label>Optional name or SKU filter<input placeholder="Leave blank to export all products" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="report-filters"><label>Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Supplier<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">All suppliers</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Stock status<select value={stockStatus} onChange={(event) => setStockStatus(event.target.value)}><option value="">All</option><option value="low">Low stock</option><option value="in_stock">In stock</option></select></label></div><button className="button button-primary" disabled={Boolean(busy)} onClick={() => void download("products")}>{busy === "products" ? "Preparing export..." : "Export products CSV"}</button></article>
        <article className="panel report-card"><h2>Inventory history</h2><p className="muted">Export the movement ledger including quantity changes and balances.</p><div className="report-filters"><label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">All products</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label><label>Movement<select value={movementType} onChange={(event) => setMovementType(event.target.value)}><option value="">All movements</option><option value="stock_in">Stock in</option><option value="stock_out">Stock out</option><option value="adjustment">Adjustment</option></select></label><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div><p className="muted report-note">Filters apply to the complete matching server-side dataset.</p><button className="button button-primary" disabled={Boolean(busy)} onClick={() => void download("inventory-history")}>{busy === "inventory-history" ? "Preparing export..." : "Export history CSV"}</button></article>
      </div>
    </section>
  );
};

export default Reports;
