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

// eslint-disable-next-line import/first
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

describe("the runtime shown per scene", () => {
  it("prefers what is written over what was planned", () => {
    // The whole point: the page is the truth, the plan is an intention.
    show([scene({ time_allocation: 2.5, draft_json: { minutes: 1.5 } })]);

    expect(screen.getByText("1:30")).toBeInTheDocument();
  });

  it("falls back to the plan when nothing is written yet", () => {
    show([scene({ time_allocation: 2.5, draft_json: null })]);

    expect(screen.getByText("2:30")).toBeInTheDocument();
  });

  it("reads draft_json when Postgres hands it over as a string", () => {
    show([scene({ draft_json: JSON.stringify({ minutes: 0.75 }) })]);

    expect(screen.getByText("0:45")).toBeInTheDocument();
  });

  it("shows a dash rather than 0:00 for a scene with no runtime either way", () => {
    // A hand-typed screenplay's scenes were never allocated anything, and "0m"
    // beside every one of them reads as a broken feature rather than a blank.
    show([scene({ time_allocation: 0, draft_json: null })]);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("degrades to a dash on unparseable draft_json instead of throwing", () => {
    show([scene({ time_allocation: 0, draft_json: "{not json" })]);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("still finds the planned time when draft_json is unparseable", () => {
    show([scene({ time_allocation: 2, draft_json: "{not json" })]);

    expect(screen.getByText("2:00")).toBeInTheDocument();
  });

  it("pads the seconds to two digits", () => {
    show([scene({ draft_json: { minutes: 3.1 } })]);

    expect(screen.getByText("3:06")).toBeInTheDocument();
  });
});
