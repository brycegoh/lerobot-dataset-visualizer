"use client";

import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";

const QUALITY_TAG_OPTIONS = [
  "high",
  "medium",
  "low",
  "unusable",
] as const;

type QualityTag = (typeof QUALITY_TAG_OPTIONS)[number];

const KEY_NOTE_OPTIONS = [
  "failed_pick_attempt",
  "litter_stuck_gripper",
  "collision",
  "litter_fall_off_counter",
] as const;

type KeyNoteTag = (typeof KEY_NOTE_OPTIONS)[number];

const LITTER_ITEMS_OPTIONS = [
  "pb_biscuit_wrapper",
  "oreo_wrapper",
  "bubble_wrap",
  "flattened_plastic_cup",
  "non_flattened_plastic_cup",
  "oatside_uht_250ml_bottle",
  "chrysanthemum_bottle",
  "pepsi_bottle",
  "orange_bottle_cap",
  "plastic_cup_lid",
  "facial_tissue",
  "paper_towel",
  "empty_tissue_packet",
  "toilet_roll_cupboard_holder",
] as const;

const ARMS_USED_OPTIONS = ["left", "right", "both"] as const;
type ArmsUsed = (typeof ARMS_USED_OPTIONS)[number];

// Store litter items as object: { itemName: quantity }
type LitterItemsMap = Record<string, number>;

export type EpisodeLabel = {
  orgId: string;
  datasetId: string;
  episodeId: string;
  labellerId: string;
  qualityTag: QualityTag | null;
  keyNotes: KeyNoteTag[];
  litterItems: LitterItemsMap;
  armsUsed: ArmsUsed | null;
  remarks: string;
  updatedAt?: string;
};

export interface EpisodeLabelPanelRef {
  getCurrentLabel: () => EpisodeLabel;
}

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
  sourceInfo?: { org: string; dataset: string; episode: number } | null;
};

export const EpisodeLabelPanel = forwardRef<EpisodeLabelPanelRef, EpisodeLabelPanelProps>(({
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
  sourceInfo,
}, ref) => {
  // allow "no selection" until user clicks a chip
  const [qualityTag, setQualityTag] = useState<QualityTag | null>(null);
  const [keyNotes, setKeyNotes] = useState<KeyNoteTag[]>([]);
  const [litterItems, setLitterItems] = useState<LitterItemsMap>({});
  const [armsUsed, setArmsUsed] = useState<ArmsUsed | null>(null);
  const [editingItemQty, setEditingItemQty] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<string>("");
  const [isClearing, setIsClearing] = useState(false);

  // Use ref to track latest litterItems state (avoids stale closure)
  const litterItemsRef = useRef<LitterItemsMap>({});
  
  // Keep ref in sync with state
  useEffect(() => {
    litterItemsRef.current = litterItems;
  }, [litterItems]);

  // Expose method to get current state (for accurate saving)
  useImperativeHandle(ref, () => ({
    getCurrentLabel: () => ({
      orgId,
      datasetId,
      episodeId,
      labellerId,
      qualityTag,
      keyNotes,
      litterItems,
      armsUsed,
      remarks,
      updatedAt: new Date().toISOString(),
    })
  }));


  const hasQualitySelection = qualityTag !== null;

  // Sync local state whenever initialLabel changes
  useEffect(() => {
    if (initialLabel) {
      setQualityTag(initialLabel.qualityTag ?? null);
      setKeyNotes(initialLabel.keyNotes ?? []);
      setLitterItems(initialLabel.litterItems ?? {});
      setArmsUsed(initialLabel.armsUsed ?? null);
      setRemarks(initialLabel.remarks ?? "");
    } else {
      setQualityTag(null);
      setKeyNotes([]);
      setLitterItems({});
      setArmsUsed(null);
      setRemarks("");
    }
  }, [initialLabel]);

  // Notify parent whenever any field changes (debounced to batch rapid clicks)
  useEffect(() => {
    // Skip initial mount and when no changes yet
    if (!qualityTag && keyNotes.length === 0 && Object.keys(litterItems).length === 0 && !armsUsed && !remarks) {
      return;
    }

    const timer = setTimeout(() => {
      onChange({
        orgId,
        datasetId,
        episodeId,
        labellerId,
        qualityTag,
        keyNotes,
        litterItems,
        armsUsed,
        remarks,
        updatedAt: new Date().toISOString(),
      });
    }, 50); // 50ms debounce to batch rapid clicks

    return () => clearTimeout(timer);
  }, [qualityTag, keyNotes, litterItems, armsUsed, remarks, onChange, orgId, datasetId, episodeId, labellerId]);

  const toggleKeyNote = (tag: KeyNoteTag) => {
    const newKeyNotes = keyNotes.includes(tag)
      ? keyNotes.filter((t) => t !== tag)
      : [...keyNotes, tag];
    
    setKeyNotes(newKeyNotes);
    onMarkDirty();
  };

  // Left click: increment litter item
  const incrementLitterItem = (item: string) => {
    setLitterItems(currentItems => ({
      ...currentItems,
      [item]: (currentItems[item] || 0) + 1
    }));
    onMarkDirty();
  };

  // Right click: decrement litter item (min 0)
  const decrementLitterItem = (item: string, e: React.MouseEvent) => {
    e.preventDefault(); // prevent context menu
    
    setLitterItems(currentItems => {
      const newQty = Math.max(0, (currentItems[item] || 0) - 1);
      
      if (newQty === 0) {
        const { [item]: _, ...rest } = currentItems;
        return rest;
      }
      return { ...currentItems, [item]: newQty };
    });
    onMarkDirty();
  };

  // Click count badge to edit directly
  const handleQtyInput = (item: string, value: string) => {
    const qty = parseInt(value);
    
    setLitterItems(currentItems => {
      if (isNaN(qty) || qty <= 0) {
        const { [item]: _, ...rest } = currentItems;
        return rest;
      }
      return { ...currentItems, [item]: qty };
    });
    setEditingItemQty(null);
    onMarkDirty();
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
      setLitterItems({});
      setArmsUsed(null);
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
            {sourceInfo ? (
              <>
                episode {episodeId} (source: {sourceInfo.org}/{sourceInfo.dataset} ep {sourceInfo.episode})
              </>
            ) : (
              <>episode {episodeId}</>
            )}
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
          Quality:
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

      {/* Litter Items with quantities */}
      <div className="mb-3 flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-300">
          Litter Items ({Object.keys(litterItems).length} items, {Object.values(litterItems).reduce((a,b) => a+b, 0)} total):
        </label>
        <p className="text-[11px] text-slate-400">
           Left click to add (+1), Right click to remove (-1), Click count to type
        </p>
        <div className="flex flex-wrap gap-2">
          {LITTER_ITEMS_OPTIONS.map((item) => {
            const count = litterItems[item] || 0;
            const hasCount = count > 0;
            
            return (
              <button
                key={item}
                type="button"
                onClick={() => incrementLitterItem(item)}
                onContextMenu={(e) => decrementLitterItem(item, e)}
                className={`relative rounded-full border px-3 py-1.5 text-xs ${
                  hasCount
                    ? "bg-slate-100 text-slate-900 border-slate-100"
                    : "bg-slate-900 text-slate-100 border-slate-600"
                }`}
              >
                {item}
                {hasCount && (
                  editingItemQty === item ? (
                    <input
                      type="number"
                      min="0"
                      value={count}
                      onChange={(e) => handleQtyInput(item, e.target.value)}
                      onBlur={() => setEditingItemQty(null)}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-1 w-10 rounded px-1 text-slate-900 bg-white border border-slate-300"
                      autoFocus
                    />
                  ) : (
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingItemQty(item);
                      }}
                      className="ml-1 font-bold cursor-pointer hover:underline"
                    >
                      ({count})
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Arms Used */}
      <div className="mb-3 flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-300">
          Arms Used:
        </label>
        <div className="flex flex-wrap gap-2">
          {ARMS_USED_OPTIONS.map((arms) => {
            const active = armsUsed === arms;
            return (
              <button
                key={arms}
                type="button"
                onClick={() => {
                  const newArmsUsed = armsUsed === arms ? null : arms;
                  setArmsUsed(newArmsUsed);
                  onMarkDirty();
                }}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  active
                    ? "bg-emerald-400 text-slate-900 border-emerald-300"
                    : "bg-slate-900 text-slate-100 border-slate-600"
                }`}
              >
                {arms}
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
});

EpisodeLabelPanel.displayName = "EpisodeLabelPanel";
