"use client";

import { useState, useEffect } from "react";

const QUALITY_TAG_OPTIONS = [
  "high",
  "medium",
  "low",
  "unusable",
] as const;

type QualityTag = (typeof QUALITY_TAG_OPTIONS)[number];

const KEY_NOTE_OPTIONS = [
  "failed_attempt",
  "knocked_sink",
  "litter_stuck_gripper",
  "collision",
  "litter_fall_of_table",
] as const;

type KeyNoteTag = (typeof KEY_NOTE_OPTIONS)[number];

export type EpisodeLabel = {
  orgId: string;
  datasetId: string;
  episodeId: string;
  qualityTag: QualityTag;
  keyNotes: KeyNoteTag[];
  remarks: string;
  updatedAt?: string;
};

type EpisodeLabelPanelProps = {
  orgId: string;
  datasetId: string;
  episodeId: string;
  initialLabel?: EpisodeLabel | null;
  onSave?: (label: EpisodeLabel) => void | Promise<void>;
  onClearAll?: () => void | Promise<void>;
};

export function EpisodeLabelPanel({
  orgId,
  datasetId,
  episodeId,
  initialLabel,
  onSave,
  onClearAll,
}: EpisodeLabelPanelProps) {
  // allow "no selection" until user clicks a chip
  const [qualityTag, setQualityTag] = useState<QualityTag | null>(null);
  const [keyNotes, setKeyNotes] = useState<KeyNoteTag[]>([]);
  const [remarks, setRemarks] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const hasQualitySelection = qualityTag !== null;

  // Sync local state whenever initialLabel changes
  useEffect(() => {
    if (initialLabel) {
      setQualityTag(initialLabel.qualityTag ?? null);
      setKeyNotes(initialLabel.keyNotes ?? []);
      setRemarks(initialLabel.remarks ?? "");
    } else {
      setQualityTag(null);
      setKeyNotes([]);
      setRemarks("");
    }
  }, [initialLabel]);

  const toggleKeyNote = (tag: KeyNoteTag) => {
    setKeyNotes((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag],
    );
  };

  const handleSave = async () => {
    if (!hasQualitySelection) return; // require explicit quality

    const label: EpisodeLabel = {
      orgId,
      datasetId,
      episodeId,
      qualityTag: qualityTag!, // we know it's not null here
      keyNotes,
      remarks,
      updatedAt: new Date().toISOString(),
    };

    setIsSaving(true);
    try {
      if (onSave) {
        await onSave(label);
      } else {
        console.log("Episode label saved:", label);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearAll = async () => {
    if (!onClearAll) return;
    setIsClearing(true);
    try {
      await onClearAll();
      // local reset
      setQualityTag(null);
      setKeyNotes([]);
      setRemarks("");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <section className="mt-4 rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-100">
      <header className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-bold text-m uppercase tracking-wide text-slate-300">
            Episode Labels
          </div>
          <div className="text-[11px] text-slate-500">
            episode {episodeId}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClearAll}
            disabled={isClearing || !onClearAll}
            className="rounded-md border border-red-500 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-950 disabled:opacity-50"
          >
            {isClearing ? "Clearing…" : "Clear all"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !hasQualitySelection}
            className="rounded-md border border-slate-500 px-3 py-1 text-xs font-medium hover:bg-slate-800 disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {/* Quality as chips */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-slate-300">
            Quality (required):
          </label>
          <span className="text-[10px] text-slate-500">
            Tap to select one
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUALITY_TAG_OPTIONS.map((tag) => {
            const active = qualityTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setQualityTag((prev) => (prev === tag ? null : tag))
                }
                className={`rounded-full border px-2 py-1 text-[11px] ${
                  active
                    ? "bg-emerald-400 text-slate-900 border-emerald-300"
                    : "bg-slate-900 text-slate-100 border-slate-600"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Key notes as chips */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-slate-300">
            Key notes (tags):
          </label>
          <span className="text-[10px] text-slate-500">
            Click to toggle
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {KEY_NOTE_OPTIONS.map((tag) => {
            const active = keyNotes.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleKeyNote(tag)}
                className={`rounded-full border px-2 py-1 text-[11px] ${
                  active
                    ? "bg-slate-100 text-slate-900 border-slate-100"
                    : "bg-slate-900 text-slate-100 border-slate-600"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Remarks */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-300">
          Remarks:
        </label>
        <textarea
          rows={2}
          className="w-full resize-y rounded-md border border-slate-600 bg-slate-950 p-2 text-xs"
          placeholder="Optional episode-specific notes…"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </div>
    </section>
  );
}
