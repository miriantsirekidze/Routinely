import Svg, { Path, Circle, Rect, Line } from "react-native-svg";

type Props = {
  color: string;
  size?: number;
};

export function TodayIcon({ color, size = 22 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
      <Path d="M12 6V12L16 14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function HistoryIcon({ color, size = 22 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C9.51472 21 7.26472 19.9926 5.63604 18.364" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M3 7V12H8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 8V12L14.5 14.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TemplatesIcon({ color, size = 22 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="7" height="7" rx="2" stroke={color} strokeWidth="2" />
      <Rect x="14" y="3" width="7" height="7" rx="2" stroke={color} strokeWidth="2" />
      <Rect x="3" y="14" width="7" height="7" rx="2" stroke={color} strokeWidth="2" />
      <Rect x="14" y="14" width="7" height="7" rx="2" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

export function ScheduleIcon({ color, size = 22 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="18" rx="3" stroke={color} strokeWidth="2" />
      <Path d="M3 9H21" stroke={color} strokeWidth="2" />
      <Path d="M8 2V5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M16 2V5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Circle cx="8" cy="14" r="1.5" fill={color} />
      <Circle cx="12" cy="14" r="1.5" fill={color} />
      <Circle cx="16" cy="14" r="1.5" fill={color} />
    </Svg>
  );
}

export function SettingsIcon({ color, size = 22 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
      <Path d="M12 2V4M12 20V22M22 12H20M4 12H2M19.07 4.93L17.66 6.34M6.34 17.66L4.93 19.07M19.07 19.07L17.66 17.66M6.34 6.34L4.93 4.93" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function JournalIcon({ color, size = 22 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="2" width="16" height="20" rx="2" stroke={color} strokeWidth="2" />
      <Path d="M8 7H16M8 12H16M8 17H12" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M4 6H2M4 12H2M4 18H2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}
