"use server";

import { getHfAuthHeaders } from "@/utils/hfAuth";

const DATASET_URL = process.env.DATASET_URL || "https://huggingface.co/datasets";

/**
 * Dataset information structure from info.json
 */
export interface DatasetInfo {
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
 * Server-side function to fetch dataset information from the main revision
 * This ensures proper access to environment variables via getHfAuthHeaders
 */
export async function getDatasetInfo(repoId: string): Promise<DatasetInfo> {
  try {
    const testUrl = `${DATASET_URL}/${repoId}/resolve/main/meta/info.json`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(testUrl, { 
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: getHfAuthHeaders(testUrl)
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch dataset info: ${response.status}`);
    }

    const data = await response.json();
    
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

