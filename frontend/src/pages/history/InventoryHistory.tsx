import { useCallback, useEffect, useState } from "react";
import { api, getErrorMessage, type PageResult, type Product } from "../../services/api";

type HistoryRow = {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  movement_type: string;
  quantity_change: number;
  previous_quantity: number;
  new_quantity: number;
  reason: string;
  reference_number: string;
  actor_name: string | null;
  created_at: string;
};

const PAGE_SIZE = 25;

const InventoryHistory = () => {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [movementType, setMovementType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [history, productsResult] = await Promise.all([
        api.get<PageResult<HistoryRow>>("/inventory-history", {
          params: { page, limit: PAGE_SIZE, productId: productId || undefined, movementType: movementType || undefined, from: from || undefined, to: to || undefined },
        }),
        api.get<PageResult<Product>>("/products", { params: { page: 1, limit: 100, search: productSearch || undefined } }),
      ]);
      setRows(history.data.data);
      setTotal(history.data.total);
      setProducts(productsResult.data.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, productId, productSearch, movementType, from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="page">
      <div className="page-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h1>Inventory history</h1><p className="muted">A chronological, append-only record of stock movements.</p></div></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="history-filters panel">
        <label>Find product<input value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductId(""); setPage(1); }} placeholder="Search product name or SKU" /></label>
        <label>Product<select value={productId} onChange={(event) => { setProductId(event.target.value); setPage(1); }}><option value="">All products</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
        <label>Movement<select value={movementType} onChange={(event) => { setMovementType(event.target.value); setPage(1); }}><option value="">All movements</option><option value="stock_in">Stock in</option><option value="stock_out">Stock out</option><option value="adjustment">Adjustment</option></select></label>
        <label>From<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
        <label>To<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
      </div>
      <div className="panel table-panel">
        {loading ? <div className="state-message">Loading inventory history...</div> : rows.length === 0 ? <div className="state-message"><strong>No movement records</strong><span>Stock movements will appear here after they are recorded.</span></div> : (
          <div className="table-scroll"><table><thead><tr><th>Product</th><th>Movement</th><th>Change</th><th>Previous</th><th>New</th><th>Reason</th><th>Reference</th><th>Recorded by</th><th>Timestamp</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.product_name}</strong><small className="table-subtitle">{row.sku}</small></td><td><span className={`status-badge ${row.movement_type === "stock_in" ? "status-good" : row.movement_type === "stock_out" ? "status-danger" : "status-neutral"}`}>{row.movement_type.replace("_", " ")}</span></td><td className={row.quantity_change >= 0 ? "quantity-positive" : "quantity-negative"}>{row.quantity_change > 0 ? "+" : ""}{row.quantity_change}</td><td>{row.previous_quantity}</td><td>{row.new_quantity}</td><td>{row.reason || "—"}</td><td>{row.reference_number || "—"}</td><td>{row.actor_name || "System"}</td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>
        )}
        <div className="pagination"><span>{total} records · Page {page} of {pages}</span><div><button className="button button-secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="button button-secondary" disabled={page >= pages || loading} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>
      </div>
    </section>
  );
};

export default InventoryHistory;
