// Declare process for TypeScript (available in Node.js and Next.js server runtime)
declare const process: { env: Record<string, string | undefined> } | undefined;

export function getHfAuthHeaders(url?: string): HeadersInit {
  // Access process.env directly (works in Next.js server components and API routes)
  // This function should only be called from server-side code to avoid exposing tokens to the client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeProcess = typeof process !== 'undefined' 
    ? process 
    : (typeof (globalThis as any).process !== 'undefined' 
        ? (globalThis as any).process 
        : undefined);
  
  // Try to access process.env directly, fallback to globalThis.process.env
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env: Record<string, string | undefined> = 
    nodeProcess?.env ?? 
    ((globalThis as any)?.process?.env as Record<string, string | undefined> | undefined) ?? 
    {};
  
  const token =
    env.HF_TOKEN ||
    env.HUGGINGFACE_TOKEN ||
    env.HF_ACCESS_TOKEN ||
    env.HUGGINGFACEHUB_API_TOKEN;

  const shouldAttach = !url || url.includes("huggingface.co");

  if (token && shouldAttach) {
    return { Authorization: `Bearer ${token}` };
  }

  return {};
}


