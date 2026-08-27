import React, { useRef } from "react";
import { render, screen } from "@testing-library/react";

/**
 * Page rules drawn over the screenplay page.
 *
 * The page is the unit of screen time in this craft — "cut ten pages" is a note
 * a writer can act on, "cut some words" is not — and the editor used to be one
 * unbroken column with no way to tell what page you were on.
 *
 * The number on each rule belongs to the page BELOW it, which is the printed
 * screenplay convention and the thing a reader flipping to "page 4" is looking
 * for. Labelling the rule with the page that just ended reads as an off-by-one
 * to anyone who has held a real script, so it is pinned here.
 *
 * The geometry is read from the rendered textarea rather than duplicated from
 * the CSS, so tests have to stub `getComputedStyle` — jsdom reports no useful
 * line height on its own, and a component that bails out when it cannot measure
 * would otherwise render nothing and pass every assertion vacuously.
 */

// eslint-disable-next-line import/first
import PageBreaks from "./PageBreaks";

const LINE_HEIGHT = 20;
const PADDING_TOP = 10;

beforeEach(() => {
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    lineHeight: `${LINE_HEIGHT}px`,
    paddingTop: `${PADDING_TOP}px`,
    paddingRight: "16px",
  });
});

function Harness({ content, pageLines = 45, scrollTop = 0, withRef = true }) {
  const ref = useRef(withRef ? document.createElement("textarea") : null);
  return (
    <PageBreaks textareaRef={ref} content={content}
                pageLines={pageLines} scrollTop={scrollTop} />
  );
}

const lines = (n) => Array.from({ length: n }, (_, i) => `Line ${i}`).join("\n");
const rules = (container) => container.querySelectorAll("[style*='top']");

describe("when no rule is drawn", () => {
  it("draws nothing for a draft shorter than a page", () => {
    const { container } = render(<Harness content={lines(10)} pageLines={45} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing for a draft exactly one page long", () => {
    const { container } = render(<Harness content={lines(45)} pageLines={45} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing on an empty draft", () => {
    const { container } = render(<Harness content="" pageLines={45} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing before it can measure the textarea", () => {
    const { container } = render(<Harness content={lines(200)} withRef={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("where the rules land", () => {
  it("puts one rule between two pages", () => {
    const { container } = render(<Harness content={lines(50)} pageLines={45} />);

    expect(rules(container)).toHaveLength(1);
  });

  it("puts a rule after every page but the last", () => {
    const { container } = render(<Harness content={lines(100)} pageLines={45} />);

    expect(rules(container)).toHaveLength(2);
  });

  it("places the first rule one page down from the top padding", () => {
    const { container } = render(<Harness content={lines(50)} pageLines={45} />);

    expect(rules(container)[0].style.top)
      .toBe(`${PADDING_TOP + 45 * LINE_HEIGHT}px`);
  });

  it("moves the rules with the scroll", () => {
    const { container } = render(
      <Harness content={lines(50)} pageLines={45} scrollTop={200} />);

    expect(rules(container)[0].style.top)
      .toBe(`${PADDING_TOP + 45 * LINE_HEIGHT - 200}px`);
  });

  it("honours a different page length from the server", () => {
    // `screenplay.PAGE_LINES` is the same number the PDF export lays out with,
    // which is what makes "page 6" mean one thing across the product.
    const { container } = render(<Harness content={lines(30)} pageLines={20} />);

    expect(rules(container)).toHaveLength(1);
    expect(rules(container)[0].style.top).toBe(`${PADDING_TOP + 20 * LINE_HEIGHT}px`);
  });
});

describe("the page numbers", () => {
  it("labels a rule with the page BELOW it", () => {
    // The printed screenplay convention. The first rule ends page 1, so it is
    // labelled 2 — the page a reader turning to it is arriving at.
    render(<Harness content={lines(50)} pageLines={45} />);

    expect(screen.getByText("2.")).toBeInTheDocument();
    expect(screen.queryByText("1.")).not.toBeInTheDocument();
  });

  it("numbers each subsequent page in turn", () => {
    render(<Harness content={lines(140)} pageLines={45} />);

    expect(screen.getByText("2.")).toBeInTheDocument();
    expect(screen.getByText("3.")).toBeInTheDocument();
    expect(screen.getByText("4.")).toBeInTheDocument();
  });
});

it("is decoration, so a screen reader does not read the rules out", () => {
  const { container } = render(<Harness content={lines(50)} pageLines={45} />);

  expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
});

it("does not intercept clicks meant for the textarea underneath", () => {
  const { container } = render(<Harness content={lines(50)} pageLines={45} />);

  expect(container.firstChild.className).toContain("pointer-events-none");
});
