import React, { useCallback, useEffect, useRef, useState } from "react";
import { scripts } from "../services/api";

/**
 * The story bible — everything the script needs to exist that never appears
 * on the page: who these people are, what they want, what the story is about.
 *
 * Writers keep this in a separate document anyway. Keeping it beside the
 * draft means the editor can *use* it: character names typed here feed the
 * type-ahead, so a character can be completed the first time they're written
 * rather than only after they've already appeared — which is exactly when the
 * completion is worth having.
 *
 * Want and need are deliberately separate fields. They are the two halves of
 * a character that make an ending land, and a single "goal" box quietly
 * collapses them into one.
 */

const BLANK_CHARACTER = { name: "", age: "", want: "", need: "", wound: "", voice: "", notes: "" };

function Field({ label, hint, value, onChange, rows, placeholder }) {
  const Tag = rows ? "textarea" : "input";
  return (
    <div>
      <label className="block font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-1">
        {label}
      </label>
      <Tag
        value={value || ""}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bgDeep/40 border border-borderSoft rounded-lg px-2.5 py-1.5 text-[12.5px] text-inkSoft placeholder:text-inkMuted/50 focus:outline-none focus:border-gold/40 resize-y"
      />
      {hint && <p className="text-[10.5px] text-inkMuted mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

export default function StoryBible({ scriptId, initial, onChange }) {
  const [bible, setBible] = useState(
    initial || { logline: "", dramatic_question: "", theme: "", characters: [], locations: [], notes: "" }
  );
  const [status, setStatus] = useState("");
  const [openCharacter, setOpenCharacter] = useState(0);
  const saveTimer = useRef(null);
  const firstRender = useRef(true);

  // Debounced autosave. The bible is written in bursts between scenes, so
  // saving per keystroke would be noise; waiting for an explicit Save button
  // means losing work when the writer navigates away mid-thought.
  const save = useCallback(async (next) => {
    setStatus("Saving…");
    try {
      await scripts.saveBible(scriptId, next);
      setStatus("Saved");
      onChange?.(next);
    } catch {
      setStatus("Could not save");
    }
  }, [scriptId, onChange]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(bible), 800);
    return () => clearTimeout(saveTimer.current);
  }, [bible, save]);

  const set = (patch) => setBible((b) => ({ ...b, ...patch }));

  const setCharacter = (i, patch) =>
    setBible((b) => ({
      ...b,
      characters: b.characters.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));

  const addCharacter = () => {
    setBible((b) => ({ ...b, characters: [...b.characters, { ...BLANK_CHARACTER }] }));
    setOpenCharacter(bible.characters.length);
  };

  const removeCharacter = (i) =>
    setBible((b) => ({ ...b, characters: b.characters.filter((_, idx) => idx !== i) }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-inkMuted">
          Story
        </span>
        <span className="text-[10.5px] text-inkMuted">{status}</span>
      </div>

      <Field
        label="Logline" rows={3}
        placeholder="One sentence: who wants what, and what stands in the way."
        value={bible.logline} onChange={(v) => set({ logline: v })}
      />

      <Field
        label="Dramatic question" rows={2}
        hint="What act one asks and the ending answers."
        placeholder="Will Prerana leave the shop?"
        value={bible.dramatic_question} onChange={(v) => set({ dramatic_question: v })}
      />

      <Field
        label="Theme" rows={2}
        placeholder="What the story is actually about, underneath the plot."
        value={bible.theme} onChange={(v) => set({ theme: v })}
      />

      {/* Characters */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted">
            Characters
          </span>
          <button
            onClick={addCharacter}
            className="text-[11px] text-inkMuted hover:text-gold transition-colors"
          >
            + Add
          </button>
        </div>

        {bible.characters.length === 0 && (
          <p className="text-[11.5px] text-inkMuted leading-snug">
            Names added here are offered by the editor's type-ahead, so you can
            write a character before they first appear.
          </p>
        )}

        <div className="space-y-2">
          {bible.characters.map((c, i) => {
            const open = openCharacter === i;
            return (
              <div key={i} className="rounded-xl border border-borderSoft bg-elevated/30">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() => setOpenCharacter(open ? -1 : i)}
                    className="flex-1 text-left text-[12.5px] text-ink font-medium truncate"
                  >
                    {c.name?.trim() || <span className="text-inkMuted">Unnamed</span>}
                    {c.age && <span className="text-inkMuted font-normal ml-2">{c.age}</span>}
                  </button>
                  <button
                    onClick={() => removeCharacter(i)}
                    title="Remove character"
                    className="text-inkMuted hover:text-red-400 text-sm leading-none px-1"
                  >
                    ×
                  </button>
                </div>

                {open && (
                  <div className="px-3 pb-3 space-y-2.5 border-t border-borderSoft pt-2.5">
                    <div className="grid grid-cols-[1fr_70px] gap-2">
                      <Field label="Name" value={c.name} placeholder="SANJANA"
                             onChange={(v) => setCharacter(i, { name: v })} />
                      <Field label="Age" value={c.age} placeholder="23"
                             onChange={(v) => setCharacter(i, { age: v })} />
                    </div>
                    <Field label="Wants" rows={2} hint="What they're chasing."
                           placeholder="To get the film finished before Baba finds out."
                           value={c.want} onChange={(v) => setCharacter(i, { want: v })} />
                    <Field label="Needs" rows={2} hint="What would actually help — usually not the same thing."
                           placeholder="To say it out loud and survive the answer."
                           value={c.need} onChange={(v) => setCharacter(i, { need: v })} />
                    <Field label="Wound" rows={2}
                           placeholder="What happened before page one that still governs them."
                           value={c.wound} onChange={(v) => setCharacter(i, { wound: v })} />
                    <Field label="Voice" rows={2}
                           hint="How they speak — rhythm, what they avoid saying, when they switch language."
                           value={c.voice} onChange={(v) => setCharacter(i, { voice: v })} />
                    <Field label="Notes" rows={2} value={c.notes}
                           onChange={(v) => setCharacter(i, { notes: v })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Field
        label="Locations" rows={3}
        hint="One per line. These are offered after INT. / EXT."
        placeholder={"CHIYA PASAL, PATAN\nFAMILY KITCHEN"}
        value={(bible.locations || []).join("\n")}
        onChange={(v) => set({ locations: v.split("\n") })}
      />

      <Field
        label="Notes" rows={4}
        placeholder="Anything else the script has to hold on to."
        value={bible.notes} onChange={(v) => set({ notes: v })}
      />
    </div>
  );
}
