/**
 * Utility functions for checking dataset version compatibility
 */

import { getHfAuthHeaders } from "./hfAuth";

const DATASET_URL = process.env.DATASET_URL || "https://huggingface.co/datasets";

/**
 * Dataset information structure from info.json
 */
interface DatasetInfo {
  codebase_version: string;
  robot_type: string | null;
  total_episodes: number;
  total_frames: number;
  total_tasks: number;
  chunks_size: number;
  data_files_size_in_mb: number;
  video_files_size_in_mb: number;
  fps: number;
  splits: Record<string, string>;
  data_path: string;
  video_path: string;
  features: Record<string, any>;
}

/**
 * Fetches dataset info.
 * - Server-side: calls HuggingFace directly with auth headers
 * - Client-side: uses the API route to keep token secure
 */
export async function fetchDatasetInfoFromApi(repoId: string, version: string = "main"): Promise<DatasetInfo> {
  const isServer = typeof window === "undefined";
  
  if (isServer) {
    // Server-side: call HuggingFace directly (has access to env vars)
    const infoUrl = `${DATASET_URL}/${repoId}/resolve/main/meta/info.json`;
    const response = await fetch(infoUrl, {
      method: "GET",
      cache: "no-store",
      headers: getHfAuthHeaders(infoUrl),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch dataset info: ${response.status}`);
    }
    
    return response.json();
  } else {
    // Client-side: use API route to keep token secure
    const apiUrl = `/api/dataset-info?repoId=${encodeURIComponent(repoId)}&version=${encodeURIComponent(version)}`;
    
    const response = await fetch(apiUrl, {
      method: "GET",
      cache: "no-store",
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch dataset info: ${response.status}`);
    }
    
    return response.json();
  }
}

/**
 * Fetches dataset information from the main revision
 */
export async function getDatasetInfo(repoId: string): Promise<DatasetInfo> {
  try {
    const data = await fetchDatasetInfoFromApi(repoId, "main");
    
    // Check if it has the required structure
    if (!data.features) {
      throw new Error("Dataset info.json does not have the expected features structure");
    }
    
    return data as DatasetInfo;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(
      `Dataset ${repoId} is not compatible with this visualizer. ` +
      "Failed to read dataset information from the main revision."
    );
  }
}


/**
 * Gets the dataset version by reading the codebase_version from the main revision's info.json
 */
export async function getDatasetVersion(repoId: string): Promise<string> {
  try {
    const datasetInfo = await getDatasetInfo(repoId);
    
    // Extract codebase_version
    const codebaseVersion = datasetInfo.codebase_version;
    if (!codebaseVersion) {
      throw new Error("Dataset info.json does not contain codebase_version");
    }
    
    // Validate that it's a supported version
    const supportedVersions = ["v3.0", "v2.1", "v2.0"];
    if (!supportedVersions.includes(codebaseVersion)) {
      throw new Error(
        `Dataset ${repoId} has codebase version ${codebaseVersion}, which is not supported. ` +
        "This tool only works with dataset versions 3.0, 2.1, or 2.0. " +
        "Please use a compatible dataset version."
      );
    }
    
    return codebaseVersion;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(
      `Dataset ${repoId} is not compatible with this visualizer. ` +
      "Failed to read dataset information from the main revision."
    );
  }
}

export function buildVersionedUrl(repoId: string, version: string, path: string): string {
  return `${DATASET_URL}/${repoId}/resolve/main/${path}`;
}

