import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[$€,\s]/g, "")
    .trim();

export default function PdfViewer({ documentUrl, highlights }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [error, setError] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const pdf = await pdfjsLib.getDocument(documentUrl).promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.4 });

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        const overlay = overlayRef.current;
        overlay.innerHTML = "";
        overlay.style.width = `${viewport.width}px`;
        overlay.style.height = `${viewport.height}px`;

        try {
          const textContent = await page.getTextContent();
          const items = textContent.items.map((it) => {
            const tx = pdfjsLib.Util.transform(
              viewport.transform,
              it.transform,
            );
            const x = tx[4];
            const y = tx[5];
            const height = Math.hypot(tx[2], tx[3]);
            const width = it.width * viewport.scale;
            return { str: it.str, x, y: y - height, width, height };
          });

          for (const hl of highlights) {
            const target = norm(hl.text);
            if (!target) continue;
            for (let i = 0; i < items.length; i++) {
              let combined = "";
              const run = [];
              for (let j = i; j < items.length && j < i + 8; j++) {
                combined += norm(items[j].str);
                run.push(items[j]);
                if (combined.includes(target)) {
                  drawBox(overlay, run, hl.severity);
                  break;
                }
              }
              if (combined.includes(target)) break;
            }
          }
        } catch (hlErr) {
          console.warn("Highlight pass failed:", hlErr);
        }
      } catch (e) {
        console.error(e);
        setError("Could not render PDF");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentUrl, pageNum, highlights]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">
          Page {pageNum} of {numPages}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            className="text-xs px-2 py-1 rounded border border-slate-300 bg-white disabled:opacity-40"
          >
            ‹ Prev
          </button>
          <button
            onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            disabled={pageNum >= numPages}
            className="text-xs px-2 py-1 rounded border border-slate-300 bg-white disabled:opacity-40"
          >
            Next ›
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-white">
        {error ? (
          <div className="h-full flex items-center justify-center text-sm text-red-500">
            {error}
          </div>
        ) : (
          <div className="relative inline-block">
            <canvas ref={canvasRef} className="block" />
            <div
              ref={overlayRef}
              className="absolute top-0 left-0 pointer-events-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function drawBox(overlay, run, severity) {
  const minX = Math.min(...run.map((r) => r.x));
  const minY = Math.min(...run.map((r) => r.y));
  const maxX = Math.max(...run.map((r) => r.x + r.width));
  const maxY = Math.max(...run.map((r) => r.y + r.height));

  const box = document.createElement("div");
  box.style.position = "absolute";
  box.style.left = `${minX - 2}px`;
  box.style.top = `${minY - 2}px`;
  box.style.width = `${maxX - minX + 4}px`;
  box.style.height = `${maxY - minY + 4}px`;
  box.style.borderRadius = "2px";
  const color = severity === "error" ? "239,68,68" : "245,158,11";
  box.style.background = `rgba(${color},0.25)`;
  box.style.border = `1.5px solid rgba(${color},0.8)`;
  overlay.appendChild(box);
}
