import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * The editor toolbar's overflow menu.
 *
 * It exists because the toolbar had grown to thirteen controls in one row, most
 * of them unlabelled icons, and a writer opening the page for the first time had
 * no way to tell which were safe to press. The rule it enforces: anything used
 * *while writing* stays on the surface, anything used occasionally goes behind a
 * named menu item, because a name explains itself and an icon in a row of twelve
 * does not.
 *
 * Mechanically it is a dropdown, so it has the three behaviours every dropdown
 * needs and can silently lose: closes on an outside click, closes on Escape, and
 * closes when an item is chosen. A menu that stays open after a selection sits
 * on top of the page the writer just asked to see.
 */

// eslint-disable-next-line import/first
import ToolbarMenu from "./ToolbarMenu";

const onExport = vi.fn();
const onPaper = vi.fn();

const ITEMS = [
  { key: "pdf", label: "Export PDF", hint: "A4, industry standard margins", onSelect: onExport },
  { key: "div", divider: true },
  { key: "paper", label: "Paper colour", active: true, onSelect: onPaper },
];

const show = (props = {}) =>
  render(<ToolbarMenu label="More" title="More options" items={ITEMS} {...props} />);

const trigger = () => screen.getByRole("button", { name: "More" });

describe("before it is opened", () => {
  it("shows only its label", () => {
    show();

    expect(trigger()).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("announces itself as a menu button", () => {
    show();

    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("does not submit a form it happens to sit in", () => {
    show();

    expect(trigger()).toHaveAttribute("type", "button");
  });

  it("carries a tooltip for the icon-shy", () => {
    show();

    expect(trigger()).toHaveAttribute("title", "More options");
  });
});

describe("once open", () => {
  beforeEach(() => {
    show();
    fireEvent.click(trigger());
  });

  it("marks itself expanded", () => {
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("names every item, rather than showing an icon", () => {
    expect(screen.getByRole("menuitem", { name: /Export PDF/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Paper colour/ })).toBeInTheDocument();
  });

  it("explains an item that needs explaining", () => {
    expect(screen.getByText("A4, industry standard margins")).toBeInTheDocument();
  });

  it("renders a divider as a rule, not as a menu item", () => {
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("marks the item that is currently on", () => {
    expect(screen.getByRole("menuitem", { name: /Paper colour/ }).textContent)
      .toContain("•");
  });

  it("runs the item and closes", () => {
    fireEvent.click(screen.getByRole("menuitem", { name: /Export PDF/ }));

    expect(onExport).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on an outside click", () => {
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("stays open on a click inside it", () => {
    fireEvent.mouseDown(screen.getByRole("menu"));

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("ignores other keys", () => {
    fireEvent.keyDown(document, { key: "e" });

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on a second click of the trigger", () => {
    fireEvent.click(trigger());

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("alignment", () => {
  it("hangs right by default, since it lives at the end of the toolbar", () => {
    show();
    fireEvent.click(trigger());

    expect(screen.getByRole("menu").className).toContain("right-0");
  });

  it("hangs left on request", () => {
    show({ align: "left" });
    fireEvent.click(trigger());

    expect(screen.getByRole("menu").className).toContain("left-0");
  });
});

it("opens with no items without falling over", () => {
  show({ items: [] });

  fireEvent.click(trigger());

  expect(screen.getByRole("menu")).toBeInTheDocument();
  expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
});
