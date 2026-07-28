import { Text } from "react-native";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
import Feather from "@expo/vector-icons/Feather";

// value is either:
//   a text glyph  e.g. "★" or "☯︎"
//   a vector ref  e.g. "@fa5/smoking" | "@mci/gamepad-variant" | "@io/moon"
export function isVectorIcon(value: string): boolean {
  return value.startsWith("@");
}

type Props = {
  value: string;
  size: number;   // container size — icon scales to fit
  color: string;
};

export function BadgeIcon({ value, size, color }: Props) {
  if (isVectorIcon(value)) {
    const slash = value.indexOf("/");
    const family = value.slice(1, slash);
    const name = value.slice(slash + 1) as any;
    const iconSize = Math.round(size * 0.55);

    switch (family) {
      case "fa5":
        return <FontAwesome5 name={name} size={iconSize} color={color} />;
      case "mci":
        return <MaterialCommunityIcons name={name} size={iconSize} color={color} />;
      case "io":
        return <Ionicons name={name} size={iconSize} color={color} />;
      case "fe":
        return <Feather name={name} size={iconSize} color={color} />;
      default:
        return null;
    }
  }

  // Text glyph
  return (
    <Text
      style={{
        width: size,
        height: size,
        lineHeight: size,
        fontSize: Math.round(size * 0.7),
        color,
        textAlign: "center",
        includeFontPadding: false,
      }}
    >
      {value}
    </Text>
  );
}
