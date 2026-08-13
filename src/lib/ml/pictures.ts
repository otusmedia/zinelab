/**
 * Resolve product image paths to HTTPS URLs acceptable by Mercado Livre.
 */
export function resolveMercadoLivrePictureUrls(
  storagePaths: string[],
  options?: { appUrl?: string; supabaseUrl?: string },
): string[] {
  const appUrl = (
    options?.appUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://zine-lab.vercel.app"
  ).replace(/\/$/, "");
  const supabaseUrl = (
    options?.supabaseUrl ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ""
  ).replace(/\/$/, "");

  const urls = storagePaths
    .map((path) => {
      if (!path) return null;
      if (path.startsWith("https://")) return path;
      if (path.startsWith("http://")) {
        // ML requires HTTPS for pictures
        return path.replace(/^http:\/\//, "https://");
      }
      // Supabase storage path: bucket/object
      if (supabaseUrl && !path.startsWith("/")) {
        return `${supabaseUrl}/storage/v1/object/public/${path}`;
      }
      return `${appUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    })
    .filter((u): u is string => Boolean(u && u.startsWith("https://")));

  if (urls.length === 0) {
    return [`${appUrl}/ml-placeholder.png`];
  }
  return urls;
}
