import React from "react";
import { readLatestRescue } from "../utils/draftRescue";

/**
 * The last line of defence between a thrown render and a writer's afternoon.
 *
 * React unmounts the whole tree when a render throws and there is no boundary
 * above it. In this product that meant a white page — with the draft the writer
 * had been typing still unsaved inside the component that just died. There was
 * no boundary anywhere in the app.
 *
 * Two jobs, in this order:
 *   1. Give the writer their words back. `draftRescue` has been mirroring the
 *      draft as it was typed, so the text still exists even though the editor
 *      that held it is gone. Offering it as a download is the only recovery
 *      that survives the writer closing the tab in frustration.
 *   2. Show something that is not a blank screen, and let them back in.
 *
 * Deliberately a class: `componentDidCatch` has no hook equivalent.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, rescue: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    // Read the mirror here rather than in the constructor: at construction
    // time the crash has not happened yet and the draft is still being typed.
    return { error, rescue: readLatestRescue() };
  }

  componentDidCatch(error, info) {
    // No error-reporting service is wired up, so the console is the only place
    // this can go. Kept explicit — swallowing it entirely would make a
    // reproducible crash undiagnosable from a user's screen recording.
    // eslint-disable-next-line no-console
    console.error("Unhandled render error:", error, info?.componentStack);
  }

  handleDownload = () => {
    const { rescue } = this.state;
    if (!rescue) return;
    const blob = new Blob([rescue.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `baakhapaa-recovered-draft-${rescue.scriptId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  handleCopy = async () => {
    const { rescue } = this.state;
    if (!rescue) return;
    try {
      await navigator.clipboard.writeText(rescue.content);
      this.setState({ copied: true });
    } catch (e) {
      // Clipboard permission can be refused; the download still works.
      this.setState({ copied: false });
    }
  };

  render() {
    const { error, rescue, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-bg text-ink flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg bg-surface border border-border rounded-xl p-8">
          <h1 className="font-display text-2xl text-ink mb-2">Something broke.</h1>
          <p className="text-inkSoft text-sm leading-relaxed mb-6">
            This is our fault, not yours. The page stopped working, but your
            writing was not lost.
          </p>

          {rescue ? (
            <div className="border border-border rounded-lg p-4 mb-6 bg-elevated">
              <p className="text-sm text-ink mb-1">
                We recovered your draft
                <span className="text-inkMuted">
                  {" "}({rescue.content.split("\n").length} lines)
                </span>
              </p>
              <p className="text-xs text-inkMuted mb-4">
                Save a copy before going back, just in case.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={this.handleDownload}
                  className="px-3 py-2 rounded-md bg-gold text-bg text-sm font-medium hover:bg-goldHover"
                >
                  Download my draft
                </button>
                <button
                  type="button"
                  onClick={this.handleCopy}
                  className="px-3 py-2 rounded-md border border-border text-sm text-inkSoft hover:text-ink"
                >
                  {copied ? "Copied" : "Copy to clipboard"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-inkMuted mb-6">
              No unsaved draft was found on this device.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-2 rounded-md border border-border text-sm text-inkSoft hover:text-ink"
            >
              Reload the page
            </button>
            <a
              href="/dashboard"
              className="px-3 py-2 rounded-md border border-border text-sm text-inkSoft hover:text-ink"
            >
              Back to dashboard
            </a>
          </div>

          {/* The message only. A component stack on screen tells a writer
              nothing and tells an attacker a little. */}
          <p className="mt-6 text-xs text-inkMuted font-mono break-words">
            {String(error?.message || error)}
          </p>
        </div>
      </div>
    );
  }
}
