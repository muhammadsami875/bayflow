import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "ERROR",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, details?: unknown) => new ApiError(400, m, "BAD_REQUEST", details);
export const unauthorized = (m = "Please sign in to continue") => new ApiError(401, m, "UNAUTHORIZED");
export const forbidden = (m = "You do not have permission to do that") => new ApiError(403, m, "FORBIDDEN");
export const notFound = (m = "Not found") => new ApiError(404, m, "NOT_FOUND");
export const conflict = (m: string) => new ApiError(409, m, "CONFLICT");

export type Ctx<K extends string = never> = { params: Promise<Record<K, string>> };

type Handler<C> =(req: Request, ctx: C) => Promise<Response | unknown>;

/**
 * Wraps a route handler so every endpoint returns the same JSON error shape:
 * { error: { code, message, details? } } with a proper HTTP status.
 */
export function route<C = Ctx>(handler: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message, details: err.details } },
          { status: err.status },
        );
      }
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const where = first?.path.length ? `${first.path.join(".")}: ` : "";
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION",
              message: `${where}${first?.message ?? "Invalid input"}`,
              details: err.flatten().fieldErrors,
            },
          },
          { status: 422 },
        );
      }
      console.error("Unhandled API error", err);
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Something went wrong on our side" } },
        { status: 500 },
      );
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}
