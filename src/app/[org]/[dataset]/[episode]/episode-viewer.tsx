"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
} from "@/components/episode-label-panel";
import type { FrameLabel } from "@/components/frame-label-panel";
import { supabase } from "@/utils/supabaseClient";

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

  // Episode + frame labels state
  const [episodeLabel, setEpisodeLabel] = useState<EpisodeLabel | null>(null);
  const [frameLabels, setFrameLabels] = useState<FrameLabel[]>([]);

  // For now, mark videos/charts as ready so you can work on UI
  const [videosReady, setVideosReady] = useState(true);
  const [chartsReady, setChartsReady] = useState(true);
  const handleVideosReady = useCallback(() => {
    setVideosReady(true);
  }, [setVideosReady]);
  const isLoading = !videosReady || !chartsReady;

  const router = useRouter();
  const searchParams = useSearchParams();

  // Use context for time sync
  const { currentTime, setCurrentTime, setIsPlaying, isPlaying } = useTime();

  // Pagination state
  const pageSize = 100;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(episodes.length / pageSize);
  const paginatedEpisodes = episodes.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

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

  // Initialize page & keyboard listener
  useEffect(() => {
    // Initialize page based on current episode
    const episodeIndex = episodes.indexOf(episodeId);
    if (episodeIndex !== -1) {
      setCurrentPage(Math.floor(episodeIndex / pageSize) + 1);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const { key } = e;

      if (key === " ") {
        e.preventDefault();
        setIsPlaying((prev: boolean) => !prev);
      } else if (key === "ArrowDown" || key === "ArrowUp") {
        e.preventDefault();
        const nextEpisodeId =
          key === "ArrowDown" ? episodeId + 1 : episodeId - 1;
        const lowestEpisodeId = episodes[0];
        const highestEpisodeId = episodes[episodes.length - 1];

        if (
          nextEpisodeId >= lowestEpisodeId &&
          nextEpisodeId <= highestEpisodeId
        ) {
          router.push(`./episode_${nextEpisodeId}`);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [episodes, episodeId, pageSize, router, setIsPlaying]);

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
    const loadLabels = async () => {
      const episodeIdStr = String(episodeId);

      // Episode-level label
      const { data: epData, error: epError } = await supabase
        .from("episode_labels")
        .select("quality_tag,key_notes,remarks,updated_at")
        .eq("org_id", effectiveOrg)
        .eq("dataset_id", effectiveDataset)
        .eq("episode_id", episodeIdStr)
        .maybeSingle();

      if (epError && epError.code !== "PGRST116") {
        console.error("Error loading episode label", epError);
      }

      if (epData) {
        setEpisodeLabel({
          orgId: effectiveOrg,
          datasetId: effectiveDataset,
          episodeId: episodeIdStr,
          qualityTag: epData.quality_tag,
          keyNotes: epData.key_notes ?? [],
          remarks: epData.remarks ?? "",
          updatedAt: epData.updated_at ?? undefined,
        });
      } else {
        setEpisodeLabel(null);
      }

      // Frame-level labels
      const { data: frData, error: frError } = await supabase
        .from("frame_labels")
        .select("frame_idx,phase_tag,issue_tags,notes,updated_at")
        .eq("org_id", effectiveOrg)
        .eq("dataset_id", effectiveDataset)
        .eq("episode_id", episodeIdStr)
        .order("frame_idx", { ascending: true });

      if (frError) {
        console.error("Error loading frame labels", frError);
        setFrameLabels([]);
      } else if (frData) {
        setFrameLabels(
          frData.map((row: any) => ({
            frameIdx: row.frame_idx,
            phaseTag: row.phase_tag,
            issueTags: row.issue_tags ?? [],
            notes: row.notes ?? "",
            updatedAt: row.updated_at ?? undefined,
          })),
        );
      } else {
        setFrameLabels([]);
      }
    };

    if (effectiveOrg && effectiveDataset && episodeId !== undefined) {
      loadLabels();
    }
  }, [effectiveOrg, effectiveDataset, episodeId]);

  // Pagination functions
  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  // Clear all labels for this episode (episode + frames)
  const handleClearAllLabels = async () => {
    const episodeIdStr = String(episodeId);

    const { error: frameErr } = await supabase
      .from("frame_labels")
      .delete()
      .eq("org_id", effectiveOrg)
      .eq("dataset_id", effectiveDataset)
      .eq("episode_id", episodeIdStr);

    if (frameErr) {
      console.error("Error clearing frame labels", frameErr);
    }

    const { error: epErr } = await supabase
      .from("episode_labels")
      .delete()
      .eq("org_id", effectiveOrg)
      .eq("dataset_id", effectiveDataset)
      .eq("episode_id", episodeIdStr);

    if (epErr) {
      console.error("Error clearing episode label", epErr);
    }

    setFrameLabels([]);
    setEpisodeLabel(null);
  };

  return (
    <div className="flex h-screen max-h-screen bg-slate-950 text-gray-200">
      {/* Sidebar */}
      <Sidebar
        datasetInfo={datasetInfo}
        paginatedEpisodes={paginatedEpisodes}
        episodeId={episodeId}
        totalPages={totalPages}
        currentPage={currentPage}
        prevPage={prevPage}
        nextPage={nextPage}
      />

      {/* Content */}
      <div
        className={`relative flex max-h-screen flex-col gap-4 p-4 md:flex-1 ${
          isLoading ? "overflow-hidden" : "overflow-y-auto"
        }`}
      >
        {isLoading && <Loading />}

        <div className="my-4 flex items-center justify-start">
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

        {/* Videos */}
        {videosInfo.length > 0 && (
          <SimpleVideosPlayer
            videosInfo={videosInfo}
            onVideosReady={handleVideosReady}
          />
        )}

        {/* Language Instruction */}
        {task && (
          <div className="mb-3 rounded-lg border border-slate-600 bg-slate-800 p-3">
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

        {/* Episode-level labels */}
        <EpisodeLabelPanel
          orgId={effectiveOrg}
          datasetId={effectiveDataset}
          episodeId={String(episodeId)}
          initialLabel={episodeLabel ?? undefined}
          onSave={async (label) => {
            const { qualityTag, keyNotes, remarks, updatedAt } = label;

            const { error } = await supabase
              .from("episode_labels")
              .upsert(
                {
                  org_id: effectiveOrg,
                  dataset_id: effectiveDataset,
                  episode_id: String(episodeId),
                  quality_tag: qualityTag,
                  key_notes: keyNotes,
                  remarks,
                  updated_at: updatedAt,
                },
                { onConflict: "org_id,dataset_id,episode_id" },
              );

            if (error) {
              console.error("Error saving episode label", error);
            } else {
              console.log("Episode label saved to DB");
              setEpisodeLabel(label);
            }
          }}
          onClearAll={handleClearAllLabels}
        />

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
          onFrameLabelSave={async (label) => {
            const { frameIdx, phaseTag, issueTags, notes, updatedAt } = label;

            const { error } = await supabase
              .from("frame_labels")
              .upsert(
                {
                  org_id: effectiveOrg,
                  dataset_id: effectiveDataset,
                  episode_id: String(episodeId),
                  frame_idx: frameIdx,
                  phase_tag: phaseTag,
                  issue_tags: issueTags,
                  notes,
                  updated_at: updatedAt,
                },
                { onConflict: "org_id,dataset_id,episode_id,frame_idx" },
              );

            if (error) {
              console.error("Error saving frame label", error);
            } else {
              console.log("Frame label saved to DB");
              setFrameLabels((prev) => {
                const idx = prev.findIndex((l) => l.frameIdx === frameIdx);
                if (idx === -1) return [...prev, label];
                const copy = [...prev];
                copy[idx] = label;
                return copy;
              });
            }
          }}
          onFrameLabelDelete={async (frameIdx) => {
            const { error } = await supabase
              .from("frame_labels")
              .delete()
              .eq("org_id", effectiveOrg)
              .eq("dataset_id", effectiveDataset)
              .eq("episode_id", String(episodeId))
              .eq("frame_idx", frameIdx);

            if (error) {
              console.error("Error deleting frame label", error);
            } else {
              console.log("Frame label deleted from DB", frameIdx);
              setFrameLabels((prev) =>
                prev.filter((l) => l.frameIdx !== frameIdx),
              );
            }
          }}
        />
      </div>
    </div>
  );
}
