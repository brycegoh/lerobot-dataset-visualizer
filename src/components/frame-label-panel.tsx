"use client";

import { useState, useEffect } from "react";
import { useTime } from "@/context/time-context";

const PHASE_TAG_OPTIONS = [
  "start_task",
  "pick_litter",
  "move_to_bin",
  "drop_in_bin",
  "end_task",
] as const;

type PhaseTag = (typeof PHASE_TAG_OPTIONS)[number];

const ISSUE_TAG_OPTIONS = [
  "frozen_cam",
  "failed_pick",
  "collision_between_arms",
  "collision_with_sink",
  "litter_stuck_gripper",
  "litter_dropped",
  "shift_during_rest",
] as const;

type IssueTag = (typeof ISSUE_TAG_OPTIONS)[number];

export type FrameLabel = {
  frameIdx: number;
  phaseTag: PhaseTag | null;
  issueTags: IssueTag[];
  notes: string;
  updatedAt?: string;
};

type FrameLabelPanelProps = {
  initialLabels?: FrameLabel[];
  onSave?: (label: FrameLabel) => void | Promise<void>;
  onDelete?: (frameIdx: number) => void | Promise<void>;
  editFrameIdx?: number | null;
  onEditFrameConsumed?: () => void;
};

export function FrameLabelPanel({
  initialLabels = [],
  onSave,
  onDelete,
  editFrameIdx,
  onEditFrameConsumed,
}: FrameLabelPanelProps) {
  const { currentTime, setIsPlaying } = useTime();
  const fps = 30;

  // Map frameIdx -> label, seeded from initialLabels
  const [labelsByFrame, setLabelsByFrame] = useState<Record<number, FrameLabel>>(
    () => Object.fromEntries(initialLabels.map((l) => [l.frameIdx, l])),
  );

  // Re-sync when initialLabels from parent (Supabase) change
  useEffect(() => {
    setLabelsByFrame(
      Object.fromEntries(initialLabels.map((l) => [l.frameIdx, l])),
    );
  }, [initialLabels]);

  // When editing, we lock onto a specific frame index
  const [editingFrameIdx, setEditingFrameIdx] = useState<number | null>(null);

  const baseFrameIdx = Math.max(0, Math.round(currentTime * fps));
  const frameIdx = editingFrameIdx ?? baseFrameIdx;
  const timeLabel =
    editingFrameIdx != null
      ? (editingFrameIdx / fps).toFixed(2)
      : currentTime.toFixed(2);

  const existing = labelsByFrame[frameIdx];

  const [isEditing, setIsEditing] = useState(false);
  const [phaseTag, setPhaseTag] = useState<PhaseTag | null>(null);
  const [issueTags, setIssueTags] = useState<IssueTag[]>([]);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const hasPhaseSelection = phaseTag !== null;

  const startEditing = (targetIdx?: number) => {
    setIsPlaying(false);

    const idx = targetIdx ?? frameIdx;
    const label = labelsByFrame[idx];

    if (label) {
      setPhaseTag(label.phaseTag ?? null);
      setIssueTags(label.issueTags);
      setNotes(label.notes);
    } else {
      setPhaseTag(null);
      setIssueTags([]);
      setNotes("");
    }

    setEditingFrameIdx(idx);
    setIsEditing(true);
  };

  // React when playback bar asks us to edit a specific frame (flag click)
  useEffect(() => {
    if (editFrameIdx == null) return;
    startEditing(editFrameIdx);
    if (onEditFrameConsumed) onEditFrameConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editFrameIdx]);

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingFrameIdx(null);
  };

  const toggleIssueTag = (tag: IssueTag) => {
    setIssueTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSave = async () => {
    if (!hasPhaseSelection) {
      // nothing selected -> don't save a label
      setIsEditing(false);
      setEditingFrameIdx(null);
      return;
    }

    const idx = editingFrameIdx ?? frameIdx;

    const label: FrameLabel = {
      frameIdx: idx,
      phaseTag,
      issueTags,
      notes,
      updatedAt: new Date().toISOString(),
    };

    setIsSaving(true);
    try {
      setLabelsByFrame((prev) => ({
        ...prev,
        [idx]: label,
      }));

      if (onSave) {
        await onSave(label);
      } else {
        console.log("Frame label saved:", label);
      }

      setIsEditing(false);
      setEditingFrameIdx(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingFrameIdx && editingFrameIdx !== 0) return;
    const idx = editingFrameIdx;

    // remove locally
    setLabelsByFrame((prev) => {
      const copy = { ...prev };
      delete copy[idx];
      return copy;
    });

    if (onDelete) {
      await onDelete(idx);
    } else {
      console.log("Frame label deleted:", idx);
    }

    setIsEditing(false);
    setEditingFrameIdx(null);
  };

  const summaryParts: string[] = [];
  if (existing?.phaseTag) summaryParts.push(`phase: ${existing.phaseTag}`);
  if (existing?.issueTags?.length)
    summaryParts.push(`issues: ${existing.issueTags.join(", ")}`);

  return (
    <section className="mb-3 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-100">
      {/* Top line: info + Add/Edit button */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            Frame Labels
          </span>
          <span className="text-[11px] text-slate-400">
            t = {timeLabel}s · frame {frameIdx}
            {summaryParts.length > 0 && (
              <span className="ml-2 text-[11px] text-slate-300">
                — {summaryParts.join(" · ")}
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => startEditing()}
          className="rounded-md border border-slate-600 px-2 py-1 text-[11px] font-medium hover:bg-slate-800"
        >
          {existing ? "Edit label" : "Add label"}
        </button>
      </div>

      {/* Editor form (only visible when editing) */}
      {isEditing && (
        <div className="space-y-3 border-t border-slate-700 pt-3">
          {/* Phase */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-300">
                Phase:
              </label>
              <span className="text-[10px] text-slate-500">
                Tap to select (required)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PHASE_TAG_OPTIONS.map((tag) => {
                const active = phaseTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setPhaseTag((prev) => (prev === tag ? null : tag))
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

          {/* Issues */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-300">
                Issues:
              </label>
              <span className="text-[10px] text-slate-500">
                Click to toggle
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ISSUE_TAG_OPTIONS.map((tag) => {
                const active = issueTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleIssueTag(tag)}
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

          {/* Notes */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-300">
              Notes:
            </label>
            <textarea
              rows={2}
              className="w-full resize-y rounded-md border border-slate-600 bg-slate-950 p-2 text-[11px]"
              placeholder="Optional frame-specific notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            {editingFrameIdx != null && labelsByFrame[editingFrameIdx] && (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md border border-red-500 px-2 py-1 text-[11px] text-red-300 hover:bg-red-950"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={cancelEditing}
              className="rounded-md border border-slate-600 px-2 py-1 text-[11px] hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !hasPhaseSelection}
              className="rounded-md bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save frame label"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
