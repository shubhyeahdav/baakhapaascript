import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Four questions, one screen each.
 *
 * The rule for a question earning its place is that the answer has to change
 * something the writer will notice — onboarding that feels like a form gets
 * abandoned, and every extra step costs completions. So the tests below check
 * that all four answers actually reach the server together, and that tone is
 * derived from genre rather than asked as a fifth question.
 *
 * Skipping is the other half, and it matters more than it looks. Skipping sets
 * `onboarded: true`, which is what makes the choice permanent — `ProtectedRoute`
 * reads that flag, and a skip that failed to set it would send the writer back
 * to onboarding on every navigation. It must also never block: a writer who
 * chose not to answer, and whose save then failed, still has to reach the app.
 */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../services/api", () => ({
  auth: { setPreferences: vi.fn() },
  learn: { submit: vi.fn() },
}));

const refreshUser = vi.fn();
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ refreshUser }),
}));

// eslint-disable-next-line import/first
import Onboarding from "./Onboarding";
// eslint-disable-next-line import/first
import { auth, learn } from "../services/api";

beforeEach(() => {
  auth.setPreferences.mockResolvedValue({});
  learn.submit.mockResolvedValue({ data: { passed: true } });
  refreshUser.mockResolvedValue(undefined);
});

const answerAll = ({ genre = "Drama" } = {}) => {
  fireEvent.click(screen.getByText("This is my first"));
  fireEvent.click(screen.getByText("Short film"));
  fireEvent.click(screen.getByText("Bilingual"));
  fireEvent.click(screen.getByText(genre === "Drama" ? "Drama" : genre));
};

describe("stepping through", () => {
  it("starts on the first question", () => {
    render(<Onboarding />);

    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByText("Have you written a screenplay before?")).toBeInTheDocument();
  });

  it("says what each answer changes, not just what it is", () => {
    // A question whose answer changes nothing the writer notices does not
    // belong here at all.
    render(<Onboarding />);

    expect(screen.getByText(/This sets how much guidance you see/)).toBeInTheDocument();
    expect(screen.getByText(/check my format as I write/)).toBeInTheDocument();
  });

  it("advances on an answer", () => {
    render(<Onboarding />);

    fireEvent.click(screen.getByText("This is my first"));

    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    expect(screen.getByText("What are you making?")).toBeInTheDocument();
  });

  it("goes back", () => {
    render(<Onboarding />);
    fireEvent.click(screen.getByText("This is my first"));

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));

    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("offers no way back from the first question", () => {
    render(<Onboarding />);

    expect(screen.getByRole("button", { name: /Back/ })).toBeDisabled();
  });

  it("keeps an answer when the writer steps back to change it", () => {
    render(<Onboarding />);
    fireEvent.click(screen.getByText("This is my first"));
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));

    fireEvent.click(screen.getByText("I write regularly"));

    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
  });

  it("fills the progress bar as it goes", () => {
    const { container } = render(<Onboarding />);
    const bar = () => container.querySelector(".bg-gold");

    // Five stops now: the four questions and the lesson.
    expect(bar().style.width).toBe("0%");
    fireEvent.click(screen.getByText("This is my first"));
    expect(bar().style.width).toBe("20%");
  });

  it("does not save anything until the last answer", () => {
    render(<Onboarding />);

    fireEvent.click(screen.getByText("This is my first"));
    fireEvent.click(screen.getByText("Short film"));
    fireEvent.click(screen.getByText("Bilingual"));

    expect(auth.setPreferences).not.toHaveBeenCalled();
  });
});

describe("finishing", () => {
  it("sends every answer together", async () => {
    render(<Onboarding />);

    answerAll();

    await waitFor(() => expect(auth.setPreferences).toHaveBeenCalledWith({
      experience: "first_time", format: "short", language: "Bilingual",
      genre: "Drama", tone: "Emotional", onboarded: true,
    }));
  });

  it("derives tone from genre rather than asking a fifth question", async () => {
    render(<Onboarding />);

    answerAll({ genre: "Thriller" });

    await waitFor(() => expect(auth.setPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ genre: "Thriller", tone: "Tense" })));
  });

  it("has a tone for every genre it offers", async () => {
    for (const [genre, tone] of [
      ["Drama", "Emotional"], ["Romance", "Emotional"], ["Thriller", "Tense"],
      ["Comedy", "Lighthearted"], ["Social issue", "Inspirational"],
    ]) {
      auth.setPreferences.mockClear();
      const { unmount } = render(<Onboarding />);
      answerAll({ genre });
      await waitFor(() => expect(auth.setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ tone })));
      unmount();
    }
  });

  it("marks the writer onboarded, so they are not asked again", async () => {
    render(<Onboarding />);

    answerAll();

    await waitFor(() => expect(auth.setPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ onboarded: true })));
  });

  it("refreshes the cached user before moving on", async () => {
    // ProtectedRoute reads `preferences.onboarded` off the cached user; moving
    // on without refreshing would bounce straight back here.
    render(<Onboarding />);

    answerAll();

    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it("teaches the first lesson instead of dropping them at a blank page", async () => {
    // The whole point of the redesign. The course was the best thing in the
    // product and lived behind a nav item nobody had reason to press.
    render(<Onboarding />);

    answerAll();

    expect(await screen.findByRole("heading", { name: /Write one scene heading/ }))
      .toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("reports a failed save and lets them try again", async () => {
    auth.setPreferences.mockRejectedValue({
      response: { data: { detail: "Your session has expired." } },
    });
    render(<Onboarding />);

    answerAll();

    expect(await screen.findByText("Your session has expired.")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Drama").closest("button")).toBeEnabled());
  });

  it("has a message of its own when the server offers none", async () => {
    auth.setPreferences.mockRejectedValue(new Error("offline"));
    render(<Onboarding />);

    answerAll();

    expect(await screen.findByText("Could not save your answers.")).toBeInTheDocument();
  });
});

describe("skipping", () => {
  it("makes the skip permanent", async () => {
    // Skipping sets onboarded:true so it is a decision, not a prompt the writer
    // has to dismiss on every navigation.
    render(<Onboarding />);

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    // And nothing else. Building the payload unconditionally wrote a
    // genre-derived tone for somebody who had declined to pick a genre, which
    // then quietly prefilled their first project.
    await waitFor(() =>
      expect(auth.setPreferences).toHaveBeenCalledWith({ onboarded: true }));
  });

  it("sends them to the dashboard", async () => {
    render(<Onboarding />);

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"));
  });

  it("never blocks someone from reaching the app, even when the save fails", async () => {
    // A writer who chose not to answer must not be trapped here by an error
    // about the answer they declined to give.
    auth.setPreferences.mockRejectedValue(new Error("offline"));
    render(<Onboarding />);

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument();
  });

  it("can be skipped from any step", async () => {
    render(<Onboarding />);
    fireEvent.click(screen.getByText("This is my first"));
    fireEvent.click(screen.getByText("Short film"));

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"));
  });
});

describe("the first lesson, taught by the Pen", () => {
  /**
   * The redesign. Onboarding used to end at a blank editor with nineteen
   * lessons sitting behind a nav item nobody had reason to press. Now the
   * writer produces one real scene heading before they see the editor at all,
   * graded by the same craft linter that runs everywhere else.
   *
   * The mechanics NOT copied from Duolingo are load-bearing: no hearts, because
   * the course's own rule is that there is no penalty for trying; no streaks,
   * because a screenwriter who rests is not failing; no points, because this
   * product reports measurements rather than scores.
   */
  const reachLesson = async () => {
    render(<Onboarding />);
    answerAll();
    await screen.findByRole("heading", { name: /Write one scene heading/ });
  };

  const box = () => screen.getByLabelText(/Your first scene/);

  it("saves the answers before the lesson, so closing the tab loses nothing", async () => {
    // The lesson is a gift, not a gate.
    await reachLesson();

    expect(auth.setPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ onboarded: true }));
  });

  it("starts them off with the beginning of a slugline", async () => {
    await reachLesson();

    expect(box()).toHaveValue("INT. ");
  });

  it("grades what they wrote with the real linter", async () => {
    await reachLesson();
    fireEvent.change(box(), { target: { value: "INT. PASAL - DAY\n\nShe counts the till." } });

    fireEvent.click(screen.getByRole("button", { name: "Check it" }));

    await waitFor(() => expect(learn.submit).toHaveBeenCalledWith(
      "the-page", "INT. PASAL - DAY\n\nShe counts the till."));
  });

  it("celebrates a pass without pretending it was hard", async () => {
    await reachLesson();
    fireEvent.change(box(), { target: { value: "INT. PASAL - DAY\n\nShe waits." } });
    fireEvent.click(screen.getByRole("button", { name: "Check it" }));

    expect(await screen.findByRole("heading", { name: /written your first slugline/ }))
      .toBeInTheDocument();
    expect(screen.getByRole("img", { name: /The Pen, pleased/ })).toBeInTheDocument();
  });

  it("names what is wrong and invites another go", async () => {
    // The linter's own message, which is the thing that teaches.
    learn.submit.mockResolvedValue({
      data: { passed: false, problems: ["Found 0 scene heading(s); this exercise needs 1."] },
    });
    await reachLesson();
    fireEvent.change(box(), { target: { value: "just some words" } });
    fireEvent.click(screen.getByRole("button", { name: "Check it" }));

    expect(await screen.findByText(/Found 0 scene heading/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });

  it("says plainly that a wrong answer costs nothing", async () => {
    learn.submit.mockResolvedValue({ data: { passed: false, problems: ["Nope."] } });
    await reachLesson();
    fireEvent.change(box(), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Check it" }));

    expect(await screen.findByText(/Nothing is lost by trying/)).toBeInTheDocument();
  });

  it("keeps what they wrote when they try again", async () => {
    learn.submit.mockResolvedValue({ data: { passed: false, problems: ["Nope."] } });
    await reachLesson();
    fireEvent.change(box(), { target: { value: "INT. HALF" } });
    fireEvent.click(screen.getByRole("button", { name: "Check it" }));
    await screen.findByRole("button", { name: "Check again" });

    expect(screen.getByLabelText(/Your first scene/)).toHaveValue("INT. HALF");
  });

  it("never blocks the door on our own network", async () => {
    // The lesson is optional. A checker that cannot be reached must not trap
    // somebody inside onboarding.
    learn.submit.mockRejectedValue(new Error("offline"));
    await reachLesson();
    fireEvent.change(box(), { target: { value: "INT. PASAL - DAY\n\nShe waits." } });
    fireEvent.click(screen.getByRole("button", { name: "Check it" }));

    expect(await screen.findByText(/couldn't reach the checker/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a project" })).toBeInTheDocument();
  });

  it("lets them skip the lesson straight into a project", async () => {
    await reachLesson();

    fireEvent.click(screen.getByRole("button", { name: "Skip this" }));

    expect(mockNavigate).toHaveBeenCalledWith("/projects/new");
  });

  it("offers the rest of the course once they have passed", async () => {
    await reachLesson();
    fireEvent.change(box(), { target: { value: "INT. PASAL - DAY\n\nShe waits." } });
    fireEvent.click(screen.getByRole("button", { name: "Check it" }));
    await screen.findByRole("button", { name: "See the course" });

    fireEvent.click(screen.getByRole("button", { name: "See the course" }));

    expect(mockNavigate).toHaveBeenCalledWith("/learn");
  });

  it("has no hearts, no streak and no score", async () => {
    // Pinning the restraint. Hearts contradict "no penalty for trying",
    // streaks punish rest, and a score puts a number on writing in a product
    // whose discipline is to report measurements instead.
    await reachLesson();

    const text = document.body.textContent;
    expect(text).not.toMatch(/streak|hearts?\b|\bXP\b|\d+\s*points/i);
  });
});
