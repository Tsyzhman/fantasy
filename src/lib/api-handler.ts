import { NextResponse } from "next/server";

import { createLogger } from "@/lib/logger";

const logger = createLogger("api");

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function apiError(code: string, message: string, status: number) {
  return new ApiError(code, message, status);
}

export function jsonError(code: string, message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message }, ...extra }, { status });
}

export function badRequest(message: string, code = "BAD_REQUEST") {
  return apiError(code, message, 400);
}

export function requiredStringParam(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${name} is required.`);
  }
  if (value.length > 128) {
    throw badRequest(`${name} is too long.`);
  }
  return value;
}

export function requiredSearchParam(searchParams: URLSearchParams, name: string) {
  return requiredStringParam(searchParams.get(name), name);
}

export function withApiHandler<Args extends unknown[]>(handler: (...args: Args) => Response | Promise<Response>) {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(error.code, error.message, error.status);
      }

      logger.error("Unhandled API route error.", { error });
      return jsonError("INTERNAL_SERVER_ERROR", "Unexpected server error.", 500);
    }
  };
}
