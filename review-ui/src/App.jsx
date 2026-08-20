import { useState, useEffect } from "react";
import axios from "axios";
import PdfViewer from "./PdfViewer";

const API = "http://localhost:3000";

const SCALAR_FIELDS = [
  "invoice_number",
  "invoice_date",
  "vendor_name",
  "subtotal",
  "tax",
  "total",
];

export default function App() {
  const [queue, setQueue] = useState([]);
  const [selected, setSelected] = useState(null);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  const loadQueue = async () => {
    const { data } = await axios.get(`${API}/jobs/review-queue`);
    setQueue(data);
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const openJob = async (id) => {
    const { data } = await axios.get(`${API}/jobs/${id}`);
    setSelected(data);
    setEdits({});
  };

  const flagsByField = {};
  if (selected?.validation?.flags) {
    for (const f of selected.validation.flags) {
      (flagsByField[f.field] ??= []).push(f);
    }
  }

  const fieldValue = (path) => {
    if (path in edits) return edits[path];
    const node = path
      .split(".")
      .reduce((a, k) => a?.[k], selected.extractedData);
    return node?.value ?? "";
  };

  const setField = (path, val) => setEdits((e) => ({ ...e, [path]: val }));

  const submit = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/jobs/${selected.id}/review`, {
        corrections: edits,
        approve: true,
      });
      setSelected(null);
      setEdits({});
      await loadQueue();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800">
      {/* Sidebar — review queue */}
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200">
          <h1 className="text-sm font-semibold tracking-tight text-slate-900">
            Review Queue
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {queue.length} document{queue.length !== 1 ? "s" : ""} awaiting
            review
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {queue.length === 0 && (
            <p className="text-sm text-slate-400 text-center mt-8">
              Nothing to review
            </p>
          )}
          {queue.map((j) => {
            const active = selected?.id === j.id;
            const flagCount = j.validation?.flags?.length ?? 0;
            return (
              <button
                key={j.id}
                onClick={() => openJob(j.id)}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition
                  ${
                    active
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
              >
                <div className="font-medium text-sm text-slate-900 truncate">
                  {j.extractedData?.vendor_name?.value || "Unknown vendor"}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium px-2 py-0.5">
                    {flagCount} flag{flagCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main detail */}
      <main className="flex-1 overflow-hidden">
        {!selected && (
          <div className="h-full flex items-center justify-center text-slate-400">
            Select a document to review
          </div>
        )}

        {selected && (
          <div className="grid grid-cols-2 h-full">
            {/* Document pane — PDF render lands here Day 10 */}
            <div className="border-r border-slate-200 bg-slate-100 p-4">
              <PdfViewer
                documentUrl={`${API}/jobs/${selected.id}/document`}
                highlights={(selected.validation?.flags || [])
                  .map((f) => {
                    const node = f.field
                      .split(".")
                      .reduce((a, k) => a?.[k], selected.extractedData);
                    return node?.source?.text
                      ? { text: node.source.text, severity: f.severity }
                      : null;
                  })
                  .filter(Boolean)}
              />
            </div>

            {/* Fields pane */}
            <div className="overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-slate-900">
                  Extracted Fields
                </h2>
                <span className="text-xs text-slate-500">
                  {selected.extractedData?.vendor_name?.value}
                </span>
              </div>

              <div className="space-y-4">
                {SCALAR_FIELDS.map((path) => {
                  const flags = flagsByField[path] || [];
                  const flagged = flags.length > 0;
                  const hasError = flags.some((f) => f.severity === "error");
                  return (
                    <div key={path}>
                      <label className="block text-xs font-medium text-slate-500 capitalize mb-1">
                        {path.replace(/_/g, " ")}
                      </label>
                      <input
                        value={fieldValue(path)}
                        onChange={(e) => setField(path, e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition
                          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                          ${
                            flagged
                              ? hasError
                                ? "border-red-400 bg-red-50"
                                : "border-amber-400 bg-amber-50"
                              : "border-slate-300 bg-white"
                          }`}
                      />
                      {flags.map((f, i) => (
                        <p
                          key={i}
                          className={`text-xs mt-1 flex items-start gap-1
                            ${f.severity === "error" ? "text-red-600" : "text-amber-600"}`}
                        >
                          <span className="font-medium">
                            {f.severity === "error" ? "⚠" : "ℹ"}
                          </span>
                          {f.message}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={submit}
                disabled={saving}
                className="mt-6 w-full rounded-lg bg-blue-600 text-white text-sm font-medium
                  py-2.5 hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving ? "Saving…" : "Approve & Complete"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
