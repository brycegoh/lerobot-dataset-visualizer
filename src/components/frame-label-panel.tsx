"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useTime } from "@/context/time-context";

const PHASE_TAG_OPTIONS = [
  "start_task",
  "during_task",
  "drop_in_bin",
  "end_task",
] as const;

type PhaseTag = (typeof PHASE_TAG_OPTIONS)[number];

const ISSUE_TAG_OPTIONS = [
  "frozen_cam",
  "left_arm_missed",
  "right_arm_missed",
  "collision_between_arms",
  "left_arm_collision",
  "right_arm_collision",
  "left_arm_litter_stuck_gripper",
  "right_arm_litter_stuck_gripper",
  "left_arm_litter_dropped",
  "right_arm_litter_dropped",
  "left_arm_recovery",
  "right_arm_recovery",
] as const;

type IssueTag = (typeof ISSUE_TAG_OPTIONS)[number];

// Define which issue tags should appear in pairs
const PAIRED_ISSUE_TAGS = [
  { tagA: "left_arm_missed", tagB: "left_arm_recovery", description: "left arm"},
  { tagA: "right_arm_missed", tagB: "right_arm_recovery", description: "right arm"},
  { tagA: "left_arm_litter_stuck_gripper", tagB: "left_arm_recovery", description: "left arm"},
  { tagA: "right_arm_litter_stuck_gripper", tagB: "right_arm_recovery", description: "right arm"},
  { tagA: "left_arm_litter_dropped", tagB: "left_arm_recovery", description: "left arm"},
  { tagA: "right_arm_litter_dropped", tagB: "right_arm_recovery", description: "right arm"},

  // Easy to add more pairs as needed
] as const;

// Validation function (pure function, outside component for performance)
function checkPairedIssueTags(allLabels: FrameLabel[]): string[] {
  const warnings: string[] = [];
  
  PAIRED_ISSUE_TAGS.forEach(pair => {
    // Count frames with each tag
    const countA = allLabels.filter(l => l.issueTags.includes(pair.tagA)).length;
    const countB = allLabels.filter(l => l.issueTags.includes(pair.tagB)).length;
    
    if (countA !== countB) {
      warnings.push(
        `${pair.tagA} (${countA}×) should match ${pair.tagB} (${countB}×)`
      );
    }
  });
  
  return warnings;
}

export type FrameLabel = {
  frameIdx: number;
  labellerId: string;
  phaseTag: PhaseTag | null;
  issueTags: IssueTag[];
  notes: string;
  updatedAt?: string;
};

type FrameLabelPanelProps = {
  labellerId: string;
  initialLabels?: FrameLabel[];
  onSave?: (label: FrameLabel) => void | Promise<void>;
  onDelete?: (frameIdx: number) => void | Promise<void>;
  editFrameIdx?: number | null;
  onEditFrameConsumed?: () => void;
};

export function FrameLabelPanel({
  labellerId,
  initialLabels = [],
  onSave,
  onDelete,
  editFrameIdx,
  onEditFrameConsumed,
}: FrameLabelPanelProps) {
  const { currentTime, setIsPlaying } = useTime();
  const fps = 30;

  // Check pairing based on committed labels from DB (initialLabels)
  // NOT local unsaved edits (labelsByFrame)
  // Warnings update after save when parent reloads from DB
  const pairingWarnings = useMemo(
    () => checkPairedIssueTags(initialLabels),
    [initialLabels]
  );

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

  // Throttle effect to skip duplicate frame checks
  const lastCheckedFrameRef = useRef<number>(-1);

  useEffect(() => {
    if (!isEditing) return;

    const newIdx = Math.max(0, Math.round(currentTime * fps));
    if (newIdx === lastCheckedFrameRef.current) return; // Skip if already checked this frame
    lastCheckedFrameRef.current = newIdx;
    
    if (newIdx === editingFrameIdx) return;

    const label = labelsByFrame[newIdx];

    if (label) {
      setPhaseTag(label.phaseTag ?? null);
      setIssueTags(label.issueTags);
      setNotes(label.notes);
    } else {
      setPhaseTag(null);
      setIssueTags([]);
      setNotes("");
    }

    setEditingFrameIdx(newIdx);
  }, [currentTime, isEditing, editingFrameIdx, labelsByFrame, fps]);

  // Store functions in refs to avoid stale closures
  const startEditingRef = useRef(startEditing);
  startEditingRef.current = startEditing;

  const onEditFrameConsumedRef = useRef(onEditFrameConsumed);
  onEditFrameConsumedRef.current = onEditFrameConsumed;

  // React when playback bar asks us to edit a specific frame (flag click)
  useEffect(() => {
    if (editFrameIdx == null) return;
    startEditingRef.current(editFrameIdx);
    onEditFrameConsumedRef.current?.();
  }, [editFrameIdx]); // Only editFrameIdx, refs are stable

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
      labellerId,
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
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">
              Phase (required):
            </label>
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

          {/* Issues */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">
              Issues:
            </label>
            <div className="flex flex-wrap gap-2">
              {ISSUE_TAG_OPTIONS.map((tag) => {
                const active = issueTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleIssueTag(tag)}
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

          {/* Notes */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
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

      {/* Pairing warnings - only shows when tags are unpaired */}
      {pairingWarnings.length > 0 && (
        <div className="mt-2 p-2 rounded bg-yellow-900/20 border border-yellow-600/40">
          <div className="text-[10px] font-semibold text-yellow-400 mb-1">
            Issue Tag Pairing:
          </div>
          {pairingWarnings.map((warning, i) => (
            <div key={i} className="text-[10px] text-yellow-300">
              • {warning}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
