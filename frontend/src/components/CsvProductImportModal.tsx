import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiDownload,
  FiFileText,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import { api, getErrorMessage, type NamedResource } from "../services/api";

export type ParsedRow = {
  id: string;
  rowIndex: number;
  name: string;
  sku: string;
  description: string;
  categoryRaw: string;
  supplierRaw: string;
  categoryId: number | null;
  categoryName: string;
  supplierId: number | null;
  supplierName: string;
  quantity: number;
  unitPrice: number;
  lowStockThreshold: number;
  errors: string[];
  isValid: boolean;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: NamedResource[];
  suppliers: NamedResource[];
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DATA_ROWS = 5000;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }

      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (inQuotes) {
    throw new Error("CSV contains an unclosed quoted field.");
  }

  row.push(cell.trim());

  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  return rows;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["\uFEFF", content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Delay revocation so browsers have time to begin the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader);

  return headers.findIndex((header) => {
    const normalized = normalizeHeader(header);
    return normalizedAliases.includes(normalized);
  });
}

function parseNonNegativeInteger(value: string): number | null {
  if (!value.trim()) return null;

  const parsed = Number(value.trim());

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parsePrice(value: string): number | null {
  if (!value.trim()) return null;

  // Supports values such as 89.99, $89.99 and USD 89.99.
  const cleaned = value.replace(/[$£€,\s]/g, "").replace(/^USD/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return Number(parsed.toFixed(2));
}

const CsvProductImportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  categories,
  suppliers,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "valid" | "invalid">(
    "all",
  );
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const resetState = useCallback(() => {
    setFileName("");
    setFileSize(null);
    setParsedRows([]);
    setError("");
    setSuccessMessage("");
    setImportProgress("");
    setActiveTab("all");
    setIsDragOver(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleClose = useCallback(() => {
    if (importing) return;

    resetState();
    onClose();
  }, [importing, onClose, resetState]);

  useEffect(() => {
    if (!isOpen) {
      setIsDragOver(false);
    }
  }, [isOpen]);


  const processCsvFile = useCallback(
    (file: File) => {
      setError("");
      setSuccessMessage("");
      setParsedRows([]);
      setFileName("");
      setFileSize(null);

      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError("Please choose a valid CSV file (.csv).");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError("CSV file must be 10 MB or smaller.");
        return;
      }

      if (file.size === 0) {
        setError("The selected CSV file is empty.");
        return;
      }

      setFileName(file.name);
      setFileSize(file.size);

      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const content = event.target?.result;

          if (typeof content !== "string" || !content.trim()) {
            setError("The selected CSV file is empty.");
            setParsedRows([]);
            return;
          }

          const rawRows = parseCsv(content);

          if (rawRows.length < 2) {
            setError(
              "CSV must contain a header row and at least one product row.",
            );
            setParsedRows([]);
            return;
          }

          if (rawRows.length - 1 > MAX_DATA_ROWS) {
            setError("CSV can contain a maximum of 5,000 product rows.");
            setParsedRows([]);
            return;
          }

          const headers = rawRows[0].map(normalizeHeader);

          const nameIdx = findColumn(headers, [
            "name",
            "product name",
            "title",
          ]);

          const skuIdx = findColumn(headers, ["sku", "code", "item code"]);

          const categoryIdx = findColumn(headers, [
            "category",
            "category name",
          ]);

          const supplierIdx = findColumn(headers, [
            "supplier",
            "supplier name",
          ]);

          const qtyIdx = findColumn(headers, [
            "quantity",
            "qty",
            "stock",
            "initial quantity",
          ]);

          const priceIdx = findColumn(headers, [
            "unit price",
            "price",
            "unitprice",
            "cost",
          ]);

          const thresholdIdx = findColumn(headers, [
            "low stock threshold",
            "threshold",
            "min stock",
          ]);

          const descIdx = findColumn(headers, [
            "description",
            "desc",
            "details",
            "notes",
          ]);

          const missingColumns: string[] = [];

          if (nameIdx === -1) missingColumns.push("Name");
          if (skuIdx === -1) missingColumns.push("SKU");
          if (qtyIdx === -1) missingColumns.push("Quantity");
          if (priceIdx === -1) missingColumns.push("Unit price");

          if (missingColumns.length > 0) {
            setError(
              `Missing required CSV column${missingColumns.length > 1 ? "s" : ""}: ${missingColumns.join(", ")}.`,
            );
            setParsedRows([]);
            return;
          }

          const seenSkus = new Set<string>();
          const rows: ParsedRow[] = [];

          for (let i = 1; i < rawRows.length; i++) {
            const sourceRow = rawRows[i];
            const errors: string[] = [];

            const getCell = (index: number): string =>
              index >= 0 ? (sourceRow[index] ?? "").trim() : "";

            const name = getCell(nameIdx);
            const sku = getCell(skuIdx);
            const description = getCell(descIdx);
            const categoryRaw = getCell(categoryIdx);
            const supplierRaw = getCell(supplierIdx);
            const qtyRaw = getCell(qtyIdx);
            const priceRaw = getCell(priceIdx);
            const thresholdRaw = getCell(thresholdIdx);

            if (!name) {
              errors.push("Product name is required.");
            } else if (name.length > 200) {
              errors.push("Product name cannot exceed 200 characters.");
            }

            if (!sku) {
              errors.push("SKU is required.");
            } else if (sku.length > 100) {
              errors.push("SKU cannot exceed 100 characters.");
            } else if (seenSkus.has(sku.toLowerCase())) {
              errors.push(`Duplicate SKU "${sku}" in uploaded file.`);
            } else {
              seenSkus.add(sku.toLowerCase());
            }

            if (
              nameIdx >= 0 &&
              skuIdx >= 0 &&
              sourceRow.length > headers.length
            ) {
              errors.push(
                "This row contains more columns than the CSV header.",
              );
            }

            const quantity = parseNonNegativeInteger(qtyRaw);

            if (quantity === null) {
              errors.push(
                "Quantity is required and must be a non-negative whole number.",
              );
            }

            const unitPrice = parsePrice(priceRaw);

            if (unitPrice === null) {
              errors.push(
                "Unit price is required and must be a valid non-negative amount with up to 2 decimal places.",
              );
            }

            let lowStockThreshold = 5;

            if (thresholdRaw) {
              const parsedThreshold = parseNonNegativeInteger(thresholdRaw);

              if (parsedThreshold === null) {
                errors.push(
                  "Low-stock threshold must be a non-negative whole number.",
                );
              } else {
                lowStockThreshold = parsedThreshold;
              }
            }

            let categoryId: number | null = null;
            let categoryName = "";

            if (categoryRaw) {
              const matchedCategory = categories.find(
                (category) =>
                  String(category.id) === categoryRaw ||
                  category.name.toLowerCase() === categoryRaw.toLowerCase(),
              );

              if (matchedCategory) {
                categoryId = matchedCategory.id;
                categoryName = matchedCategory.name;
              } else {
                categoryName = categoryRaw;
                errors.push(
                  `Category "${categoryRaw}" was not found. Create it first or correct the CSV value.`,
                );
              }
            }

            let supplierId: number | null = null;
            let supplierName = "";

            if (supplierRaw) {
              const matchedSupplier = suppliers.find(
                (supplier) =>
                  String(supplier.id) === supplierRaw ||
                  supplier.name.toLowerCase() === supplierRaw.toLowerCase(),
              );

              if (matchedSupplier) {
                supplierId = matchedSupplier.id;
                supplierName = matchedSupplier.name;
              } else {
                supplierName = supplierRaw;
                errors.push(
                  `Supplier "${supplierRaw}" was not found. Create it first or correct the CSV value.`,
                );
              }
            }

            rows.push({
              id: `${i}-${sku || name}`,
              rowIndex: i + 1,
              name,
              sku,
              description,
              categoryRaw,
              supplierRaw,
              categoryId,
              categoryName,
              supplierId,
              supplierName,
              quantity: quantity ?? 0,
              unitPrice: unitPrice ?? 0,
              lowStockThreshold,
              errors,
              isValid: errors.length === 0,
            });
          }

          setParsedRows(rows);
          setActiveTab("all");

          if (rows.length === 0) {
            setError("No product rows were found in the CSV.");
          }
        } catch (readError) {
          setError(
            `Failed to parse CSV: ${
              readError instanceof Error ? readError.message : "Invalid format."
            }`,
          );
          setParsedRows([]);
        }
      };

      reader.onerror = () => {
        setError("An error occurred while reading the selected file.");
        setParsedRows([]);
      };

      reader.readAsText(file);
    },
    [categories, suppliers],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      processCsvFile(file);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    if (importing) return;

    const file = event.dataTransfer.files?.[0];

    if (file) {
      processCsvFile(file);
    }
  };

  const validRows = useMemo(
    () => parsedRows.filter((row) => row.isValid),
    [parsedRows],
  );

  const invalidRows = useMemo(
    () => parsedRows.filter((row) => !row.isValid),
    [parsedRows],
  );

  const displayedRows = useMemo(() => {
    if (activeTab === "valid") return validRows;
    if (activeTab === "invalid") return invalidRows;
    return parsedRows;
  }, [activeTab, parsedRows, validRows, invalidRows]);

  const executeImport = async () => {
    if (importing) return;

    if (validRows.length === 0) {
      setError("There are no valid products to import.");
      return;
    }

    setImporting(true);
    setError("");
    setSuccessMessage("");
    setImportProgress(`Importing ${validRows.length} products...`);

    const productsPayload = validRows.map((row) => ({
      name: row.name,
      sku: row.sku,
      description: row.description,
      categoryId: row.categoryId,
      supplierId: row.supplierId,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      lowStockThreshold: row.lowStockThreshold,
    }));

    try {
      const response = await api.post<{
        message?: string;
        imported?: number;
      }>("/products/bulk", {
        products: productsPayload,
      });

      setSuccessMessage(
        response.data?.message ||
          `Successfully imported ${validRows.length} product${
            validRows.length === 1 ? "" : "s"
          }.`,
      );

      setImportProgress("");

      window.dispatchEvent(new Event("inventory-updated"));
      onSuccess();

      // Keep the success message visible before closing the modal.
      window.setTimeout(() => {
        resetState();
        onClose();
      }, 1600);
    } catch (importError) {
      setError(
        `Import failed: ${getErrorMessage(importError)}. No automatic retry was performed; check the product list before trying again.`,
      );
      setImportProgress("");
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !importing) {
          handleClose();
        }
      }}
    >
      <section
        className="modal panel csv-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-modal-title"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">BULK DATA ENTRY</p>
            <h2 id="csv-modal-title">Import Products CSV</h2>
            <p
              className="muted"
              style={{ margin: "4px 0 0", fontSize: "12px" }}
            >
              Upload your product catalog and validate the data before
              importing.
            </p>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={handleClose}
            disabled={importing}
            aria-label="Close import dialog"
          >
            <FiX />
          </button>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="alert-close"
              onClick={() => setError("")}
            >
              Dismiss
            </button>
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success" role="status">
            <span>{successMessage}</span>
          </div>
        )}

        <div className="csv-upload-section">

          <div
            className={`csv-dropzone ${
              isDragOver ? "csv-dropzone-active" : ""
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!importing) setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              id={fileInputId}
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={handleFileChange}
              disabled={importing}
            />

            <div className="csv-dropzone-content">
              <div className="csv-dropzone-text">
                <label
                  htmlFor={fileInputId}
                  className="csv-browse-link"
                  style={{
                    cursor: importing ? "not-allowed" : "pointer",
                  }}
                >
                  Click to select CSV file 
                </label>
                <span> or drag and drop here</span>

                <small
                  className="muted"
                  style={{ display: "block", marginTop: "4px" }}
                >
                  CSV only · Maximum 10 MB · Up to 5,000 products
                </small>
              </div>
            </div>
          </div>

          {fileName && (
            <div className="csv-file-badge">
              <FiFileText />

              <div className="csv-file-info">
                <strong>{fileName}</strong>
                {fileSize !== null && (
                  <small className="muted">
                    {(fileSize / 1024).toFixed(1)} KB · {parsedRows.length} data
                    rows parsed
                  </small>
                )}
              </div>

              <button
                type="button"
                className="text-button"
                onClick={resetState}
                disabled={importing}
                style={{ marginLeft: "auto", fontSize: "12px" }}
              >
                Change file
              </button>
            </div>
          )}
        </div>

        {parsedRows.length > 0 && (
          <div className="csv-preview-section">
            <div className="csv-stats-grid">
              <button
                type="button"
                className={`csv-stat-card ${
                  activeTab === "all" ? "active" : ""
                }`}
                onClick={() => setActiveTab("all")}
              >
                <span className="stat-label">Total Rows</span>
                <strong className="stat-value">{parsedRows.length}</strong>
              </button>

              <button
                type="button"
                className={`csv-stat-card stat-valid ${
                  activeTab === "valid" ? "active" : ""
                }`}
                onClick={() => setActiveTab("valid")}
              >
                <span className="stat-label">
                  <FiCheckCircle /> Ready to Import
                </span>
                <strong className="stat-value">{validRows.length}</strong>
              </button>

              <button
                type="button"
                className={`csv-stat-card stat-invalid ${
                  activeTab === "invalid" ? "active" : ""
                }`}
                onClick={() => setActiveTab("invalid")}
              >
                <span className="stat-label">
                  <FiAlertCircle /> Needs Attention
                </span>
                <strong className="stat-value">{invalidRows.length}</strong>
              </button>
            </div>

            <div className="csv-table-wrapper">
              <div className="csv-table-scroll">
                <table className="csv-table">
                  <thead>
                    <tr>
                      <th style={{ width: "45px" }}>#</th>
                      <th style={{ width: "110px" }}>Status</th>
                      <th>Product Name</th>
                      <th>SKU</th>
                      <th>Category</th>
                      <th>Supplier</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Min Stock</th>
                    </tr>
                  </thead>

                  <tbody>
                    {displayedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          style={{
                            textAlign: "center",
                            padding: "20px",
                          }}
                        >
                          No rows to display in this view.
                        </td>
                      </tr>
                    ) : (
                      displayedRows.slice(0, 100).map((row) => (
                        <tr
                          key={row.id}
                          className={row.isValid ? "row-valid" : "row-invalid"}
                        >
                          <td>{row.rowIndex}</td>

                          <td>
                            {row.isValid ? (
                              <span className="status-badge status-good">
                                <FiCheckCircle style={{ marginRight: "3px" }} />
                                Ready
                              </span>
                            ) : (
                              <span
                                className="status-badge status-danger"
                                title={row.errors.join("; ")}
                              >
                                <FiAlertCircle style={{ marginRight: "3px" }} />
                                Issue
                              </span>
                            )}
                          </td>

                          <td>
                            <strong>
                              {row.name || <em className="muted">—</em>}
                            </strong>

                            {row.errors.length > 0 && (
                              <small className="row-error-hint">
                                {row.errors.join(" ")}
                              </small>
                            )}
                          </td>

                          <td className="sku-cell">
                            {row.sku || <em className="muted">—</em>}
                          </td>

                          <td>
                            {row.categoryName ||
                              row.categoryRaw ||
                              "Uncategorized"}
                          </td>

                          <td>{row.supplierName || row.supplierRaw || "—"}</td>

                          <td>{row.quantity}</td>

                          <td>
                            {row.unitPrice.toLocaleString(undefined, {
                              style: "currency",
                              currency: "USD",
                            })}
                          </td>

                          <td>{row.lowStockThreshold}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {displayedRows.length > 100 && (
                <div className="csv-table-footer">
                  Showing the first 100 of {displayedRows.length} rows.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="modal-actions csv-modal-actions">
          {importProgress && (
            <div
              className="import-progress-indicator"
              role="status"
              aria-live="polite"
            >
              <span className="spinner-dot" />
              <span>{importProgress}</span>
            </div>
          )}

          <button
            type="button"
            className="button button-secondary"
            onClick={handleClose}
            disabled={importing}
          >
            Cancel
          </button>

          <button
            type="button"
            className="button button-primary"
            onClick={executeImport}
            disabled={importing || validRows.length === 0}
          >
            {importing
              ? "Importing Products..."
              : validRows.length > 0
                ? `Import ${validRows.length} Product${
                    validRows.length === 1 ? "" : "s"
                  }`
                : "No Valid Products to Import"}
          </button>
        </div>
      </section>
    </div>
  );
};

export default CsvProductImportModal;
