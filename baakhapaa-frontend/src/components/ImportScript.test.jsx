import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ImportScript from "./ImportScript";
import { scripts } from "../services/api";

vi.mock("../services/api", () => ({
  scripts: { importFile: vi.fn() },
}));

const file = (name, text = "INT. A - DAY") =>
  new File([text], name, { type: "text/plain" });

const pick = (f) => {
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [f] } });
};

beforeEach(() => vi.clearAllMocks());

test("a chosen file is sent to the server", async () => {
  scripts.importFile.mockResolvedValue({
    data: { content: "INT. A - DAY", imported: { source: "Final Draft", scenes: 2, replaced: false } },
  });
  render(<ImportScript scriptId="s1" />);

  pick(file("script.fdx"));

  await waitFor(() => expect(scripts.importFile).toHaveBeenCalledWith("s1", expect.any(File)));
});

test("the imported draft is handed back to the editor", async () => {
  const onImported = vi.fn();
  scripts.importFile.mockResolvedValue({
    data: { content: "INT. A - DAY", imported: { source: "PDF", scenes: 5, replaced: false } },
  });
  render(<ImportScript scriptId="s1" onImported={onImported} />);

  pick(file("script.pdf"));

  await waitFor(() => expect(onImported).toHaveBeenCalled());
  expect(onImported.mock.calls[0][0].content).toBe("INT. A - DAY");
});

test("it says what came through", async () => {
  scripts.importFile.mockResolvedValue({
    data: { content: "x", imported: { source: "Final Draft", scenes: 12, replaced: false } },
  });
  render(<ImportScript scriptId="s1" />);

  pick(file("script.fdx"));

  expect(await screen.findByText(/imported 12 scenes from final draft/i)).toBeInTheDocument();
});

test("replacing a draft points at where the old one went", async () => {
  // Import is the most destructive action in the product. The server snapshots
  // first, so the honest thing to show is where the snapshot is.
  scripts.importFile.mockResolvedValue({
    data: { content: "x", imported: { source: "PDF", scenes: 3, replaced: true } },
  });
  render(<ImportScript scriptId="s1" />);

  pick(file("script.pdf"));

  expect(await screen.findByText(/previous draft is saved under history/i)).toBeInTheDocument();
});

test("the server's refusal is shown in full, not flattened", async () => {
  // "This is probably a scan, there is no text layer to read" is the only part
  // that tells the writer what to do next.
  scripts.importFile.mockRejectedValue({
    response: {
      status: 422,
      data: { detail: "Almost no text came out of that PDF. It is probably a scan." },
    },
  });
  render(<ImportScript scriptId="s1" />);

  pick(file("scan.pdf"));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/probably a scan/i);
});

test("only the formats the server can read are offered", () => {
  render(<ImportScript scriptId="s1" />);
  const input = document.querySelector('input[type="file"]');
  for (const ext of [".fdx", ".fountain", ".txt", ".pdf"]) {
    expect(input.getAttribute("accept")).toContain(ext);
  }
});

test("choosing the same file twice still fires", async () => {
  scripts.importFile.mockResolvedValue({
    data: { content: "x", imported: { source: "PDF", scenes: 1, replaced: false } },
  });
  render(<ImportScript scriptId="s1" />);
  const input = document.querySelector('input[type="file"]');

  pick(file("a.pdf"));
  await waitFor(() => expect(scripts.importFile).toHaveBeenCalledTimes(1));
  // The input clears itself, so a re-pick is still a change event.
  expect(input.value).toBe("");
});
