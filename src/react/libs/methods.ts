/**
 * HTTP method display labels for compact badge rendering.
 *
 * Longer methods are abbreviated to fit the fixed-width badge.
 * Exported so consumer libraries can reuse the same mapping.
 */
export const METHOD_LABEL_MAP: Record<string, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  delete: "DEL",
  patch: "PATCH",
  head: "HEAD",
  options: "OPT",
  trace: "TRA",
  connect: "CONN",
};

/**
 * Returns the compact display label for an HTTP method.
 * Falls back to the first 4 characters uppercased for unknown methods.
 */
export function getMethodLabel(method: string): string {
  const normalized = method.toLowerCase().trim();
  return METHOD_LABEL_MAP[normalized] ?? normalized.slice(0, 4).toUpperCase();
}
