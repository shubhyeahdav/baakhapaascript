import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import PageNotes from "./PageNotes";
import { lineTops } from "../lib/caretLine";

/**
 * The linter's notes in the page margin. jsdom has no layout, so `lineTops`
 * falls back to counting lines; the geometry itself is checked in a browser.
 * What is pinned here is behaviour: one marker per line, worst note first,
 * nothing until asked, and the two ways out of a note.
 */
function setup(flags, content = "a\nb\nc\nd\ne\nf\n", props = {}) {
  const ref = createRef();
  const utils = render(
    <div>
      <textarea ref={ref} defaultValue={content} />
      <PageNotes flags={flags} textareaRef={ref} content={content} {...props} />
    </div>,
  );
  return { ref, ...utils };
}

const FLAGS = [
  { rule: "directed_emotion", severity: "medium", line: 3, message: "An emotional parenthetical is doing the actor's work.", technique: "Put the feeling into a physical thing" },
  { rule: "on_the_nose", severity: "high", line: 3, message: "The character states the real grievance out loud.", technique: "Let them fight about the small wrong thing" },
  { rule: "greeting_scene_open", severity: "medium", line: 5, message: "The scene opens on a greeting.", technique: "Start late" },
];

it("puts one marker on each flagged line, not one per note", () => {
  setup(FLAGS);
  expect(screen.getAllByRole("button", { name: /^Line \d/ })).toHaveLength(2);
});

it("says nothing until asked, then the worst note first, with its fix", () => {
  setup(FLAGS);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Line 3/ }));
  const items = screen.getByRole("dialog").querySelectorAll("li");
  expect(items[0]).toHaveTextContent("states the real grievance");
  expect(items[0]).toHaveTextContent("→ Let them fight about the small wrong thing");
});

it("goes to the line, or to Craft for the why", () => {
  const onGoToLine = vi.fn();
  const onOpenCraft = vi.fn();
  setup(FLAGS, undefined, { onGoToLine, onOpenCraft });
  fireEvent.click(screen.getByRole("button", { name: /^Line 5/ }));
  fireEvent.click(screen.getByText("Go to the line"));
  expect(onGoToLine).toHaveBeenCalledWith(5);
  fireEvent.click(screen.getByRole("button", { name: /^Line 5/ }));
  fireEvent.click(screen.getByText("Why, and how to fix it"));
  expect(onOpenCraft).toHaveBeenCalled();
});

it("renders nothing for a clean page", () => {
  const { container } = setup([]);
  expect(container.querySelector('[data-testid="page-notes"]')).toBeNull();
});

it("measures every requested line in one pass, and skips lines past the end", () => {
  const ta = document.createElement("textarea");
  ta.value = "one\ntwo\nthree";
  document.body.appendChild(ta);
  const tops = lineTops(ta, [1, 3, 9]);
  expect(Object.keys(tops).map(Number).sort()).toEqual([1, 3]);
  expect(tops[3]).toBeGreaterThan(tops[1]);
  ta.remove();
});
