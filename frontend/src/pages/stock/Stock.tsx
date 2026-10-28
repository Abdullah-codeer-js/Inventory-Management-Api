import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  FiArrowDownCircle,
  FiArrowUpCircle,
  FiRefreshCw,
} from "react-icons/fi";
import {
  api,
  getErrorMessage,
  type PageResult,
  type Product,
} from "../../services/api";

const movementTypes = [
  { value: "stock_in", label: "Stock in", icon: FiArrowDownCircle },
  { value: "stock_out", label: "Stock out", icon: FiArrowUpCircle },
  { value: "adjustment", label: "Adjustment", icon: FiRefreshCw },
] as const;

type MovementType = (typeof movementTypes)[number]["value"];

const Stock = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [movement, setMovement] = useState<MovementType>("stock_in");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    const loadProducts = async () => {
      setLoading(true);
      setError("");

      try {
        const { data } = await api.get<PageResult<Product>>("/products", {
          params: {
            page: 1,
            limit: 100,
            search: productSearch.trim() || undefined,
          },
        });

        if (!active) return;

        const loadedProducts = data.data;
        setProducts(loadedProducts);

        setProductId((currentId) =>
          loadedProducts.some((product) => String(product.id) === currentId)
            ? currentId
            : "",
        );
      } catch (requestError) {
        if (active) {
          setError(getErrorMessage(requestError));
          setProducts([]);
          setProductId("");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadProducts();

    return () => {
      active = false;
    };
  }, [productSearch]);

  const selectedProduct = products.find(
    (product) => String(product.id) === productId,
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitting) return;

    setError("");
    setNotice("");

    if (!productId) {
      setError("Select a product before recording stock movement.");
      return;
    }

    if (quantity.trim() === "") {
      setError("Enter a quantity.");
      return;
    }

    const parsedQuantity = Number(quantity);

    if (
      !Number.isSafeInteger(parsedQuantity) ||
      parsedQuantity < 0 ||
      (movement !== "adjustment" && parsedQuantity === 0)
    ) {
      setError(
        movement === "adjustment"
          ? "Enter a whole-number stock count of zero or greater."
          : "Enter a whole-number quantity greater than zero.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const endpoint =
        movement === "stock_in"
          ? "/stock/in"
          : movement === "stock_out"
            ? "/stock/out"
            : "/stock/adjust";

      await api.post(endpoint, {
        productId: Number(productId),
        quantity: parsedQuantity,
        reason: reason.trim(),
        referenceNumber: referenceNumber.trim(),
      });

      setNotice("Stock movement saved and inventory history recorded.");
      setQuantity("");
      setReason("");
      setReferenceNumber("");

      const { data } = await api.get<PageResult<Product>>("/products", {
        params: {
          page: 1,
          limit: 100,
          search: productSearch.trim() || undefined,
        },
      });

      setProducts(data.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">OPERATIONS</p>
          <h1>Stock Management</h1>
          <p className="muted">
            Record receipts, outflows, and verified stock counts.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}

      <div className="stock-layout">
        <section className="panel stock-form-panel">
          <div className="section-heading">
            <h2>Record Movement</h2>
            <p className="muted">
              Each successful movement should be recorded in inventory history.
            </p>
          </div>

          <div
            className="movement-tabs"
            role="group"
            aria-label="Movement type"
          >
            {movementTypes.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={`movement-tab${
                  movement === value ? " movement-tab-active" : ""
                }`}
                onClick={() => {
                  setMovement(value);
                  setError("");
                  setNotice("");
                  setQuantity("");
                }}
                aria-pressed={movement === value}
                disabled={submitting}
              >
                <Icon aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <form className="form-stack" onSubmit={submit}>
            <label>
              Find Product
              <input
                type="search"
                placeholder="Search by product or SKU..."
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                disabled={submitting}
              />
            </label>

            <label>
              Product
              <select
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                required
                disabled={loading || submitting}
              >
                <option value="">
                  {loading ? "Loading products..." : "Select a product"}
                </option>

                {products.map((product) => (
                  <option key={product.id} value={String(product.id)}>
                    {product.name} · {product.sku}
                  </option>
                ))}
              </select>
            </label>

            {!loading && products.length === 0 && (
              <p className="muted">No products found. Try another search.</p>
            )}

            {selectedProduct && (
              <div className="current-stock">
                <span>Current Quantity</span>
                <strong>{selectedProduct.quantity}</strong>
              </div>
            )}

            <label>
              {movement === "adjustment" ? "New Actual Quantity" : "Quantity"}
              <input
                type="number"
                min={movement === "adjustment" ? "0" : "1"}
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
                disabled={submitting}
                placeholder={
                  movement === "adjustment"
                    ? "Enter the counted stock"
                    : "Enter quantity"
                }
              />
            </label>

            <label>
              Reason or Notes
              <textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
                placeholder="Optional details for this movement"
                disabled={submitting}
              />
            </label>

            <label>
              Reference Number
              <input
                value={referenceNumber}
                onChange={(event) => setReferenceNumber(event.target.value)}
                maxLength={100}
                placeholder="Optional purchase order or reference"
                disabled={submitting}
              />
            </label>

            <button
              type="submit"
              className="button button-primary button-full"
              disabled={submitting || loading || !products.length}
            >
              {submitting ? "Saving Movement..." : "Record Movement"}
            </button>
          </form>
        </section>

        <aside className="panel stock-guidance">
          <div className="section-heading">
            <h2>Movement Guide</h2>
            <p className="muted">
              Select the operation that matches the physical stock change.
            </p>
          </div>

          <div className="guide-item">
            <FiArrowDownCircle className="guide-positive" aria-hidden="true" />
            <div>
              <strong>Stock In</strong>
              <p>
                Receiving, returns, or replenishment. Adds the submitted
                quantity to available stock.
              </p>
            </div>
          </div>

          <div className="guide-item">
            <FiArrowUpCircle className="guide-negative" aria-hidden="true" />
            <div>
              <strong>Stock Out</strong>
              <p>
                Sales, damage, or write-offs. The backend must prevent stock
                from becoming negative.
              </p>
            </div>
          </div>

          <div className="guide-item">
            <FiRefreshCw className="guide-neutral" aria-hidden="true" />
            <div>
              <strong>Adjustment</strong>
              <p>
                Replaces the system quantity with the newly counted quantity,
                including zero when appropriate.
              </p>
            </div>
          </div>

          <p className="notice-note">
            The backend should update stock and insert its history record in the
            same PostgreSQL transaction.
          </p>
        </aside>
      </div>
    </section>
  );
};

export default Stock;
