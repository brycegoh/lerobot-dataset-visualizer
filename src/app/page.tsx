"use client";
import { useEffect, useRef, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [labellerId, setLabellerId] = useState<string>("");
  const [datasetInput, setDatasetInput] = useState<string>("");

  // Load labeller ID from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("labeller_id");
    if (stored) {
      setLabellerId(stored);
    }
  }, []);

  // Handle redirects with useEffect instead of direct redirect
  useEffect(() => {
    // Redirect to the first episode of the dataset if REPO_ID is defined
    if (process.env.REPO_ID) {
      const episodeN = process.env.EPISODES
        ?.split(/\s+/)
        .map((x) => parseInt(x.trim(), 10))
        .filter((x) => !isNaN(x))[0] ?? 0;

      router.push(`/${process.env.REPO_ID}/episode_${episodeN}`);
      return;
    }
    
    // sync with hf.co/spaces URL params
    if (searchParams.get('path')) {
      router.push(searchParams.get('path')!);
      return;
    }

    // legacy sync with hf.co/spaces URL params
    let redirectUrl: string | null = null;
    if (searchParams.get('dataset') && searchParams.get('episode')) {
      redirectUrl = `/${searchParams.get('dataset')}/episode_${searchParams.get('episode')}`;
    } else if (searchParams.get('dataset')) {
      redirectUrl = `/${searchParams.get('dataset')}`;
    }

    if (redirectUrl && searchParams.get('t')) {
      redirectUrl += `?t=${searchParams.get('t')}`;
    }

    if (redirectUrl) {
      router.push(redirectUrl);
      return;
    }
  }, [searchParams, router]);

  const playerRef = useRef<any>(null);

  useEffect(() => {
    // Load YouTube IFrame API if not already present
    if (!(window as any).YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
    let interval: NodeJS.Timeout;
    (window as any).onYouTubeIframeAPIReady = () => {
      playerRef.current = new (window as any).YT.Player("yt-bg-player", {
        videoId: "Er8SPJsIYr0",
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          showinfo: 0,
          modestbranding: 1,
          rel: 0,
          loop: 1,
          fs: 0,
          playlist: "Er8SPJsIYr0",
          start: 0,
        },
        events: {
          onReady: (event: any) => {
            event.target.playVideo();
            event.target.mute();
            interval = setInterval(() => {
              const t = event.target.getCurrentTime();
              if (t >= 60) {
                event.target.seekTo(0);
              }
            }, 500);
          },
        },
      });
    };
    return () => {
      if (interval) clearInterval(interval);
      if (playerRef.current && playerRef.current.destroy)
        playerRef.current.destroy();
    };
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const labellerIdRef = useRef<HTMLInputElement>(null);

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    const datasetValue = inputRef.current?.value.trim();
    const labellerValue = labellerIdRef.current?.value.trim();
    
    if (datasetValue && labellerValue) {
      // Validate labeller ID: no spaces
      if (labellerValue.includes(" ")) {
        alert("Labeller ID cannot contain spaces");
        return;
      }
      
      // Store labeller ID in localStorage
      localStorage.setItem("labeller_id", labellerValue);
      
      router.push(datasetValue);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* YouTube Video Background */}
      <div className="video-background">
        <div id="yt-bg-player" />
      </div>
      {/* Overlay */}
      <div className="fixed top-0 right-0 bottom-0 left-0 bg-black/60 -z-0" />
      {/* Centered Content */}
      <div className="relative z-10 h-screen flex flex-col items-center justify-center text-white text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 drop-shadow-lg">
          LeRobot Dataset Visualizer
        </h1>
        <a
          href="https://x.com/RemiCadene/status/1825455895561859185"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 font-medium text-lg underline mb-8 inline-block hover:text-sky-300 transition-colors"
        >
          create & train your own robots
        </a>
        <form onSubmit={handleGo} className="flex flex-col gap-3 justify-center mt-6 min-w-[320px]">
          <input
            ref={labellerIdRef}
            type="text"
            placeholder="Enter your labeller ID (e.g. test_user)"
            value={labellerId}
            onChange={(e) => setLabellerId(e.target.value)}
            className="px-4 py-2 rounded-md text-base text-white bg-slate-900/80 placeholder-slate-400 border border-sky-500/50 focus:outline-none focus:bg-slate-900 focus:ring-2 focus:ring-sky-400 focus:border-sky-400 shadow-md transition-all"
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Enter dataset id (e.g. lerobot/visualize_dataset)"
            value={datasetInput}
            onChange={(e) => setDatasetInput(e.target.value)}
            className="px-4 py-2 rounded-md text-base text-white bg-slate-900/80 placeholder-slate-400 border border-sky-500/50 focus:outline-none focus:bg-slate-900 focus:ring-2 focus:ring-sky-400 focus:border-sky-400 shadow-md transition-all"
          />
          <button
            type="submit"
            disabled={!labellerId.trim() || !datasetInput.trim()}
            className="px-5 py-2 rounded-md bg-sky-400 text-black font-semibold text-base hover:bg-sky-300 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Go
          </button>
        </form>
        {/* Example Datasets */}
        <div className="mt-8">
          <div className="font-semibold mb-2 text-lg">Example Datasets:</div>
          <div className="flex flex-col gap-2 items-center">
            {[
              "lerobot/aloha_static_cups_open",
              "lerobot/columbia_cairlab_pusht_real",
              "lerobot/taco_play",
            ].map((ds) => (
              <button
                key={ds}
                type="button"
                className="px-4 py-2 rounded bg-slate-700 text-sky-200 hover:bg-sky-700 hover:text-white transition-colors shadow"
                onClick={() => {
                  if (inputRef.current && labellerIdRef.current) {
                    const labellerValue = labellerIdRef.current.value.trim();
                    
                    if (!labellerValue) {
                      alert("Please enter your Labeller ID first");
                      labellerIdRef.current.focus();
                      return;
                    }
                    
                    if (labellerValue.includes(" ")) {
                      alert("Labeller ID cannot contain spaces");
                      return;
                    }
                    
                    inputRef.current.value = ds;
                    setDatasetInput(ds);
                    localStorage.setItem("labeller_id", labellerValue);
                  }
                  router.push(ds);
                }}
              >
                {ds}
              </button>
            ))}
          </div>
        </div>

        <Link
          href="/explore"
          className="inline-block px-6 py-3 mt-8 rounded-md bg-sky-500 text-white font-semibold text-lg shadow-lg hover:bg-sky-400 transition-colors"
        >
          Explore Open Datasets
        </Link>
      </div>
    </div>
  );
}
