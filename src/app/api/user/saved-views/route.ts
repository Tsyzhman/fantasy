import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJsonObject } from "@/lib/request-json";
import {
  machetePlayerTableFiltersSource,
  machetePlayerTableSettingsSource,
  maximumMachetePlayerFilterPresets,
  parseMachetePlayerFilterPresetValue,
  parseMachetePlayerTableSettings
} from "@/machete/machete-player-table-preferences";
import { maximumSquadFilterPresets, parseSquadFilterPresetFilters } from "@/machete/squad-filter-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SavedViewSource = "machete" | "baltika" | "squad" | typeof machetePlayerTableSettingsSource | typeof machetePlayerTableFiltersSource;

const maxSavedViews = 8;
const validSources = new Set<SavedViewSource>(["machete", "baltika", "squad", machetePlayerTableSettingsSource, machetePlayerTableFiltersSource]);

export const GET = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const source = sourceValue(new URL(request.url).searchParams.get("source"));
  if (!source) return badRequest("source is invalid.");

  return NextResponse.json({ views: await loadSavedViews(userId, source) });
});

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const body = await readJsonObject(request);
  const source = sourceValue(body.source);
  const name = trimmedString(body.name, 80);
  const href = trimmedString(body.href, 2000);
  if (!source) return badRequest("source is invalid.");
  if (!name) return badRequest("name is required.");
  if (!href || !isSafeExplorerHref(source, href)) return badRequest("href must point to the matching player explorer.");

  const squadFilters = source === "squad" ? parseSquadFilterPresetFilters(body.filters) : null;
  if (source === "squad" && !squadFilters) return badRequest("filters contain an invalid squad filter preset.");
  const tableSettings = source === machetePlayerTableSettingsSource ? parseMachetePlayerTableSettings(body.filters) : null;
  if (source === machetePlayerTableSettingsSource && !tableSettings) return badRequest("filters contain invalid player-table settings.");
  const tableFilters = source === machetePlayerTableFiltersSource ? parseMachetePlayerFilterPresetValue(body.filters) : null;
  if (source === machetePlayerTableFiltersSource && !tableFilters) return badRequest("filters contain an invalid player-table filter preset.");
  const filters = source === "squad"
    ? squadFilters as Prisma.InputJsonValue
    : source === machetePlayerTableSettingsSource
      ? tableSettings as Prisma.InputJsonValue
      : source === machetePlayerTableFiltersSource
        ? tableFilters as Prisma.InputJsonValue
        : inputJson(body.filters);
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
});

export const DELETE = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const params = new URL(request.url).searchParams;
  const source = sourceValue(params.get("source"));
  const id = trimmedString(params.get("id"), 200);
  if (!source) return badRequest("source is invalid.");
  if (!id) return badRequest("id is required.");

  await prisma.userSavedView.deleteMany({
    where: {
      id,
      userId,
      source
    }
  });

  return NextResponse.json({ views: await loadSavedViews(userId, source) });
});

async function loadSavedViews(userId: string, source: SavedViewSource) {
  const views = await prisma.userSavedView.findMany({
    where: { userId, source },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: savedViewLimit(source)
  });

  return views.map((view) => ({
    id: view.id,
    name: view.name,
    href: view.href,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    ...(source === "squad"
      ? { filters: parseSquadFilterPresetFilters(view.filters) }
      : source === machetePlayerTableSettingsSource
        ? { filters: parseMachetePlayerTableSettings(view.filters) }
        : source === machetePlayerTableFiltersSource
          ? { filters: parseMachetePlayerFilterPresetValue(view.filters) }
          : {})
  }));
}

async function trimSavedViews(userId: string, source: SavedViewSource) {
  const overflow = await prisma.userSavedView.findMany({
    where: { userId, source },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    skip: savedViewLimit(source),
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
  if (source === "squad") return /^squad-filter:[a-z0-9_%.-]{1,240}$/i.test(href);
  if (source === machetePlayerTableSettingsSource) return href === "machete-table:preferences";
  if (source === machetePlayerTableFiltersSource) return /^machete-table-filter:[a-z0-9_%.-]{1,240}$/i.test(href);
  const prefix = source === "machete" ? "/machete/players" : "/baltika/players";
  return href === prefix || href.startsWith(`${prefix}?`);
}

function savedViewLimit(source: SavedViewSource) {
  if (source === "squad") return maximumSquadFilterPresets;
  if (source === machetePlayerTableSettingsSource) return 1;
  if (source === machetePlayerTableFiltersSource) return maximumMachetePlayerFilterPresets;
  return maxSavedViews;
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
  return jsonError("BAD_REQUEST", message, 400);
}
