import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Dimensions,
  Image, ScrollView, Modal, FlatList, ActivityIndicator, ToastAndroid, Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Gesture, GestureDetector,
  type GestureType,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue,
  runOnJS, cancelAnimation, clamp, withTiming, withSpring,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, Pattern, Circle, Rect } from "react-native-svg";
import { Canvas, Fill, Shader, Skia, Path as SkiaPath, Group as SkiaGroup } from "@shopify/react-native-skia";
import { BottomSheetModal, BottomSheetView, BottomSheetScrollView, BottomSheetTextInput, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import * as FileSystem from "expo-file-system";
import { cacheDirectory } from "expo-file-system/legacy";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image as ExpoImage } from "expo-image";
import DraggableFlatList, { RenderItemParams } from "react-native-draggable-flatlist";
import { db } from "../../src/db/client";
import { canvasFiles } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import {
  getCanvasNodes, createCanvasNode, updateCanvasNode, deleteCanvasNode,
  getCanvasConnections, createCanvasConnection, deleteCanvasConnection,
  CanvasNode, CanvasFile, CanvasConnection,
} from "../../src/db/canvas";
import {
  CanvasTodoItem, CanvasMediaItem, CanvasLinkMeta, CanvasPlaceMeta, CanvasAudioMeta,
  getTodoItems, createTodoItem, toggleTodoItem, deleteTodoItem, reorderTodoItems,
  getMediaItems, createMediaItem, deleteMediaItem,
  getLinkMeta, saveLinkMeta,
  getPlaceMeta, savePlaceMeta,
  getAudioMeta, saveAudioMeta,
  fetchOpenGraph,
} from "../../src/db/canvas-components";
import * as DocumentPicker from "expo-document-picker";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import YoutubePlayer, { YoutubeIframeRef } from "react-native-youtube-iframe";
import { DeleteConfirmSheet, DeleteConfirmSheetRef } from "../../src/components/DeleteConfirmSheet";
import MapPreview from "../../src/components/MapPreview";
import MapPickerModal, { PickedPlace } from "../../src/components/MapPickerModal";
import { generateImage, pickGalleryImage, downloadImage } from "../../src/utils/imageGen";
import { colors, typography, spacing, radius } from "../../src/constants/theme";
import Feather from "@expo/vector-icons/Feather";

const { width: SW, height: SH } = Dimensions.get("window");

const DOT_SPACING = 32;
const MIN_SCALE = 0.2;
const MAX_SCALE = 1;
const CARD_W = 220;
const MIN_CARD_W = 140;
const MAX_CARD_W = 360;
const DRAWER_W = Math.min(Math.round(SW * 0.58), 240);

const TYPE_CONFIG: Record<string, { icon: keyof typeof Feather.glyphMap; color: string; label: string }> = {
  "text-titled": { icon: "type",          color: "#006FFD", label: "Note" },
  "text-quote":  { icon: "message-square",color: "#7C3AED", label: "Quote" },
  "image":       { icon: "image",         color: "#16A34A", label: "Image" },
  "link":        { icon: "link",          color: "#D97706", label: "Link" },
  "todo":        { icon: "check-square",  color: "#0891B2", label: "To-do" },
  "place":       { icon: "map-pin",       color: "#DC2626", label: "Place" },
  "gif":         { icon: "film",          color: "#D946EF", label: "GIF" },
  "video":       { icon: "video",         color: "#F97316", label: "Video" },
};

type CardType =
  | "text-titled"
  | "text-quote"
  | "image"
  | "link"
  | "todo"
  | "place"
  | "gif"
  | "video"
  | "audio"
  // Transient picker-only choice: creates a normal "image" card, then opens the AI generate
  // sheet. Never persisted as a cardType (the resulting node is stored as "image").
  | "ai-image";

const CARD_TYPE_OPTIONS: { type: CardType; icon: keyof typeof Feather.glyphMap; label: string }[] = [
  { type: "text-titled", icon: "type", label: "Note" },
  { type: "text-quote", icon: "message-square", label: "Quote" },
  { type: "image", icon: "image", label: "Image" },
  { type: "ai-image", icon: "zap", label: "AI Image" },
  { type: "link", icon: "link", label: "Link" },
  { type: "todo", icon: "check-square", label: "To-do" },
  { type: "place", icon: "map-pin", label: "Place" },
  { type: "gif", icon: "film", label: "GIF" },
  { type: "video", icon: "video", label: "Video" },
  { type: "audio", icon: "music", label: "Audio" },
];

// ─── Supplemental data state ──────────────────────────────────────────────────

type SupData = {
  todoItemsMap: Record<number, CanvasTodoItem[]>;
  mediaItemsMap: Record<number, CanvasMediaItem[]>;
  linkMetaMap: Record<number, CanvasLinkMeta | null>;
  placeMetaMap: Record<number, CanvasPlaceMeta | null>;
  audioMetaMap: Record<number, CanvasAudioMeta | null>;
};

// ─── TextTitled card content ──────────────────────────────────────────────────

function TextTitledContent({ node }: { node: CanvasNode }) {
  return (
    <>
      <Text style={contentStyles.titledTitle} numberOfLines={3}>{node.title}</Text>
      {!!node.description?.trim() && (
        <Text style={contentStyles.titledDesc} numberOfLines={6}>{node.description}</Text>
      )}
    </>
  );
}

// ─── TextQuote card content ───────────────────────────────────────────────────

function TextQuoteContent({ node }: { node: CanvasNode }) {
  return (
    <View style={contentStyles.quoteRow}>
      <View style={contentStyles.quoteBar} />
      <Text style={contentStyles.quoteText} numberOfLines={10}>{node.description ?? node.title}</Text>
    </View>
  );
}

// ─── Image card content ───────────────────────────────────────────────────────

const AR_VALUES: Record<string, number> = { "1:1": 1, "3:2": 2 / 3, "2:3": 3 / 2 };



function ImageContent({
  node, mediaItems, cardW, cardWidthSV,
}: {
  node: CanvasNode; mediaItems: CanvasMediaItem[]; cardW: number; cardWidthSV: SharedValue<number>;
}) {
  const arValue = AR_VALUES[node.aspectRatio] ?? 2 / 3;
  // Dimensions bound to the live card width → resizing keeps the aspect ratio.
  const mediaStyle = useAnimatedStyle(() => ({
    width: cardWidthSV.value,
    height: cardWidthSV.value * arValue,
  }));
  if (!mediaItems.length) {
    return (
      <Animated.View style={[contentStyles.imgPlaceholder, mediaStyle]}>
        <Feather name="image" size={32} color={colors.neutralLight} />
        <Text style={contentStyles.placeholderLabel} numberOfLines={1}>{node.aspectRatio}</Text>
      </Animated.View>
    );
  }
  return (
    <>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -spacing.md, marginTop: -spacing.md }}>
        {mediaItems.map((m) => (
          <Animated.View key={m.id} style={mediaStyle}>
            <Image source={{ uri: m.uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          </Animated.View>
        ))}
      </ScrollView>
      {!!node.title?.trim() && node.title !== "New card" && (
        <Text style={contentStyles.imageTitleBelow} numberOfLines={2}>{node.title}</Text>
      )}
    </>
  );
}

// ─── Link card content ────────────────────────────────────────────────────────

function LinkContent({ linkMeta, cardW }: { linkMeta: CanvasLinkMeta | null | undefined; cardW: number }) {
  if (!linkMeta) {
    return (
      <View style={contentStyles.placeholder}>
        <Feather name="link" size={28} color={colors.neutralLight} />
      </View>
    );
  }
  return (
    <View>
      {!!linkMeta.ogImageUrl && (
        <Image
          source={{ uri: linkMeta.ogImageUrl }}
          style={[contentStyles.linkOgImage, { width: cardW }]}
          resizeMode="cover"
        />
      )}
      <View style={contentStyles.linkTextPad}>
        <Text style={contentStyles.linkTitle} numberOfLines={2}>
          {linkMeta.ogTitle ?? linkMeta.url}
        </Text>
        {!!linkMeta.ogTitle && (
          <Text style={contentStyles.linkUrl} numberOfLines={1}>{linkMeta.url}</Text>
        )}
      </View>
    </View>
  );
}

// ─── Todo card content ────────────────────────────────────────────────────────

function TodoContent({
  node,
  todoItems,
  onToggle,
}: {
  node: CanvasNode;
  todoItems: CanvasTodoItem[];
  onToggle: (id: number, checked: boolean) => void;
}) {
  return (
    <>
      {!!node.title?.trim() && node.title !== "New card" && (
        <Text style={contentStyles.titledTitle} numberOfLines={2}>{node.title}</Text>
      )}
      {todoItems.slice(0, 6).map((item) => (
        <Pressable
          key={item.id}
          style={contentStyles.todoRow}
          onPress={() => onToggle(item.id, !item.checked)}
        >
          <View style={[contentStyles.todoCheck, item.checked && contentStyles.todoCheckDone]}>
            {item.checked && <Feather name="check" size={10} color={colors.white} />}
          </View>
          <Text
            style={[contentStyles.todoText, item.checked && contentStyles.todoTextDone]}
            numberOfLines={2}
          >
            {item.text}
          </Text>
        </Pressable>
      ))}
      {todoItems.length > 6 && (
        <Text style={contentStyles.todoMore}>+{todoItems.length - 6} more</Text>
      )}
    </>
  );
}

// ─── Place card content ───────────────────────────────────────────────────────

function PlaceContent({
  node, placeMeta, cardW,
}: {
  node: CanvasNode; placeMeta: CanvasPlaceMeta | null | undefined; cardW: number;
}) {
  const hasLoc = placeMeta?.lat != null && placeMeta?.lng != null;
  const h = Math.round(cardW * 0.55);
  return (
    <>
      {hasLoc ? (
        <MapPreview lat={placeMeta!.lat!} lng={placeMeta!.lng!} height={h} />
      ) : (
        <View style={[contentStyles.imgPlaceholder, { width: "100%", height: h }]}>
          <Feather name="map-pin" size={28} color={colors.neutralLight} />
        </View>
      )}
      <Text style={contentStyles.linkTitle} numberOfLines={2}>
        {placeMeta?.placeTitle ?? (node.title !== "New card" ? node.title : "")}
      </Text>
    </>
  );
}

// ─── GIF card content ─────────────────────────────────────────────────────────

const GIF_MIN_H = 60;
const GIF_MAX_H = 800; // high cap so the gif keeps its natural aspect as the card resizes

function GifContent({ mediaItems, cardW, cardWidthSV }: { mediaItems: CanvasMediaItem[]; cardW: number; cardWidthSV: SharedValue<number> }) {
  const uri = mediaItems[0]?.uri ?? null;
  // Store the natural aspect (height/width); dimensions bind to the live card width.
  const aspect = useSharedValue(9 / 16);

  const handleLoad = (e: { source: { width: number; height: number } }) => {
    const { width, height } = e.source;
    if (width > 0 && height > 0) aspect.value = height / width;
  };

  const mediaStyle = useAnimatedStyle(() => ({
    width: cardWidthSV.value,
    height: Math.max(GIF_MIN_H, Math.min(GIF_MAX_H, cardWidthSV.value * aspect.value)),
  }));

  if (!uri) {
    return (
      <Animated.View style={[contentStyles.imgPlaceholder, mediaStyle]}>
        <Feather name="film" size={28} color={colors.neutralLight} />
      </Animated.View>
    );
  }

  // Container height matches the image's natural ratio → fill has zero letterboxing
  return (
    <Animated.View style={[contentStyles.gifView, mediaStyle]}>
      <ExpoImage
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="fill"
        autoplay
        recyclingKey={uri}
        onLoad={handleLoad}
      />
    </Animated.View>
  );
}

// ─── Video full-screen player (mounts only when opened) ──────────────────────

function VideoPlayerModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  const player = useVideoPlayer({ uri }, (p) => { p.play(); });
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => {
      setCurrentTime(player.currentTime ?? 0);
      setDuration(player.duration ?? 0);
      setPlaying(player.playing);
    }, 300);
    return () => clearInterval(tick);
  }, [player]);

  const togglePlay = () => {
    if (player.playing) { player.pause(); setPlaying(false); }
    else { player.play(); setPlaying(true); }
  };

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={false} />
      {/* Tap anywhere on the video (outside controls) to close */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      {/* Custom controls — no settings button */}
      <View style={videoModalStyles.controls}>
        <Pressable onPress={togglePlay} hitSlop={12}>
          <Feather name={playing ? "pause" : "play"} size={26} color={colors.white} />
        </Pressable>
        <View style={videoModalStyles.progressTrack}>
          <View style={[videoModalStyles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={videoModalStyles.time}>{fmt(currentTime)} / {fmt(duration)}</Text>
      </View>
      <Pressable style={contentStyles.videoCloseBtn} onPress={onClose}>
        <Feather name="x" size={22} color={colors.white} />
      </Pressable>
    </View>
  );
}

// Fullscreen YouTube video — same close behavior, but the player is an iframe.
function FullscreenYoutubeModal({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}>
      {/* Tap the letterbox area to close; the player keeps its own controls */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <YoutubePlayer height={Math.round(SW * 9 / 16)} width={SW} videoId={videoId} play={true} />
      <Pressable style={contentStyles.videoCloseBtn} onPress={onClose}>
        <Feather name="x" size={22} color={colors.white} />
      </Pressable>
    </View>
  );
}

// ─── Video card content ───────────────────────────────────────────────────────

// VideoContent is now a pure display — double-tap on the card triggers the player
// at the screen level via onInteractById → handleInteractById → fullScreenVideoUri
function VideoContent({ mediaItems, cardW, cardWidthSV }: { mediaItems: CanvasMediaItem[]; cardW: number; cardWidthSV: SharedValue<number> }) {
  const item = mediaItems[0];
  const uri = item?.uri ?? null;
  const isYt = item?.mediaType === "youtube";
  const mediaStyle = useAnimatedStyle(() => ({
    width: cardWidthSV.value,
    height: cardWidthSV.value * 9 / 16,
  }));

  if (!uri) {
    return (
      <Animated.View style={[contentStyles.imgPlaceholder, mediaStyle]}>
        <Feather name="video" size={28} color={colors.neutralLight} />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[contentStyles.videoThumb, mediaStyle]}>
      {isYt && (
        <Image
          source={{ uri: `https://img.youtube.com/vi/${uri}/hqdefault.jpg` }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      <View style={contentStyles.videoPlayBtn}>
        <Feather name="play" size={22} color={colors.white} />
      </View>
    </Animated.View>
  );
}

// ─── Audio card content ───────────────────────────────────────────────────────

function AudioContent({
  node, audioMeta, active, playing,
}: {
  node: CanvasNode;
  audioMeta: CanvasAudioMeta | null | undefined;
  active: boolean;
  playing: boolean;
}) {
  const title =
    (node.title && node.title !== "New card" ? node.title.trim() : "") ||
    audioMeta?.title?.trim() ||
    "Audio track";
  const hasSource = !!audioMeta;
  const isPlaying = active && playing;
  // Non-interactive indicator — single tap opens the sheet, double-tap plays.
  return (
    <View style={contentStyles.audioRow}>
      <View style={[contentStyles.audioPlayBtn, active && contentStyles.audioPlayBtnActive]}>
        <Feather
          name={!hasSource ? "music" : isPlaying ? "pause" : "play"}
          size={18}
          color={hasSource ? colors.white : colors.neutralLight}
          // The play triangle is right-heavy — nudge it to sit optically centered.
          style={{ marginLeft: hasSource && !isPlaying ? 2 : 0 }}
        />
      </View>
      <View style={contentStyles.audioTextCol}>
        <Text style={contentStyles.audioTitle} numberOfLines={2}>{title}</Text>
        <Text style={contentStyles.audioSub} numberOfLines={1}>
          {!hasSource ? "Tap to add a file" : active ? (playing ? "Playing" : "Paused") : "Tap to play"}
        </Text>
      </View>
    </View>
  );
}


// ─── Dot grid background ──────────────────────────────────────────────────────
// Primary: Skia SkSL shader — screen-sized Canvas, dots track canvas transform,
//          truly infinite, zero bitmap allocation.
// Fallback: screen-space SVG — fixed dots, safe size (~13 MB), always works.

const DOT_SHADER_SRC = `
  uniform float2 resolution;
  uniform float2 translate;
  uniform float  zoom;

  half4 main(float2 pos) {
    float spacing = 32.0;
    float dotR    = 1.5;
    // Inverse canvas transform: screen pixel → canvas-local coord
    // screen = (local - res/2) * zoom + res/2 + translate
    float lx = (pos.x - resolution.x * 0.5 - translate.x) / zoom + resolution.x * 0.5;
    float ly = (pos.y - resolution.y * 0.5 - translate.y) / zoom + resolution.y * 0.5;
    float2 cell = mod(float2(lx, ly), float2(spacing)) - float2(spacing * 0.5);
    float  dist = length(cell);
    float  aa   = 0.8 / zoom;
    float  alpha = 0.35 * (1.0 - smoothstep(dotR - aa, dotR + aa, dist));
    half4 bg  = half4(0.973, 0.980, 1.0, 1.0);
    half4 dot = half4(0.231, 0.510, 0.965, 1.0);
    return mix(bg, dot, half(alpha));
  }
`;

function DotGridBackground({
  translateX, translateY, scale,
}: {
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
}) {
  const dotShader = useMemo(() => {
    try { return Skia.RuntimeEffect.Make(DOT_SHADER_SRC); } catch { return null; }
  }, []);

  const uniforms = useDerivedValue(() => ({
    resolution: [SW, SH],
    translate: [translateX.value, translateY.value],
    zoom: scale.value,
  }));

  if (dotShader) {
    return (
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Fill><Shader source={dotShader} uniforms={uniforms} /></Fill>
      </Canvas>
    );
  }

  // Fallback: screen-space SVG (~13 MB on a 3× device — well within limits)
  return (
    <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="screen-dots" x={0} y={0} width={DOT_SPACING} height={DOT_SPACING} patternUnits="userSpaceOnUse">
          <Circle cx={DOT_SPACING / 2} cy={DOT_SPACING / 2} r={1.5} fill="#3B82F6" opacity={0.35} />
        </Pattern>
      </Defs>
      <Rect width={SW} height={SH} fill="url(#screen-dots)" />
    </Svg>
  );
}

// ─── Connection rendering (Skia, real-time) ──────────────────────────────────
// All connection data is packed into ONE SharedValue so the UI thread receives
// a single atomic update — no race condition between separate shared values.

const CARD_H_EST = 90;

type ConnRenderData = {
  positions: Record<number, CardPos>;
  connections: Array<{ id: number; fromNodeId: number; toNodeId: number }>;
  heights: Record<number, number>;
};
const CONN_COLOR = colors.neutralDarkMedium;

type CardPos = { x: number; y: number; w: number };

// Worklet: compute all connection SVG path strings in screen space.
// Returns "curvePath|||arrowPath" — split by caller.
function buildConnPaths(
  positions: Record<number, CardPos>,
  conns: Array<{ id: number; fromNodeId: number; toNodeId: number }>,
  heights: Record<number, number>,
  s: number, tx: number, ty: number,
  showX: boolean
): string {
  "worklet";
  const HW = SW / 2, HH = SH / 2;
  let curve = "", arrow = "", xCircles = "", xMarks = "";
  for (let i = 0; i < conns.length; i++) {
    const conn = conns[i];
    const from = positions[conn.fromNodeId];
    const to   = positions[conn.toNodeId];
    if (!from || !to) continue;
    const fH = heights[conn.fromNodeId] ?? 90;
    const tH = heights[conn.toNodeId]   ?? 90;
    const fcx = from.x + from.w / 2, fcy = from.y + fH / 2;
    const tcx = to.x   + to.w   / 2, tcy = to.y   + tH / 2;
    const dx = tcx - fcx, dy = tcy - fcy;
    // best anchor pair
    let fa: string, ta: string;
    if (Math.abs(dx) >= Math.abs(dy)) { fa = dx > 0 ? "right" : "left"; ta = dx > 0 ? "left" : "right"; }
    else                              { fa = dy > 0 ? "bottom" : "top"; ta = dy > 0 ? "top" : "bottom"; }
    // anchor points in canvas space
    let fpx = 0, fpy = 0, tpx = 0, tpy = 0;
    if      (fa === "right")  { fpx = from.x + from.w; fpy = fcy; }
    else if (fa === "left")   { fpx = from.x;           fpy = fcy; }
    else if (fa === "top")    { fpx = fcx; fpy = from.y; }
    else                      { fpx = fcx; fpy = from.y + fH; }
    if      (ta === "left")   { tpx = to.x;           tpy = tcy; }
    else if (ta === "right")  { tpx = to.x + to.w;    tpy = tcy; }
    else if (ta === "top")    { tpx = tcx; tpy = to.y; }
    else                      { tpx = tcx; tpy = to.y + tH; }
    // canvas → screen
    const sfpx = (fpx - HW) * s + HW + tx, sfpy = (fpy - HH) * s + HH + ty;
    const stpx = (tpx - HW) * s + HW + tx, stpy = (tpy - HH) * s + HH + ty;
    const d = Math.sqrt((stpx-sfpx)*(stpx-sfpx) + (stpy-sfpy)*(stpy-sfpy));
    const c = Math.min(d * 0.45, 100);
    let ox1 = 0, oy1 = 0, ox2 = 0, oy2 = 0;
    if      (fa === "right")  ox1 =  c;
    else if (fa === "left")   ox1 = -c;
    else if (fa === "bottom") oy1 =  c;
    else                      oy1 = -c;
    if      (ta === "left")   ox2 = -c;
    else if (ta === "right")  ox2 =  c;
    else if (ta === "top")    oy2 = -c;
    else                      oy2 =  c;
    curve += `M ${sfpx} ${sfpy} C ${sfpx+ox1} ${sfpy+oy1} ${stpx+ox2} ${stpy+oy2} ${stpx} ${stpy} `;
    const sz = 9;
    const angMap: Record<string, number> = { left: 0, right: 3.14159, top: 1.5708, bottom: -1.5708 };
    const ang = angMap[ta] ?? 0;
    arrow += `M ${stpx} ${stpy} L ${stpx+Math.cos(ang+2.5)*sz} ${stpy+Math.sin(ang+2.5)*sz} L ${stpx+Math.cos(ang-2.5)*sz} ${stpy+Math.sin(ang-2.5)*sz} Z `;
    if (showX) {
      // X button circle at curve midpoint (screen space) — r=6 → 12px diameter
      const mx = (sfpx + stpx) / 2, my = (sfpy + stpy) / 2, r = 6, k = 0.5523;
      xCircles += `M ${mx-r} ${my} C ${mx-r} ${my-k*r} ${mx-k*r} ${my-r} ${mx} ${my-r} C ${mx+k*r} ${my-r} ${mx+r} ${my-k*r} ${mx+r} ${my} C ${mx+r} ${my+k*r} ${mx+k*r} ${my+r} ${mx} ${my+r} C ${mx-k*r} ${my+r} ${mx-r} ${my+k*r} ${mx-r} ${my} Z `;
      const xs = 2;
      xMarks += `M ${mx-xs} ${my-xs} L ${mx+xs} ${my+xs} M ${mx+xs} ${my-xs} L ${mx-xs} ${my+xs} `;
    }
  }
  return curve.trimEnd() + "|||" + arrow.trimEnd() + "|||" + xCircles.trimEnd() + "|||" + xMarks.trimEnd();
}

function ConnectionsSkiaLayer({
  connRenderData, translateX, translateY, scale, showXButtons,
}: {
  connRenderData: SharedValue<ConnRenderData>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  showXButtons: boolean;
}) {
  // Local shared values — tracked reliably within this component's worklets
  const showXShared = useSharedValue(showXButtons);
  const localTick = useSharedValue(0);

  useEffect(() => {
    showXShared.value = showXButtons;
    localTick.value += 1;
  }, [showXButtons]);

  const allPaths = useDerivedValue(() => {
    void localTick.value;         // force re-run when showXButtons changes
    const showX = showXShared.value;
    const d = connRenderData.value;
    if (d.connections.length === 0) return "|||";
    return buildConnPaths(d.positions, d.connections, d.heights,
      scale.value, translateX.value, translateY.value, showX);
  });

  const curvePath  = useDerivedValue(() => allPaths.value.split("|||")[0] ?? "");
  const arrowPath  = useDerivedValue(() => allPaths.value.split("|||")[1] ?? "");
  const xCircPath  = useDerivedValue(() => allPaths.value.split("|||")[2] ?? "");
  const xMarkPath  = useDerivedValue(() => allPaths.value.split("|||")[3] ?? "");

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <SkiaPath path={curvePath} color={CONN_COLOR} strokeWidth={1.5} style="stroke" strokeCap="round" strokeJoin="round" />
      <SkiaPath path={arrowPath} color={CONN_COLOR} style="fill" />
      <SkiaPath path={xCircPath} color="#EF4444" style="fill" />
      <SkiaPath path={xMarkPath} color="white" strokeWidth={1.5} style="stroke" strokeCap="round" />
    </Canvas>
  );
}


// ─── Drawer helpers ───────────────────────────────────────────────────────────

function getCardSubtitle(node: CanvasNode, supData: SupData): string {
  switch (node.cardType) {
    case "text-titled": return node.description ?? "";
    case "text-quote":  return node.description ?? "";
    case "link": {
      const m = supData.linkMetaMap[node.id];
      return m?.ogTitle ?? (m?.url ? m.url.replace(/^https?:\/\//, "").split("/")[0] : "");
    }
    case "todo": {
      const items = supData.todoItemsMap[node.id] ?? [];
      return `${items.length} item${items.length !== 1 ? "s" : ""}`;
    }
    case "place": return supData.placeMetaMap[node.id]?.placeTitle ?? "";
    case "image": {
      const items = supData.mediaItemsMap[node.id] ?? [];
      return `${items.length} image${items.length !== 1 ? "s" : ""}`;
    }
    case "gif":   return "Animated GIF";
    case "video": return "Video";
    default: return "";
  }
}

function DrawerPreviewPlaceholder({ icon }: { icon: keyof typeof Feather.glyphMap }) {
  return (
    <View style={drawerStyles.preview}>
      <Feather name={icon} size={16} color={colors.neutralLight} />
    </View>
  );
}

const DrawerMiniPreview = React.memo(function DrawerMiniPreview({ node, supData }: { node: CanvasNode; supData: SupData }) {
  const media = supData.mediaItemsMap[node.id] ?? [];
  const cfg = TYPE_CONFIG[node.cardType] ?? TYPE_CONFIG["text-titled"];

  switch (node.cardType) {
    case "image":
    case "place": {
      const uri = media[0]?.uri;
      return uri
        ? <Image source={{ uri }} style={drawerStyles.preview} resizeMode="cover" />
        : <DrawerPreviewPlaceholder icon={cfg.icon} />;
    }
    case "gif": {
      const uri = media[0]?.uri;
      return uri
        ? <ExpoImage source={{ uri }} style={drawerStyles.preview} contentFit="cover" autoplay={false} />
        : <DrawerPreviewPlaceholder icon="film" />;
    }
    case "video":
      return (
        <View style={[drawerStyles.preview, drawerStyles.previewDark]}>
          <Feather name="play" size={14} color="rgba(255,255,255,0.65)" />
        </View>
      );
    case "link": {
      const og = supData.linkMetaMap[node.id]?.ogImageUrl;
      return og
        ? <Image source={{ uri: og }} style={drawerStyles.preview} resizeMode="cover" />
        : <DrawerPreviewPlaceholder icon="link" />;
    }
    case "todo": {
      const items = supData.todoItemsMap[node.id] ?? [];
      return (
        <View style={[drawerStyles.preview, drawerStyles.previewPad]}>
          {(items.length ? items.slice(0, 4) : [{} as any, {} as any, {} as any]).map((item, i) => (
            <View key={i} style={drawerStyles.previewTodoRow}>
              <View style={[drawerStyles.previewDot, item.checked && { backgroundColor: colors.primary }]} />
              <View style={[drawerStyles.previewLine, i === (items.length ? items.length - 1 : 2) && { width: "60%" }]} />
            </View>
          ))}
        </View>
      );
    }
    default:
      return (
        <View style={[drawerStyles.preview, drawerStyles.previewPad]}>
          {[1, 0.85, 0.55].map((w, i) => (
            <View key={i} style={[drawerStyles.previewLine, { width: `${w * 100}%` }]} />
          ))}
        </View>
      );
  }
});

const DrawerCardItem = React.memo(function DrawerCardItem({
  number, node, supData, isDeleteMode, onPress, onLongPress, onDelete,
}: {
  number: number; node: CanvasNode; supData: SupData; isDeleteMode: boolean;
  onPress: () => void; onLongPress: () => void; onDelete: () => void;
}) {
  const cfg = TYPE_CONFIG[node.cardType] ?? TYPE_CONFIG["text-titled"];
  const title = node.title && node.title !== "New card" ? node.title : "";
  const sub = getCardSubtitle(node, supData);
  return (
    <Pressable style={drawerStyles.listItem} onPress={onPress} onLongPress={onLongPress} delayLongPress={400}>
      <Text style={drawerStyles.frameNumber}>{number}</Text>
      <DrawerMiniPreview node={node} supData={supData} />
      <View style={drawerStyles.itemInfo}>
        <View style={drawerStyles.typeRow}>
          <Feather name={cfg.icon} size={11} color={colors.neutralDarkMedium} />
          <Text style={drawerStyles.typeName}>{cfg.label}</Text>
        </View>
        {!!(title || sub) && (
          <Text style={drawerStyles.itemTitle} numberOfLines={1}>{title || sub}</Text>
        )}
      </View>
      {isDeleteMode && (
        <Pressable onPress={onDelete} hitSlop={10} style={{ marginRight: spacing.sm }}>
          <Feather name="trash-2" size={18} color="#EF4444" />
        </Pressable>
      )}
    </Pressable>
  );
});

function ComponentsDrawer({
  frames, supData, connections, nodeMapAll, onSelect, onDelete, onDeleteConnection, onClose,
}: {
  frames: CanvasNode[]; supData: SupData; connections: CanvasConnection[]; nodeMapAll: CanvasNode[];
  onSelect: (node: CanvasNode) => void;
  onDelete: (nodeId: number) => void;
  onDeleteConnection: (id: number) => void;
  onClose: () => void;
}) {
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteConnId, setDeleteConnId] = useState<number | null>(null);
  // Phase 1 (instant): header only
  // Phase 2 (after ~290ms, post-animation): node list
  // Phase 3 (after ~440ms): connections section
  const [showNodes, setShowNodes] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const t1 = setTimeout(() => setShowNodes(true), 290);
    const t2 = setTimeout(() => setShowConnections(true), 440);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const nodeMap = useMemo(() => {
    const m: Record<number, CanvasNode> = {};
    nodeMapAll.forEach(n => { m[n.id] = n; });
    return m;
  }, [nodeMapAll]);

  // Every URL on the board (link cards, YouTube audio/video, places) — shown as a
  // dedicated "Links" section.
  const linkItems = useMemo(() => {
    const items: { key: string; title: string; url: string; icon: keyof typeof Feather.glyphMap }[] = [];
    for (const n of nodeMapAll) {
      if (n.cardType === "link") {
        const m = supData.linkMetaMap[n.id];
        if (m?.url) items.push({ key: `l${n.id}`, title: m.ogTitle || m.url, url: m.url, icon: "link" });
      } else if (n.cardType === "audio") {
        const m = supData.audioMetaMap[n.id];
        if (m?.sourceType === "youtube" && m.youtubeVideoId)
          items.push({ key: `a${n.id}`, title: m.title || "YouTube audio", url: `https://youtu.be/${m.youtubeVideoId}`, icon: "music" });
      } else if (n.cardType === "video") {
        const md = supData.mediaItemsMap[n.id]?.[0];
        if (md?.mediaType === "youtube")
          items.push({ key: `v${n.id}`, title: n.title && n.title !== "New card" ? n.title : "YouTube video", url: `https://youtu.be/${md.uri}`, icon: "youtube" });
      } else if (n.cardType === "place") {
        const m = supData.placeMetaMap[n.id];
        if (m?.osmUrl) items.push({ key: `p${n.id}`, title: m.placeTitle || "Place", url: m.osmUrl, icon: "map-pin" });
      }
    }
    return items;
  }, [nodeMapAll, supData]);

  return (
    <View style={[drawerStyles.panel, { paddingTop: insets.top }]}>
      <View style={drawerStyles.drawerHeader}>
        <Text style={drawerStyles.drawerTitle}>Frames · left-to-right order</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Feather name="x" size={18} color={colors.neutralDarkDarkest} />
        </Pressable>
      </View>

      {showNodes ? (
        <FlatList
          data={frames}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews
          ListFooterComponent={showConnections ? (
            <View>
              {connections.length > 0 && (
              <View>
              <View style={drawerStyles.sectionHeader}>
                <Feather name="link-2" size={11} color={colors.textMuted} />
                <Text style={drawerStyles.sectionTitle}>Connections ({connections.length})</Text>
              </View>
              {connections.map((conn, i) => {
                const from = nodeMap[conn.fromNodeId];
                const to   = nodeMap[conn.toNodeId];
                const fromCfg = TYPE_CONFIG[from?.cardType ?? ""] ?? TYPE_CONFIG["text-titled"];
                const toCfg   = TYPE_CONFIG[to?.cardType   ?? ""] ?? TYPE_CONFIG["text-titled"];
                return (
                  <Pressable key={conn.id} style={drawerStyles.connItem}
                    onLongPress={() => setDeleteConnId(conn.id)} delayLongPress={400}>
                    <Text style={drawerStyles.indexText}>{i + 1}</Text>
                    <Feather name={fromCfg.icon} size={12} color={colors.neutralDarkMedium} />
                    <Feather name="arrow-right" size={10} color={colors.textMuted} />
                    <Feather name={toCfg.icon} size={12} color={colors.neutralDarkMedium} />
                    <Text style={[drawerStyles.itemTitle, { flex: 1 }]} numberOfLines={1}>
                      {from?.title || fromCfg.label} → {to?.title || toCfg.label}
                    </Text>
                    {deleteConnId === conn.id && (
                      <Pressable onPress={() => { onDeleteConnection(conn.id); setDeleteConnId(null); }}
                        hitSlop={10} style={{ marginRight: spacing.sm }}>
                        <Feather name="trash-2" size={16} color="#EF4444" />
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
              </View>
              )}

              {linkItems.length > 0 && (
                <View>
                  <View style={drawerStyles.sectionHeader}>
                    <Feather name="link" size={11} color={colors.textMuted} />
                    <Text style={drawerStyles.sectionTitle}>Links ({linkItems.length})</Text>
                  </View>
                  {linkItems.map((item, i) => (
                    <Pressable
                      key={item.key}
                      style={drawerStyles.connItem}
                      onPress={() => WebBrowser.openBrowserAsync(item.url)}
                    >
                      <Text style={drawerStyles.indexText}>{i + 1}</Text>
                      <Feather name={item.icon} size={12} color={colors.neutralDarkMedium} />
                      <Text style={[drawerStyles.itemTitle, { flex: 1 }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Feather name="external-link" size={12} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : null}
          renderItem={({ item, index }) => (
            <DrawerCardItem
              number={index + 1}
              node={item}
              supData={supData}
              isDeleteMode={deleteTargetId === item.id}
              onPress={() => {
                if (deleteTargetId !== null) { setDeleteTargetId(null); return; }
                onSelect(item);
              }}
              onLongPress={() => setDeleteTargetId(item.id)}
              onDelete={() => { setDeleteTargetId(null); onDelete(item.id); }}
            />
          )}
        />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
    </View>
  );
}

// ─── Canvas Card shell ────────────────────────────────────────────────────────

type CardProps = {
  node: CanvasNode;
  scale: SharedValue<number>;
  panRef: React.MutableRefObject<GestureType | undefined>;
  supData: SupData;
  highlighted: boolean;
  isConnectSource: boolean;
  hidden: boolean;
  childCount: number;
  locked: boolean;
  frameNumber?: number;
  audioActive: boolean;
  audioPlaying: boolean;
  onMoveById: (id: number, x: number, y: number) => void;
  onEditById: (id: number) => void;
  onDeleteById: (id: number) => void;
  onResizeById: (id: number, width: number) => void;
  onResizeStart: (id: number) => void;
  onResizeEnd: () => void;
  onToggleTodo: (nodeId: number, itemId: number, checked: boolean) => void;
  onInteractById: (id: number) => void;
  onToggleCollapse: (id: number, collapsed: boolean) => void;
  onMeasureHeight: (nodeId: number, height: number) => void;
  connRenderData: SharedValue<ConnRenderData>;
};

function CanvasCard({
  node, scale, panRef, supData, highlighted, isConnectSource, hidden, childCount, locked, frameNumber,
  audioActive, audioPlaying,
  onMoveById, onEditById, onDeleteById, onResizeById, onResizeStart, onResizeEnd,
  onToggleTodo, onInteractById, onToggleCollapse, onMeasureHeight, connRenderData,
}: CardProps) {
  const absX = useSharedValue(node.x);
  const absY = useSharedValue(node.y);
  const startX = useSharedValue(node.x);
  const startY = useSharedValue(node.y);
  const cardWidth = useSharedValue(node.width);
  const startWidth = useSharedValue(node.width);
  const cardOpacity = useSharedValue(1);

  useEffect(() => {
    absX.value = node.x;
    absY.value = node.y;
    cardWidth.value = node.width;
  }, [node.x, node.y, node.width]);

  // Single tap = interact (play / open media / etc.); double tap = edit sheet.
  // All card gestures are disabled in lock (viewer) mode.
  const doubleTap = Gesture.Tap()
    .enabled(!locked)
    .numberOfTaps(2)
    .maxDuration(200)
    .onEnd(() => { runOnJS(onEditById)(node.id); });

  const tapGesture = Gesture.Tap()
    .enabled(!locked)
    .numberOfTaps(1)
    .maxDuration(200)
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => { runOnJS(onInteractById)(node.id); });

  const longPress = Gesture.LongPress()
    .enabled(!locked)
    .minDuration(600)
    .onStart(() => { runOnJS(onDeleteById)(node.id); });

  const dragGesture = Gesture.Pan()
    .enabled(!locked)
    .blocksExternalGesture(panRef) // held drag moves the card, not the canvas
    .activateAfterLongPress(300)
    .onStart(() => {
      startX.value = absX.value;
      startY.value = absY.value;
      // Keep the card fully opaque while dragging (dimming let the dot-grid show
      // through the white card and read as gray).
    })
    .onUpdate((e) => {
      absX.value = startX.value + e.translationX / scale.value;
      absY.value = startY.value + e.translationY / scale.value;
      // Update positions atomically — same object, new reference so worklet re-runs
      const cur = connRenderData.value;
      connRenderData.value = { ...cur, positions: { ...cur.positions, [node.id]: { x: absX.value, y: absY.value, w: cardWidth.value } } };
    })
    .onEnd(() => {
      cardOpacity.value = 1;
      runOnJS(onMoveById)(node.id, absX.value, absY.value);
    })
    .onFinalize(() => { cardOpacity.value = 1; });

  // Top-right handle. Drag up/right to grow, down/left to shrink. Width changes in
  // real time; media content height is bound to this same width (see media cards),
  // so both dimensions resize together, keeping the aspect ratio.
  const resizeGesture = Gesture.Pan()
    .enabled(!locked)
    .blocksExternalGesture(panRef) // resizing shouldn't also pan the canvas
    .minPointers(1)
    .maxPointers(1)
    .hitSlop(14)
    .onStart(() => {
      startWidth.value = cardWidth.value;
      runOnJS(onResizeStart)(node.id);
    })
    .onUpdate((e) => {
      // Horizontal drag drives width; media height is bound to width (aspect ratio).
      const w = Math.max(MIN_CARD_W, Math.min(MAX_CARD_W, startWidth.value + e.translationX / scale.value));
      cardWidth.value = w;
      // Live width keeps arrows attached; height stays frozen (measurement is
      // paused for this node during the resize) and settles exactly on release.
      const cur = connRenderData.value;
      connRenderData.value = {
        ...cur,
        positions: { ...cur.positions, [node.id]: { x: absX.value, y: absY.value, w } },
      };
    })
    .onEnd(() => {
      runOnJS(onResizeById)(node.id, cardWidth.value);
      runOnJS(onResizeEnd)();
    });

  // Pan/zoom is handled by the single canvas-wide gesture that now wraps the cards
  // (see render). The card only needs its own interactions; the long-press drag
  // blocks the canvas pan so a held drag moves the card instead of panning.
  const gesture = Gesture.Race(dragGesture, longPress, doubleTap, tapGesture);

  // The eye chip must use a gesture-handler Tap (not a plain Pressable) so it can win against
  // the canvas pan/pinch ancestor via blocksExternalGesture — otherwise the pan swallows the
  // tap on Android and the eye appears unresponsive.
  const eyeTap = Gesture.Tap()
    .enabled(!locked)
    .maxDuration(250)
    .blocksExternalGesture(panRef)
    .onEnd(() => { runOnJS(onToggleCollapse)(node.id, !node.collapsed); });

  // Outer wrapper holds position; card keeps the width. The eye chip is a flow
  // child below the card so the wrapper grows to include it (Android delivers
  // touches only within a parent's bounds — an absolute chip below the card
  // would be untappable).
  const wrapperStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: absX.value,
    top: absY.value,
    // Hidden (collapsed-branch) cards go fully transparent. This MUST live in the animated
    // style: a static `opacity: 0` override is overridden by this animated opacity on the UI
    // thread every frame, which is why collapsing appeared to hide the arrows but not cards.
    opacity: hidden ? 0 : cardOpacity.value,
    alignItems: "flex-end",
  }), [hidden]);
  const cardStyle = useAnimatedStyle(() => ({
    width: cardWidth.value,
  }));

  const cardType = node.cardType as CardType;
  const cardW = node.width;
  const todoItems = supData.todoItemsMap[node.id] ?? [];
  const mediaItems = supData.mediaItemsMap[node.id] ?? [];
  const linkMeta = supData.linkMetaMap[node.id];
  const placeMeta = supData.placeMetaMap[node.id];
  const audioMeta = supData.audioMetaMap[node.id];

  const renderContent = () => {
    switch (cardType) {
      case "text-titled": return <TextTitledContent node={node} />;
      case "text-quote": return <TextQuoteContent node={node} />;
      case "image": return <ImageContent node={node} mediaItems={mediaItems} cardW={cardW} cardWidthSV={cardWidth} />;
      case "link": return <LinkContent linkMeta={linkMeta} cardW={cardW} />;
      case "todo": return <TodoContent node={node} todoItems={todoItems} onToggle={(id, c) => onToggleTodo(node.id, id, c)} />;
      case "place": return <PlaceContent node={node} placeMeta={placeMeta} cardW={cardW} />;
      case "gif": return <GifContent mediaItems={mediaItems} cardW={cardW} cardWidthSV={cardWidth} />;
      case "video": return <VideoContent mediaItems={mediaItems} cardW={cardW} cardWidthSV={cardWidth} />;
      case "audio": return <AudioContent node={node} audioMeta={audioMeta} active={audioActive} playing={audioPlaying} />;
      default: return <TextTitledContent node={node} />;
    }
  };

  return (
    // Hidden cards stay mounted + laid out (so no image reload / height thrash on
    // re-show) but render invisible and non-interactive.
    <Animated.View
      style={wrapperStyle}
      pointerEvents={hidden ? "none" : "box-none"}
    >
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.card, cardStyle, highlighted && styles.cardHighlighted, isConnectSource && styles.cardConnectSource]}
          onLayout={(e) => onMeasureHeight(node.id, e.nativeEvent.layout.height)}
          // In lock mode cards pass touches through so pan/zoom works anywhere.
          pointerEvents={locked ? "none" : "auto"}
        >
          {renderContent()}
          {/* Resize handle — inner GestureDetector takes priority over outer card gestures */}
          <GestureDetector gesture={resizeGesture}>
            <View style={styles.resizeHandle}>
              <Feather name="chevrons-right" size={10} color={colors.neutralLight} />
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>

      {/* Eye chip — below the card, bottom-right. Plain Pressable (captures its own
          tap, never opens the modal) and OUTSIDE the card's GestureDetector. White
          fill so an arrow reads as passing under it. Only when it has children. */}
      {childCount > 0 && !locked && (
        <GestureDetector gesture={eyeTap}>
          <View style={styles.collapseChip} hitSlop={10}>
            <Feather
              name={node.collapsed ? "eye-off" : "eye"}
              size={24}
              color={colors.neutralDarkMedium}
            />
            <Text style={styles.collapseChipText}>{childCount}</Text>
          </View>
        </GestureDetector>
      )}

      {/* Frame number badge (top-left) — only on frames (roots) that are ordered. */}
      {frameNumber != null && (
        <View style={styles.frameBadge} pointerEvents="none">
          <Text style={styles.frameBadgeText}>{frameNumber}</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Card type picker sheet ───────────────────────────────────────────────────

function CardTypePicker({
  sheetRef,
  onSelect,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  onSelect: (type: CardType) => void;
}) {
  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={["42%"]}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.sheetHandle}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
      )}
    >
      <BottomSheetView style={pickerStyles.container}>
        <Text style={pickerStyles.title}>Add card</Text>
        <View style={pickerStyles.grid}>
          {CARD_TYPE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.type}
              style={pickerStyles.cell}
              onPress={() => {
                sheetRef.current?.dismiss();
                onSelect(opt.type);
              }}
            >
              <View style={pickerStyles.iconBox}>
                <Feather name={opt.icon} size={22} color={colors.primary} />
              </View>
              <Text style={pickerStyles.label}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

// ─── Collapse visibility transform ────────────────────────────────────────────
// Pure. Given all nodes + real connections, decide which nodes are hidden by a
// collapsed node, and which arrows to draw. The connect / sever / Skia arrow code
// is untouched — it just receives the filtered lists.
//
// Model (direction-based, "any parent"):
//  • "children" of a node = the nodes it POINTS TO (outgoing arrows). Direction is
//    set by pick order in connect mode (first-picked = the parent/source). It has
//    nothing to do with which side a card sits on.
//  • Pressing a node's eye hides its ENTIRE downstream branch (children, their
//    children, …). A node is hidden if it is downstream of ANY collapsed node.
//  • The collapsed node itself stays visible (shows the eye) unless it is itself
//    inside another collapsed branch.
//  • NO rerouting: an arrow is drawn only if BOTH endpoints are visible. Arrows
//    touching a hidden node simply disappear (nothing snaps onto the collapsed
//    card), so collapsing/expanding doesn't make the graph jump around. All
//    visible arrows keep their real ids, so the X-sever always hits a real edge.
type VisConn = { id: number; fromNodeId: number; toNodeId: number };
function computeCanvasVisibility(
  nodes: CanvasNode[],
  connections: CanvasConnection[]
): {
  hidden: Set<number>;
  visibleConnections: VisConn[];
  childCount: Record<number, number>;
} {
  const childrenOf: Record<number, number[]> = {};
  const childCount: Record<number, number> = {};
  for (const c of connections) {
    (childrenOf[c.fromNodeId] ??= []).push(c.toNodeId);
    childCount[c.fromNodeId] = (childCount[c.fromNodeId] ?? 0) + 1;
  }

  // Hidden = everything downstream (following arrows) of ANY collapsed node.
  const hidden = new Set<number>();
  for (const n of nodes) {
    if (!n.collapsed) continue;
    const stack = [...(childrenOf[n.id] ?? [])];
    while (stack.length) {
      const d = stack.pop()!;
      if (hidden.has(d)) continue;
      hidden.add(d);
      for (const ch of childrenOf[d] ?? []) stack.push(ch);
    }
  }

  const visibleConnections: VisConn[] = connections
    .filter((c) => !hidden.has(c.fromNodeId) && !hidden.has(c.toNodeId))
    .map((c) => ({ id: c.id, fromNodeId: c.fromNodeId, toNodeId: c.toNodeId }));

  return { hidden, visibleConnections, childCount };
}

// ─── YouTube helpers ──────────────────────────────────────────────────────────

// Extract an 11-char video id from any common YouTube URL form (or a bare id).
function extractYoutubeId(input: string): string | null {
  const url = input.trim();
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/
  );
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url;
  return null;
}

// Title / author / thumbnail via YouTube's keyless oEmbed endpoint.
async function fetchYoutubeOEmbed(url: string): Promise<{
  title: string | null; author: string | null; thumbnail: string | null;
} | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const j = await res.json();
    return { title: j.title ?? null, author: j.author_name ?? null, thumbnail: j.thumbnail_url ?? null };
  } catch {
    return null;
  }
}

// ─── Frames (storyboard sequence) ─────────────────────────────────────────────
// A "frame" = a root card (no incoming arrow). Sequence order is spatial: frames
// are numbered left-to-right by their canvas x position (ties broken top-to-bottom,
// then by creation). Arranging cards on the canvas IS ordering them.
function getOrderedFrames(nodes: CanvasNode[], connections: CanvasConnection[]): CanvasNode[] {
  const hasIncoming = new Set<number>();
  for (const c of connections) hasIncoming.add(c.toNodeId);
  return nodes
    .filter((n) => !hasIncoming.has(n.id))
    .sort((a, b) => {
      if (Math.abs(a.x - b.x) > 1) return a.x - b.x;
      if (Math.abs(a.y - b.y) > 1) return a.y - b.y;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CanvasEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const fileId = parseInt(id, 10);

  const [file, setFile] = useState<CanvasFile | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [supData, setSupData] = useState<SupData>({
    todoItemsMap: {},
    mediaItemsMap: {},
    linkMetaMap: {},
    placeMetaMap: {},
    audioMetaMap: {},
  });

  // Camera transform
  const translateX = useSharedValue(SW / 2);
  const translateY = useSharedValue(SH / 2);
  const scale = useSharedValue(1);
  const savedTx = useSharedValue(SW / 2);
  const savedTy = useSharedValue(SH / 2);
  const savedScale = useSharedValue(1);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  // Sheet refs
  const pickerSheetRef = useRef<BottomSheetModal>(null);
  const editSheetRef = useRef<BottomSheetModal>(null);
  const deleteSheetRef = useRef<DeleteConfirmSheetRef>(null);
  const pendingDeleteRef = useRef<(() => Promise<void>) | null>(null);

  // Edit state
  const [editingNode, setEditingNode] = useState<CanvasNode | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Link edit
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [linkFetching, setLinkFetching] = useState(false);

  // Todo edit
  const [editTodoItems, setEditTodoItems] = useState<CanvasTodoItem[]>([]);
  const [newTodoText, setNewTodoText] = useState("");

  // Place edit — real coordinates picked via the map (no more pasted URL)
  const [editPlaceTitle, setEditPlaceTitle] = useState("");
  const [editPlaceLat, setEditPlaceLat] = useState<number | null>(null);
  const [editPlaceLng, setEditPlaceLng] = useState<number | null>(null);
  const [editPlaceOsmUrl, setEditPlaceOsmUrl] = useState<string | null>(null);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);

  // Media edit — ref keeps the latest value so handleSaveEdit never reads a stale closure
  const [editMediaItems, setEditMediaItems] = useState<CanvasMediaItem[]>([]);
  const editMediaItemsRef = useRef<CanvasMediaItem[]>([]);
  // Synchronously updates the ref BEFORE scheduling the React state update,
  // so handleSaveEdit always reads the latest value regardless of render timing
  const setEditMediaItemsSynced = (items: CanvasMediaItem[] | ((prev: CanvasMediaItem[]) => CanvasMediaItem[])) => {
    const next = typeof items === "function" ? items(editMediaItemsRef.current) : items;
    editMediaItemsRef.current = next;
    setEditMediaItems(next);
  };
  const [mediaUrlInput, setMediaUrlInput] = useState("");
  const mediaUrlRef = useRef("");  // ref so handleAddMediaUrl always sees latest value
  const [editAspectRatio, setEditAspectRatio] = useState<"1:1" | "3:2" | "2:3">("3:2");

  // AI image generation sheet (Cloudflare Workers AI). Targets a node id — either a freshly
  // created card (from the "+" picker) or the current editing node (from the edit-sheet button).
  const aiSheetRef = useRef<BottomSheetModal>(null);
  const [aiTargetNodeId, setAiTargetNodeId] = useState<number | null>(null);
  const aiOpenedFromFabRef = useRef(false); // true when the target node was just created by the picker
  const aiDidGenerateRef = useRef(false);   // set on success so the dismiss handler keeps the card
  // Prompt & reference-URL fields are UNCONTROLLED (value kept in refs, not state) so typing
  // doesn't re-render this huge screen on every keystroke — that caused flicker on new lines and
  // Android cursor jumps (e.g. a trailing space snapping back after the re-render landed). We
  // bump `aiFieldKey` to remount (and thus reset) the fields when the sheet opens.
  const aiPromptRef = useRef("");
  const aiRefUrlRef = useRef("");
  const [aiFieldKey, setAiFieldKey] = useState(0);
  const [aiRefUri, setAiRefUri] = useState<string | null>(null);     // local uri of reference → editing
  const [aiRefThumb, setAiRefThumb] = useState<string | null>(null); // preview uri for the reference
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Audio/video edit-sheet: source tab + the shared YouTube URL field
  const [audioSourceTab, setAudioSourceTab] = useState<"local" | "youtube">("local");
  const [videoYtMode, setVideoYtMode] = useState(false); // video sheet showing the YT input
  const [youtubeUrlInput, setYoutubeUrlInput] = useState("");
  const youtubeUrlRef = useRef("");

  // Full-screen image modal
  const [fullScreenUri, setFullScreenUri] = useState<string | null>(null);
  const [fullScreenGifUri, setFullScreenGifUri] = useState<string | null>(null);
  const [fullScreenVideoUri, setFullScreenVideoUri] = useState<string | null>(null);
  const [fullScreenYoutubeId, setFullScreenYoutubeId] = useState<string | null>(null);

  // Drawer — mount first (off-screen), animate in after one frame so
  // the FlatList/images render while the panel is invisible, not during animation
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState<number | null>(null);

  // Measured card heights for precise connection anchors
  const [cardHeights, setCardHeights] = useState<Record<number, number>>({});

  // Single atomic SharedValue for all connection render data — one JS→UI message
  // guarantees the worklet sees consistent state with no race condition.
  const connRenderData = useSharedValue<ConnRenderData>({ positions: {}, connections: [], heights: {} });
  const connectModeShared = useSharedValue(false);
  const renderTick = useSharedValue(0);

  useEffect(() => {
    // Collapsed nodes drop the arrows into their hidden branch before the data
    // reaches the (untouched) Skia worklet. All cards stay laid out (hidden ones
    // just render invisible), so positions/heights come from every node.
    const { visibleConnections } = computeCanvasVisibility(nodes, connections);
    const pos: Record<number, CardPos> = {};
    nodes.forEach(n => { pos[n.id] = { x: n.x, y: n.y, w: n.width }; });
    connRenderData.value = {
      positions: pos,
      connections: visibleConnections,
      heights: { ...cardHeights },
    };
    renderTick.value += 1;
    // @ts-expect-error `connections` is intentionally declared below this effect — the dep
    // array reading it as `undefined` is what makes the effect run once (see the notes at its
    // declaration). Reordering would change canvas runtime behavior, so we keep the forward ref.
  }, [nodes, connections, cardHeights]);



  // Connect mode
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [connectMode, setConnectMode] = useState(false);
  const [locked, setLocked] = useState(false); // viewer mode: pan/zoom + audio only
  const [pendingSourceId, setPendingSourceId] = useState<number | null>(null);
  const [connMidpoints, setConnMidpoints] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const pendingSourceIdRef = useRef<number | null>(null); // always-current for gestures

  // Sync connect-mode into the shared value the connectTap worklet reads. MUST be
  // declared AFTER `connectMode` — if it sits before the declaration the dep array
  // reads `undefined` every render, so the effect only runs once and the worklet
  // gets stuck seeing connectMode=false (severing silently no-ops).
  useEffect(() => {
    connectModeShared.value = connectMode;
    renderTick.value += 1; // force ConnectionsSkiaLayer worklet to re-evaluate showX
  }, [connectMode]);

  // Which cards are hidden by a collapsed ancestor + each card's direct-child
  // count (for the eye chip). Hidden cards stay mounted but render invisible.
  const { hidden: hiddenNodeIds, childCount } = useMemo(
    () => computeCanvasVisibility(nodes, connections),
    [nodes, connections]
  );

  // Are all parent nodes currently collapsed? Drives the collapse-all/expand-all FAB.
  const allChildrenHidden = useMemo(() => {
    const parents = nodes.filter((n) => (childCount[n.id] ?? 0) > 0);
    return parents.length > 0 && parents.every((n) => n.collapsed);
  }, [nodes, childCount]);

  // Frames (roots) in sequence order → number badge per frame.
  const orderedFrames = useMemo(() => getOrderedFrames(nodes, connections), [nodes, connections]);
  const frameNumbers = useMemo(() => {
    const m: Record<number, number> = {};
    orderedFrames.forEach((n, i) => { m[n.id] = i + 1; });
    return m;
  }, [orderedFrames]);


  // ── Audio: one canvas-level player, one track at a time. Two backends —
  //    expo-audio for local files, a hidden react-native-youtube-iframe for
  //    YouTube. Only one is ever active; play/pause/seek route by source type. ──
  const [activeAudioNodeId, setActiveAudioNodeId] = useState<number | null>(null);
  const [youtubePlaying, setYoutubePlaying] = useState(false); // controls the YT player
  const youtubeRef = useRef<YoutubeIframeRef>(null);

  const activeMeta = activeAudioNodeId != null ? supData.audioMetaMap[activeAudioNodeId] : null;
  const activeIsYoutube = activeMeta?.sourceType === "youtube";
  const activeYoutubeId = activeIsYoutube ? (activeMeta?.youtubeVideoId ?? null) : null;
  const activeLocalUri =
    activeAudioNodeId != null && !activeIsYoutube
      ? (supData.mediaItemsMap[activeAudioNodeId]?.[0]?.uri ?? null)
      : null;

  // Pass the raw uri string (a stable primitive) — an object literal would reload
  // the track every render. Null when the active track is a YouTube one.
  const audioPlayer = useAudioPlayer(activeLocalUri);
  const audioStatus = useAudioPlayerStatus(audioPlayer);

  const isActivePlaying = activeIsYoutube ? youtubePlaying : !!audioStatus?.playing;
  const activeAudioTitle = activeMeta?.title ?? "Audio track";

  // Auto-play local tracks when the selected local source changes.
  useEffect(() => {
    if (activeLocalUri) audioPlayer.play();
  }, [activeLocalUri]);

  const handleAudioToggle = useCallback((nodeId: number) => {
    const meta = supData.audioMetaMap[nodeId];
    const isYt = meta?.sourceType === "youtube";
    if (activeAudioNodeId === nodeId) {
      if (isYt) setYoutubePlaying((p) => !p);
      else if (audioStatus?.playing) audioPlayer.pause();
      else audioPlayer.play();
    } else {
      // Switch tracks — stop whichever backend was running, start the new one.
      audioPlayer.pause();
      setActiveAudioNodeId(nodeId);
      setYoutubePlaying(isYt); // YT → plays new videoId; local → YT idle, effect plays local
    }
  }, [activeAudioNodeId, supData, audioStatus?.playing, audioPlayer]);

  const handleAudioStop = useCallback(() => {
    audioPlayer.pause();
    setYoutubePlaying(false);
    setActiveAudioNodeId(null);
  }, [audioPlayer]);

  const handleAudioSeek = useCallback(async (delta: number) => {
    if (activeIsYoutube) {
      const t = (await youtubeRef.current?.getCurrentTime()) ?? 0;
      youtubeRef.current?.seekTo(Math.max(0, t + delta), true);
    } else {
      audioPlayer.seekTo(Math.max(0, (audioStatus?.currentTime ?? 0) + delta));
    }
  }, [activeIsYoutube, audioPlayer, audioStatus?.currentTime]);

  const drawerOffset = useSharedValue(DRAWER_W);
  const drawerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerOffset.value }],
  }));

  useEffect(() => {
    if (!drawerMounted) return;
    const rafId = requestAnimationFrame(() => {
      drawerOffset.value = withTiming(0, { duration: 260 });
    });
    return () => cancelAnimationFrame(rafId);
  }, [drawerMounted]);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    setIsLoading(true);
    loadCanvas(); // loadCanvas also loads file metadata
  }, [fileId]);

  const fitNodesToView = (nodeList: CanvasNode[]) => {
    if (!nodeList.length) return;
    const PADDING = 48;
    const HEADER_H = 60;
    const FAB_AREA = 110;
    const USABLE_H = SH - HEADER_H - FAB_AREA;
    const usableCenterY = HEADER_H + USABLE_H / 2;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodeList.forEach(n => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + n.width);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + CARD_H_EST);
    });

    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const newScale = Math.min(
      (SW - 2 * PADDING) / contentW,
      (USABLE_H - 2 * PADDING) / contentH,
      MAX_SCALE
    );
    const s = Math.max(newScale, MIN_SCALE);
    const newTx = -(cx - SW / 2) * s;
    const newTy = usableCenterY - (cy - SH / 2) * s - SH / 2;

    translateX.value = withTiming(newTx, { duration: 500 });
    translateY.value = withTiming(newTy, { duration: 500 });
    scale.value     = withTiming(s,     { duration: 500 });
    savedTx.value    = newTx;
    savedTy.value    = newTy;
    savedScale.value = s;
  };

  const loadCanvas = async () => {
    const t0 = Date.now();
    const [fileResult, loadedNodes, loadedConns] = await Promise.all([
      db.select().from(canvasFiles).where(eq(canvasFiles.id, fileId)).limit(1),
      getCanvasNodes(fileId),
      getCanvasConnections(fileId),
    ]);
    setFile(fileResult[0] as CanvasFile ?? null);
    setNodes(loadedNodes);
    setConnections(loadedConns);
    await loadSupData(loadedNodes);
    // Wait until 2 seconds total, then hide loading screen and start center animation
    await new Promise(r => setTimeout(r, Math.max(0, 2000 - (Date.now() - t0))));
    setIsLoading(false);
    // Small delay so canvas is visible before animation starts
    setTimeout(() => fitNodesToView(loadedNodes), 50);
  };

  const loadSupData = async (nodeList: CanvasNode[]) => {
    const todoMap: Record<number, CanvasTodoItem[]> = {};
    const mediaMap: Record<number, CanvasMediaItem[]> = {};
    const linkMap: Record<number, CanvasLinkMeta | null> = {};
    const placeMap: Record<number, CanvasPlaceMeta | null> = {};
    const audioMap: Record<number, CanvasAudioMeta | null> = {};

    await Promise.all(nodeList.map(async (n) => {
      if (n.cardType === "todo") {
        todoMap[n.id] = await getTodoItems(n.id);
      }
      if (["image", "gif", "video", "place", "audio"].includes(n.cardType)) {
        mediaMap[n.id] = await getMediaItems(n.id);
      }
      if (n.cardType === "link") {
        linkMap[n.id] = await getLinkMeta(n.id);
      }
      if (n.cardType === "place") {
        placeMap[n.id] = await getPlaceMeta(n.id);
      }
      if (n.cardType === "audio") {
        audioMap[n.id] = await getAudioMeta(n.id);
      }
    }));

    setSupData({
      todoItemsMap: todoMap,
      mediaItemsMap: mediaMap,
      linkMetaMap: linkMap,
      placeMetaMap: placeMap,
      audioMetaMap: audioMap,
    });
  };

  // ── Gestures ──────────────────────────────────────────────────────────────

  // Ref for the canvas pan so a card's long-press drag can block it (move the card
  // instead of panning). Quick drags still pan (drag needs the long-press first).
  const panRef = useRef<GestureType | undefined>(undefined);

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      savedScale.value = scale.value;
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
      pinchFocalX.value = e.focalX;
      pinchFocalY.value = e.focalY;
    })
    .onUpdate((e) => {
      const newScale = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
      const ratio = newScale / savedScale.value;
      translateX.value = pinchFocalX.value - ratio * (pinchFocalX.value - savedTx.value);
      translateY.value = pinchFocalY.value - ratio * (pinchFocalY.value - savedTy.value);
      scale.value = newScale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    });

  const panGesture = Gesture.Pan()
    .withRef(panRef)
    .minPointers(1)
    .maxPointers(1)
    .onStart(() => {
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = savedTx.value + e.translationX;
      translateY.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    });

  // Tap on canvas in connect mode: delete connection if near an X circle midpoint
  const canvasGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));


  // ── Node callbacks ────────────────────────────────────────────────────────

  const handleMoveById = useCallback(async (nodeId: number, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, x, y } : n));
    await updateCanvasNode(nodeId, { x, y });
  }, []);

  const handleResizeById = useCallback(async (nodeId: number, width: number) => {
    const w = Math.round(width);
    setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, width: w } : n));
    await updateCanvasNode(nodeId, { width: w });
  }, []);

  // While a card is being resized, ignore its onLayout height changes — otherwise
  // the connRenderData effect rebuilds positions from the stale (uncommitted)
  // width and fights the live resize update, making the arrows oscillate.
  const resizingNodeIdRef = useRef<number | null>(null);
  const handleResizeStart = useCallback((nodeId: number) => { resizingNodeIdRef.current = nodeId; }, []);
  const handleResizeEnd = useCallback(() => { resizingNodeIdRef.current = null; }, []);

  // Eye chip: collapse/expand a node's downstream branch. `collapsed` is the
  // desired next state (passed from the card, which knows the current value).
  const handleToggleCollapse = useCallback(async (nodeId: number, collapsed: boolean) => {
    if (connectMode) return; // inert while wiring arrows
    setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, collapsed } : n));
    await updateCanvasNode(nodeId, { collapsed });
  }, [connectMode]);

  // Collapse-all / expand-all: toggle every parent node's collapsed flag together.
  const handleToggleAll = useCallback(async () => {
    const parents = nodes.filter((n) => (childCount[n.id] ?? 0) > 0);
    if (parents.length === 0) return;
    const next = !parents.every((n) => n.collapsed); // collapse all unless already all collapsed
    setNodes((prev) =>
      prev.map((n) => ((childCount[n.id] ?? 0) > 0 ? { ...n, collapsed: next } : n))
    );
    await Promise.all(parents.map((n) => updateCanvasNode(n.id, { collapsed: next })));
  }, [nodes, childCount]);

  // Organize: lay frames out in a single evenly-spaced horizontal row, in their
  // left-to-right order, all centered on one axis. Each frame's whole subtree
  // (its references) is shifted by the same delta so clusters stay attached.
  const handleOrganize = useCallback(async () => {
    const frames = getOrderedFrames(nodes, connections);
    if (frames.length === 0) return;

    const childrenOf: Record<number, number[]> = {};
    for (const c of connections) (childrenOf[c.fromNodeId] ??= []).push(c.toNodeId);
    const descendantsOf = (rootId: number): number[] => {
      const out: number[] = [];
      const seen = new Set<number>();
      const stack = [...(childrenOf[rootId] ?? [])];
      while (stack.length) {
        const d = stack.pop()!;
        if (seen.has(d)) continue;
        seen.add(d); out.push(d);
        for (const ch of childrenOf[d] ?? []) stack.push(ch);
      }
      return out;
    };

    const GAP = 80;
    const nodeById: Record<number, CanvasNode> = {};
    nodes.forEach((n) => { nodeById[n.id] = n; });
    const heightOf = (id: number) => cardHeights[id] ?? CARD_H_EST;

    // Keep the row roughly where the frames already are.
    const centerY = frames.reduce((s, f) => s + (f.y + heightOf(f.id) / 2), 0) / frames.length;
    let cursorX = Math.min(...frames.map((f) => f.x));

    const updates: Record<number, { x: number; y: number }> = {};
    for (const f of frames) {
      const newX = cursorX;
      const newY = centerY - heightOf(f.id) / 2;
      const dx = newX - f.x, dy = newY - f.y;
      updates[f.id] = { x: newX, y: newY };
      for (const cid of descendantsOf(f.id)) {
        const cn = nodeById[cid];
        if (cn) updates[cid] = { x: cn.x + dx, y: cn.y + dy };
      }
      cursorX += f.width + GAP;
    }

    const next = nodes.map((n) => (updates[n.id] ? { ...n, ...updates[n.id] } : n));
    setNodes(next);
    await Promise.all(
      Object.entries(updates).map(([id, p]) => updateCanvasNode(Number(id), { x: p.x, y: p.y }))
    );
    // Frame the freshly organized row.
    setTimeout(() => fitNodesToView(next), 60);
  }, [nodes, connections, cardHeights]);

  const handleOpenDrawer = useCallback(() => {
    drawerOffset.value = DRAWER_W; // ensure off-screen before mount
    setDrawerMounted(true);
  }, [drawerOffset]);

  const handleCloseDrawer = useCallback(() => {
    drawerOffset.value = withTiming(DRAWER_W, { duration: 240 }, () => {
      runOnJS(setDrawerMounted)(false);
    });
  }, [drawerOffset]);

  const handlePanToCard = useCallback((node: CanvasNode) => {
    handleCloseDrawer();
    // Zoom to fit the card in the usable area and center it (same math as the
    // auto-fit on load, but for a single card).
    const PADDING = 56;
    const HEADER_H = 60;
    const FAB_AREA = 110;
    const USABLE_H = SH - HEADER_H - FAB_AREA;
    const usableCenterY = HEADER_H + USABLE_H / 2;
    const cardH = cardHeights[node.id] ?? CARD_H_EST;
    const cx = node.x + node.width / 2;
    const cy = node.y + cardH / 2;

    const fit = Math.min(
      (SW - 2 * PADDING) / node.width,
      (USABLE_H - 2 * PADDING) / cardH,
      MAX_SCALE
    );
    const s = Math.max(fit, MIN_SCALE);
    const targetTx = -(cx - SW / 2) * s;
    const targetTy = usableCenterY - (cy - SH / 2) * s - SH / 2;

    scale.value = withTiming(s, { duration: 400 });
    translateX.value = withTiming(targetTx, { duration: 400 });
    translateY.value = withTiming(targetTy, { duration: 400 });
    savedScale.value = s;
    savedTx.value = targetTx;
    savedTy.value = targetTy;
    setHighlightedNodeId(node.id);
    setTimeout(() => setHighlightedNodeId(null), 2000);
  }, [handleCloseDrawer, scale, translateX, translateY, savedTx, savedTy, savedScale, cardHeights]);

  const handleDeleteFromDrawer = useCallback(async (nodeId: number) => {
    await deleteCanvasNode(nodeId);
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setConnections((prev) => prev.filter((c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId));
    // Update render data — filter positions and connections by nodeId
    const cur = connRenderData.value;
    connRenderData.value = {
      ...cur,
      positions: Object.fromEntries(Object.entries(cur.positions).filter(([k]) => Number(k) !== nodeId)),
      connections: cur.connections.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId),
    };
  }, [connRenderData]);

  const handleCreateConnection = useCallback(async (fromNodeId: number, toNodeId: number) => {
    const conn = await createCanvasConnection({ fileId, fromNodeId, toNodeId });
    setConnections((prev) => [...prev, conn]);
    const cur = connRenderData.value;
    connRenderData.value = {
      ...cur,
      connections: [...cur.connections, { id: conn.id, fromNodeId, toNodeId }],
    };
  }, [fileId, connRenderData]);

  // Stable deps (no `connections`) so runOnJS captures a reliable reference in the gesture worklet
  const handleDeleteConnection = useCallback(async (id: number) => {
    await deleteCanvasConnection(id);
    setConnections((prev) => prev.filter((c) => c.id !== id));
    const cur = connRenderData.value;
    connRenderData.value = {
      ...cur,
      connections: cur.connections.filter(c => c.id !== id),
    };
  }, [connRenderData]);

  // Defined AFTER handleDeleteConnection to avoid Reanimated Babel forward-reference issue
  // (worklet closures are serialized at compile-time, so forward refs become undefined)
  const connectTap = Gesture.Tap()
    .onEnd((e) => {
      if (!connectModeShared.value) return;
      const d = connRenderData.value;
      if (d.connections.length === 0) return;
      const s = scale.value, tx = translateX.value, ty = translateY.value;
      const HW = SW / 2, HH = SH / 2;
      const HIT = 12;
      for (let i = 0; i < d.connections.length; i++) {
        const conn = d.connections[i];
        const from = d.positions[conn.fromNodeId], to = d.positions[conn.toNodeId];
        if (!from || !to) continue;
        const fH = d.heights[conn.fromNodeId] ?? 90, tH = d.heights[conn.toNodeId] ?? 90;
        const fcy = from.y + fH / 2, tcy = to.y + tH / 2;
        const fcx = from.x + from.w / 2, tcx = to.x + to.w / 2;
        const dx = tcx - fcx, dy = tcy - fcy;
        let fpx = 0, fpy = 0, tpx = 0, tpy = 0;
        if (Math.abs(dx) >= Math.abs(dy)) {
          fpx = dx > 0 ? from.x + from.w : from.x; fpy = fcy;
          tpx = dx > 0 ? to.x : to.x + to.w;       tpy = tcy;
        } else {
          fpx = fcx; fpy = dy > 0 ? from.y + fH : from.y;
          tpx = tcx; tpy = dy > 0 ? to.y : to.y + tH;
        }
        const mx = (fpx + tpx) / 2, my = (fpy + tpy) / 2;
        const smx = (mx - HW) * s + HW + tx, smy = (my - HH) * s + HH + ty;
        const ex = e.x - smx, ey = e.y - smy;
        if (ex * ex + ey * ey < HIT * HIT) {
          runOnJS(handleDeleteConnection)(conn.id);
          return;
        }
      }
    });

  const handleMeasureHeight = useCallback((nodeId: number, height: number) => {
    if (resizingNodeIdRef.current === nodeId) return; // frozen during this card's resize
    if (height < 1) return;
    setCardHeights((prev) => {
      if (Math.abs((prev[nodeId] ?? 0) - height) < 2) return prev;
      return { ...prev, [nodeId]: height };
    });
  }, []);

  // Compute X-button midpoints in CANVAS space (no screen transform needed —
  // buttons live inside the canvas Animated.View which already applies the transform)
  useEffect(() => {
    if (!connectMode || !connections.length) { setConnMidpoints([]); return; }
    const nodeMap: Record<number, CanvasNode> = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });
    const mids = connections.map(conn => {
      const from = nodeMap[conn.fromNodeId];
      const to   = nodeMap[conn.toNodeId];
      if (!from || !to) return null;
      const fH = cardHeights[from.id] ?? CARD_H_EST;
      const tH = cardHeights[to.id]   ?? CARD_H_EST;
      const fcx = from.x + from.width / 2, fcy = from.y + fH / 2;
      const tcx = to.x   + to.width   / 2, tcy = to.y   + tH / 2;
      const dx = tcx - fcx, dy = tcy - fcy;
      let fa: string, ta: string;
      if (Math.abs(dx) >= Math.abs(dy)) { fa = dx > 0 ? "right" : "left"; ta = dx > 0 ? "left" : "right"; }
      else                              { fa = dy > 0 ? "bottom" : "top";  ta = dy > 0 ? "top"  : "bottom"; }
      let fpx = 0, fpy = 0, tpx = 0, tpy = 0;
      if      (fa === "right") { fpx = from.x + from.width; fpy = fcy; }
      else if (fa === "left")  { fpx = from.x;               fpy = fcy; }
      else if (fa === "top")   { fpx = fcx; fpy = from.y; }
      else                     { fpx = fcx; fpy = from.y + fH; }
      if      (ta === "left")  { tpx = to.x;             tpy = tcy; }
      else if (ta === "right") { tpx = to.x + to.width;  tpy = tcy; }
      else if (ta === "top")   { tpx = tcx; tpy = to.y; }
      else                     { tpx = tcx; tpy = to.y + tH; }
      // Canvas-space midpoint — Animated.View canvas transform handles screen projection
      return { id: conn.id, x: (fpx + tpx) / 2, y: (fpy + tpy) / 2 };
    }).filter((m): m is { id: number; x: number; y: number } => m !== null);
    setConnMidpoints(mids);
  }, [connectMode, connections, nodes, cardHeights]);

  const handleInteractById = useCallback((nodeId: number) => {
    // In connect mode both single-tap and double-tap should connect, not open content
    if (connectMode) {
      handleEditById(nodeId);
      return;
    }
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const media = supData.mediaItemsMap[nodeId] ?? [];
    switch (node.cardType) {
      case "image":
        if (media[0]?.uri) setFullScreenUri(media[0].uri);
        break;
      case "gif":
        if (media[0]?.uri) setFullScreenGifUri(media[0].uri);
        break;
      case "video":
        if (media[0]?.mediaType === "youtube") {
          handleAudioStop(); // avoid two YouTube players running at once
          setFullScreenYoutubeId(media[0].uri);
        } else if (media[0]?.uri) {
          setFullScreenVideoUri(media[0].uri);
        }
        break;
      case "link": {
        const m = supData.linkMetaMap[nodeId];
        if (m?.url) WebBrowser.openBrowserAsync(m.url);
        break;
      }
      case "place": {
        const m = supData.placeMetaMap[nodeId];
        if (m?.lat != null && m?.lng != null) {
          const label = encodeURIComponent(m.placeTitle ?? "Place");
          Linking.openURL(`geo:${m.lat},${m.lng}?q=${m.lat},${m.lng}(${label})`).catch(() => {});
        } else if (m?.osmUrl) {
          WebBrowser.openBrowserAsync(m.osmUrl);
        }
        break;
      }
      case "audio":
        // Playable if it has a local file or a YouTube source.
        if (supData.audioMetaMap[nodeId]) handleAudioToggle(nodeId);
        break;
      default: break;
    }
    // @ts-expect-error `handleEditById` is intentionally declared below — this forward
    // reference in the dep array is deliberate; reordering would change hook order/behavior
    // in the frozen canvas, so we keep the declaration where it is.
  }, [connectMode, handleEditById, nodes, supData, handleAudioToggle, handleAudioStop]);

  const handleEditById = useCallback((nodeId: number) => {
    if (connectMode) {
      // Read from ref — always current even if React state hasn't re-rendered yet
      const current = pendingSourceIdRef.current;
      if (current === null) {
        pendingSourceIdRef.current = nodeId;
        setPendingSourceId(nodeId);
      } else if (current !== nodeId) {
        handleCreateConnection(current, nodeId);
        pendingSourceIdRef.current = null;
        setPendingSourceId(null);
      }
      return;
    }
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    openEditSheet(node);
  }, [connectMode, nodes, supData, handleCreateConnection]);

  const handleDeleteById = useCallback((nodeId: number) => {
    const node = nodes.find((n) => n.id === nodeId);
    pendingDeleteRef.current = async () => {
      await deleteCanvasNode(nodeId);
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    };
    deleteSheetRef.current?.present(node?.title ?? "Card");
  }, [nodes]);

  const handleToggleTodo = useCallback(async (nodeId: number, itemId: number, checked: boolean) => {
    if (connectModeShared.value) return; // ignore in connect mode — tap should trigger connect flow
    await toggleTodoItem(itemId, checked);
    setSupData((prev) => ({
      ...prev,
      todoItemsMap: {
        ...prev.todoItemsMap,
        [nodeId]: (prev.todoItemsMap[nodeId] ?? []).map((i) =>
          i.id === itemId ? { ...i, checked } : i
        ),
      },
    }));
  }, [connectModeShared]);

  // ── Open edit sheet ───────────────────────────────────────────────────────

  const openEditSheet = (node: CanvasNode) => {
    setEditingNode(node);
    setEditTitle(node.title === "New card" ? "" : node.title);
    setEditDesc(node.description ?? "");
    setEditLinkUrl("");
    setEditTodoItems([]);
    setNewTodoText("");
    setEditPlaceTitle("");
    setEditPlaceLat(null);
    setEditPlaceLng(null);
    setEditPlaceOsmUrl(null);
    setEditMediaItemsSynced([]);
    mediaUrlRef.current = "";
    setMediaUrlInput("");

    const type = node.cardType as CardType;
    if (type === "link") {
      const meta = supData.linkMetaMap[node.id];
      if (meta) setEditLinkUrl(meta.url);
    }
    if (type === "todo") {
      setEditTodoItems(supData.todoItemsMap[node.id] ?? []);
    }
    if (type === "place") {
      const meta = supData.placeMetaMap[node.id];
      if (meta) {
        setEditPlaceTitle(meta.placeTitle ?? "");
        setEditPlaceLat(meta.lat ?? null);
        setEditPlaceLng(meta.lng ?? null);
        setEditPlaceOsmUrl(meta.osmUrl ?? null);
      }
    }
    if (type === "image") {
      setEditAspectRatio((node.aspectRatio as "1:1" | "3:2" | "2:3") ?? "3:2");
      setEditMediaItemsSynced(supData.mediaItemsMap[node.id] ?? []);
    }
    if (type === "gif" || type === "video") {
      setEditMediaItemsSynced(supData.mediaItemsMap[node.id] ?? []);
    }
    if (type === "video") {
      setVideoYtMode(supData.mediaItemsMap[node.id]?.[0]?.mediaType === "youtube");
      youtubeUrlRef.current = "";
      setYoutubeUrlInput("");
    }
    if (type === "audio") {
      setAudioSourceTab(supData.audioMetaMap[node.id]?.sourceType === "youtube" ? "youtube" : "local");
      youtubeUrlRef.current = "";
      setYoutubeUrlInput("");
    }

    editSheetRef.current?.present();
  };

  // ── Open AI generate sheet ────────────────────────────────────────────────

  const openAiSheet = (node: CanvasNode, fromFab: boolean) => {
    setAiTargetNodeId(node.id);
    aiOpenedFromFabRef.current = fromFab;
    aiDidGenerateRef.current = false;
    aiPromptRef.current = "";
    aiRefUrlRef.current = "";
    setAiFieldKey((k) => k + 1); // remount the text fields so they reset to empty
    setAiRefUri(null);
    setAiRefThumb(null);
    setAiError(null);
    setAiLoading(false);
    aiSheetRef.current?.present();
  };

  // ── FAB: card type picker ─────────────────────────────────────────────────

  const handleFabPress = useCallback(() => {
    pickerSheetRef.current?.present();
  }, []);

  const handleSelectCardType = useCallback(async (type: CardType) => {
    // Correct screen→canvas conversion: x_canvas = screenTarget - translate / scale
    // (NOT (screenTarget - translate) / scale — that's wrong when scale ≠ 1)
    const cx = SW / 2 - translateX.value / scale.value;
    const cy = SH * 0.30 - translateY.value / scale.value;
    // "ai-image" is a picker-only shortcut: it makes a normal image card, then opens the AI
    // generate sheet (rather than the standard edit sheet) so everything downstream treats it
    // as a plain image.
    const isAi = type === "ai-image";
    const node = await createCanvasNode({
      fileId,
      title: type === "text-quote" ? "" : "New card",
      x: cx - CARD_W / 2,
      y: cy,
      cardType: isAi ? "image" : type,
    });
    // FLUX.2 outputs square images — default AI cards to 1:1 so the full image shows.
    if (isAi) {
      await updateCanvasNode(node.id, { aspectRatio: "1:1" });
      node.aspectRatio = "1:1";
    }
    setNodes((prev) => [...prev, node]);
    // Seed supData entries for the new node
    setSupData((prev) => ({
      todoItemsMap: { ...prev.todoItemsMap, [node.id]: [] },
      mediaItemsMap: { ...prev.mediaItemsMap, [node.id]: [] },
      linkMetaMap: { ...prev.linkMetaMap, [node.id]: null },
      placeMetaMap: { ...prev.placeMetaMap, [node.id]: null },
      audioMetaMap: { ...prev.audioMetaMap, [node.id]: null },
    }));
    if (isAi) openAiSheet(node, true);
    else openEditSheet(node);
  }, [fileId, translateX, translateY, scale]);

  // ── Save edit ─────────────────────────────────────────────────────────────
  // Always read back from SQLite after writes — eliminates every stale-closure
  // and race-condition issue with in-memory state / refs.

  const handleSaveEdit = useCallback(async () => {
    if (!editingNode) return;
    const type = editingNode.cardType as CardType;
    const nid = editingNode.id;

    if (type === "text-titled") {
      const title = editTitle.trim() || "Card";
      const description = editDesc.trim() || null;
      await updateCanvasNode(nid, { title, description });
      setNodes((prev) => prev.map((n) => n.id === nid ? { ...n, title, description } : n));
    }

    if (type === "text-quote") {
      const description = editDesc.trim() || null;
      await updateCanvasNode(nid, { title: "", description });
      setNodes((prev) => prev.map((n) => n.id === nid ? { ...n, title: "", description } : n));
    }

    if (type === "link" && editLinkUrl.trim()) {
      setLinkFetching(true);
      const url = editLinkUrl.trim();
      const og = await fetchOpenGraph(url);
      await saveLinkMeta(nid, {
        url,
        ogTitle: og?.title ?? null,
        ogDescription: og?.description ?? null,
        ogImageUrl: og?.imageUrl ?? null,
        fetchFailed: !og,
      });
      setLinkFetching(false);
      const freshLink = await getLinkMeta(nid);
      setSupData((prev) => ({ ...prev, linkMetaMap: { ...prev.linkMetaMap, [nid]: freshLink } }));
    }

    if (type === "todo") {
      const title = editTitle.trim() || "To-do";
      await updateCanvasNode(nid, { title });
      setNodes((prev) => prev.map((n) => n.id === nid ? { ...n, title } : n));
      const freshTodos = await getTodoItems(nid);
      setSupData((prev) => ({ ...prev, todoItemsMap: { ...prev.todoItemsMap, [nid]: freshTodos } }));
    }

    if (type === "place") {
      await savePlaceMeta(nid, {
        plusCode: "",
        lat: editPlaceLat,
        lng: editPlaceLng,
        placeTitle: editPlaceTitle.trim() || null,
        googleMapsUrl: null,
        osmUrl: editPlaceOsmUrl,
      });
      const freshPlace = await getPlaceMeta(nid);
      setSupData((prev) => ({
        ...prev,
        placeMetaMap: { ...prev.placeMetaMap, [nid]: freshPlace },
      }));
    }

    if (type === "image") {
      await updateCanvasNode(nid, { aspectRatio: editAspectRatio });
      setNodes((prev) => prev.map((n) => n.id === nid ? { ...n, aspectRatio: editAspectRatio } : n));
      const freshImg = await getMediaItems(nid);
      setSupData((prev) => ({ ...prev, mediaItemsMap: { ...prev.mediaItemsMap, [nid]: freshImg } }));
    }

    if (type === "gif" || type === "video") {
      const freshMedia = await getMediaItems(nid);
      console.log("[canvas] gif/video save, nodeId:", nid, "items:", freshMedia.length, freshMedia.map(m => m.uri));
      setSupData((prev) => ({ ...prev, mediaItemsMap: { ...prev.mediaItemsMap, [nid]: freshMedia } }));
    }

    editSheetRef.current?.dismiss();
    setEditingNode(null);
  }, [editingNode, editTitle, editDesc, editLinkUrl, editPlaceTitle, editPlaceLat, editPlaceLng, editPlaceOsmUrl, editAspectRatio]);

  // ── Todo item handlers ────────────────────────────────────────────────────

  const handleAddTodoItem = useCallback(async () => {
    if (!editingNode || !newTodoText.trim()) return;
    const item = await createTodoItem(editingNode.id, newTodoText.trim());
    const next = [...editTodoItems, item];
    setEditTodoItems(next);
    setSupData((prev) => ({
      ...prev,
      todoItemsMap: { ...prev.todoItemsMap, [editingNode.id]: next },
    }));
    setNewTodoText("");
  }, [editingNode, newTodoText, editTodoItems]);

  const handleDeleteTodoItem = useCallback(async (itemId: number) => {
    if (!editingNode) return;
    await deleteTodoItem(itemId);
    const next = editTodoItems.filter((i) => i.id !== itemId);
    setEditTodoItems(next);
    setSupData((prev) => ({
      ...prev,
      todoItemsMap: { ...prev.todoItemsMap, [editingNode.id]: next },
    }));
  }, [editingNode, editTodoItems]);

  const handleReorderTodos = useCallback(async ({ data }: { data: CanvasTodoItem[] }) => {
    if (!editingNode) return;
    setEditTodoItems(data);
    await reorderTodoItems(editingNode.id, data.map((i) => i.id));
    setSupData((prev) => ({
      ...prev,
      todoItemsMap: { ...prev.todoItemsMap, [editingNode.id]: data },
    }));
  }, [editingNode]);

  // ── Media handlers ────────────────────────────────────────────────────────

  const handlePickImage = useCallback(async (camera: boolean) => {
    if (!editingNode) return;
    const fn = camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const type = editingNode.cardType as CardType;
    // SDK 56: MediaTypeOptions is deprecated — use an array of MediaType strings.
    const mediaTypes: ImagePicker.MediaType[] = type === "video" ? ["videos"] : ["images"];
    const result = await fn({ quality: 0.8, mediaTypes });
    if (result.canceled) return;
    const mediaType = type === "gif" ? "gif" : type === "video" ? "video" : "image";
    const newItems: CanvasMediaItem[] = [];
    for (const asset of result.assets) {
      let uri = asset.uri;
      // Copy content:// gallery files to app cache so Glide loads via file:// (better animation support)
      if (type === "gif" && uri.startsWith("content://")) {
        try {
          const ext = (asset.fileName?.split(".").pop() ?? "webp").toLowerCase();
          const cached = `${cacheDirectory}gif_${Date.now()}.${ext}`;
          await FileSystem.copyAsync({ from: uri, to: cached });
          uri = cached;
        } catch {}
      }
      const item = await createMediaItem(editingNode.id, uri, mediaType);
      newItems.push(item);
    }
    setEditMediaItemsSynced((prev) => [...prev, ...newItems]);
  }, [editingNode]);

  const handleAddMediaUrl = useCallback(async () => {
    const url = mediaUrlRef.current.trim();
    console.log("[canvas] + tapped | editingNode:", editingNode?.id ?? "NULL", "| url:", JSON.stringify(url));
    if (!editingNode) { console.log("[canvas] early return: no editingNode"); return; }
    if (!url) { console.log("[canvas] early return: url empty (BottomSheetTextInput may not have fired onChangeText)"); return; }
    const type = editingNode.cardType as CardType;
    const mediaType = type === "gif" ? "gif" : type === "video" ? "video" : "image";
    const item = await createMediaItem(editingNode.id, url, mediaType);
    console.log("[canvas] created media item id:", item.id, "uri:", item.uri);
    setEditMediaItemsSynced((prev) => [...prev, item]);
    mediaUrlRef.current = "";
    setMediaUrlInput("");
  }, [editingNode]);

  const handleDeleteEditMedia = useCallback(async (itemId: number) => {
    await deleteMediaItem(itemId);
    setEditMediaItemsSynced((prev) => prev.filter((m) => m.id !== itemId));
  }, []);

  // ── AI image generation handlers ──────────────────────────────────────────

  const handleAiPickGallery = useCallback(async () => {
    const uri = await pickGalleryImage();
    if (!uri) return;
    setAiRefUri(uri);
    setAiRefThumb(uri);
    setAiError(null);
  }, []);

  const handleAiAddRefUrl = useCallback(async () => {
    const url = aiRefUrlRef.current.trim();
    if (!url) return;
    setAiLoading(true);
    const uri = await downloadImage(url);
    setAiLoading(false);
    if (!uri) { setAiError("Couldn't load that image URL."); return; }
    setAiRefUri(uri);
    setAiRefThumb(url);
    aiRefUrlRef.current = "";
    setAiError(null);
  }, []);

  const handleAiClearRef = useCallback(() => {
    setAiRefUri(null);
    setAiRefThumb(null);
  }, []);

  const handleAiGenerate = useCallback(async () => {
    if (aiTargetNodeId == null) return;
    const prompt = aiPromptRef.current.trim();
    if (!prompt) { setAiError("Enter a prompt first."); return; }
    setAiLoading(true);
    setAiError(null);
    const res = await generateImage({ prompt, referenceUri: aiRefUri });
    setAiLoading(false);
    if ("error" in res) { setAiError(res.error); return; }
    const item = await createMediaItem(aiTargetNodeId, res.uri, "image");
    // Card content renders from supData.mediaItemsMap — append there so it appears immediately.
    setSupData((prev) => ({
      ...prev,
      mediaItemsMap: {
        ...prev.mediaItemsMap,
        [aiTargetNodeId]: [...(prev.mediaItemsMap[aiTargetNodeId] ?? []), item],
      },
    }));
    if (editingNode?.id === aiTargetNodeId) setEditMediaItemsSynced((prev) => [...prev, item]);
    aiDidGenerateRef.current = true;
    aiSheetRef.current?.dismiss();
  }, [aiTargetNodeId, aiRefUri, editingNode]);

  // If the sheet was opened from the "+" picker (a freshly created empty card) and nothing was
  // generated, remove the orphan node so we don't leave a blank image card behind.
  const handleAiDismiss = useCallback(() => {
    const id = aiTargetNodeId;
    if (aiOpenedFromFabRef.current && !aiDidGenerateRef.current && id != null) {
      deleteCanvasNode(id);
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setSupData((prev) => {
        const mediaItemsMap = { ...prev.mediaItemsMap };
        delete mediaItemsMap[id];
        return { ...prev, mediaItemsMap };
      });
    }
    setAiTargetNodeId(null);
  }, [aiTargetNodeId]);

  const handlePickAudio = useCallback(async () => {
    if (!editingNode) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    // One track per card — clear any existing file first.
    const existing = await getMediaItems(editingNode.id);
    for (const m of existing) await deleteMediaItem(m.id);
    await createMediaItem(editingNode.id, asset.uri, "audio");
    await saveAudioMeta(editingNode.id, {
      sourceType: "local",
      title: asset.name ?? "Audio track",
    });
    await loadSupData(nodes);
  }, [editingNode, nodes]);

  const handleAddYoutube = useCallback(async () => {
    if (!editingNode) return;
    const url = youtubeUrlRef.current.trim();
    if (!url) return;
    const id = extractYoutubeId(url);
    if (!id) {
      ToastAndroid.show("Not a valid YouTube link", ToastAndroid.SHORT);
      return;
    }
    const meta = await fetchYoutubeOEmbed(url);
    // Switching to YouTube — drop any local file for this card.
    const existing = await getMediaItems(editingNode.id);
    for (const m of existing) await deleteMediaItem(m.id);
    await saveAudioMeta(editingNode.id, {
      sourceType: "youtube",
      youtubeVideoId: id,
      title: meta?.title ?? "YouTube audio",
      author: meta?.author ?? null,
      thumbnailUrl: meta?.thumbnail ?? null,
    });
    await loadSupData(nodes);
    youtubeUrlRef.current = "";
    setYoutubeUrlInput("");
  }, [editingNode, nodes]);

  const handleAddVideoYoutube = useCallback(async () => {
    if (!editingNode) return;
    const url = youtubeUrlRef.current.trim();
    if (!url) return;
    const id = extractYoutubeId(url);
    if (!id) {
      ToastAndroid.show("Not a valid YouTube link", ToastAndroid.SHORT);
      return;
    }
    // Single source per video card — replace any existing media with the YT id.
    const existing = await getMediaItems(editingNode.id);
    for (const m of existing) await deleteMediaItem(m.id);
    const item = await createMediaItem(editingNode.id, id, "youtube");
    setEditMediaItemsSynced([item]);
    await loadSupData(nodes);
    youtubeUrlRef.current = "";
    setYoutubeUrlInput("");
  }, [editingNode, nodes]);

  // ── Edit sheet content ────────────────────────────────────────────────────

  const renderEditContent = () => {
    if (!editingNode) return null;
    const type = editingNode.cardType as CardType;

    if (type === "text-titled") {
      return (
        <>
          <Text style={styles.editSheetTitle}>Edit Note</Text>
          <BottomSheetTextInput
            style={styles.editInput}
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Title"
            placeholderTextColor={colors.textMuted}
          />
          <BottomSheetTextInput
            style={[styles.editInput, styles.editInputDesc]}
            value={editDesc}
            onChangeText={setEditDesc}
            placeholder="Description (optional)"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </>
      );
    }

    if (type === "text-quote") {
      return (
        <>
          <Text style={styles.editSheetTitle}>Edit Quote</Text>
          <BottomSheetTextInput
            style={[styles.editInput, styles.editInputDesc]}
            value={editDesc}
            onChangeText={setEditDesc}
            placeholder="Quote text…"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </>
      );
    }

    if (type === "link") {
      return (
        <>
          <Text style={styles.editSheetTitle}>Edit Link</Text>
          <BottomSheetTextInput
            style={styles.editInput}
            value={editLinkUrl}
            onChangeText={setEditLinkUrl}
            placeholder="https://..."
            placeholderTextColor={colors.textMuted}
            keyboardType="url"
            autoCapitalize="none"
          />
          {linkFetching && (
            <Text style={styles.fetchingText}>Fetching preview…</Text>
          )}
        </>
      );
    }

    if (type === "todo") {
      return (
        <>
          <Text style={styles.editSheetTitle}>Edit To-do</Text>
          <BottomSheetTextInput
            style={styles.editInput}
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="List title"
            placeholderTextColor={colors.textMuted}
          />
          <DraggableFlatList
            data={editTodoItems}
            keyExtractor={(item) => String(item.id)}
            onDragEnd={handleReorderTodos}
            scrollEnabled={false}
            renderItem={({ item, drag, isActive }: RenderItemParams<CanvasTodoItem>) => (
              <Pressable
                style={[editStyles.todoRow, isActive && editStyles.todoRowActive]}
                onLongPress={drag}
              >
                <Feather name="menu" size={14} color={colors.neutralLight} style={{ marginRight: 6 }} />
                <Text style={editStyles.todoItemText} numberOfLines={1}>{item.text}</Text>
                <Pressable onPress={() => handleDeleteTodoItem(item.id)} hitSlop={8}>
                  <Feather name="x" size={14} color={colors.textMuted} />
                </Pressable>
              </Pressable>
            )}
          />
          <View style={editStyles.todoAddRow}>
            <BottomSheetTextInput
              style={[styles.editInput, { flex: 1 }]}
              value={newTodoText}
              onChangeText={setNewTodoText}
              placeholder="Add item…"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={handleAddTodoItem}
              returnKeyType="done"
            />
            <Pressable style={editStyles.addBtn} onPress={handleAddTodoItem}>
              <Feather name="plus" size={18} color={colors.white} />
            </Pressable>
          </View>
        </>
      );
    }

    if (type === "gif") {
      return (
        <>
          <Text style={styles.editSheetTitle}>Edit GIF</Text>
          {editMediaItems.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={editStyles.mediaScroll}>
              {editMediaItems.map((m) => (
                <View key={m.id} style={editStyles.mediaTile}>
                  <View style={editStyles.mediaTileUrl}>
                    <Feather name="link" size={14} color={colors.primary} />
                    <Text style={editStyles.mediaTileUrlText} numberOfLines={2}>
                      {m.uri.replace(/^https?:\/\//, "").substring(0, 30)}
                    </Text>
                  </View>
                  <Pressable style={editStyles.mediaTileDelete} onPress={() => handleDeleteEditMedia(m.id)}>
                    <Feather name="x" size={12} color={colors.white} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          <BottomSheetTextInput
            style={styles.editInput}
            value={mediaUrlInput}
            onChangeText={(t) => { mediaUrlRef.current = t; setMediaUrlInput(t); }}
            placeholder="Paste GIF/WebP URL, press Go ↵"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleAddMediaUrl}
            blurOnSubmit={false}
          />
        </>
      );
    }

    if (type === "image" || type === "video") {
      const label = type === "video" ? "Video" : "Image";
      return (
        <>
          <Text style={styles.editSheetTitle}>Edit {label}</Text>
          {type === "image" && (
            <View style={editStyles.arRow}>
              {(["1:1", "3:2", "2:3"] as const).map((ar) => (
                <Pressable
                  key={ar}
                  style={[editStyles.arBtn, editAspectRatio === ar && editStyles.arBtnActive]}
                  onPress={() => setEditAspectRatio(ar)}
                >
                  <Text style={[editStyles.arBtnText, editAspectRatio === ar && editStyles.arBtnTextActive]}>
                    {ar}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {editMediaItems.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={editStyles.mediaScroll}>
              {editMediaItems.map((m) => (
                <View key={m.id} style={editStyles.mediaTile}>
                  {m.mediaType === "youtube" ? (
                    <Image source={{ uri: `https://img.youtube.com/vi/${m.uri}/default.jpg` }} style={editStyles.mediaTileImg} />
                  ) : m.uri.startsWith("http") ? (
                    <View style={editStyles.mediaTileUrl}>
                      <Feather name="link" size={14} color={colors.primary} />
                      <Text style={editStyles.mediaTileUrlText} numberOfLines={2}>
                        {m.uri.replace(/^https?:\/\//, "").substring(0, 30)}
                      </Text>
                    </View>
                  ) : (
                    <Image source={{ uri: m.uri }} style={editStyles.mediaTileImg} />
                  )}
                  <Pressable style={editStyles.mediaTileDelete} onPress={() => handleDeleteEditMedia(m.id)}>
                    <Feather name="x" size={12} color={colors.white} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          <View style={editStyles.mediaActions}>
            <Pressable style={editStyles.mediaBtn} onPress={() => { setVideoYtMode(false); handlePickImage(false); }}>
              <Feather name="image" size={16} color={colors.primary} />
              <Text style={editStyles.mediaBtnText}>Gallery</Text>
            </Pressable>
            <Pressable style={editStyles.mediaBtn} onPress={() => { setVideoYtMode(false); handlePickImage(true); }}>
              <Feather name="camera" size={16} color={colors.primary} />
              <Text style={editStyles.mediaBtnText}>Camera</Text>
            </Pressable>
            {type === "image" && editingNode && (
              <Pressable style={editStyles.mediaBtn} onPress={() => openAiSheet(editingNode, false)}>
                <Feather name="zap" size={16} color={colors.primary} />
                <Text style={editStyles.mediaBtnText}>Generate</Text>
              </Pressable>
            )}
            {type === "video" && (
              <Pressable
                style={[editStyles.mediaBtn, videoYtMode && editStyles.arBtnActive]}
                onPress={() => setVideoYtMode(true)}
              >
                <Feather name="youtube" size={16} color={colors.primary} />
                <Text style={editStyles.mediaBtnText}>YouTube</Text>
              </Pressable>
            )}
          </View>
          {type === "video" && videoYtMode && (
            <BottomSheetTextInput
              style={styles.editInput}
              value={youtubeUrlInput}
              onChangeText={(t) => { youtubeUrlRef.current = t; setYoutubeUrlInput(t); }}
              placeholder="Paste YouTube link, press Go ↵"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={handleAddVideoYoutube}
              blurOnSubmit={false}
            />
          )}
        </>
      );
    }

    if (type === "place") {
      const hasLoc = editPlaceLat != null && editPlaceLng != null;
      return (
        <>
          <Text style={styles.editSheetTitle}>Edit Place</Text>
          <BottomSheetTextInput
            style={styles.editInput}
            value={editPlaceTitle}
            onChangeText={setEditPlaceTitle}
            placeholder="Place name"
            placeholderTextColor={colors.textMuted}
          />
          {hasLoc ? (
            <Pressable style={editStyles.placePreview} onPress={() => setPlacePickerOpen(true)}>
              <MapPreview lat={editPlaceLat!} lng={editPlaceLng!} height={150} />
              <View style={editStyles.placePreviewEdit}>
                <Feather name="edit-2" size={13} color={colors.white} />
              </View>
            </Pressable>
          ) : (
            <Pressable style={editStyles.placePicker} onPress={() => setPlacePickerOpen(true)}>
              <Feather name="map-pin" size={18} color={colors.primary} />
              <Text style={editStyles.placePickerText}>Pick a location</Text>
            </Pressable>
          )}
          {hasLoc && (
            <Pressable
              style={editStyles.placeOpen}
              onPress={() => {
                const label = encodeURIComponent(editPlaceTitle.trim() || "Place");
                Linking.openURL(`geo:${editPlaceLat},${editPlaceLng}?q=${editPlaceLat},${editPlaceLng}(${label})`).catch(() => {});
              }}
            >
              <Feather name="navigation" size={14} color={colors.primary} />
              <Text style={editStyles.placeOpenText}>Open in maps</Text>
            </Pressable>
          )}
        </>
      );
    }

    if (type === "audio") {
      const meta = supData.audioMetaMap[editingNode.id];
      const file = supData.mediaItemsMap[editingNode.id]?.[0];
      const isYt = meta?.sourceType === "youtube";
      return (
        <>
          <Text style={styles.editSheetTitle}>Edit Audio</Text>
          <BottomSheetTextInput
            style={styles.editInput}
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Title (optional)"
            placeholderTextColor={colors.textMuted}
          />
          {/* Source toggle */}
          <View style={editStyles.arRow}>
            <Pressable
              style={[editStyles.arBtn, audioSourceTab === "local" && editStyles.arBtnActive]}
              onPress={() => setAudioSourceTab("local")}
            >
              <Text style={[editStyles.arBtnText, audioSourceTab === "local" && editStyles.arBtnTextActive]}>Local file</Text>
            </Pressable>
            <Pressable
              style={[editStyles.arBtn, audioSourceTab === "youtube" && editStyles.arBtnActive]}
              onPress={() => setAudioSourceTab("youtube")}
            >
              <Text style={[editStyles.arBtnText, audioSourceTab === "youtube" && editStyles.arBtnTextActive]}>YouTube</Text>
            </Pressable>
          </View>

          {audioSourceTab === "local" ? (
            <>
              {file ? (
                <View style={editStyles.audioFileRow}>
                  <Feather name="music" size={16} color={colors.primary} />
                  <Text style={editStyles.audioFileName} numberOfLines={1}>{meta?.title ?? "Audio file"}</Text>
                </View>
              ) : (
                <Text style={editStyles.audioHint}>No file yet — pick one below.</Text>
              )}
              <View style={editStyles.mediaActions}>
                <Pressable style={editStyles.mediaBtn} onPress={handlePickAudio}>
                  <Feather name="folder" size={16} color={colors.primary} />
                  <Text style={editStyles.mediaBtnText}>{file ? "Replace file" : "Pick audio file"}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              {isYt && (
                <View style={editStyles.audioFileRow}>
                  <Feather name="youtube" size={16} color={colors.primary} />
                  <Text style={editStyles.audioFileName} numberOfLines={1}>{meta?.title ?? "YouTube audio"}</Text>
                </View>
              )}
              <BottomSheetTextInput
                style={styles.editInput}
                value={youtubeUrlInput}
                onChangeText={(t) => { youtubeUrlRef.current = t; setYoutubeUrlInput(t); }}
                placeholder="Paste YouTube link, press Go ↵"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={handleAddYoutube}
                blurOnSubmit={false}
              />
            </>
          )}
        </>
      );
    }

    return null;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* Dot grid — Skia shader (canvas-space, infinite) with SVG fallback */}
      <DotGridBackground translateX={translateX} translateY={translateY} scale={scale} />

      {/* Connection arrows — Skia worklets, real-time during card drag + pan/zoom */}
      <ConnectionsSkiaLayer
        connRenderData={connRenderData}
        translateX={translateX}
        translateY={translateY}
        scale={scale}
        showXButtons={connectMode}
      />

      {/* Gesture receiver WRAPS the transformed card content, so camera pan/zoom
          (and connect-tap severing) work over cards too — a two-finger pinch with
          fingers on different cards reaches this single canvas-wide pinch. */}
      <GestureDetector gesture={Gesture.Race(connectTap, canvasGesture)}>
        <View style={StyleSheet.absoluteFill}>
          <View style={[StyleSheet.absoluteFill, styles.gestureLayer]} />
          <Animated.View
            style={[StyleSheet.absoluteFill, canvasStyle]}
            pointerEvents="box-none"
          >

        {nodes.map((node) => (
          <CanvasCard
            key={node.id}
            node={node}
            scale={scale}
            panRef={panRef}
            supData={supData}
            highlighted={node.id === highlightedNodeId}
            isConnectSource={node.id === pendingSourceId}
            hidden={hiddenNodeIds.has(node.id)}
            childCount={childCount[node.id] ?? 0}
            locked={locked}
            frameNumber={frameNumbers[node.id]}
            audioActive={node.id === activeAudioNodeId}
            audioPlaying={isActivePlaying}
            onMoveById={handleMoveById}
            onEditById={handleEditById}
            onDeleteById={handleDeleteById}
            onResizeById={handleResizeById}
            onResizeStart={handleResizeStart}
            onResizeEnd={handleResizeEnd}
            onToggleTodo={handleToggleTodo}
            onInteractById={handleInteractById}
            onToggleCollapse={handleToggleCollapse}
            onMeasureHeight={handleMeasureHeight}
            connRenderData={connRenderData}
          />
        ))}

          </Animated.View>
        </View>
      </GestureDetector>

      {/* Fixed UI: header */}
      <SafeAreaView style={styles.overlay} edges={["top"]} pointerEvents="box-none">
        <View style={styles.header} pointerEvents="auto">
          <Pressable style={styles.headerBtn} onPress={() => router.back()}>
            <Text style={styles.headerBtnText}>← Back</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {file?.title ?? "Canvas"}
          </Text>
          <Pressable style={styles.headerBtn} onPress={handleOpenDrawer} hitSlop={8}>
            <Feather name="menu" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Add card FAB */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }, locked && styles.fabDisabled]}
        disabled={locked}
        onPress={handleFabPress}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>

      {/* Connect mode FAB — above the add FAB */}
      <Pressable
        style={[
          styles.fab,
          styles.connectFab,
          { bottom: insets.bottom + 24 + 56 + 12 },
          connectMode && styles.connectFabActive,
          locked && styles.fabDisabled,
        ]}
        disabled={locked}
        onPress={() => {
          if (connectMode) { setConnectMode(false); pendingSourceIdRef.current = null; setPendingSourceId(null); }
          else setConnectMode(true);
        }}
      >
        <Feather
          name={pendingSourceId !== null ? "arrow-right" : "link-2"}
          size={20}
          color={connectMode ? colors.white : colors.primary}
        />
      </Pressable>

      {/* Lock (viewer) mode FAB — above the connect FAB. Always enabled. */}
      <Pressable
        style={[
          styles.fab,
          styles.connectFab,
          { bottom: insets.bottom + 24 + (56 + 12) * 2 },
          locked && styles.connectFabActive,
        ]}
        onPress={() => {
          const next = !locked;
          setLocked(next);
          if (next && connectMode) {
            setConnectMode(false);
            pendingSourceIdRef.current = null;
            setPendingSourceId(null);
          }
        }}
      >
        <Feather
          name={locked ? "lock" : "unlock"}
          size={20}
          color={locked ? colors.white : colors.primary}
        />
      </Pressable>

      {/* Collapse-all / expand-all FAB — above the lock FAB */}
      <Pressable
        style={[
          styles.fab,
          styles.connectFab,
          { bottom: insets.bottom + 24 + (56 + 12) * 3 },
          locked && styles.fabDisabled,
        ]}
        disabled={locked}
        onPress={handleToggleAll}
      >
        <Feather
          name={allChildrenHidden ? "eye" : "eye-off"}
          size={20}
          color={colors.primary}
        />
      </Pressable>

      {/* Organize FAB — lay frames out in a horizontal storyboard row */}
      <Pressable
        style={[
          styles.fab,
          styles.connectFab,
          { bottom: insets.bottom + 24 + (56 + 12) * 4 },
          locked && styles.fabDisabled,
        ]}
        disabled={locked}
        onPress={handleOrganize}
      >
        <Feather name="columns" size={20} color={colors.primary} />
      </Pressable>

      {/* Now-playing bar — bottom-left, left of the FABs */}
      {activeAudioNodeId != null && (
        <View style={[styles.nowPlaying, { bottom: insets.bottom + 24 }]}>
          <Feather name="music" size={16} color={colors.primary} />
          <Text style={styles.nowPlayingTitle} numberOfLines={1}>{activeAudioTitle}</Text>
          <Pressable hitSlop={8} onPress={() => handleAudioSeek(-10)}>
            <Feather name="rotate-ccw" size={16} color={colors.neutralDarkMedium} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => (activeAudioNodeId != null && handleAudioToggle(activeAudioNodeId))}
          >
            <Feather name={isActivePlaying ? "pause" : "play"} size={20} color={colors.primary} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => handleAudioSeek(10)}>
            <Feather name="rotate-cw" size={16} color={colors.neutralDarkMedium} />
          </Pressable>
          <Pressable hitSlop={8} onPress={handleAudioStop}>
            <Feather name="x" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      {/* Hidden YouTube player — off-screen so only the audio is heard while you
          view the board. Mounted only when a YouTube track is active. */}
      {activeYoutubeId && (
        <View style={styles.hiddenYoutube} pointerEvents="none">
          <YoutubePlayer
            ref={youtubeRef}
            height={200}
            width={320}
            videoId={activeYoutubeId}
            play={youtubePlaying}
            onChangeState={(state: string) => { if (state === "ended") setYoutubePlaying(false); }}
            initialPlayerParams={{ controls: false, modestbranding: true }}
          />
        </View>
      )}

      {/* Card type picker */}
      <CardTypePicker sheetRef={pickerSheetRef} onSelect={handleSelectCardType} />

      {/* Edit sheet */}
      <BottomSheetModal
        ref={editSheetRef}
        snapPoints={["65%"]}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
        keyboardBehavior="extend"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
        )}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.editSheet}
          keyboardShouldPersistTaps="handled"
        >
          {renderEditContent()}
          {/* Done is hidden in the YouTube URL contexts — the link is submitted
              with the keyboard Go key, so a Done button here does nothing useful. */}
          {!(editingNode &&
             ((editingNode.cardType === "audio" && audioSourceTab === "youtube") ||
              (editingNode.cardType === "video" && videoYtMode))) && (
            <Pressable style={[styles.saveBtn, { marginTop: spacing.md }]} onPress={handleSaveEdit}>
              <Text style={styles.saveBtnText}>Done</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.deleteCardBtn}
            onPress={async () => {
              if (!editingNode) return;
              const nodeId = editingNode.id;
              editSheetRef.current?.dismiss();
              setEditingNode(null);
              await deleteCanvasNode(nodeId);
              setNodes((prev) => prev.filter((n) => n.id !== nodeId));
            }}
          >
            <Text style={styles.deleteCardBtnText}>Delete card</Text>
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* AI generate sheet */}
      <BottomSheetModal
        ref={aiSheetRef}
        snapPoints={["70%"]}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
        keyboardBehavior="extend"
        onDismiss={handleAiDismiss}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
        )}
      >
        <BottomSheetScrollView contentContainerStyle={styles.editSheet} keyboardShouldPersistTaps="handled">
          <Text style={styles.editSheetTitle}>Generate image</Text>

          <BottomSheetTextInput
            key={`ai-prompt-${aiFieldKey}`}
            style={[styles.editInput, aiStyles.promptInput]}
            defaultValue=""
            onChangeText={(t) => { aiPromptRef.current = t; }}
            placeholder="Describe the image… e.g. mountain at sunrise, motion blur, cinematic"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          {/* Optional reference image → the model edits / restyles it, guided by the prompt */}
          {aiRefThumb ? (
            <View style={aiStyles.refRow}>
              <Image source={{ uri: aiRefThumb }} style={aiStyles.refThumb} />
              <View style={aiStyles.refTextWrap}>
                <Text style={aiStyles.refLabel}>Reference added</Text>
                <Text style={aiStyles.hint}>
                  The image will be re-imagined following your prompt (e.g. "as a watercolor").
                </Text>
              </View>
              <Pressable onPress={handleAiClearRef} hitSlop={8} style={aiStyles.refClear}>
                <Feather name="x" size={14} color={colors.white} />
              </Pressable>
            </View>
          ) : (
            <>
              <View style={editStyles.mediaActions}>
                <Pressable style={editStyles.mediaBtn} onPress={handleAiPickGallery}>
                  <Feather name="image" size={16} color={colors.primary} />
                  <Text style={editStyles.mediaBtnText}>Reference (gallery)</Text>
                </Pressable>
              </View>
              <BottomSheetTextInput
                key={`ai-url-${aiFieldKey}`}
                style={styles.editInput}
                defaultValue=""
                onChangeText={(t) => { aiRefUrlRef.current = t; }}
                placeholder="…or paste an image URL, press Go ↵"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={handleAiAddRefUrl}
                blurOnSubmit={false}
              />
            </>
          )}

          {!!aiError && <Text style={aiStyles.error}>{aiError}</Text>}

          <Pressable
            style={[styles.saveBtn, { marginTop: spacing.md }, aiLoading && aiStyles.genBtnDisabled]}
            onPress={handleAiGenerate}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.saveBtnText}>Generate</Text>
            )}
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Delete confirm */}
      <DeleteConfirmSheet
        ref={deleteSheetRef}
        onConfirm={() => pendingDeleteRef.current?.()}
      />

      {/* Place location picker (single location; no directions on canvas places) */}
      <MapPickerModal
        visible={placePickerOpen}
        initial={editPlaceLat != null && editPlaceLng != null
          ? { lat: editPlaceLat, lng: editPlaceLng } : null}
        onClose={() => setPlacePickerOpen(false)}
        onPick={(p: PickedPlace) => {
          setEditPlaceLat(p.lat);
          setEditPlaceLng(p.lng);
          setEditPlaceOsmUrl(p.osmUrl);
          if (p.name && !editPlaceTitle.trim()) setEditPlaceTitle(p.name);
        }}
      />

      {/* Full-screen image modal */}
      <Modal
        visible={!!fullScreenUri}
        transparent
        animationType="fade"
        onRequestClose={() => setFullScreenUri(null)}
      >
        <View style={styles.fsOverlay}>
          {!!fullScreenUri && (
            <Image source={{ uri: fullScreenUri }} style={styles.fsImage} resizeMode="contain" />
          )}
          {/* Overlay catches taps even if Image consumes them */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFullScreenUri(null)} />
        </View>
      </Modal>

      {/* Full-screen GIF / animated WebP — ExpoImage for animation */}
      {!!fullScreenGifUri && (
        <Modal visible animationType="fade" onRequestClose={() => setFullScreenGifUri(null)}>
          <View style={styles.fsOverlay}>
            <ExpoImage
              source={{ uri: fullScreenGifUri }}
              style={styles.fsImage}
              contentFit="contain"
              autoplay
            />
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setFullScreenGifUri(null)} />
          </View>
        </Modal>
      )}

      {/* Full-screen video player */}
      {!!fullScreenVideoUri && (
        <Modal visible animationType="fade" onRequestClose={() => setFullScreenVideoUri(null)}>
          <VideoPlayerModal uri={fullScreenVideoUri} onClose={() => setFullScreenVideoUri(null)} />
        </Modal>
      )}

      {!!fullScreenYoutubeId && (
        <Modal visible animationType="fade" onRequestClose={() => setFullScreenYoutubeId(null)}>
          <FullscreenYoutubeModal videoId={fullScreenYoutubeId} onClose={() => setFullScreenYoutubeId(null)} />
        </Modal>
      )}

      {/* Drawer backdrop */}
      {drawerMounted && (
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.28)" }]}
          onPress={handleCloseDrawer}
        />
      )}

      {/* Components drawer */}
      {drawerMounted && (
        <Animated.View
          style={[drawerStyles.panelContainer, drawerAnimStyle]}
          renderToHardwareTextureAndroid
        >
          <ComponentsDrawer
            frames={orderedFrames}
            supData={supData}
            connections={connections}
            nodeMapAll={nodes}
            onSelect={handlePanToCard}
            onDelete={handleDeleteFromDrawer}
            onDeleteConnection={handleDeleteConnection}
            onClose={handleCloseDrawer}
          />
        </Animated.View>
      )}

      {/* Loading Modal — renders in its own Android window, covers status bar + everything */}
      <Modal
        visible={isLoading}
        transparent={false}
        animationType="none"
        statusBarTranslucent
      >
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingTitle}>{file?.title ?? "Canvas"}</Text>
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: spacing.xl }}
          />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </Modal>
    </View>
  );
}

// ─── Content styles ───────────────────────────────────────────────────────────

const contentStyles = StyleSheet.create({
  titledTitle: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
    textAlign: "center",
    marginBottom: 4,
  },
  titledDesc: {
    ...typography.bodyS,
    color: colors.textSecondary,
    lineHeight: 18,
    textAlign: "left",
  },
  quoteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 2,
  },
  quoteBar: {
    width: 4,
    alignSelf: "stretch",
    backgroundColor: colors.neutralLightDark,
    borderRadius: 2,
  },
  quoteText: {
    ...typography.bodyM,
    fontStyle: "italic",
    color: colors.neutralDarkDarkest,
    flex: 1,
    lineHeight: 22,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 8,
  },
  placeholderLabel: {
    ...typography.captionM,
    color: colors.textMuted,
    textAlign: "center",
  },
  imgPlaceholder: {
    marginHorizontal: -spacing.md,
    marginTop: -spacing.md,
    backgroundColor: colors.neutralLightest,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: radius.sm,
    marginRight: 6,
    backgroundColor: colors.neutralLightest,
  },
  imageTitleBelow: {
    ...typography.bodyS,
    color: colors.neutralDarkDarkest,
    marginTop: 8,
  },
  linkOgImage: {
    width: CARD_W,
    height: 110,
    marginHorizontal: -spacing.md,
    marginTop: -spacing.md,
    marginBottom: spacing.sm,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
  },
  linkTextPad: { paddingBottom: 2 },
  linkTitle: { ...typography.actionM, color: colors.neutralDarkDarkest, marginBottom: 2 },
  linkUrl: { ...typography.captionM, color: colors.textMuted },
  todoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
  },
  todoCheck: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.neutralLight,
    alignItems: "center",
    justifyContent: "center",
  },
  todoCheckDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  todoText: { ...typography.bodyS, color: colors.neutralDarkDarkest, flex: 1 },
  todoTextDone: {
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  todoMore: { ...typography.captionM, color: colors.textMuted, marginTop: 4 },
  mapsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  mapsUrl: {
    ...typography.captionM,
    color: colors.primary,
    flex: 1,
  },
  gifView: {
    marginHorizontal: -spacing.md,
    marginTop: -spacing.md,
    width: CARD_W,
    // height is set dynamically from the image's natural ratio
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    overflow: "hidden",
  },
  videoThumb: {
    marginHorizontal: -spacing.md,
    marginTop: -spacing.md,
    width: CARD_W,
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlayBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  audioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  audioPlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.neutralLight,
    alignItems: "center",
    justifyContent: "center",
  },
  audioPlayBtnActive: {
    backgroundColor: colors.primary,
  },
  audioTextCol: { flex: 1 },
  audioTitle: { ...typography.h5, color: colors.neutralDarkDarkest },
  audioSub: { ...typography.bodyXS, color: colors.textMuted, marginTop: 2 },
  videoCloseBtn: {
    position: "absolute",
    top: 48,
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── Picker styles ────────────────────────────────────────────────────────────

const pickerStyles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  title: { ...typography.h3, color: colors.neutralDarkDarkest, marginBottom: spacing.md },
  // width: "25%" gives exactly 4 per row with no inter-item gap needed
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "25%",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: 6,
    gap: 6,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { ...typography.captionM, color: colors.neutralDarkMedium, textAlign: "center" },
});

// ─── Edit sheet styles ────────────────────────────────────────────────────────

const editStyles = StyleSheet.create({
  placePreview: { marginTop: spacing.sm, borderRadius: radius.lg, overflow: "hidden" },
  placePreviewEdit: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(31,32,36,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  placePicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.primaryLightest,
    borderRadius: radius.lg,
  },
  placePickerText: { ...typography.actionM, color: colors.primary },
  placeOpen: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, alignSelf: "flex-start" },
  placeOpenText: { ...typography.actionM, color: colors.primary },
  todoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    marginBottom: 6,
  },
  todoRowActive: { opacity: 0.8, elevation: 4 },
  todoItemText: { ...typography.bodyM, color: colors.neutralDarkDarkest, flex: 1 },
  todoAddRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 },
  mediaScroll: { marginBottom: spacing.sm },
  mediaTile: { position: "relative", marginRight: 8 },
  mediaTileImg: { width: 72, height: 72, borderRadius: radius.sm },
  mediaTileUrl: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    gap: 4,
  },
  mediaTileUrlText: { ...typography.captionM, color: colors.textMuted, textAlign: "center" },
  mediaTileDelete: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaActions: { flexDirection: "row", gap: 8, marginBottom: spacing.sm },
  mediaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mediaBtnText: { ...typography.actionS, color: colors.primary },
  audioFileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  audioFileName: { ...typography.bodyM, color: colors.neutralDarkDarkest, flex: 1 },
  audioHint: { ...typography.bodyS, color: colors.textMuted, marginBottom: spacing.sm },
  arRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  arBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  arBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "15",
  },
  arBtnText: { ...typography.actionM, color: colors.textMuted },
  arBtnTextActive: { color: colors.primary },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── AI generate sheet styles ─────────────────────────────────────────────────

const aiStyles = StyleSheet.create({
  // Fixed height (not minHeight) so the field scrolls internally as you add lines instead of
  // auto-growing — growing re-lays-out the BottomSheetScrollView every new line, which made the
  // first line flicker until the input got tall enough to stop growing (~8–10 lines).
  promptInput: { height: 120, textAlignVertical: "top", marginBottom: spacing.sm },
  refRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  refThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surface },
  refTextWrap: { flex: 1 },
  refLabel: { ...typography.actionS, color: colors.neutralDarkDarkest },
  refClear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { ...typography.captionM, color: colors.textMuted },
  error: { ...typography.bodyS, color: colors.errorDark, marginTop: spacing.sm },
  genBtnDisabled: { opacity: 0.6 },
});

// ─── Main styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFF" },
  gestureLayer: { backgroundColor: "rgba(248,250,255,0.01)" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  headerBtnText: { ...typography.actionM, color: colors.primary },
  headerTitle: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
    flex: 1,
    textAlign: "center",
  },
  resizeHandle: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-45deg" }],
  },
  cardHighlighted: {
    borderColor: colors.primary,
    borderWidth: 2,
    elevation: 8,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  cardConnectSource: {
    borderColor: colors.primary,
    borderWidth: 2,
    elevation: 8,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 60,
    overflow: "hidden",
  },
  cardHidden: { opacity: 0 },
  // Eye toggle: flow child below the card, right-aligned (wrapper is alignItems
  // flex-end). No container — just a bigger eye icon + count. Flow child → the
  // wrapper grows to include it, so it stays tappable.
  collapseChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    marginRight: 2,
  },
  collapseChipText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.neutralDarkMedium,
    fontVariant: ["tabular-nums"],
  },
  // Same treatment as the eye chip — outside the card at a corner, no container.
  // Sits just above the card's top-left; blue.
  frameBadge: {
    position: "absolute",
    bottom: "100%",
    left: 2,
    marginBottom: 2,
  },
  frameBadgeText: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
    fontVariant: ["tabular-nums"],
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
  },
  connectFab: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  connectFabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  fabDisabled: { opacity: 0.4 },
  fabIcon: { fontSize: 28, color: colors.white, lineHeight: 32, marginTop: -2 },
  nowPlaying: {
    position: "absolute",
    left: 10,
    right: 88, // clear the FAB column on the right
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  nowPlayingTitle: { ...typography.actionS, color: colors.neutralDarkDarkest, flex: 1 },
  hiddenYoutube: { position: "absolute", top: -1000, left: 0, width: 320, height: 200 },
  sheetBg: { backgroundColor: colors.background, borderRadius: radius.xl, overflow: "hidden" },
  sheetHandle: { backgroundColor: colors.neutralLight },
  editSheet: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  editSheetTitle: { ...typography.h3, color: colors.neutralDarkDarkest },
  editInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    ...typography.bodyL,
    color: colors.neutralDarkDarkest,
    includeFontPadding: false,
  },
  editInputDesc: { minHeight: 80, textAlignVertical: "top", paddingTop: 12 },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnText: { ...typography.actionM, color: colors.white },
  fetchingText: { ...typography.bodyS, color: colors.textMuted },
  deleteCardBtn: { alignItems: "center", paddingVertical: spacing.sm },
  deleteCardBtnText: { ...typography.actionS, color: "#EF4444" },
  loadingOverlay: {
    flex: 1,
    backgroundColor: "#F8FAFF",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingTitle: {
    ...typography.h2,
    color: colors.neutralDarkDarkest,
    textAlign: "center",
  },
  loadingText: {
    ...typography.captionM,
    color: colors.textMuted,
  },
  connXBtn: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  fsImage: {
    width: SW,
    height: SH * 0.85,
  },
});

const videoModalStyles = StyleSheet.create({
  controls: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.white,
    borderRadius: 2,
  },
  time: {
    ...typography.captionM,
    color: colors.white,
    minWidth: 72,
    textAlign: "right",
  },
});

const drawerStyles = StyleSheet.create({
  // Outer animated container — explicit position so GPU rasterization works correctly
  panelContainer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_W,
    elevation: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: -3, height: 0 },
  },
  panel: {
    flex: 1,
    backgroundColor: colors.background,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  drawerTitle: { ...typography.actionM, color: colors.neutralDarkDarkest },
  // List item — single row
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  frameNumber: {
    ...typography.h5,
    color: colors.primary,
    width: 22,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  indexText: {
    ...typography.captionM,
    color: colors.textMuted,
    width: 16,
    textAlign: "right",
  },
  // 44×44 preview thumbnail
  preview: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.neutralLightest,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  previewDark: { backgroundColor: "#1a1a1a" },
  previewPad: { gap: 5, padding: 6, alignItems: "flex-start", justifyContent: "center" },
  previewLine: {
    height: 2,
    backgroundColor: colors.neutralLight,
    borderRadius: 1,
    width: "100%",
  },
  previewTodoRow: { flexDirection: "row", alignItems: "center", gap: 3, width: "100%" },
  previewDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.neutralLight,
  },
  // Info section
  itemInfo: { flex: 1, gap: 2 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  typeName: { ...typography.captionM, color: colors.neutralDarkMedium },
  itemTitle: { ...typography.actionS, color: colors.neutralDarkDarkest },
  // Connections section
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sectionTitle: { ...typography.captionM, color: colors.textMuted },
  connItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
