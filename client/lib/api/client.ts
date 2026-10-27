import type { z } from 'zod';

/** A failed request: the API's own message when it sent one ({ error }), the HTTP status otherwise */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Sends a request to the API and checks the answer against `schema`. A body that is FormData goes as
 * multipart (files); any other body as JSON.
 */
export async function apiRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  { body, ...init }: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<z.infer<S>> {
  const headers = new Headers(init.headers);
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }
  const response = await fetch(path, { ...init, headers, body: payload });
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = (data as { error?: unknown } | undefined)?.error;
    throw new ApiError(
      typeof message === 'string' ? message : `${response.status} ${response.statusText}`,
      response.status,
    );
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(
      `Unexpected answer from ${path}: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      response.status,
    );
  }
  return parsed.data;
}
