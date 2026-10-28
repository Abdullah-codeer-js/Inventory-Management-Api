import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FiAlertTriangle, FiBox, FiDollarSign, FiTruck } from "react-icons/fi";
import { api, getErrorMessage } from "../../services/api";

type Summary = { total_products: number; low_stock_items: number; total_stock_value: string; total_suppliers: number };
type Movement = { day: string; stock_in: number; stock_out: number; adjustments: number };
type Category = { name: string; quantity: number };
type Activity = { id: number; product_name: string; sku: string; movement_type: string; quantity_change: number; created_at: string };
type LowStock = { id: number; name: string; sku: string; quantity: number; low_stock_threshold: number };

const colors = ["#4aa8ff", "#24c9a1", "#ffb547", "#ff6577", "#8a79ff", "#54d5d5"];

const Home = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [movement, setMovement] = useState<Movement[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get("/dashboard/summary"),
      api.get("/dashboard/stock-movement"),
      api.get("/dashboard/category-distribution"),
      api.get("/dashboard/recent-activity"),
      api.get("/dashboard/low-stock"),
    ]).then(([summaryResult, movementResult, categoryResult, activityResult, lowStockResult]) => {
      if (!active) return;
      setSummary(summaryResult.data);
      setMovement(movementResult.data.data);
      setCategories(categoryResult.data.data);
      setActivity(activityResult.data.data);
      setLowStock(lowStockResult.data.data);
    }).catch((requestError) => {
      if (active) setError(getErrorMessage(requestError));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const cards = summary ? [
    { label: "Total products", value: summary.total_products.toLocaleString(), icon: FiBox, accent: "blue" },
    { label: "Low stock items", value: summary.low_stock_items.toLocaleString(), icon: FiAlertTriangle, accent: "orange" },
    { label: "Total stock value", value: Number(summary.total_stock_value).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }), icon: FiDollarSign, accent: "green" },
    { label: "Suppliers", value: summary.total_suppliers.toLocaleString(), icon: FiTruck, accent: "purple" },
  ] : [];

  return (
    <section className="page dashboard">
      <div className="page-heading"><div><p className="eyebrow">INVENTORY OVERVIEW</p><h1>Dashboard</h1><p className="muted">Monitor stock levels and recent inventory activity.</p></div><div className="page-actions"><Link className="button button-secondary" to="/products">Add product</Link><Link className="button button-primary" to="/stock">Record stock movement</Link></div></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {loading ? <div className="panel state-message">Loading dashboard data...</div> : summary ? (
        <>
          <div className="summary-grid">{cards.map(({ label, value, icon: Icon, accent }) => <article className="panel summary-card" key={label}><span className={`summary-icon accent-${accent}`}><Icon /></span><div><p className="muted">{label}</p><strong>{value}</strong></div></article>)}</div>
          <div className="dashboard-charts">
            <section className="panel dashboard-panel"><div className="section-heading"><div><h2>Stock movement</h2><p className="muted">Last seven days</p></div></div>{movement.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={movement} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}><CartesianGrid stroke="#263c58" vertical={false} /><XAxis dataKey="day" stroke="#8293aa" tickLine={false} axisLine={false} /><YAxis stroke="#8293aa" tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "#132640", border: "1px solid #263c58", borderRadius: 8 }} /><Bar dataKey="stock_in" name="Stock in" fill="#24c9a1" radius={[4, 4, 0, 0]} /><Bar dataKey="stock_out" name="Stock out" fill="#ff6577" radius={[4, 4, 0, 0]} /><Bar dataKey="adjustments" name="Adjustments" fill="#4aa8ff" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="empty-inline">No movement data for this period.</div>}</section>
            <section className="panel dashboard-panel"><div className="section-heading"><div><h2>Stock by category</h2><p className="muted">Units currently on hand</p></div></div>{categories.length ? <><div className="category-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categories} dataKey="quantity" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3}>{categories.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip contentStyle={{ background: "#132640", border: "1px solid #263c58", borderRadius: 8 }} /></PieChart></ResponsiveContainer></div><div className="category-legend">{categories.slice(0, 5).map((category, index) => <span key={category.name}><i style={{ background: colors[index % colors.length] }} />{category.name}<strong>{category.quantity}</strong></span>)}</div></> : <div className="empty-inline">No category quantities available.</div>}</section>
          </div>
          <div className="dashboard-lists">
            <section className="panel dashboard-panel"><div className="section-heading"><div><h2>Low-stock alerts</h2><p className="muted">Products at or below their threshold</p></div><Link to="/products?stockStatus=low">View products</Link></div>{lowStock.length ? <div className="compact-list">{lowStock.map((product) => <div className="compact-row" key={product.id}><span className="alert-dot" /><div className="compact-main"><strong>{product.name}</strong><small>{product.sku}</small></div><span className="stock-alert-qty">{product.quantity} <small>/ {product.low_stock_threshold}</small></span></div>)}</div> : <div className="empty-inline">No low-stock items. Inventory levels look good.</div>}</section>
            <section className="panel dashboard-panel"><div className="section-heading"><div><h2>Recent activity</h2><p className="muted">Latest inventory movements</p></div><Link to="/history">Full history</Link></div>{activity.length ? <div className="compact-list">{activity.map((item) => <div className="compact-row" key={item.id}><span className={`movement-dot ${item.movement_type}`} /><div className="compact-main"><strong>{item.product_name}</strong><small>{item.sku} · {item.movement_type.replace("_", " ")}</small></div><span className={item.quantity_change < 0 ? "quantity-negative" : "quantity-positive"}>{item.quantity_change > 0 ? "+" : ""}{item.quantity_change}</span><time>{new Date(item.created_at).toLocaleDateString()}</time></div>)}</div> : <div className="empty-inline">Inventory activity will appear here.</div>}</section>
          </div>
        </>
      ) : <div className="panel state-message">Dashboard metrics are not available.</div>}
    </section>
  );
};

export default Home;
