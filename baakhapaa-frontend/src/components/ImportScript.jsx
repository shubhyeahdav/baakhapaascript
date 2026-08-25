import React, { useRef, useState } from "react";
import { scripts } from "../services/api";
import { authErrorMessage } from "../utils/apiError";

/**
 * Bring in a screenplay the writer already has.
 *
 * The thing this product is best at is *reading* a script — the craft linter,
 * the corpus benchmark, the structural review — and every one of those was
 * gated behind typing the whole thing in again. So this is not a convenience
 * feature; it is the on-ramp.
 *
 * Two things the UI has to get right, because the server already does its half:
 *
 * It has to say what it is about to do BEFORE doing it. Import replaces the
 * draft, which is the most destructive action in the product. The server takes
 * a snapshot first, unconditionally — so the honest thing to show afterwards is
 * not "are you sure" but "this replaced your draft, the old one is in History".
 *
 * And it has to show the refusal in full. The server writes real sentences for
 * a person — "this is probably a scan, there is no text layer to read" — and
 * flattening those into "Import failed" throws away the only part that tells
 * the writer what to do next.
 */
const ACCEPT = ".fdx,.fountain,.txt,.pdf";

export default function ImportScript({ scriptId, onImported, className = "" }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const choose = async (event) => {
    const file = event.target.files?.[0];
    // Reset immediately so choosing the same file twice still fires a change.
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError("");
    setDone(null);
    try {
      const res = await scripts.importFile(scriptId, file);
      setDone(res.data.imported);
      onImported?.(res.data);
    } catch (err) {
      setError(authErrorMessage(err, "That file could not be imported."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        onChange={choose}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="text-xs py-1.5 px-3 rounded-lg border border-border text-inkMuted hover:text-ink transition disabled:opacity-50"
        title="Import a screenplay from Final Draft, Fountain, plain text or PDF"
      >
        {busy ? "Reading…" : "Import"}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-[11.5px] text-red-300 leading-snug max-w-xs">
          {error}
        </p>
      )}

      {done && (
        <p className="mt-2 text-[11.5px] text-emerald-300 leading-snug max-w-xs">
          Imported {done.scenes} scene{done.scenes === 1 ? "" : "s"} from{" "}
          {done.source}.
          {done.replaced && (
            <span className="text-inkMuted">
              {" "}Your previous draft is saved under History.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
