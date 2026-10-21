export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

/** Single, centralized API client. All UI code goes through this. */
export async function api<T = unknown>(
  url: string,
  opts: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: opts.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError("Can't reach the server. Check your connection and try again.", 0, "NETWORK");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiClientError(
      e?.message ?? "Something went wrong. Please try again.",
      res.status,
      e?.code ?? "ERROR",
      e?.details,
    );
  }
  return data as T;
}

export const fetcher = <T = unknown>(url: string) => api<T>(url);

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
