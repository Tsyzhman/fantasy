import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJsonObject } from "@/lib/request-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SavedViewSource = "machete" | "baltika";

const maxSavedViews = 8;
const validSources = new Set<SavedViewSource>(["machete", "baltika"]);

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const source = sourceValue(new URL(request.url).searchParams.get("source"));
  if (!source) return badRequest("source must be machete or baltika.");

  return NextResponse.json({ views: await loadSavedViews(userId, source) });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const body = await readJsonObject(request);
  const source = sourceValue(body.source);
  const name = trimmedString(body.name, 80);
  const href = trimmedString(body.href, 2000);
  if (!source) return badRequest("source must be machete or baltika.");
  if (!name) return badRequest("name is required.");
  if (!href || !isSafeExplorerHref(source, href)) return badRequest("href must point to the matching player explorer.");

  const filters = inputJson(body.filters);
  const jsonData = filters === undefined ? {} : { filters };

  await prisma.userSavedView.upsert({
    where: {
      userId_source_href: {
        userId,
        source,
        href
      }
    },
    create: {
      userId,
      source,
      name,
      href,
      ...jsonData
    },
    update: {
      name,
      ...jsonData
    }
  });

  await trimSavedViews(userId, source);
  return NextResponse.json({ views: await loadSavedViews(userId, source) });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const params = new URL(request.url).searchParams;
  const source = sourceValue(params.get("source"));
  const id = trimmedString(params.get("id"), 200);
  if (!source) return badRequest("source must be machete or baltika.");
  if (!id) return badRequest("id is required.");

  await prisma.userSavedView.deleteMany({
    where: {
      id,
      userId,
      source
    }
  });

  return NextResponse.json({ views: await loadSavedViews(userId, source) });
}

async function loadSavedViews(userId: string, source: SavedViewSource) {
  const views = await prisma.userSavedView.findMany({
    where: { userId, source },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: maxSavedViews
  });

  return views.map((view) => ({
    id: view.id,
    name: view.name,
    href: view.href,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString()
  }));
}

async function trimSavedViews(userId: string, source: SavedViewSource) {
  const overflow = await prisma.userSavedView.findMany({
    where: { userId, source },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    skip: maxSavedViews,
    select: { id: true }
  });

  if (overflow.length === 0) return;

  await prisma.userSavedView.deleteMany({
    where: { id: { in: overflow.map((view) => view.id) }, userId, source }
  });
}

function sourceValue(value: unknown): SavedViewSource | null {
  return typeof value === "string" && validSources.has(value as SavedViewSource) ? (value as SavedViewSource) : null;
}

function trimmedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isSafeExplorerHref(source: SavedViewSource, href: string) {
  const prefix = source === "machete" ? "/machete/players" : "/baltika/players";
  return href === prefix || href.startsWith(`${prefix}?`);
}

function inputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== "object") return undefined;

  try {
    if (JSON.stringify(value).length > 20_000) return undefined;
  } catch {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function badRequest(message: string) {
  return NextResponse.json({ error: { code: "BAD_REQUEST", message } }, { status: 400 });
}
