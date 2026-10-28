import { useCallback, useEffect, useState } from "react";
import { FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import ConfirmDialog from "./ConfirmDialog";
import { api, getErrorMessage, type NamedResource, type PageResult } from "../services/api";

export type ResourceField = { key: keyof NamedResource; label: string; multiline?: boolean; required?: boolean };

type Props = {
  title: string;
  endpoint: "categories" | "suppliers";
  description: string;
  fields: ResourceField[];
};

const PAGE_SIZE = 20;

const ResourceManager = ({ title, endpoint, description, fields }: Props) => {
  const [rows, setRows] = useState<NamedResource[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<NamedResource | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deletingRow, setDeletingRow] = useState<NamedResource | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<PageResult<NamedResource>>(`/${endpoint}`, {
        params: { page, limit: PAGE_SIZE, search: search || undefined },
      });
      setRows(data.data);
      setTotal(data.total);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, search]);

  useEffect(() => { void load(); }, [load]);

  const open = (row?: NamedResource) => {
    setEditing(row || null);
    setValues(Object.fromEntries(fields.map(({ key }) => [key, String(row?.[key] ?? "")])));
    setDialog(true);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key === "contact_person" ? "contactPerson" : key,
          value,
        ]),
      );
      if (editing) await api.put(`/${endpoint}/${editing.id}`, payload);
      else await api.post(`/${endpoint}`, payload);
      setDialog(false);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!deletingRow) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/${endpoint}/${deletingRow.id}`);
      setDeletingRow(null);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDeleting(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="page">
      <div className="page-heading"><div><p className="eyebrow">CATALOG</p><h1>{title}</h1><p className="muted">{description}</p></div><button className="button button-primary" onClick={() => open()}><FiPlus /> Add {title.slice(0, -1).toLowerCase()}</button></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="toolbar panel"><input placeholder={`Search ${title.toLowerCase()}...`} aria-label={`Search ${title.toLowerCase()}`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><span className="result-count">{total} records</span></div>
      <div className="panel table-panel">
        {loading ? <div className="state-message">Loading {title.toLowerCase()}...</div> : rows.length === 0 ? <div className="state-message"><strong>No {title.toLowerCase()} found</strong><span>Create one to start organizing your inventory.</span></div> : (
          <div className="table-scroll"><table><thead><tr>{fields.map((field) => <th key={String(field.key)}>{field.label}</th>)}<th>Products</th><th>Created</th><th>Actions</th></tr></thead><tbody>
            {rows.map((row) => <tr key={row.id}>{fields.map((field) => <td key={String(field.key)}>{String(row[field.key] || "—")}</td>)}<td>{(row as NamedResource & { product_count?: number }).product_count ?? "—"}</td><td>{new Date(row.created_at).toLocaleDateString()}</td><td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${row.name}`} onClick={() => open(row)}><FiEdit2 /></button><button className="icon-button danger-icon" aria-label={`Delete ${row.name}`} onClick={() => setDeletingRow(row)}><FiTrash2 /></button></div></td></tr>)}
          </tbody></table></div>
        )}
        <div className="pagination"><span>Page {page} of {pages}</span><div><button className="button button-secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="button button-secondary" disabled={page >= pages || loading} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>
      </div>
      {dialog && <div className="modal-backdrop"><section className="modal panel" role="dialog" aria-modal="true" aria-labelledby="resource-title"><div className="modal-heading"><div><p className="eyebrow">{editing ? "EDIT RECORD" : "NEW RECORD"}</p><h2 id="resource-title">{editing ? `Edit ${title.slice(0, -1).toLowerCase()}` : `Add ${title.slice(0, -1).toLowerCase()}`}</h2></div><button className="icon-button" onClick={() => setDialog(false)} aria-label="Close">×</button></div>{error && <div className="alert alert-error">{error}</div>}<form className="form-grid" onSubmit={save}>{fields.map((field) => <label className={field.multiline ? "form-wide" : ""} key={String(field.key)}>{field.label}{field.multiline ? <textarea rows={3} value={values[field.key] || ""} onChange={(event) => setValues((old) => ({ ...old, [field.key]: event.target.value }))} /> : <input type={field.key === "email" ? "email" : "text"} value={values[field.key] || ""} onChange={(event) => setValues((old) => ({ ...old, [field.key]: event.target.value }))} required={field.required} />}</label>)}<div className="modal-actions form-wide"><button className="button button-secondary" type="button" onClick={() => setDialog(false)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button></div></form></section></div>}
      <ConfirmDialog
        isOpen={Boolean(deletingRow)}
        title={`Delete ${title.slice(0, -1)}`}
        message={
          deletingRow ? (
            <>
              Are you sure you want to delete <strong>{deletingRow.name}</strong>?
            </>
          ) : null
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDanger
        isLoading={deleting}
        onConfirm={confirmRemove}
        onCancel={() => {
          if (!deleting) setDeletingRow(null);
        }}
      />
    </section>
  );
};

export default ResourceManager;
