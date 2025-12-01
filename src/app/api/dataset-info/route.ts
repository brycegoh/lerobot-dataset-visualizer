import { NextRequest, NextResponse } from "next/server";
import { getHfAuthHeaders } from "@/utils/hfAuth";

const DATASET_URL = process.env.DATASET_URL || "https://huggingface.co/datasets";

/**
 * GET /api/dataset-info
 * 
 * Proxies requests to HuggingFace's meta/info.json endpoint with authentication.
 * This keeps the HF token secure on the server.
 * 
 * Query params:
 * - repoId: The repository ID (e.g., "org/dataset")
 * - version: Optional version/revision (defaults to "main")
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const repoId = searchParams.get("repoId");
  const version = searchParams.get("version") || "main";

  if (!repoId) {
    return NextResponse.json(
      { error: "Missing required parameter: repoId" },
      { status: 400 }
    );
  }

  const infoUrl = `${DATASET_URL}/${repoId}/resolve/${version}/meta/info.json`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch(infoUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: getHfAuthHeaders(infoUrl),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch dataset info: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return NextResponse.json(
          { error: "Request timed out" },
          { status: 504 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch dataset info" },
      { status: 500 }
    );
  }
}

