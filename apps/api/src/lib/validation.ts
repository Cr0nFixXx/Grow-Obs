import { HTTPException } from "hono/http-exception";
import { z } from "zod";

export function uuid(value: string): string {
  const result = z.string().uuid().safeParse(value);
  if (!result.success) throw new HTTPException(400, { message: "Ungueltige ID" });
  return result.data;
}

export function pageLimit(value: string | undefined, fallback = 100): number {
  const result = z.coerce.number().int().min(1).max(200).safeParse(value ?? fallback);
  if (!result.success) throw new HTTPException(400, { message: "Ungueltiges Listenlimit" });
  return result.data;
}