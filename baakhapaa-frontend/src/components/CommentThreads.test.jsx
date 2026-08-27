import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Notes on a script, anchored to the line they are about.
 *
 * The anchoring is the part worth testing. A note on line 0 is a note nobody can
 * find again, and the old design — a line-number field the writer filled in by
 * hand — produced those constantly, because it is exactly the kind of field
 * people skip. So the number now follows the caret until the writer deliberately
 * types one, and the footer says where the note is about to land. Three states,
 * one of which only appears once you have typed, and all three are one condition
 * away from lying about the anchor.
 *
 * The other pinned behaviour is that the server's order is preserved. It returns
 * anchored notes in page order with un-anchored ones last; re-sorting by time in
 * the component would scatter the anchors back out of the order the page reads
 * in, which is the order a writer is looking for them in.
 */

vi.mock("../services/api", () => ({
  comments: { getAll: vi.fn(), add: vi.fn(), remove: vi.fn() },
}));

const mockUser = { current: { id: "me" } };
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

// eslint-disable-next-line import/first
import CommentThreads from "./CommentThreads";
// eslint-disable-next-line import/first
import { comments as commentsApi } from "../services/api";

const note = (over = {}) => ({
  id: "c1", user_id: "me", user_name: "Mira", content: "This beat lands late.",
  line_number: 12, created_at: "2026-08-20T10:00:00Z", ...over,
});

beforeEach(() => {
  mockUser.current = { id: "me" };
  commentsApi.getAll.mockResolvedValue({ data: [] });
  commentsApi.add.mockResolvedValue({});
  commentsApi.remove.mockResolvedValue({});
});

describe("loading the notes", () => {
  it("says it is loading first", () => {
    commentsApi.getAll.mockReturnValue(new Promise(() => {}));
    render(<CommentThreads scriptId="s1" caretLine={0} />);

    expect(screen.getByText(/Loading comments/)).toBeInTheDocument();
  });

  it("invites the first note when there are none", async () => {
    render(<CommentThreads scriptId="s1" caretLine={0} />);

    expect(await screen.findByText(/Leave the first note/)).toBeInTheDocument();
  });

  it("shows a note with its author, time and line", async () => {
    commentsApi.getAll.mockResolvedValue({ data: [note()] });
    render(<CommentThreads scriptId="s1" caretLine={0} />);

    expect(await screen.findByText("This beat lands late.")).toBeInTheDocument();
    expect(screen.getByText("Mira")).toBeInTheDocument();
    expect(screen.getByText("Line 12")).toBeInTheDocument();
  });

  it("shows no line chip on an un-anchored note", async () => {
    commentsApi.getAll.mockResolvedValue({ data: [note({ line_number: 0 })] });
    render(<CommentThreads scriptId="s1" caretLine={0} />);

    await screen.findByText("This beat lands late.");
    expect(screen.queryByText(/^Line /)).not.toBeInTheDocument();
  });

  it("keeps the server's order rather than re-sorting by time", async () => {
    // Page order, not chronological order — the server sorts anchored notes by
    // line and puts un-anchored ones last, and that is what a writer scans.
    commentsApi.getAll.mockResolvedValue({
      data: [
        note({ id: "a", content: "On line 3", line_number: 3, created_at: "2026-08-22T10:00:00Z" }),
        note({ id: "b", content: "On line 40", line_number: 40, created_at: "2026-08-20T10:00:00Z" }),
        note({ id: "c", content: "Unanchored", line_number: 0, created_at: "2026-08-21T10:00:00Z" }),
      ],
    });
    render(<CommentThreads scriptId="s1" caretLine={0} />);

    await screen.findByText("On line 3");
    const rendered = screen.getAllByText(/On line|Unanchored/).map((n) => n.textContent);
    expect(rendered).toEqual(["On line 3", "On line 40", "Unanchored"]);
  });

  it("reports why the notes could not be loaded", async () => {
    commentsApi.getAll.mockRejectedValue({
      response: { data: { detail: "You do not have access to this script." } },
    });
    render(<CommentThreads scriptId="s1" caretLine={0} />);

    expect(await screen.findByText("You do not have access to this script."))
      .toBeInTheDocument();
  });
});

describe("where a new note will land", () => {
  it("follows the caret when nothing has been typed", async () => {
    render(<CommentThreads scriptId="s1" caretLine={42} />);
    await screen.findByText(/Leave the first note/);

    expect(screen.getByText(/Will attach to line 42, where your cursor is/))
      .toBeInTheDocument();
  });

  it("asks for a cursor when there is not one", async () => {
    render(<CommentThreads scriptId="s1" caretLine={0} />);
    await screen.findByText(/Leave the first note/);

    expect(screen.getByText(/Put your cursor in the script/)).toBeInTheDocument();
  });

  it("pins to a typed line and stops following the caret", async () => {
    render(<CommentThreads scriptId="s1" caretLine={42} />);
    await screen.findByText(/Leave the first note/);

    fireEvent.change(screen.getByLabelText("Line number"), { target: { value: "7" } });

    expect(screen.getByText(/Pinned to line 7/)).toBeInTheDocument();
    expect(screen.queryByText(/where your cursor is/)).not.toBeInTheDocument();
  });

  it("goes back to following the caret on request", async () => {
    render(<CommentThreads scriptId="s1" caretLine={42} />);
    await screen.findByText(/Leave the first note/);
    fireEvent.change(screen.getByLabelText("Line number"), { target: { value: "7" } });

    fireEvent.click(screen.getByRole("button", { name: "follow my cursor" }));

    expect(screen.getByText(/Will attach to line 42/)).toBeInTheDocument();
    expect(screen.getByLabelText("Line number")).toHaveValue(null);
  });

  it("offers the caret line as the field's placeholder", async () => {
    render(<CommentThreads scriptId="s1" caretLine={42} />);
    await screen.findByText(/Leave the first note/);

    expect(screen.getByLabelText("Line number")).toHaveAttribute("placeholder", "L42");
  });
});

describe("posting", () => {
  const type = (text) =>
    fireEvent.change(screen.getByPlaceholderText(/Add a comment/), { target: { value: text } });

  it("will not post an empty note", async () => {
    render(<CommentThreads scriptId="s1" caretLine={5} />);
    await screen.findByText(/Leave the first note/);

    expect(screen.getByRole("button", { name: /Post Comment/ })).toBeDisabled();
  });

  it("will not post whitespace either", async () => {
    render(<CommentThreads scriptId="s1" caretLine={5} />);
    await screen.findByText(/Leave the first note/);

    type("   ");

    expect(screen.getByRole("button", { name: /Post Comment/ })).toBeDisabled();
  });

  it("anchors to the caret when nothing was typed", async () => {
    render(<CommentThreads scriptId="s1" caretLine={42} />);
    await screen.findByText(/Leave the first note/);
    type("Late.");

    fireEvent.click(screen.getByRole("button", { name: /Post Comment/ }));

    await waitFor(() =>
      expect(commentsApi.add).toHaveBeenCalledWith("s1", "Late.", 42));
  });

  it("anchors to the typed line when there is one", async () => {
    render(<CommentThreads scriptId="s1" caretLine={42} />);
    await screen.findByText(/Leave the first note/);
    fireEvent.change(screen.getByLabelText("Line number"), { target: { value: "7" } });
    type("Late.");

    fireEvent.click(screen.getByRole("button", { name: /Post Comment/ }));

    await waitFor(() => expect(commentsApi.add).toHaveBeenCalledWith("s1", "Late.", 7));
  });

  it("trims the note before sending it", async () => {
    render(<CommentThreads scriptId="s1" caretLine={1} />);
    await screen.findByText(/Leave the first note/);
    type("  Late.  ");

    fireEvent.click(screen.getByRole("button", { name: /Post Comment/ }));

    await waitFor(() => expect(commentsApi.add).toHaveBeenCalledWith("s1", "Late.", 1));
  });

  it("keeps the caret anchor when the line field is given something that is not a number", async () => {
    // The field is `type="number"`, so the browser refuses the keystrokes and no
    // change event fires — the note stays on the caret line rather than falling
    // through to an un-findable line 0. Pinned here because it is the outcome
    // that matters, and it is reached by the input type rather than by any
    // parsing in the component.
    render(<CommentThreads scriptId="s1" caretLine={42} />);
    await screen.findByText(/Leave the first note/);
    fireEvent.change(screen.getByLabelText("Line number"), { target: { value: "abc" } });
    type("Late.");

    fireEvent.click(screen.getByRole("button", { name: /Post Comment/ }));

    await waitFor(() => expect(commentsApi.add).toHaveBeenCalledWith("s1", "Late.", 42));
  });

  it("clears the form and reloads once posted", async () => {
    render(<CommentThreads scriptId="s1" caretLine={5} />);
    await screen.findByText(/Leave the first note/);
    type("Late.");

    fireEvent.click(screen.getByRole("button", { name: /Post Comment/ }));

    await waitFor(() => expect(commentsApi.getAll).toHaveBeenCalledTimes(2));
    expect(screen.getByPlaceholderText(/Add a comment/)).toHaveValue("");
  });

  it("says so when the note could not be posted", async () => {
    commentsApi.add.mockRejectedValue({
      response: { data: { detail: "This script is finalized." } },
    });
    render(<CommentThreads scriptId="s1" caretLine={5} />);
    await screen.findByText(/Leave the first note/);
    type("Late.");

    fireEvent.click(screen.getByRole("button", { name: /Post Comment/ }));

    expect(await screen.findByText("This script is finalized.")).toBeInTheDocument();
  });
});

describe("deleting", () => {
  it("offers Delete on your own note", async () => {
    commentsApi.getAll.mockResolvedValue({ data: [note({ user_id: "me" })] });
    render(<CommentThreads scriptId="s1" caretLine={0} />);

    expect(await screen.findByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("does not offer it on someone else's", async () => {
    commentsApi.getAll.mockResolvedValue({ data: [note({ user_id: "someone-else" })] });
    render(<CommentThreads scriptId="s1" caretLine={0} />);

    await screen.findByText("This beat lands late.");
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("removes the note from the list", async () => {
    commentsApi.getAll.mockResolvedValue({ data: [note()] });
    render(<CommentThreads scriptId="s1" caretLine={0} />);
    await screen.findByText("This beat lands late.");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("This beat lands late.")).not.toBeInTheDocument());
    expect(commentsApi.remove).toHaveBeenCalledWith("c1");
  });

  it("keeps the note visible when the server refuses", async () => {
    commentsApi.getAll.mockResolvedValue({ data: [note()] });
    commentsApi.remove.mockRejectedValue({
      response: { data: { detail: "Only an admin can moderate." } },
    });
    render(<CommentThreads scriptId="s1" caretLine={0} />);
    await screen.findByText("This beat lands late.");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Only an admin can moderate.")).toBeInTheDocument();
    expect(screen.getByText("This beat lands late.")).toBeInTheDocument();
  });
});
