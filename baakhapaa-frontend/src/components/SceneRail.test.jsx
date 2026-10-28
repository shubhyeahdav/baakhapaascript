import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * The scene index down the left of the writing page.
 *
 * Almost all of the risk here sits in one small function. `sceneRuntime` prefers
 * the runtime measured off the written page (`draft_json.minutes`) over the one
 * the structure preview planned (`time_allocation`), and it has to, because a
 * hand-typed screenplay was never allocated anything: reading the planned number
 * alone printed "0m" beside every scene of a real script, which is the case this
 * product most wants to support.
 *
 * `draft_json` also arrives in two shapes — a parsed object from the local mock,
 * a JSON string from Postgres — and a malformed one must degrade to a dash
 * rather than throw and take the whole rail down with it.
 */

 
import SceneRail from "./SceneRail";

const scene = (over = {}) => ({
  id: "sc1", title: "The shop at dusk", scene_type: "major",
  time_allocation: 2.5, ...over,
});

const onSceneClick = vi.fn();

const show = (scenes, active = 0) =>
  render(<SceneRail scenes={scenes} activeScene={active} onSceneClick={onSceneClick} />);

describe("the cards", () => {
  it("numbers the scenes from one", () => {
    show([scene(), scene({ id: "sc2", title: "The bus" })]);

    expect(screen.getByText("Scene 1")).toBeInTheDocument();
    expect(screen.getByText("Scene 2")).toBeInTheDocument();
  });

  it("shows each scene's title and type", () => {
    show([scene()]);

    expect(screen.getByText("The shop at dusk")).toBeInTheDocument();
    expect(screen.getByText("major")).toBeInTheDocument();
  });

  it("marks the active scene", () => {
    show([scene(), scene({ id: "sc2", title: "The bus" })], 1);

    expect(screen.getByText("The bus").closest("button").className)
      .toContain("border-gold/50");
  });

  it("jumps to a scene by its index", () => {
    show([scene(), scene({ id: "sc2", title: "The bus" })]);

    fireEvent.click(screen.getByText("The bus").closest("button"));

    expect(onSceneClick).toHaveBeenCalledWith(1);
  });

  it("survives being given no scenes", () => {
    show(undefined);

    expect(screen.getByText("Scene Index Cards")).toBeInTheDocument();
  });

  it("survives an empty list", () => {
    show([]);

    expect(screen.queryByText("Scene 1")).not.toBeInTheDocument();
  });
});

// The runtime now appears twice on screen — once on the card and once in the
// column's totals — so these look inside the card button specifically. With a
// single scene the two values are identical, which is exactly when an
// unscoped query becomes ambiguous.
const cardText = (t) =>
  screen.getAllByText(t).find((n) => n.closest("button"));

describe("the runtime shown per scene", () => {
  it("prefers what is written over what was planned", () => {
    // The whole point: the page is the truth, the plan is an intention.
    show([scene({ time_allocation: 2.5, draft_json: { minutes: 1.5 } })]);

    expect(cardText("1:30")).toBeTruthy();
  });

  it("falls back to the plan when nothing is written yet", () => {
    show([scene({ time_allocation: 2.5, draft_json: null })]);

    expect(cardText("2:30")).toBeTruthy();
  });

  it("reads draft_json when Postgres hands it over as a string", () => {
    show([scene({ draft_json: JSON.stringify({ minutes: 0.75 }) })]);

    expect(cardText("0:45")).toBeTruthy();
  });

  it("shows a dash rather than 0:00 for a scene with no runtime either way", () => {
    // A hand-typed screenplay's scenes were never allocated anything, and "0m"
    // beside every one of them reads as a broken feature rather than a blank.
    show([scene({ time_allocation: 0, draft_json: null })]);

    expect(cardText("—")).toBeTruthy();
  });

  it("degrades to a dash on unparseable draft_json instead of throwing", () => {
    show([scene({ time_allocation: 0, draft_json: "{not json" })]);

    expect(cardText("—")).toBeTruthy();
  });

  it("still finds the planned time when draft_json is unparseable", () => {
    show([scene({ time_allocation: 2, draft_json: "{not json" })]);

    expect(cardText("2:00")).toBeTruthy();
  });

  it("pads the seconds to two digits", () => {
    show([scene({ draft_json: { minutes: 3.1 } })]);

    expect(cardText("3:06")).toBeTruthy();
  });
});

/* Month 4, Day 14. `scenePage` computed `line / 45` for every card, which
   gave a long-form video section a page number — the one thing `videoscript`
   deliberately returns as null, because a video script has no pages. */
describe("a video section is not a scene", () => {
  const section = (over = {}) => ({
    id: "v1", title: "HOOK - 0:15", scene_type: null,
    draft_json: JSON.stringify({ section_kind: "hook", target_seconds: 15,
                                 minutes: 7 / 60, page: null, line_number: 1, ...over }),
  });
  const scene = { id: "s1", title: "INT. CHIYA PASAL - DAY", scene_type: "major",
                  draft_json: JSON.stringify({ page: 6, line_number: 270, minutes: 1.5 }) };

  it("carries no page number, and says what kind of section it is", () => {
    render(<SceneRail scenes={[section()]} activeScene={0} onSceneClick={() => {}} />);
    expect(screen.queryByText(/^p\.\d/)).toBeNull();
    expect(screen.getByTestId("section-kind")).toHaveTextContent("hook");
  });

  it("shows written against target", () => {
    render(<SceneRail scenes={[section()]} activeScene={0} onSceneClick={() => {}} />);
    expect(screen.getByTestId("section-timing")).toHaveTextContent("0:07 / 0:15");
  });

  it("says nothing about durations in course mode", () => {
    render(<SceneRail scenes={[section({ section_kind: "objective", target_seconds: null })]}
      activeScene={0} onSceneClick={() => {}} videoCategory="course" />);
    expect(screen.queryByTestId("section-timing")).toBeNull();
    expect(screen.queryByText(/Written runtime/)).toBeNull();
  });

  it("a screenplay scene still carries its page — the server's, not line/45", () => {
    // line 270 / 45 would say p.7; the PDF's own page says p.6.
    render(<SceneRail scenes={[scene]} activeScene={0} onSceneClick={() => {}} />);
    expect(screen.getByText("p.6")).toBeInTheDocument();
    expect(screen.queryByTestId("section-kind")).toBeNull();
  });
});
