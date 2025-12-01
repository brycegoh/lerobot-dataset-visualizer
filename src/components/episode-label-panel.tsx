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
  labellerId: string;
  qualityTag: QualityTag;
  keyNotes: KeyNoteTag[];
  remarks: string;
  updatedAt?: string;
};

type EpisodeLabelPanelProps = {
  orgId: string;
  datasetId: string;
  episodeId: string;
  labellerId: string;
  initialLabel?: EpisodeLabel | null;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onSaveAll: () => Promise<void>;
  onMarkDirty: () => void;
  onChange: (label: EpisodeLabel) => void;
  onClearAll?: () => void | Promise<void>;
};

export function EpisodeLabelPanel({
  orgId,
  datasetId,
  episodeId,
  labellerId,
  initialLabel,
  hasUnsavedChanges,
  isSaving,
  onSaveAll,
  onMarkDirty,
  onChange,
  onClearAll,
}: EpisodeLabelPanelProps) {
  // allow "no selection" until user clicks a chip
  const [qualityTag, setQualityTag] = useState<QualityTag | null>(null);
  const [keyNotes, setKeyNotes] = useState<KeyNoteTag[]>([]);
  const [remarks, setRemarks] = useState<string>("");
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
    const newKeyNotes = keyNotes.includes(tag)
      ? keyNotes.filter((t) => t !== tag)
      : [...keyNotes, tag];
    
    setKeyNotes(newKeyNotes);
    onMarkDirty();
    
    // Update parent with new label
    if (qualityTag) {
      onChange({
        orgId,
        datasetId,
        episodeId,
        labellerId,
        qualityTag,
        keyNotes: newKeyNotes,
        remarks,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete all labels for this episode?\nThis cannot be undone."
    );
    if (!confirmed) return;

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
    <section className="mt-2 rounded-lg border border-slate-600 bg-slate-800 p-3 text-sm text-slate-100">
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
        </div>
      </header>

      {/* Quality as chips */}
      <div className="mb-3 flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-300">
          Quality (required):
        </label>
        <div className="flex flex-wrap gap-2">
          {QUALITY_TAG_OPTIONS.map((tag) => {
            const active = qualityTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  const newQualityTag = qualityTag === tag ? null : tag;
                  setQualityTag(newQualityTag);
                  onMarkDirty();
                  
                  // Update parent with new label
                  if (newQualityTag) {
                    onChange({
                      orgId,
                      datasetId,
                      episodeId,
                      labellerId,
                      qualityTag: newQualityTag,
                      keyNotes,
                      remarks,
                      updatedAt: new Date().toISOString(),
                    });
                  }
                }}
                className={`rounded-full border px-3 py-1.5 text-xs ${
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
      <div className="mb-3 flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-300">
          Key notes (tags):
        </label>

        <div className="flex flex-wrap gap-2">
          {KEY_NOTE_OPTIONS.map((tag) => {
            const active = keyNotes.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleKeyNote(tag)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
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
        <label className="mb-2 block text-sm font-medium text-slate-300">
          Remarks:
        </label>
        <textarea
          rows={2}
          className="w-full resize-y rounded-md border border-slate-600 bg-slate-950 p-2 text-xs"
          placeholder="Optional episode-specific notes…"
          value={remarks}
          onChange={(e) => {
            const newRemarks = e.target.value;
            setRemarks(newRemarks);
            onMarkDirty();
            
            // Update parent with new label
            if (qualityTag) {
              onChange({
                orgId,
                datasetId,
                episodeId,
                labellerId,
                qualityTag,
                keyNotes,
                remarks: newRemarks,
                updatedAt: new Date().toISOString(),
              });
            }
          }}
        />
      </div>

      {/* Save All button */}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onSaveAll}
          disabled={!hasUnsavedChanges || isSaving}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save All Labels"}
        </button>
      </div>
    </section>
  );
}
