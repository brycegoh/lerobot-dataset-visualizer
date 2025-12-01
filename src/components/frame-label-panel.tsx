"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useTime } from "@/context/time-context";

const PHASE_TAG_OPTIONS = [
  "left_arm_pick_litter",
  "right_arm_pick_litter",
  "left_arm_bin_litter",
  "right_arm_bin_litter",
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

// Organize issue tags into logical categories for UI display
const ISSUE_TAG_CATEGORIES = {
  "Critical Issues": {
    issues: ["frozen_cam", "collision_between_arms", "left_arm_collision", "right_arm_collision"] as const,
    recovery: [] as const
  },
  "Left Arm Issues and recovery": {
    issues: [
      "left_arm_missed",
      "left_arm_litter_stuck_gripper",
      "left_arm_litter_dropped"
    ] as const,
    recovery: ["left_arm_recovery"] as const
  },
  "Right Arm Issues and recovery": {
    issues: [
      "right_arm_missed",
      "right_arm_litter_stuck_gripper", 
      "right_arm_litter_dropped"
    ] as const,
    recovery: ["right_arm_recovery"] as const
  }
} as const;

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
  
  // Group issue tags by their recovery tag (handle shared recoveries)
  const recoveryGroups = new Map<IssueTag, IssueTag[]>();
  
  PAIRED_ISSUE_TAGS.forEach(pair => {
    if (!recoveryGroups.has(pair.tagB)) {
      recoveryGroups.set(pair.tagB, []);
    }
    recoveryGroups.get(pair.tagB)!.push(pair.tagA);
  });
  
  // Check each recovery group (e.g., all issues that pair with left_arm_recovery)
  recoveryGroups.forEach((issueTags, recoveryTag) => {
    // Count total frames with ANY of these issue tags
    let totalIssueFrames = 0;
    const issueCounts: Record<string, number> = {};
    
    issueTags.forEach(issueTag => {
      const count = allLabels.filter(l => l.issueTags.includes(issueTag)).length;
      if (count > 0) {
        issueCounts[issueTag] = count;
        totalIssueFrames += count;
      }
    });
    
    // Count total frames with this recovery tag
    const recoveryCount = allLabels.filter(l => l.issueTags.includes(recoveryTag)).length;
    
    // Only warn if totals don't match
    if (totalIssueFrames !== recoveryCount && totalIssueFrames > 0) {
      // Build readable breakdown
      const issueList = Object.keys(issueCounts).join('/');
      warnings.push(
        `${issueList} (${totalIssueFrames}×) should match ${recoveryTag} (${recoveryCount}×)`
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
  onMarkDirty?: () => void;
  onPairingWarningsChange?: (warnings: string[]) => void;
  editFrameIdx?: number | null;
  onEditFrameConsumed?: () => void;
};

export function FrameLabelPanel({
  labellerId,
  initialLabels = [],
  onSave,
  onDelete,
  onMarkDirty,
  onPairingWarningsChange,
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

  // Lift pairing warnings to parent
  useEffect(() => {
    if (onPairingWarningsChange) {
      onPairingWarningsChange(pairingWarnings);
    }
  }, [pairingWarnings, onPairingWarningsChange]);

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
  const hasAnyContent = phaseTag !== null || issueTags.length > 0 || notes.trim().length > 0;

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
    // Only skip save if nothing at all is entered
    if (!phaseTag && issueTags.length === 0 && !notes.trim()) {
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

      // Mark dirty after local state update
      if (onMarkDirty) {
        onMarkDirty();
      }

      // Keep panel open in edit mode so user can continue labeling
      // setIsEditing(false);
      // setEditingFrameIdx(null);
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

    // Mark dirty after local state update
    if (onMarkDirty) {
      onMarkDirty();
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
              Phase:
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
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-slate-300">
              Issues: (Select ALL that apply)
            </label>
            {Object.entries(ISSUE_TAG_CATEGORIES).map(([category, { issues, recovery }]) => (
              <div key={category} className="flex flex-col gap-1.5">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {category}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Issue tags */}
                  {issues.map((tag) => {
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
                  
                  {/* Separator (only if recovery tags exist) */}
                  {recovery.length > 0 && (
                    <div className="text-slate-500 text-lg font-light px-2">|</div>
                  )}
                  
                  {/* Recovery tags */}
                  {recovery.map((tag) => {
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
            ))}
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
              disabled={isSaving || !hasAnyContent}
              className="rounded-md bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Done"}
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
