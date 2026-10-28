import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { FiBell, FiBox, FiMenu, FiSearch, FiX } from "react-icons/fi";
import { api } from "../../services/api";

type Props = {
  onMenuClick: () => void;
};

type DashboardSummary = {
  low_stock_items?: number;
};

type LowStockProduct = {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  low_stock_threshold: number;
};

const Navbar = ({ onMenuClick }: Props) => {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [lowStockCount, setLowStockCount] = useState(0);
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>(
    [],
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const checkLowStock = useCallback(async () => {
    try {
      const [summaryResponse, lowStockResponse] = await Promise.all([
        api.get<DashboardSummary>("/dashboard/summary"),
        api.get<{ data: LowStockProduct[] }>("/dashboard/low-stock"),
      ]);

      const count = Number(summaryResponse.data?.low_stock_items ?? 0);
      const products = Array.isArray(lowStockResponse.data?.data)
        ? lowStockResponse.data.data
        : [];

      setLowStockCount(Number.isFinite(count) && count > 0 ? count : 0);
      setLowStockProducts(products);
    } catch {
      setLowStockCount(0);
      setLowStockProducts([]);
    }
  }, []);

  useEffect(() => {
    void checkLowStock();

    const handleUpdate = () => {
      void checkLowStock();
    };

    window.addEventListener("inventory-updated", handleUpdate);
    window.addEventListener("focus", handleUpdate);

    const interval = window.setInterval(handleUpdate, 30000);

    return () => {
      window.removeEventListener("inventory-updated", handleUpdate);
      window.removeEventListener("focus", handleUpdate);
      window.clearInterval(interval);
    };
  }, [checkLowStock]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const query = search.trim();

    navigate(
      query ? `/products?search=${encodeURIComponent(query)}` : "/products",
    );
  };

  const handleNotifications = () => {
    setNotificationsOpen((open) => !open);
  };

  const viewLowStockProducts = () => {
    setNotificationsOpen(false);
    navigate("/products?stockStatus=low");
  };

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-button mobile-menu-button"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <FiMenu aria-hidden="true" />
      </button>

      <button
        type="button"
        className="brand"
        onClick={() => navigate("/")}
        aria-label="Go to dashboard"
      >
        <span className="brand-mark">
          <FiBox aria-hidden="true" />
        </span>

        <span className="brand-text">
          Inventory<span className="brand-accent">Management</span>
        </span>
      </button>
      <div className="topbar-actions">
        <button
          type="button"
          className={`icon-button notification-button ${
            lowStockCount > 0 ? "has-alert" : ""
          }`}
          aria-label={
            lowStockCount > 0
              ? `${lowStockCount} low-stock products. View alerts`
              : "No low-stock alerts. View products"
          }
          title={
            lowStockCount > 0
              ? `${lowStockCount} product(s) at or below the low-stock threshold`
              : "No low-stock products"
          }
          onClick={handleNotifications}
        >
          <FiBell aria-hidden="true" />

          {lowStockCount > 0 && (
            <span className="notification-dot" aria-hidden="true" />
          )}
        </button>

        {notificationsOpen && (
          <div className="notification-panel" role="status">
            <div className="notification-panel-heading">
              <strong>Low-stock alerts</strong>
              <button
                type="button"
                className="notification-close"
                onClick={() => setNotificationsOpen(false)}
                aria-label="Close low-stock alerts"
              >
                <FiX aria-hidden="true" />
              </button>
            </div>

            {lowStockProducts.length > 0 ? (
              <>
                <p className="notification-summary">
                  {lowStockCount} product{lowStockCount === 1 ? " is" : "s are"} at
                  or below the low-stock threshold.
                </p>
                <div className="notification-list">
                  {lowStockProducts.map((product) => (
                    <button
                      type="button"
                      className="notification-item"
                      key={product.id}
                      onClick={() => {
                        setNotificationsOpen(false);
                        navigate(
                          `/products?search=${encodeURIComponent(product.sku)}`,
                        );
                      }}
                    >
                      <span className="alert-dot" aria-hidden="true" />
                      <span>
                        <strong>{product.name}</strong>
                        <small>
                          {product.sku} · {product.quantity} left (threshold: {product.low_stock_threshold})
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="notification-view-all"
                  onClick={viewLowStockProducts}
                >
                  View or edit full product details
                </button>
              </>
            ) : (
              <p className="notification-summary">No low-stock products.</p>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
