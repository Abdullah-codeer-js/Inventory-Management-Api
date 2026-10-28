import { useState } from "react";
import { FiCheckCircle, FiRefreshCw } from "react-icons/fi";
import { api, getErrorMessage } from "../../services/api";

const Settings = () => {
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState("");
  const [error, setError] = useState("");

  const checkConnection = async () => {
    setChecking(true);
    setConnection("");
    setError("");
    try {
      const { data } = await api.get("/health");
      setConnection(data.database === "connected" ? "API and PostgreSQL are connected." : "API is responding.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="page">
      <div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Settings</h1><p className="muted">Backend service connection status.</p></div></div>
      <div className="settings-grid">
        <section className="panel settings-card"><p className="eyebrow">SERVICE STATUS</p><h2>Backend connection</h2><p className="muted">Check whether the API and its PostgreSQL database are reachable.</p><button className="button button-secondary" onClick={() => void checkConnection()} disabled={checking}><FiRefreshCw />{checking ? "Checking..." : "Check connection"}</button>{connection && <p className="connection-success"><FiCheckCircle />{connection}</p>}{error && <div className="alert alert-error settings-error" role="alert">{error}</div>}</section>
      </div>
    </section>
  );
};

export default Settings;
