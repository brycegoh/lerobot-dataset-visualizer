"use client";

import Link from "next/link";
import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from "react";

interface SidebarProps {
  datasetInfo: any;
  episodes: any[];
  episodeId: any;
  org: string;
  dataset: string;
  hasUnsavedChanges?: boolean;
}

export interface SidebarRef {
  getFilteredEpisodes: () => number[];
}

const Sidebar = forwardRef<SidebarRef, SidebarProps>(({
  datasetInfo,
  episodes,
  episodeId,
  org,
  dataset,
  hasUnsavedChanges = false,
}, ref) => {
  // Episode filter state
  const [episodeRangeInput, setEpisodeRangeInput] = useState("");
  const [filterError, setFilterError] = useState("");

  // Load filter from localStorage on mount
  useEffect(() => {
    const key = `episode_filter_${org}_${dataset}`;
    const saved = localStorage.getItem(key);
    if (saved) setEpisodeRangeInput(saved);
  }, [org, dataset]);

  // Save filter to localStorage on change
  useEffect(() => {
    const key = `episode_filter_${org}_${dataset}`;
    localStorage.setItem(key, episodeRangeInput);
  }, [episodeRangeInput, org, dataset]);

  // Validate input whenever it changes
  useEffect(() => {
    if (!episodeRangeInput.trim()) {
      setFilterError("");
      return;
    }
    
    const parts = episodeRangeInput.trim().split("-");
    const start = parseInt(parts[0]);
    const end = parts.length > 1 ? parseInt(parts[1]) : start;
    
    if (isNaN(start) || isNaN(end) || start > end) {
      setFilterError("Invalid input");
    } else {
      setFilterError("");
    }
  }, [episodeRangeInput]);

  // Filter episodes based on valid input
  const filteredEpisodes = useMemo(() => {
    if (!episodeRangeInput.trim() || filterError) return episodes;
    
    const parts = episodeRangeInput.trim().split("-");
    const start = parseInt(parts[0]);
    const end = parts.length > 1 ? parseInt(parts[1]) : start;
    
    return episodes.filter((ep: any) => ep >= start && ep <= end);
  }, [episodes, episodeRangeInput, filterError]);

  // Expose filtered episodes via ref
  useImperativeHandle(ref, () => ({
    getFilteredEpisodes: () => filteredEpisodes
  }));

  // Pagination state
  const pageSize = 100;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(filteredEpisodes.length / pageSize);
  const paginatedEpisodes = useMemo(
    () => filteredEpisodes.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredEpisodes, currentPage, pageSize]
  );

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [episodeRangeInput]);

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

  const [sidebarVisible, setSidebarVisible] = React.useState(true);
  const toggleSidebar = () => setSidebarVisible((prev) => !prev);

  const sidebarRef = React.useRef<HTMLDivElement>(null);

  // Handler for episode link clicks with unsaved changes check
  const handleEpisodeClick = (e: React.MouseEvent<HTMLAnchorElement>, targetEpisode: any) => {
    if (hasUnsavedChanges && targetEpisode !== episodeId) {
      const confirmed = window.confirm(
        "You have unsaved changes.\nLeave without saving?"
      );
      if (!confirmed) {
        e.preventDefault();
      }
    }
  };

  React.useEffect(() => {
    if (!sidebarVisible) return;
    function handleClickOutside(event: MouseEvent) {
      // If click is outside the sidebar nav
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        setTimeout(() => setSidebarVisible(false), 500);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [sidebarVisible]);

  return (
    <div className="flex z-10 min-h-screen absolute md:static" ref={sidebarRef}>
      <nav
        className={`shrink-0 overflow-y-auto bg-slate-900 p-5 break-words md:max-h-screen w-60 md:shrink ${
          !sidebarVisible ? "hidden" : ""
        }`}
        aria-label="Sidebar navigation"
      >
        <ul>
          <li>Number of samples/frames: {datasetInfo.total_frames}</li>
          <li>Number of episodes: {datasetInfo.total_episodes}</li>
          <li>Frames per second: {datasetInfo.fps}</li>
        </ul>

        <p>Episodes:</p>

        {/* Episode range filter */}
        <div className="mt-2 mb-2">
          {filterError && (
            <p className="text-red-500 text-xs mb-1">{filterError}</p>
          )}
          <input
            type="text"
            placeholder="e.g., 114-150"
            value={episodeRangeInput}
            onChange={(e) => setEpisodeRangeInput(e.target.value)}
            className="w-full px-2 py-1 text-sm bg-slate-800 rounded border border-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        {/* episodes menu for medium & large screens */}
        <div className="ml-2 block">
          <ul>
            {paginatedEpisodes.map((episode) => (
              <li key={episode} className="mt-0.5 font-mono text-sm">
                <Link
                  href={`./episode_${episode}`}
                  className={`underline ${episode === episodeId ? "-ml-1 font-bold" : ""}`}
                  onClick={(e) => handleEpisodeClick(e, episode)}
                >
                  Episode {episode}
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center text-xs">
              <button
                onClick={prevPage}
                className={`mr-2 rounded bg-slate-800 px-2 py-1 ${
                  currentPage === 1 ? "cursor-not-allowed opacity-50" : ""
                }`}
                disabled={currentPage === 1}
              >
                « Prev
              </button>
              <span className="mr-2 font-mono">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={nextPage}
                className={`rounded bg-slate-800 px-2 py-1 ${
                  currentPage === totalPages
                    ? "cursor-not-allowed opacity-50"
                    : ""
                }`}
                disabled={currentPage === totalPages}
              >
                Next »
              </button>
            </div>
          )}
        </div>
      </nav>
      {/* Toggle sidebar button */}
      <button
        className="mx-1 flex items-center opacity-50 hover:opacity-100 focus:outline-none focus:ring-0"
        onClick={toggleSidebar}
        title="Toggle sidebar"
      >
        <div className="h-10 w-2 rounded-full bg-slate-500"></div>
      </button>
    </div>
  );
});

Sidebar.displayName = "Sidebar";

export default Sidebar;
