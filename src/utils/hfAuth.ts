export function getHfAuthHeaders(url?: string): HeadersInit {
  // In server-side contexts, process.env is available directly
  // In client-side contexts, it won't be available (which is expected)
  const env = typeof process !== 'undefined' && process.env 
    ? process.env 
    : (globalThis as any)?.process?.env ?? {};
  
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


