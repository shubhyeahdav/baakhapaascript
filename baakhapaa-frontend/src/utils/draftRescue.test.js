import { saveRescue, readRescue, readLatestRescue, clearRescue } from "./draftRescue";

beforeEach(() => window.localStorage.clear());

test("a mirrored draft reads back exactly as it was written", () => {
  const draft = "INT. CHIYA PASAL, PATAN - MORNING\n\nभाप उठ्छ।";
  saveRescue("1", draft);
  expect(readRescue("1").content).toBe(draft);
});

test("an empty draft is not mirrored", () => {
  // Otherwise the rescue copy of a freshly-opened script is an empty string,
  // which would be offered back as if it were the writer's work.
  expect(saveRescue("1", "")).toBe(false);
  expect(readRescue("1")).toBeNull();
});

test("the latest draft wins when several scripts have been open", () => {
  saveRescue("old", "first");
  const stored = JSON.parse(window.localStorage.getItem("baakhapaa:draft:old"));
  stored.savedAt -= 60000;
  window.localStorage.setItem("baakhapaa:draft:old", JSON.stringify(stored));
  saveRescue("new", "second");

  expect(readLatestRescue().content).toBe("second");
});

test("clearing removes the mirror once the server has the draft", () => {
  saveRescue("1", "text");
  clearRescue("1");
  expect(readRescue("1")).toBeNull();
});

test("a full or disabled localStorage does not break the editor", () => {
  const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  expect(() => saveRescue("1", "text")).not.toThrow();
  expect(saveRescue("1", "text")).toBe(false);
  setItem.mockRestore();
});

test("corrupt stored JSON is ignored rather than thrown", () => {
  window.localStorage.setItem("baakhapaa:draft:1", "{not json");
  expect(readRescue("1")).toBeNull();
  expect(readLatestRescue()).toBeNull();
});
