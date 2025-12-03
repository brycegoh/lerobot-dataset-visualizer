"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { postParentMessageWithParams } from "@/utils/postParentMessage";
import { SimpleVideosPlayer } from "@/components/simple-videos-player";
import DataRecharts from "@/components/data-recharts";
import PlaybackBar from "@/components/playback-bar";
import { TimeProvider, useTime } from "@/context/time-context";
import Sidebar from "@/components/side-nav";
import Loading from "@/components/loading-component";
import { getAdjacentEpisodesVideoInfo } from "./fetch-data";
import {
  EpisodeLabelPanel,
  type EpisodeLabel,
  type EpisodeLabelPanelRef,
} from "@/components/episode-label-panel";
import type { FrameLabel } from "@/components/frame-label-panel";
import { supabase } from "@/utils/supabaseClient";
import {
  fetchEpisodesJsonl,
  parseEpisodesJsonl,
  extractSourceInfo,
  type SourceInfo,
  type EpisodeMetadata,
} from "@/utils/jsonlUtils";
import { getDatasetVersion } from "@/utils/versionUtils";

export default function EpisodeViewer({
  data,
  error,
  org,
  dataset,
}: {
  data?: any;
  error?: string;
  org?: string;
  dataset?: string;
}) {
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-red-400">
        <div className="max-w-xl rounded border border-red-500 bg-slate-900 p-8 shadow-lg">
          <h2 className="mb-4 text-2xl font-bold">Something went wrong</h2>
          <p className="mb-4 whitespace-pre-wrap font-mono text-lg">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <Loading />
      </div>
    );
  }

  return (
    <TimeProvider duration={data.duration}>
      <EpisodeViewerInner data={data} org={org} dataset={dataset} />
    </TimeProvider>
  );
}

function EpisodeViewerInner({
  data,
  org,
  dataset,
}: {
  data: any;
  org?: string;
  dataset?: string;
}) {
  const {
    datasetInfo,
    episodeId,
    videosInfo,
    chartDataGroups,
    episodes,
    task,
  } = data;

  // Derive org/dataset from repoId if not provided by route
  const [orgFromRepo, datasetFromRepo] = (datasetInfo?.repoId ?? "").split("/");
  const effectiveOrg = org ?? orgFromRepo ?? "unknown-org";
  const effectiveDataset =
    dataset ?? datasetFromRepo ?? datasetInfo.repoId ?? "unknown-dataset";

  const router = useRouter();

  // Get labeller ID from localStorage
  const [labellerId, setLabellerId] = useState<string | null>(null);
  
  useEffect(() => {
    const stored = localStorage.getItem("labeller_id");
    if (!stored) {
      // Redirect to home if no labeller ID
      alert("Please enter your Labeller ID first");
      router.push("/");
    } else {
      setLabellerId(stored);
    }
  }, []); // Run once on mount only

  // Episode + frame labels state
  const [episodeLabel, setEpisodeLabel] = useState<EpisodeLabel | null>(null);
  const [frameLabels, setFrameLabels] = useState<FrameLabel[]>([]);

  // Batch save state management
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletedFrameIndices, setDeletedFrameIndices] = useState<Set<number>>(new Set());
  const [pairingWarnings, setPairingWarnings] = useState<string[]>([]);

  // Source tracking: cache metadata for the entire dataset
  const [episodesMetadataMap, setEpisodesMetadataMap] = useState<Map<number, EpisodeMetadata> | null>(null);
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null);
  const [isLoadingSourceInfo, setIsLoadingSourceInfo] = useState(true);

  // Fetch and cache episodes.jsonl metadata for the dataset (once per dataset)
  useEffect(() => {
    const loadSourceMetadata = async () => {
      setIsLoadingSourceInfo(true);
      
      try {
        const repoId = `${effectiveOrg}/${effectiveDataset}`;
        const version = await getDatasetVersion(repoId);
        const jsonlText = await fetchEpisodesJsonl(repoId, version);
        const metadataMap = parseEpisodesJsonl(jsonlText);
        
        setEpisodesMetadataMap(metadataMap);
        
        // Extract source info for current episode
        const sourceData = extractSourceInfo(episodeId, metadataMap);
        setSourceInfo(sourceData);
      } catch (error) {
        // Silently fallback - episodes.jsonl might not exist (regular dataset)
        setEpisodesMetadataMap(null);
        setSourceInfo(null);
      } finally {
        setIsLoadingSourceInfo(false);
      }
    };

    if (effectiveOrg && effectiveDataset && episodeId !== undefined) {
      loadSourceMetadata();
    }
  }, [effectiveOrg, effectiveDataset]); // Re-fetch only when dataset changes

  // Update sourceInfo when episode changes (use cached metadataMap)
  useEffect(() => {
    if (!episodesMetadataMap || episodeId === undefined) {
      setSourceInfo(null);
      return;
    }
    
    const sourceData = extractSourceInfo(episodeId, episodesMetadataMap);
    setSourceInfo(sourceData);
  }, [episodeId, episodesMetadataMap]);

  // For now, mark videos/charts as ready so you can work on UI
  const [videosReady, setVideosReady] = useState(true);
  const [chartsReady, setChartsReady] = useState(true);
  const handleVideosReady = useCallback(() => {
    setVideosReady(true);
  }, []); // setState is stable, no dependencies needed
  const isLoading = !videosReady || !chartsReady;

  const searchParams = useSearchParams();

  // Use context for time sync
  const { currentTime, setCurrentTime, setIsPlaying, isPlaying } = useTime();

  // Sidebar ref for accessing filtered episodes (for arrow key navigation)
  const sidebarRef = useRef<{ getFilteredEpisodes: () => number[] }>(null);
  
  // Episode label panel ref for getting fresh state when saving
  const episodeLabelRef = useRef<EpisodeLabelPanelRef>(null);

  // Preload adjacent episodes' videos (for smoother navigation)
  useEffect(() => {
    if (!effectiveOrg || !effectiveDataset) return;

    const preloadAdjacent = async () => {
      try {
        await getAdjacentEpisodesVideoInfo(
          effectiveOrg,
          effectiveDataset,
          episodeId,
          2,
        );
      } catch {
        // ignore preload errors
      }
    };

    preloadAdjacent();
  }, [effectiveOrg, effectiveDataset, episodeId]);

  // Initialize based on URL time parameter
  useEffect(() => {
    const timeParam = searchParams.get("t");
    if (timeParam) {
      const timeValue = parseFloat(timeParam);
      if (!isNaN(timeValue)) {
        setCurrentTime(timeValue);
      }
    }
  }, [searchParams, setCurrentTime]);

  // sync with parent window hf.co/spaces
  useEffect(() => {
    postParentMessageWithParams((params: URLSearchParams) => {
      params.set("path", window.location.pathname + window.location.search);
    });
  }, []);

  // Initialize keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { key } = e;

      // Ctrl+S / Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && key === "s") {
        e.preventDefault();
        if (hasUnsavedChanges && !isSaving) {
          handleSaveAllLabels();
        }
        return;
      }

      if (key === " ") {
        // Check if user is typing in a text field
        const activeElement = document.activeElement;
        const isTyping = activeElement?.tagName === 'TEXTAREA' || 
                         activeElement?.tagName === 'INPUT';
        if (isTyping) return; // Allow space to be typed normally
        
        e.preventDefault();
        setIsPlaying((prev: boolean) => !prev);
      } else if (key === "ArrowDown" || key === "ArrowUp") {
        e.preventDefault();
        
        // Get filtered episodes from sidebar
        const filteredEps = sidebarRef.current?.getFilteredEpisodes() || episodes;
        
        // Handle empty filter
        if (filteredEps.length === 0) return;
        
        const lowestEpisodeId = filteredEps[0];
        const highestEpisodeId = filteredEps[filteredEps.length - 1];
        
        let nextEpisodeId;
        
        // If outside range, jump to closest edge
        if (episodeId < lowestEpisodeId) {
          nextEpisodeId = lowestEpisodeId;
        } else if (episodeId > highestEpisodeId) {
          nextEpisodeId = highestEpisodeId;
        } else {
          // In range, calculate next based on arrow direction
          nextEpisodeId = key === "ArrowDown" ? episodeId + 1 : episodeId - 1;
        }
        
        // Navigate if in range
        if (
          nextEpisodeId >= lowestEpisodeId &&
          nextEpisodeId <= highestEpisodeId
        ) {
          // Check for unsaved changes before navigating
          if (hasUnsavedChanges) {
            const confirmed = window.confirm(
              "You have unsaved changes.\nLeave without saving?"
            );
            if (!confirmed) return;
          }
          router.push(`./episode_${nextEpisodeId}`);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [episodes, episodeId, router, setIsPlaying, hasUnsavedChanges, isSaving]);

  // Browser navigation guard (close tab, refresh, external links)
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // Modern browsers show generic message
    };
    
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  // Update URL ?t= param when paused, preserving fractional seconds
  const lastUrlTimeRef = useRef<number>(-1);
  useEffect(() => {
    if (isPlaying) return;

    // Round to 2 decimal places to preserve frame precision
    const roundedTime = Math.round(currentTime * 100) / 100;
    
    if (currentTime > 0 && Math.abs(lastUrlTimeRef.current - roundedTime) > 0.01) {
      lastUrlTimeRef.current = roundedTime;
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set("t", roundedTime.toString());

      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?${newParams.toString()}`,
      );

      postParentMessageWithParams((params: URLSearchParams) => {
        params.set("path", window.location.pathname + window.location.search);
      });
    }
  }, [isPlaying, currentTime, searchParams]);

  // Load episode + frame labels from Supabase whenever org/dataset/episode changes
  useEffect(() => {
    if (!labellerId) return; // Wait for labeller ID
    if (isLoadingSourceInfo) return; // Wait for source info to load
    
    const loadLabels = async () => {
      // Use source IDs if available, otherwise use current IDs
      const queryOrg = sourceInfo?.org ?? effectiveOrg;
      const queryDataset = sourceInfo?.dataset ?? effectiveDataset;
      const queryEpisode = sourceInfo?.episode ?? episodeId;
      const episodeIdStr = String(queryEpisode);

      // Episode-level label
      const { data: epData, error: epError } = await supabase
        .from("episode_labels")
        .select("labeller_id,quality_tag,key_notes,litter_items,arms_used,remarks,updated_at")
        .eq("org_id", queryOrg)
        .eq("dataset_id", queryDataset)
        .eq("episode_id", episodeIdStr)
        // .eq("labeller_id", labellerId)
        .maybeSingle();

      if (epError && epError.code !== "PGRST116") {
        console.error("Error loading episode label", epError);
      }

      if (epData) {
        setEpisodeLabel({
          orgId: queryOrg,
          datasetId: queryDataset,
          episodeId: episodeIdStr,
          labellerId: epData.labeller_id,
          qualityTag: epData.quality_tag,
          keyNotes: epData.key_notes ?? [],
          litterItems: epData.litter_items ?? {},
          armsUsed: epData.arms_used ?? null,
          remarks: epData.remarks ?? "",
          updatedAt: epData.updated_at ?? undefined,
        });
      } else {
        setEpisodeLabel(null);
      }

      // Frame-level labels
      const { data: frData, error: frError } = await supabase
        .from("frame_labels")
        .select("frame_idx,labeller_id,phase_tag,issue_tags,notes,updated_at")
        .eq("org_id", queryOrg)
        .eq("dataset_id", queryDataset)
        .eq("episode_id", episodeIdStr)
        // .eq("labeller_id", labellerId)
        .order("frame_idx", { ascending: true });

      if (frError) {
        console.error("Error loading frame labels", frError);
        setFrameLabels([]);
      } else if (frData) {
        setFrameLabels(
          frData.map((row: any) => ({
            frameIdx: row.frame_idx,
            labellerId: row.labeller_id,
            phaseTag: Array.isArray(row.phase_tag) ? row.phase_tag : (row.phase_tag ? [row.phase_tag] : []),
            issueTags: row.issue_tags ?? [],
            notes: row.notes ?? "",
            updatedAt: row.updated_at ?? undefined,
          })),
        );
      } else {
        setFrameLabels([]);
      }

      // Reset dirty flag and deleted indices after fresh load
      setHasUnsavedChanges(false);
      setDeletedFrameIndices(new Set());
      setPairingWarnings([]);
    };

    if (effectiveOrg && effectiveDataset && episodeId !== undefined) {
      loadLabels();
    }
  }, [effectiveOrg, effectiveDataset, episodeId, labellerId, sourceInfo, isLoadingSourceInfo]);

  // Clear all labels for this episode (episode + frames)
  const handleClearAllLabels = async () => {
    if (!labellerId) return;
    
    // Use source IDs if available, otherwise use current IDs
    const queryOrg = sourceInfo?.org ?? effectiveOrg;
    const queryDataset = sourceInfo?.dataset ?? effectiveDataset;
    const queryEpisode = sourceInfo?.episode ?? episodeId;
    const episodeIdStr = String(queryEpisode);

    const { error: frameErr } = await supabase
      .from("frame_labels")
      .delete()
      .eq("org_id", queryOrg)
      .eq("dataset_id", queryDataset)
      .eq("episode_id", episodeIdStr)
      // .eq("labeller_id", labellerId);

    if (frameErr) {
      console.error("Error clearing frame labels", frameErr);
    }

    const { error: epErr } = await supabase
      .from("episode_labels")
      .delete()
      .eq("org_id", queryOrg)
      .eq("dataset_id", queryDataset)
      .eq("episode_id", episodeIdStr)
      // .eq("labeller_id", labellerId);

    if (epErr) {
      console.error("Error clearing episode label", epErr);
    }

    setFrameLabels([]);
    setEpisodeLabel(null);
    setHasUnsavedChanges(false);
    setDeletedFrameIndices(new Set());
    setPairingWarnings([]);
  };

  // Callback for pairing warnings from frame label panel
  const handlePairingWarningsChange = useCallback((warnings: string[]) => {
    setPairingWarnings(warnings);
  }, []);

  // Batch save all labels (episode + all frames)
  const handleSaveAllLabels = async () => {
    if (!labellerId) return;

    // Get fresh episode label state from panel ref (handles rapid clicking accurately)
    const freshEpisodeLabel = episodeLabelRef.current?.getCurrentLabel();
    
    // Use fresh label if available, otherwise fall back to state
    const labelToSave = freshEpisodeLabel || episodeLabel;

    // Show paired tag warning if exists (confirm to proceed)
    if (pairingWarnings.length > 0) {
      const confirmed = window.confirm(
        "Warning: Some paired issue tags are unbalanced.\nPlease review the frame labeller panel.\n\nSave anyway?"
      );
      if (!confirmed) {
        return;
      }
    }

    setIsSaving(true);
    try {
      // Use source IDs if available, otherwise use current IDs
      const queryOrg = sourceInfo?.org ?? effectiveOrg;
      const queryDataset = sourceInfo?.dataset ?? effectiveDataset;
      const queryEpisode = sourceInfo?.episode ?? episodeId;
      const episodeIdStr = String(queryEpisode);

      // 1. Upsert labeller (ensure it exists)
      await supabase.from("labellers").upsert(
        { id: labellerId, name: labellerId },
        { onConflict: "id" }
      );

      // 2. Delete explicitly deleted frames first
      if (deletedFrameIndices.size > 0) {
        const { error: deleteError } = await supabase
          .from("frame_labels")
          .delete()
          .eq("org_id", queryOrg)
          .eq("dataset_id", queryDataset)
          .eq("episode_id", episodeIdStr)
          .eq("labeller_id", labellerId)
          .in("frame_idx", Array.from(deletedFrameIndices));
        
        if (deleteError) throw deleteError;
      }

      // 3. Upsert episode label (if exists)
      if (labelToSave) {
        // Filter to only include items with qty > 0
        const litterItemsFiltered = Object.fromEntries(
          Object.entries(labelToSave.litterItems || {}).filter(([_, qty]) => qty > 0)
        );
        // Use null instead of {} for consistency with armsUsed
        const litterItemsToSave = Object.keys(litterItemsFiltered).length > 0 
          ? litterItemsFiltered 
          : null;

        const episodeData = {
          org_id: queryOrg,
          dataset_id: queryDataset,
          episode_id: episodeIdStr,
          labeller_id: labellerId,
          quality_tag: labelToSave.qualityTag,
          key_notes: labelToSave.keyNotes,
          litter_items: litterItemsToSave,
          arms_used: labelToSave.armsUsed,
          remarks: labelToSave.remarks,
          updated_at: labelToSave.updatedAt || new Date().toISOString(),
        };
        
        console.log("[DEBUG] Saving episode label:", episodeData);
        
        const { error: epError } = await supabase
          .from("episode_labels")
          .upsert(episodeData, { onConflict: "org_id,dataset_id,episode_id" });
        
        if (epError) throw epError;
      }

      // 4. Batch upsert ALL frame labels
      if (frameLabels.length > 0) {
        const frameRows = frameLabels.map(label => ({
          org_id: queryOrg,
          dataset_id: queryDataset,
          episode_id: episodeIdStr,
          frame_idx: label.frameIdx,
          labeller_id: label.labellerId,
          phase_tag: label.phaseTag,
          issue_tags: label.issueTags,
          notes: label.notes,
          updated_at: label.updatedAt || new Date().toISOString(),
        }));
        
        const { error: frameError } = await supabase
          .from("frame_labels")
          .upsert(frameRows, {
            onConflict: "org_id,dataset_id,episode_id,frame_idx"
          });
        
        if (frameError) throw frameError;
      }

      // 5. Reset state on success
      setHasUnsavedChanges(false);
      setDeletedFrameIndices(new Set());
      alert("All labels saved successfully!");
    } catch (error) {
      console.error("Save failed:", error);
      alert("Failed to save labels.\nCheck console for details.");
      // Keep hasUnsavedChanges = true so user can retry
    } finally {
      setIsSaving(false);
    }
  };

  // Don't render until we have labeller ID
  if (!labellerId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <Loading />
      </div>
    );
  }

  return (
    <div className="flex h-screen max-h-screen bg-slate-950 text-gray-200">
      {/* Sidebar */}
      <Sidebar
        ref={sidebarRef}
        datasetInfo={datasetInfo}
        episodes={episodes}
        episodeId={episodeId}
        org={effectiveOrg}
        dataset={effectiveDataset}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Content */}
      <div
        className={`relative flex max-h-screen flex-col gap-4 p-4 md:flex-1 ${
          isLoading ? "overflow-hidden" : "overflow-y-auto"
        }`}
      >
        {isLoading && <Loading />}

        <div className="my-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/huggingface/lerobot"
              target="_blank"
              className="block"
            >
              <img
                src="https://github.com/huggingface/lerobot/raw/main/media/lerobot-logo-thumbnail.png"
                alt="LeRobot Logo"
                className="w-32"
              />
            </a>

            <div>
              <a
                href={`https://huggingface.co/datasets/${datasetInfo.repoId}`}
                target="_blank"
              >
                <p className="text-lg font-semibold">{datasetInfo.repoId}</p>
              </a>

              <p className="font-mono text-lg font-semibold">
                episode {episodeId}
              </p>
            </div>
          </div>
          
          <div className="text-sm text-slate-400">
            <span className="font-medium">Labeller:</span>{" "}
            <span className="font-mono text-slate-300">{labellerId}</span>
          </div>
        </div>

        {/* Videos */}
        {videosInfo.length > 0 && (
          <SimpleVideosPlayer
            videosInfo={videosInfo}
            onVideosReady={handleVideosReady}
          />
        )}

        {/* Episode-level labels */}
        <EpisodeLabelPanel
          ref={episodeLabelRef}
          orgId={effectiveOrg}
          datasetId={effectiveDataset}
          episodeId={String(episodeId)}
          labellerId={labellerId}
          initialLabel={episodeLabel ?? undefined}
          hasUnsavedChanges={hasUnsavedChanges}
          isSaving={isSaving}
          onSaveAll={handleSaveAllLabels}
          onMarkDirty={() => setHasUnsavedChanges(true)}
          onChange={(label) => setEpisodeLabel(label)}
          onClearAll={handleClearAllLabels}
          sourceInfo={sourceInfo}
        />

        {/* Language Instruction */}
        {task && (
          <div className="mt-2 rounded-lg border border-slate-600 bg-slate-800 p-3">
            <p className="text-slate-300">
              <span className="font-semibold text-slate-100">
                Language Instruction:
              </span>
            </p>
            <div className="mt-2 text-slate-300">
              {task.split("\n").map((instruction: string, index: number) => (
                <p key={index} className="mb-1">
                  {instruction}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Graph */}
        <div className="mb-4">
          <DataRecharts
            data={chartDataGroups}
            onChartsReady={() => setChartsReady(true)}
          />
        </div>

        {/* Playback + frame-level labels */}
        <PlaybackBar
          frameLabels={frameLabels}
          labellerId={labellerId}
          onFrameLabelSave={(label) => {
            // Update local state and mark dirty
            setFrameLabels((prev) => {
              const idx = prev.findIndex((l) => l.frameIdx === label.frameIdx);
              if (idx === -1) return [...prev, label];
              const copy = [...prev];
              copy[idx] = label;
              return copy;
            });
            setHasUnsavedChanges(true);
          }}
          onFrameLabelDelete={(frameIdx) => {
            // Remove from local state, track deletion, mark dirty
            setFrameLabels((prev) =>
              prev.filter((l) => l.frameIdx !== frameIdx)
            );
            setDeletedFrameIndices((prev) => new Set(prev).add(frameIdx));
            setHasUnsavedChanges(true);
          }}
          onMarkDirty={() => setHasUnsavedChanges(true)}
          onPairingWarningsChange={handlePairingWarningsChange}
        />
      </div>
    </div>
  );
}
