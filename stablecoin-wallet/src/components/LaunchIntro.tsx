import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { createContext, useContext, useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, HoneyBackground, Text } from './ui';

const LAUNCH_VIDEO = require('../../assets/brand/launch.mp4');

/** True once the intro has finished or been skipped. */
export const IntroDoneContext = createContext(true);
export const useIntroDone = () => useContext(IntroDoneContext);

/** Pearl's 5-second launch animation, with her laugh. Tap anywhere to skip. */
export function LaunchIntro({ onDone }: { onDone: () => void }) {
  const player = useVideoPlayer(LAUNCH_VIDEO, (p) => {
    p.loop = false;
    // Don't stop music or podcasts the person is already playing.
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });

  useEventListener(player, 'playToEnd', onDone);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') onDone();
  });

  // Never leave someone stuck on the intro if the video stalls.
  useEffect(() => {
    const timer = setTimeout(onDone, 8000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <HoneyBackground style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel="Skip intro"
      >
        <SafeAreaView style={s.skipArea} edges={['bottom']}>
          <Text style={s.skip}>Tap to skip</Text>
        </SafeAreaView>
      </Pressable>
    </HoneyBackground>
  );
}

const s = StyleSheet.create({
  skipArea: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 24 },
  skip: { color: colors.text, opacity: 0.6, fontSize: 14, fontWeight: '500' },
});
