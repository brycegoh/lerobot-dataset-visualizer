"use client";

import React from "react";
import { useTime } from "../context/time-context";
import {
  FaPlay,
  FaPause,
  FaBackward,
  FaForward,
  FaUndoAlt,
  FaArrowDown,
  FaArrowUp,
} from "react-icons/fa";

import { debounce } from "@/utils/debounce";
import { FrameLabelPanel, FrameLabel } from "@/components/frame-label-panel";

type PlaybackBarProps = {
  labellerId: string;
  onFrameLabelSave?: (label: FrameLabel) => void | Promise<void>;
  onFrameLabelDelete?: (frameIdx: number) => void | Promise<void>;
  onMarkDirty?: () => void;
  onPairingWarningsChange?: (warnings: string[]) => void;
  frameLabels?: FrameLabel[];
};

const FPS = 30;

const PlaybackBar: React.FC<PlaybackBarProps> = ({
  labellerId,
  onFrameLabelSave,
  onFrameLabelDelete,
  onMarkDirty,
  onPairingWarningsChange,
  frameLabels = [],
}) => {
  const { duration, isPlaying, setIsPlaying, currentTime, setCurrentTime } =
    useTime();

  const sliderActiveRef = React.useRef(false);
  const wasPlayingRef = React.useRef(false);
  const [sliderValue, setSliderValue] = React.useState(currentTime);

  // For clicking markers to open the editor for a specific frame
  const [editFrameIdx, setEditFrameIdx] = React.useState<number | null>(null);

  // Only update sliderValue from context if not dragging
  React.useEffect(() => {
    if (!sliderActiveRef.current) {
      setSliderValue(currentTime);
    }
  }, [currentTime]);

  const updateTime = debounce((t: number) => {
    // console.log('[Slider] Debounced setCurrentTime:', t.toFixed(2));
    setCurrentTime(t);
  }, 200);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    setSliderValue(t);
    updateTime(t);
  };

  const handleSliderMouseDown = () => {
    // console.log('[Slider] MouseDown - pausing');
    sliderActiveRef.current = true;
    wasPlayingRef.current = isPlaying;
    setIsPlaying(false);
  };

  const handleSliderMouseUp = () => {
    // console.log('[Slider] MouseUp - seeking to:', sliderValue.toFixed(2));
    sliderActiveRef.current = false;
    setCurrentTime(sliderValue); // Snap to final value
    if (wasPlayingRef.current) {
      // console.log('[Slider] MouseUp - resuming play');
      setIsPlaying(true);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto sticky bottom-0 mt-auto space-y-2">
      {/* Frame labels panel, visually attached above the bar */}
      <FrameLabelPanel
        labellerId={labellerId}
        onSave={onFrameLabelSave}
        onDelete={onFrameLabelDelete}
        onMarkDirty={onMarkDirty}
        onPairingWarningsChange={onPairingWarningsChange}
        initialLabels={frameLabels}
        editFrameIdx={editFrameIdx}
        onEditFrameConsumed={() => setEditFrameIdx(null)}
      />

      {/* Playback controls pill + slider + markers */}
      <div className="flex items-center gap-4 w-full bg-slate-900/95 px-4 py-3 rounded-3xl">
        <button
          title="Jump backward 5 seconds"
          onClick={() => {
            setIsPlaying(false);
            setCurrentTime(Math.max(0, currentTime - 5));
          }}
          className="text-2xl hidden md:block"
        >
          <FaBackward size={24} />
        </button>
        <button
          className={`text-3xl transition-transform ${
            isPlaying ? "scale-90 opacity-60" : "scale-110"
          }`}
          title="Play. Toggle with Space"
          onClick={() => setIsPlaying(true)}
          style={{ display: isPlaying ? "none" : "inline-block" }}
        >
          <FaPlay size={24} />
        </button>
        <button
          className={`text-3xl transition-transform ${
            !isPlaying ? "scale-90 opacity-60" : "scale-110"
          }`}
          title="Pause. Toggle with Space"
          onClick={() => setIsPlaying(false)}
          style={{ display: !isPlaying ? "none" : "inline-block" }}
        >
          <FaPause size={24} />
        </button>
        <button
          title="Jump forward 5 seconds"
          onClick={() => {
            setIsPlaying(false);
            setCurrentTime(Math.min(duration, currentTime + 5));
          }}
          className="text-2xl hidden md:block"
        >
          <FaForward size={24} />
        </button>
        <button
          title="Rewind from start"
          onClick={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          className="text-2xl hidden md:block"
        >
          <FaUndoAlt size={24} />
        </button>

        {/* Slider + triangle markers */}
        <div className="relative flex-1 mx-2">
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={sliderValue}
            onChange={handleSliderChange}
            onMouseDown={handleSliderMouseDown}
            onMouseUp={handleSliderMouseUp}
            onTouchStart={handleSliderMouseDown}
            onTouchEnd={handleSliderMouseUp}
            className="w-full accent-orange-500 focus:outline-none focus:ring-0 relative z-10"
            aria-label="Seek video"
          />

          {/* Frame label markers as triangles above the bar */}
          {duration > 0 && frameLabels.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 -top-4 z-20">
              {frameLabels.map((label) => {
                const time = label.frameIdx / FPS;
                if (!Number.isFinite(time) || time < 0 || time > duration) {
                  return null;
                }
                const pct = (time / duration) * 100;

                return (
                  <button
                    key={label.frameIdx}
                    type="button"
                    className="pointer-events-auto absolute -translate-x-1/2"
                    style={{ left: `${pct}%` }}
                    title={`Frame ${label.frameIdx} @ ${time.toFixed(2)}s`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPlaying(false);
                      setCurrentTime(time);
                      setEditFrameIdx(label.frameIdx);
                    }}
                  >
                    {/* Triangle marker */}
                    <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent border-t-emerald-400 drop-shadow" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <span className="w-16 text-right tabular-nums text-xs text-slate-200 shrink-0">
          {Math.floor(sliderValue)} / {Math.floor(duration)}
        </span>

        <div className="text-xs text-slate-300 select-none ml-8 flex-col gap-y-0.5 hidden md:flex">
          <p>
            <span className="inline-flex items-center gap-1 font-mono align-middle">
              <span className="px-2 py-0.5 rounded border border-slate-400 bg-slate-800 text-slate-200 text-xs shadow-inner">
                Space
              </span>
            </span>{" "}
            to pause/unpause
          </p>
          <p>
            <span className="inline-flex items-center gap-1 font-mono align-middle">
              <FaArrowUp size={14} />/<FaArrowDown size={14} />
            </span>{" "}
            to previous/next episode
          </p>
        </div>
      </div>
    </div>
  );
};

export default PlaybackBar;
