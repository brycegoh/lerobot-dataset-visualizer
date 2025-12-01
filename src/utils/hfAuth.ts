export function getHfAuthHeaders(url?: string): HeadersInit {
  const token =
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_TOKEN ||
    process.env.HF_ACCESS_TOKEN ||
    process.env.HUGGINGFACEHUB_API_TOKEN;

  const shouldAttach = !url || url.includes("huggingface.co");

  if (token && shouldAttach) {
    return { Authorization: `Bearer ${token}` };
  }

  return {};
}


