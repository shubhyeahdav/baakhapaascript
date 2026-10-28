import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider, useT } from "../i18n";
import EditorHeader from "./EditorHeader";

/**
 * The editor's interface language (Month 4, Day 11).
 *
 * The switch lived only in the account dropdown, and the editor has none — so
 * a writer inside the editor could not change the interface at all, and the
 * toolbar was English whatever they chose elsewhere. These pin both halves.
 */

function Header() {
  const t = useT();
  const noop = () => {};
  return (
    <EditorHeader
      id="s1" title="Chiya Break" navigate={noop} t={t}
      saving={false} view="script" setView={noop} caretPage={1} pageCount={1}
      nepaliMode={false} setNepaliMode={noop} textareaRef={{ current: null }}
      showShortcuts={false} setShowShortcuts={noop}
      suggestions={null} showStructure={false} setShowStructure={noop}
      zenMode={false} setZenMode={noop} isFullPage={false} toggleFullPage={noop}
      cursor="pen" setCursor={noop} typewriter={false} setTypewriter={noop}
      pageTheme="light" setPageTheme={noop}
      handleExport={noop} handleFinalize={noop} reviewing={false}
      setShowShare={noop} setPanelOpen={noop}
      importRef={{ current: null }} onImported={noop}
    />
  );
}

beforeEach(() => window.localStorage.clear());

it("switches the interface language from inside the editor", () => {
  render(<LanguageProvider><Header /></LanguageProvider>);
  expect(screen.getAllByText("Share")[0]).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^View/ }));
  fireEvent.click(screen.getByText("Interface: English"));

  expect(screen.getAllByText("सेयर")[0]).toBeInTheDocument();
  expect(window.localStorage.getItem("baakhapaa:lang")).toBe("ne");
});

it("keeps the interface switch apart from the typing switch", () => {
  /* Typing sets what the keyboard writes into the script; the interface sets
     the menus. A writer may want Nepali on the page under English menus. */
  render(<LanguageProvider><Header /></LanguageProvider>);
  fireEvent.click(screen.getByRole("button", { name: "⋯" }));
  expect(screen.getAllByText("Typing: English").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Interface: English").length).toBeGreaterThan(0);
});
