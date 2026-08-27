/**
 * Display helpers for backend rows.
 *
 * Both of these exist to keep a raw database value from reaching the page.
 * `userLabel` is the more interesting one: version and comment rows carry
 * `user_id` always and `user_name` only once the backend has joined it in, so
 * the fallback path is not an edge case — it is what a row looks like from any
 * endpoint that has not done the join. Printing a bare UUID there would be
 * unreadable; printing nothing would make an attributed comment look anonymous,
 * which is the opposite of what FR12's attributed notes are for.
 *
 * `formatTime` has to survive a null, because a row can reach the page before
 * its timestamp does, and "Invalid Date" beside a version snapshot reads as data
 * loss rather than as a missing field.
 */
import { formatTime, userLabel } from "./format";

describe("userLabel", () => {
  it("uses the name once the backend has joined it in", () => {
    expect(userLabel({ user_name: "Mira Shrestha", user_id: "abc123def456" }))
      .toBe("Mira Shrestha");
  });

  it("falls back to a short id when the name is not there", () => {
    // Not the whole UUID: six characters is enough to tell two people apart in
    // a comment thread and short enough to sit in the layout.
    expect(userLabel({ user_id: "abc123def456" })).toBe("User abc123");
  });

  it("says Unknown rather than showing an empty attribution", () => {
    expect(userLabel({})).toBe("Unknown");
    expect(userLabel({ user_id: null })).toBe("Unknown");
  });

  it("prefers the name even when both are present", () => {
    expect(userLabel({ user_name: "Mira", user_id: "abc123def456" })).toBe("Mira");
  });

  it("falls through an empty name to the id", () => {
    expect(userLabel({ user_name: "", user_id: "abc123def456" })).toBe("User abc123");
  });

  it("handles an id shorter than the slice", () => {
    expect(userLabel({ user_id: "ab" })).toBe("User ab");
  });

  it("copes with a non-string id, which the mock database produces", () => {
    expect(userLabel({ user_id: 12345678 })).toBe("User 123456");
  });
});

describe("formatTime", () => {
  it("renders a timestamp as something a person reads", () => {
    const got = formatTime("2026-08-20T10:30:00Z");

    expect(got).not.toBe("Unknown time");
    expect(got).not.toMatch(/Invalid/);
  });

  it("includes the day and the time", () => {
    const got = formatTime("2026-08-20T10:30:00Z");

    expect(got).toMatch(/20|21/);   // the local day either side of the boundary
    expect(got).toMatch(/\d{1,2}:\d{2}/);
  });

  it("says so plainly when there is no timestamp", () => {
    expect(formatTime(null)).toBe("Unknown time");
    expect(formatTime(undefined)).toBe("Unknown time");
    expect(formatTime("")).toBe("Unknown time");
  });

  it("accepts the naive timestamps the local store writes", () => {
    // The SQLite mock writes without a timezone; Supabase writes with one.
    const got = formatTime("2026-08-20T10:30:00");

    expect(got).not.toBe("Unknown time");
    expect(got).not.toMatch(/Invalid/);
  });
});
