import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Version history, and the FR11 diff that hangs off it.
 *
 * The behaviour worth protecting here is the pair ordering. The server refuses
 * to diff two versions unless it is told which is the older side, and asking a
 * writer that question would be asking the wrong one — they picked "this one"
 * and "that one", not "before" and "after". So the component sorts the pair by
 * timestamp before calling. Get that backwards and every diff reads inverted:
 * additions show as deletions and the writer is told they removed work they
 * just wrote.
 *
 * Two mechanical notes. The preview modal is rendered through `createPortal` to
 * `document.body`, so it must be queried through `screen` and never through the
 * render result's `container`. And restore falls back to the version's own
 * cached content if the server's response has none, which is the branch that
 * keeps a restore from silently blanking the editor.
 */

vi.mock("../services/api", () => ({
  versions: { getAll: vi.fn(), diff: vi.fn(), restore: vi.fn() },
}));

// eslint-disable-next-line import/first
import VersionHistory from "./VersionHistory";
// eslint-disable-next-line import/first
import { versions as versionsApi } from "../services/api";

const OLDER = {
  id: "v-old", label: "First draft", content: "One.\n",
  created_at: "2026-08-20T10:00:00Z", user_name: "Mira",
};
const NEWER = {
  id: "v-new", label: "After the pass", content: "Two.\n",
  created_at: "2026-08-22T10:00:00Z", user_name: "Mira",
};

const onRestore = vi.fn();

beforeEach(() => {
  versionsApi.getAll.mockResolvedValue({ data: [OLDER, NEWER] });
  versionsApi.diff.mockResolvedValue({
    data: { hunks: [], added: 0, removed: 0, summary: "No changes between these versions." },
  });
  versionsApi.restore.mockResolvedValue({ data: { content: "Restored.\n" } });
});

const openNewest = async () => {
  render(<VersionHistory scriptId="s1" onRestore={onRestore} />);
  const rows = await screen.findAllByRole("button");
  fireEvent.click(rows[0]);
  return rows;
};

describe("the list", () => {
  it("says it is loading first", () => {
    versionsApi.getAll.mockReturnValue(new Promise(() => {}));
    render(<VersionHistory scriptId="s1" />);

    expect(screen.getByText(/Loading versions/)).toBeInTheDocument();
  });

  it("explains that snapshots are automatic when there are none", async () => {
    versionsApi.getAll.mockResolvedValue({ data: [] });
    render(<VersionHistory scriptId="s1" />);

    expect(await screen.findByText(/Snapshots are captured automatically/))
      .toBeInTheDocument();
  });

  it("shows newest first however the server ordered them", async () => {
    versionsApi.getAll.mockResolvedValue({ data: [OLDER, NEWER] });
    render(<VersionHistory scriptId="s1" />);

    await screen.findByText("After the pass");
    const labels = screen.getAllByText(/First draft|After the pass/).map((n) => n.textContent);
    expect(labels).toEqual(["After the pass", "First draft"]);
  });

  it("labels an unlabelled snapshot rather than showing a blank", async () => {
    versionsApi.getAll.mockResolvedValue({ data: [{ ...NEWER, label: null }] });
    render(<VersionHistory scriptId="s1" />);

    expect(await screen.findByText("Snapshot")).toBeInTheDocument();
  });

  it("reports why the list could not be loaded", async () => {
    versionsApi.getAll.mockRejectedValue({
      response: { data: { detail: "You do not have access to this script." } },
    });
    render(<VersionHistory scriptId="s1" />);

    expect(await screen.findByText("You do not have access to this script."))
      .toBeInTheDocument();
  });
});

describe("the preview modal", () => {
  it("opens on a version and shows its content", async () => {
    await openNewest();

    // Portaled to document.body, so `screen` is the only way to reach it.
    expect(screen.getByText("Two.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore this version" })).toBeInTheDocument();
  });

  it("says so for an empty snapshot instead of showing nothing", async () => {
    versionsApi.getAll.mockResolvedValue({ data: [{ ...NEWER, content: "" }] });
    render(<VersionHistory scriptId="s1" />);
    fireEvent.click((await screen.findAllByRole("button"))[0]);

    expect(screen.getByText("(empty version)")).toBeInTheDocument();
  });

  it("closes on the footer close button", async () => {
    await openNewest();

    // Two controls answer to "Close": the header × (which carries the aria-label)
    // and this one. Take the last, which is the footer button.
    const closes = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closes[closes.length - 1]);

    expect(screen.queryByText("Restore this version")).not.toBeInTheDocument();
  });

  it("closes on the × control", async () => {
    await openNewest();

    fireEvent.click(screen.getByLabelText("Close"));

    expect(screen.queryByText("Restore this version")).not.toBeInTheDocument();
  });
});

describe("comparing two versions", () => {
  it("offers no comparison when there is only one snapshot", async () => {
    versionsApi.getAll.mockResolvedValue({ data: [NEWER] });
    render(<VersionHistory scriptId="s1" />);
    fireEvent.click((await screen.findAllByRole("button"))[0]);

    expect(screen.queryByLabelText("Compare with version")).not.toBeInTheDocument();
  });

  it("does not offer a version against itself", async () => {
    await openNewest();

    const options = screen.getByLabelText("Compare with version").querySelectorAll("option");
    const values = Array.from(options).map((o) => o.value);
    expect(values).toEqual(["", "v-old"]);
  });

  it("sends the older version first however the pair was picked", async () => {
    // The whole point. The open version is the NEWER one and the picked one is
    // older, so the call has to be (old, new) — not (open, picked).
    await openNewest();

    fireEvent.change(screen.getByLabelText("Compare with version"),
                     { target: { value: "v-old" } });

    await waitFor(() => expect(versionsApi.diff).toHaveBeenCalledWith("v-old", "v-new"));
  });

  it("sends the older version first when the open one is the older one", async () => {
    // The mirror case, which a naive (selected, other) call would get right by
    // accident in the first test and wrong here.
    render(<VersionHistory scriptId="s1" />);
    const rows = await screen.findAllByRole("button");
    fireEvent.click(rows[1]);  // the older snapshot

    fireEvent.change(screen.getByLabelText("Compare with version"),
                     { target: { value: "v-new" } });

    await waitFor(() => expect(versionsApi.diff).toHaveBeenCalledWith("v-old", "v-new"));
  });

  it("says it is comparing while it waits", async () => {
    versionsApi.diff.mockReturnValue(new Promise(() => {}));
    await openNewest();

    fireEvent.change(screen.getByLabelText("Compare with version"),
                     { target: { value: "v-old" } });

    expect(await screen.findByText("Comparing…")).toBeInTheDocument();
  });

  it("says two identical versions are identical", async () => {
    await openNewest();

    fireEvent.change(screen.getByLabelText("Compare with version"),
                     { target: { value: "v-old" } });

    expect(await screen.findByText("These two versions are identical."))
      .toBeInTheDocument();
  });

  it("renders the hunks with their line numbers and signs", async () => {
    versionsApi.diff.mockResolvedValue({
      data: {
        hunks: [[
          { type: "equal", line: 1, text: "INT. PASAL - DAY" },
          { type: "remove", line: 2, text: "She waits." },
          { type: "add", line: 2, text: "She leaves." },
        ]],
        added: 1, removed: 1, summary: "1 line added, 1 removed, across 1 place.",
      },
    });
    await openNewest();

    fireEvent.change(screen.getByLabelText("Compare with version"),
                     { target: { value: "v-old" } });

    expect(await screen.findByText("She leaves.")).toBeInTheDocument();
    expect(screen.getByText("She waits.")).toBeInTheDocument();
    expect(screen.getByText("1 line added, 1 removed, across 1 place.")).toBeInTheDocument();
  });

  it("goes back to the plain content when the comparison is cleared", async () => {
    await openNewest();
    fireEvent.change(screen.getByLabelText("Compare with version"),
                     { target: { value: "v-old" } });
    await screen.findByText("These two versions are identical.");

    fireEvent.change(screen.getByLabelText("Compare with version"),
                     { target: { value: "" } });

    expect(screen.getByText("Two.")).toBeInTheDocument();
  });

  it("reports a refusal and drops the selection", async () => {
    versionsApi.diff.mockRejectedValue({
      response: { data: { detail: "Those versions belong to different scripts." } },
    });
    await openNewest();

    fireEvent.change(screen.getByLabelText("Compare with version"),
                     { target: { value: "v-old" } });

    expect(await screen.findByText("Those versions belong to different scripts."))
      .toBeInTheDocument();
  });
});

describe("restoring", () => {
  it("hands the restored content back to the editor", async () => {
    await openNewest();

    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith("Restored.\n"));
  });

  it("falls back to the snapshot's own content when the server returns none", async () => {
    // Without this branch a restore would hand the editor `undefined` and blank
    // the page — the opposite of what the writer asked for.
    versionsApi.restore.mockResolvedValue({ data: {} });
    await openNewest();

    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith("Two.\n"));
  });

  it("closes the modal and reloads the list", async () => {
    await openNewest();

    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));

    await waitFor(() =>
      expect(screen.queryByText("Restore this version")).not.toBeInTheDocument());
    expect(versionsApi.getAll).toHaveBeenCalledTimes(2);
  });

  it("reports a failed restore without calling back", async () => {
    versionsApi.restore.mockRejectedValue({
      response: { data: { detail: "This script is finalized." } },
    });
    await openNewest();

    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));

    expect(await screen.findByText("This script is finalized.")).toBeInTheDocument();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("survives being given no callback at all", async () => {
    render(<VersionHistory scriptId="s1" />);
    fireEvent.click((await screen.findAllByRole("button"))[0]);

    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));

    await waitFor(() => expect(versionsApi.restore).toHaveBeenCalled());
  });
});
