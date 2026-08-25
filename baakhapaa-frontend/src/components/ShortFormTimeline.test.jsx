import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ShortFormTimeline from "./ShortFormTimeline";

/**
 * The beat sheet used to render five full cards under the bar and took roughly
 * a third of the editor, so the writing page began below the fold on a laptop.
 * The information was right; the shape was not.
 */

const STRUCTURE = {
  category: "comedy_skit",
  total_seconds: 45,
  beats: [
    { beat_number: 1, name: "Hook", retention_function: "stop_scroll", start_second: 0, duration_seconds: 3, description: "Put the absurd premise inside the first line." },
    { beat_number: 2, name: "Escalation", retention_function: "open_loop", start_second: 3, duration_seconds: 19, description: "Escalate the same joke three times." },
    { beat_number: 3, name: "Core payoff", retention_function: "payoff", start_second: 22, duration_seconds: 13, description: "The third escalation breaks the pattern." },
    { beat_number: 4, name: "Twist", retention_function: "rewatch_trigger", start_second: 35, duration_seconds: 6, description: "Subvert what the payoff implied." },
    { beat_number: 5, name: "Soft CTA", retention_function: "share_trigger", start_second: 41, duration_seconds: 4, description: "One line, low pressure." },
  ],
};

test("every beat is on the bar", () => {
  render(<ShortFormTimeline structure={STRUCTURE} />);
  expect(screen.getAllByRole("tab")).toHaveLength(5);
});

test("the runtime is stated once, not per beat", () => {
  render(<ShortFormTimeline structure={STRUCTURE} />);
  expect(screen.getByText("45s total")).toBeInTheDocument();
});

test("only one beat's prose is on screen at a time", () => {
  // Five descriptions is what made this a third of the editor.
  render(<ShortFormTimeline structure={STRUCTURE} />);
  expect(screen.getByText(/absurd premise/i)).toBeInTheDocument();
  expect(screen.queryByText(/escalate the same joke/i)).not.toBeInTheDocument();
});

test("the hook opens selected, because it is the beat worth reading", () => {
  render(<ShortFormTimeline structure={STRUCTURE} />);
  expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
});

test("choosing a beat swaps the prose", () => {
  render(<ShortFormTimeline structure={STRUCTURE} />);
  fireEvent.click(screen.getAllByRole("tab")[1]);

  expect(screen.getByText(/escalate the same joke/i)).toBeInTheDocument();
  expect(screen.queryByText(/absurd premise/i)).not.toBeInTheDocument();
});

test("segment width is proportional, so the hook looks as small as it is", () => {
  // Three seconds out of forty-five. That the hook is tiny is the lesson the
  // format most needs to teach.
  render(<ShortFormTimeline structure={STRUCTURE} />);
  const [hook, escalation] = screen.getAllByRole("tab");
  expect(hook.style.width).toBe(`${(3 / 45) * 100}%`);
  expect(parseFloat(escalation.style.width)).toBeGreaterThan(parseFloat(hook.style.width));
});

test("a segment too narrow for its name still carries it as a tooltip", () => {
  render(<ShortFormTimeline structure={STRUCTURE} />);
  const hook = screen.getAllByRole("tab")[0];
  // 3s of 45 is under the labelling threshold, so the name is not rendered...
  expect(hook).toHaveAttribute("title", expect.stringContaining("Hook"));
  // ...but a wide beat does show it.
  expect(screen.getByText("Escalation")).toBeInTheDocument();
});

test("nothing renders without beats", () => {
  const { container } = render(<ShortFormTimeline structure={{ beats: [] }} />);
  expect(container).toBeEmptyDOMElement();
});
