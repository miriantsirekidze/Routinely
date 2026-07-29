import { db } from "./client";
import { canvasFiles, canvasNodes, canvasConnections } from "./schema";
import { eq, desc, asc } from "drizzle-orm";

export type CanvasFile = {
  id: number;
  folderId: number;
  title: string;
  emoji: string | null;
  createdAt: Date;
};

export async function getCanvasFiles(folderId: number): Promise<CanvasFile[]> {
  return db.select().from(canvasFiles)
    .where(eq(canvasFiles.folderId, folderId))
    .orderBy(desc(canvasFiles.createdAt)) as Promise<CanvasFile[]>;
}

export async function createCanvasFile(data: {
  folderId: number;
  title: string;
  emoji?: string | null;
}): Promise<CanvasFile> {
  const result = await db.insert(canvasFiles).values({
    folderId: data.folderId,
    title: data.title,
    emoji: data.emoji ?? null,
  }).returning();
  return result[0] as CanvasFile;
}

export async function deleteCanvasFile(id: number): Promise<void> {
  await db.delete(canvasFiles).where(eq(canvasFiles.id, id));
}

// ─── Canvas Nodes ─────────────────────────────────────────────────────────────

export type CanvasNode = {
  id: number;
  fileId: number;
  title: string;
  description: string | null;
  x: number;
  y: number;
  width: number;
  cardType: string;
  aspectRatio: string;
  collapsed: boolean;
  seqOrder: number | null;
  createdAt: Date;
};

export async function getCanvasNodes(fileId: number): Promise<CanvasNode[]> {
  return db.select().from(canvasNodes)
    .where(eq(canvasNodes.fileId, fileId))
    .orderBy(asc(canvasNodes.createdAt)) as Promise<CanvasNode[]>;
}

export async function createCanvasNode(data: {
  fileId: number;
  title: string;
  x: number;
  y: number;
  width?: number;
  cardType?: string;
}): Promise<CanvasNode> {
  const result = await db.insert(canvasNodes).values({
    fileId: data.fileId,
    title: data.title,
    x: data.x,
    y: data.y,
    width: data.width ?? 220,
    cardType: data.cardType ?? "text-titled",
  }).returning();
  return result[0] as CanvasNode;
}

export async function updateCanvasNode(
  id: number,
  patch: Partial<Pick<CanvasNode, "title" | "description" | "x" | "y" | "width" | "aspectRatio" | "collapsed" | "seqOrder">>
): Promise<void> {
  await db.update(canvasNodes).set(patch).where(eq(canvasNodes.id, id));
}

export async function deleteCanvasNode(id: number): Promise<void> {
  await db.delete(canvasNodes).where(eq(canvasNodes.id, id));
}

// ─── Canvas Connections ───────────────────────────────────────────────────────

export type CanvasConnection = {
  id: number;
  fileId: number;
  fromNodeId: number;
  toNodeId: number;
  label: string | null;
};

export async function getCanvasConnections(fileId: number): Promise<CanvasConnection[]> {
  return db.select().from(canvasConnections)
    .where(eq(canvasConnections.fileId, fileId)) as Promise<CanvasConnection[]>;
}

export async function createCanvasConnection(data: {
  fileId: number;
  fromNodeId: number;
  toNodeId: number;
}): Promise<CanvasConnection> {
  const result = await db.insert(canvasConnections).values(data).returning();
  return result[0] as CanvasConnection;
}

export async function deleteCanvasConnection(id: number): Promise<void> {
  await db.delete(canvasConnections).where(eq(canvasConnections.id, id));
}
