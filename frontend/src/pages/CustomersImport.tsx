import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import HelpTip from "../components/HelpTip";
import { IMPORT_TEMPLATE_CSV, importCustomersCSV, type ImportResult } from "../lib/customerImport";

// Dedicated bulk "Create Customers" upload screen — a drop zone, sample-file
// download and format note, then a created/skipped result summary.
export default function CustomersImport() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    if (!/\.csv$/i.test(file.name)) {
      setError("Please upload a .csv file.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      const text = await file.text();
      setResult(await importCustomersCSV(text, (done, total) => setProgress({ done, total })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/customers" className="back-link">
            ← Customers
          </Link>
          <h2>Import Customers</h2>
          <p>Bulk-create customers from a CSV file</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        {!result ? (
          <>
            <div className="import-step">Step 1 of 2 · Upload CSV</div>
            <div
              className={`dropzone${dragOver ? " over" : ""}${busy ? " busy" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => !busy && fileRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) handleFile(f);
                }}
              />
              {busy ? (
                <div className="dropzone-busy">
                  Importing… {progress && progress.total > 0 ? `${progress.done}/${progress.total}` : ""}
                </div>
              ) : (
                <div className="dropzone-label">Drop your file here or click to upload</div>
              )}
            </div>

            <div className="import-note">
              <div className="import-note-head">
                <a
                  className="csv-template-link"
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE_CSV)}`}
                  download="customers-template.csv"
                >
                  ↓ Download sample CSV file
                </a>
                <HelpTip text="email is required. Optional: name, country (2-letter ISO code like US), gateway_customer_ref." />
              </div>
              <p className="import-note-title">NOTE</p>
              <p>
                Your CSV must include an <strong>email</strong> column. Optional columns:{" "}
                <strong>name</strong>, <strong>country</strong> (2-letter code, e.g. US) and{" "}
                <strong>gateway_customer_ref</strong>.
              </p>
              <p>
                Don&apos;t rename the column headers, and make sure the file extension is{" "}
                <strong>.csv</strong>. Rows with a duplicate or missing email are skipped.
              </p>
            </div>
          </>
        ) : (
          <div className="import-result">
            <h3>Import complete</h3>
            <p className="import-summary">
              <strong>{result.created}</strong> created · <strong>{result.skipped}</strong> skipped
              {result.total > 0 ? ` · ${result.total} rows` : ""}
            </p>
            {result.errors.length > 0 && (
              <>
                <p className="muted">Some rows were skipped:</p>
                <ul className="import-errors">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setResult(null)}>
                Import another file
              </button>
              <button className="btn" onClick={() => navigate("/customers")}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
