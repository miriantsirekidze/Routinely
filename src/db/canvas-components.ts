import { db } from "./client";
import {
  canvasNodes,
  canvasTodoItems,
  canvasMedia,
  canvasLinkMeta,
  canvasPlaceMeta,
  canvasAudioMeta,
} from "./schema";
import { eq, asc } from "drizzle-orm";
import { CanvasNode } from "./canvas";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CanvasTodoItem = {
  id: number;
  nodeId: number;
  text: string;
  checked: boolean;
  sortOrder: number;
};

export type CanvasMediaItem = {
  id: number;
  nodeId: number;
  uri: string;
  mediaType: string;
  sortOrder: number;
};

export type CanvasLinkMeta = {
  id: number;
  nodeId: number;
  url: string;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  fetchFailed: boolean;
};

export type CanvasPlaceMeta = {
  id: number;
  nodeId: number;
  plusCode: string;
  lat: number | null;
  lng: number | null;
  placeTitle: string | null;
  googleMapsUrl: string | null;
  osmUrl: string | null;
};

export type CanvasAudioMeta = {
  id: number;
  nodeId: number;
  sourceType: string; // "local" | "youtube"
  youtubeVideoId: string | null;
  title: string | null;
  author: string | null;
  thumbnailUrl: string | null;
};

export type NodeWithData = {
  node: CanvasNode;
  todoItems?: CanvasTodoItem[];
  mediaItems?: CanvasMediaItem[];
  linkMeta?: CanvasLinkMeta | null;
  placeMeta?: CanvasPlaceMeta | null;
  audioMeta?: CanvasAudioMeta | null;
};

// ─── Node + supplemental data ─────────────────────────────────────────────────

export async function getNodeWithData(nodeId: number): Promise<NodeWithData | null> {
  const rows = await db.select().from(canvasNodes).where(eq(canvasNodes.id, nodeId)).limit(1);
  if (!rows[0]) return null;
  const node = rows[0] as CanvasNode;

  switch (node.cardType) {
    case "todo": {
      const todoItems = await getTodoItems(nodeId);
      return { node, todoItems };
    }
    case "image":
    case "gif":
    case "video":
    case "place": {
      const mediaItems = await getMediaItems(nodeId);
      if (node.cardType === "place") {
        const placeMeta = await getPlaceMeta(nodeId);
        return { node, mediaItems, placeMeta };
      }
      return { node, mediaItems };
    }
    case "link": {
      const linkMeta = await getLinkMeta(nodeId);
      return { node, linkMeta };
    }
    case "audio": {
      const mediaItems = await getMediaItems(nodeId);
      const audioMeta = await getAudioMeta(nodeId);
      return { node, mediaItems, audioMeta };
    }
    default:
      return { node };
  }
}

// ─── Todo items ───────────────────────────────────────────────────────────────

export async function getTodoItems(nodeId: number): Promise<CanvasTodoItem[]> {
  return db.select().from(canvasTodoItems)
    .where(eq(canvasTodoItems.nodeId, nodeId))
    .orderBy(asc(canvasTodoItems.sortOrder)) as Promise<CanvasTodoItem[]>;
}

export async function createTodoItem(nodeId: number, text: string): Promise<CanvasTodoItem> {
  const existing = await db.select().from(canvasTodoItems)
    .where(eq(canvasTodoItems.nodeId, nodeId))
    .orderBy(asc(canvasTodoItems.sortOrder));
  const sortOrder = existing.length;
  const result = await db.insert(canvasTodoItems).values({ nodeId, text, sortOrder }).returning();
  return result[0] as CanvasTodoItem;
}

export async function toggleTodoItem(id: number, checked: boolean): Promise<void> {
  await db.update(canvasTodoItems).set({ checked }).where(eq(canvasTodoItems.id, id));
}

export async function deleteTodoItem(id: number): Promise<void> {
  await db.delete(canvasTodoItems).where(eq(canvasTodoItems.id, id));
}

export async function reorderTodoItems(nodeId: number, orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(canvasTodoItems)
      .set({ sortOrder: i })
      .where(eq(canvasTodoItems.id, orderedIds[i]));
  }
}

// ─── Media ────────────────────────────────────────────────────────────────────

export async function getMediaItems(nodeId: number): Promise<CanvasMediaItem[]> {
  return db.select().from(canvasMedia)
    .where(eq(canvasMedia.nodeId, nodeId))
    .orderBy(asc(canvasMedia.sortOrder)) as Promise<CanvasMediaItem[]>;
}

export async function createMediaItem(
  nodeId: number,
  uri: string,
  mediaType: string,
): Promise<CanvasMediaItem> {
  const existing = await db.select().from(canvasMedia).where(eq(canvasMedia.nodeId, nodeId));
  const sortOrder = existing.length;
  const result = await db.insert(canvasMedia).values({ nodeId, uri, mediaType, sortOrder }).returning();
  return result[0] as CanvasMediaItem;
}

export async function deleteMediaItem(id: number): Promise<void> {
  await db.delete(canvasMedia).where(eq(canvasMedia.id, id));
}

// ─── Link meta ────────────────────────────────────────────────────────────────

export async function getLinkMeta(nodeId: number): Promise<CanvasLinkMeta | null> {
  const rows = await db.select().from(canvasLinkMeta)
    .where(eq(canvasLinkMeta.nodeId, nodeId)).limit(1);
  return (rows[0] as CanvasLinkMeta) ?? null;
}

export async function saveLinkMeta(nodeId: number, data: {
  url: string;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  fetchFailed?: boolean;
}): Promise<CanvasLinkMeta> {
  const existing = await getLinkMeta(nodeId);
  if (existing) {
    await db.update(canvasLinkMeta).set({
      url: data.url,
      ogTitle: data.ogTitle ?? null,
      ogDescription: data.ogDescription ?? null,
      ogImageUrl: data.ogImageUrl ?? null,
      fetchFailed: data.fetchFailed ?? false,
    }).where(eq(canvasLinkMeta.nodeId, nodeId));
    return (await getLinkMeta(nodeId))!;
  }
  const result = await db.insert(canvasLinkMeta).values({
    nodeId,
    url: data.url,
    ogTitle: data.ogTitle ?? null,
    ogDescription: data.ogDescription ?? null,
    ogImageUrl: data.ogImageUrl ?? null,
    fetchFailed: data.fetchFailed ?? false,
  }).returning();
  return result[0] as CanvasLinkMeta;
}

// ─── Place meta ───────────────────────────────────────────────────────────────

export async function getPlaceMeta(nodeId: number): Promise<CanvasPlaceMeta | null> {
  const rows = await db.select().from(canvasPlaceMeta)
    .where(eq(canvasPlaceMeta.nodeId, nodeId)).limit(1);
  return (rows[0] as CanvasPlaceMeta) ?? null;
}

export async function savePlaceMeta(nodeId: number, data: {
  plusCode: string;
  lat?: number | null;
  lng?: number | null;
  placeTitle?: string | null;
  googleMapsUrl?: string | null;
  osmUrl?: string | null;
}): Promise<CanvasPlaceMeta> {
  const existing = await getPlaceMeta(nodeId);
  if (existing) {
    await db.update(canvasPlaceMeta).set({
      plusCode: data.plusCode,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      placeTitle: data.placeTitle ?? null,
      googleMapsUrl: data.googleMapsUrl ?? null,
      osmUrl: data.osmUrl ?? null,
    }).where(eq(canvasPlaceMeta.nodeId, nodeId));
    return (await getPlaceMeta(nodeId))!;
  }
  const result = await db.insert(canvasPlaceMeta).values({
    nodeId,
    plusCode: data.plusCode,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    placeTitle: data.placeTitle ?? null,
    googleMapsUrl: data.googleMapsUrl ?? null,
    osmUrl: data.osmUrl ?? null,
  }).returning();
  return result[0] as CanvasPlaceMeta;
}

// ─── Audio meta ───────────────────────────────────────────────────────────────

export async function getAudioMeta(nodeId: number): Promise<CanvasAudioMeta | null> {
  const rows = await db.select().from(canvasAudioMeta)
    .where(eq(canvasAudioMeta.nodeId, nodeId)).limit(1);
  return (rows[0] as CanvasAudioMeta) ?? null;
}

export async function saveAudioMeta(nodeId: number, data: {
  sourceType: string;
  youtubeVideoId?: string | null;
  title?: string | null;
  author?: string | null;
  thumbnailUrl?: string | null;
}): Promise<CanvasAudioMeta> {
  const existing = await getAudioMeta(nodeId);
  const values = {
    sourceType: data.sourceType,
    youtubeVideoId: data.youtubeVideoId ?? null,
    title: data.title ?? null,
    author: data.author ?? null,
    thumbnailUrl: data.thumbnailUrl ?? null,
  };
  if (existing) {
    await db.update(canvasAudioMeta).set(values).where(eq(canvasAudioMeta.nodeId, nodeId));
    return (await getAudioMeta(nodeId))!;
  }
  const result = await db.insert(canvasAudioMeta).values({ nodeId, ...values }).returning();
  return result[0] as CanvasAudioMeta;
}

// ─── OG fetch ─────────────────────────────────────────────────────────────────

export async function fetchOpenGraph(url: string): Promise<{
  title: string | null;
  description: string | null;
  imageUrl: string | null;
} | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const html = await response.text();
    const title = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i)?.[1]
      ?? html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:title"[^>]*>/i)?.[1]
      ?? null;
    const description = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i)?.[1]
      ?? html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:description"[^>]*>/i)?.[1]
      ?? null;
    const imageUrl = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i)?.[1]
      ?? html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:image"[^>]*>/i)?.[1]
      ?? null;
    return { title, description, imageUrl };
  } catch {
    return null;
  }
}
