const origin = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  if (!origin)
    throw new Error(
      "The API address is not configured. Add VITE_API_URL and rebuild the frontend.",
    );
  const response = await fetch(`${origin}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(45000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.message ??
        `The server could not complete this request (${response.status}).`,
    );
  if (!data) throw new Error("The server returned an unexpected response.");
  return data as T;
}
export function xlm(value: string | undefined) {
  const stroops = BigInt(value ?? "0");
  const fraction = (stroops % 10_000_000n)
    .toString()
    .padStart(7, "0")
    .replace(/0+$/, "");
  return `${(stroops / 10_000_000n).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}
export function date(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}
