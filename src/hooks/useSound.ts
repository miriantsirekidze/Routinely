import { useAudioPlayer } from "expo-audio";
import { useSettingsStore } from "../stores/settingsStore";

const sounds = {
  tick: require("../../assets/sounds/tick.wav"),
  countdownEnd: require("../../assets/sounds/countdown_end.wav"),
  sessionStart: require("../../assets/sounds/session_start.wav"),
  sessionEnd: require("../../assets/sounds/session_end.wav"),
  warning: require("../../assets/sounds/warning.wav"),
  dayComplete: require("../../assets/sounds/day_complete.wav"),
  halfway: require("../../assets/sounds/halfway.wav"),
};

export type SoundName = keyof typeof sounds;

export function useSound(name: SoundName) {
  const player = useAudioPlayer(sounds[name]);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);

  const play = () => {
    if (!soundEnabled) return;
    player.seekTo(0);
    player.play();
  };

  return { play };
}
