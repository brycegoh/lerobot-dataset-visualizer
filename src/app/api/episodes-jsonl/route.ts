import { NextRequest, NextResponse } from "next/server";
import { getHfAuthHeaders } from "@/utils/hfAuth";

const DATASET_URL = process.env.DATASET_URL || "https://huggingface.co/datasets";

/**
 * GET /api/episodes-jsonl
 * 
 * Proxies requests to HuggingFace's meta/episodes.jsonl endpoint with authentication.
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

  const jsonlUrl = `${DATASET_URL}/${repoId}/resolve/${version}/meta/episodes.jsonl`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch(jsonlUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: getHfAuthHeaders(jsonlUrl),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch episodes.jsonl: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const text = await response.text();
    
    // Return plain text response
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
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
      { error: "Failed to fetch episodes.jsonl" },
      { status: 500 }
    );
  }
}

