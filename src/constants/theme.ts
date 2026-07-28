export const colors = {
  // Highlight (Primary)
  primary: "#006FFD",
  primaryDark: "#006FFD",
  primaryMedium: "#2897FF",
  primaryLight: "#6FBAFF",
  primaryLighter: "#B4DBFF",
  primaryLightest: "#EAF2FF",

  // Neutral Light
  neutralLightDark: "#C5C6CC",
  neutralLightMedium: "#D4D6DD",
  neutralLight: "#E8E9F1",
  neutralLighter: "#F8F9FE",
  neutralLightest: "#FFFFFF",

  // Neutral Dark
  neutralDarkDarkest: "#1F2024",
  neutralDarkDark: "#2F3036",
  neutralDarkMedium: "#494A50",
  neutralDarkLight: "#71727A",
  neutralDarkLightest: "#8F9098",

  // Support - Success
  successDark: "#298267",
  successMedium: "#3AC0A0",
  successLight: "#E7F4E8",

  // Support - Warning
  warningDark: "#E86339",
  warningMedium: "#FFB37C",
  warningLight: "#FFF4E4",

  // Support - Error
  errorDark: "#ED3241",
  errorMedium: "#FF616D",
  errorLight: "#FFE2E5",

  // Feature - Calendar / Trackers
  green: "#15803D",
  greenDark: "#14532D",
  greenMedium: "#22C55E",
  greenLight: "#86EFAC",
  greenLightest: "#DCFCE7",

  // Semantic aliases
  background: "#FFFFFF",
  surface: "#F8F9FE",
  surfaceDark: "#E8E9F1",
  accent: "#006FFD",
  text: "#1F2024",
  textSecondary: "#71727A",
  textMuted: "#8F9098",
  border: "#E8E9F1",
  white: "#FFFFFF",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

// Inter typography scale from Figma
export const typography = {
  h1: { fontSize: 24, fontWeight: "800" as const, lineHeight: 29 },
  h2: { fontSize: 18, fontWeight: "800" as const, lineHeight: 22 },
  h3: { fontSize: 16, fontWeight: "800" as const, lineHeight: 19 },
  h4: { fontSize: 14, fontWeight: "700" as const, lineHeight: 17 },
  h5: { fontSize: 12, fontWeight: "700" as const, lineHeight: 15 },

  bodyXL: { fontSize: 18, fontWeight: "400" as const, lineHeight: 24 },
  bodyL: { fontSize: 16, fontWeight: "400" as const, lineHeight: 22 },
  bodyM: { fontSize: 14, fontWeight: "400" as const, lineHeight: 20 },
  bodyS: { fontSize: 12, fontWeight: "400" as const, lineHeight: 16 },
  bodyXS: { fontSize: 10, fontWeight: "500" as const, lineHeight: 14 },

  actionL: { fontSize: 14, fontWeight: "600" as const, lineHeight: 17 },
  actionM: { fontSize: 12, fontWeight: "600" as const, lineHeight: 15 },
  actionS: { fontSize: 10, fontWeight: "600" as const, lineHeight: 12 },

  captionM: {
    fontSize: 10,
    fontWeight: "600" as const,
    lineHeight: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
  },
};

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  timer: 48,
};
