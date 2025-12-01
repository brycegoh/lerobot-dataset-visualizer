/**
 * Episode metadata structure from episodes.jsonl
 */
export interface EpisodeMetadata {
  episode_index: number;
  tasks?: string[];
  length?: number;
  source_episode_index?: number;
  source_repo_id?: string;
}

/**
 * Parsed source repository information
 */
export interface SourceInfo {
  org: string;
  dataset: string;
  episode: number;
}

/**
 * Fetches episodes.jsonl via the internal API route.
 * This keeps the HF token secure on the server side.
 */
export async function fetchEpisodesJsonl(
  repoId: string,
  version: string
): Promise<string> {
  // Determine base URL for API calls
  // In server context, we need absolute URL; in client, relative works
  const baseUrl = typeof window === "undefined" 
    ? (process.env.NEXT_PUBLIC_BASE_URL || 
       (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"))
    : "";
  
  const apiUrl = `${baseUrl}/api/episodes-jsonl?repoId=${encodeURIComponent(repoId)}&version=${encodeURIComponent(version)}`;
  
  const response = await fetch(apiUrl, {
    method: "GET",
    cache: "no-store",
  });
  
  if (!response.ok) {
    // Try to get error message from JSON response
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch episodes.jsonl: ${response.status}`);
    }
    throw new Error(`Failed to fetch episodes.jsonl: ${response.status}`);
  }
  
  return await response.text();
}

/**
 * Parses a single JSONL line
 */
export function parseJsonlLine(line: string): EpisodeMetadata | null {
  try {
    if (!line.trim()) return null;
    return JSON.parse(line) as EpisodeMetadata;
  } catch (error) {
    console.error("Failed to parse JSONL line:", line, error);
    return null;
  }
}

/**
 * Parses entire episodes.jsonl into a Map of episode_index -> metadata
 */
export function parseEpisodesJsonl(jsonlText: string): Map<number, EpisodeMetadata> {
  const map = new Map<number, EpisodeMetadata>();
  const lines = jsonlText.split("\n");
  
  for (const line of lines) {
    const metadata = parseJsonlLine(line);
    if (metadata && metadata.episode_index !== undefined) {
      map.set(metadata.episode_index, metadata);
    }
  }
  
  return map;
}

/**
 * Parses source_repo_id into org and dataset
 * Handles formats like "org/dataset" or "org/sub/dataset"
 */
export function parseSourceRepoId(sourceRepoId: string): { org: string; dataset: string } | null {
  if (!sourceRepoId) return null;
  
  const parts = sourceRepoId.split("/");
  if (parts.length < 2) return null;
  
  // First part is org, rest is dataset path
  const [org, ...datasetParts] = parts;
  const dataset = datasetParts.join("/");
  
  return { org, dataset };
}

/**
 * Extracts source information for a specific episode
 * Returns null if no source info exists (regular dataset)
 */
export function extractSourceInfo(
  episodeIndex: number,
  metadataMap: Map<number, EpisodeMetadata>
): SourceInfo | null {
  const metadata = metadataMap.get(episodeIndex);
  
  if (!metadata) return null;
  
  // Check if source fields exist
  if (!metadata.source_repo_id || metadata.source_episode_index === undefined) {
    return null; // No source info - regular dataset
  }
  
  const parsed = parseSourceRepoId(metadata.source_repo_id);
  if (!parsed) return null;
  
  return {
    org: parsed.org,
    dataset: parsed.dataset,
    episode: metadata.source_episode_index,
  };
}

