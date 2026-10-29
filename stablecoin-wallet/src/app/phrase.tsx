import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Body, Button, colors, Screen, Sticker, Text } from '../components/ui';
import { useUnlockedWallet } from '../state/WalletContext';

export default function Phrase() {
  const { revealPhrase } = useUnlockedWallet();
  const [phrase, setPhrase] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    revealPhrase().then((p) => (p ? setPhrase(p) : setDenied(true)));
  }, [revealPhrase]);

  if (denied) {
    return (
      <Screen>
        <View style={{ alignItems: 'center' }}>
          <Sticker name="hmm" size={130} />
        </View>
        <Body>We couldn’t check it’s you, so the secret words stay hidden.</Body>
        <Button title="Go back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={s.intro}>
        <Sticker name="cheeky" size={80} />
        <Text style={s.introText}>These 12 words are your wallet. Keep them on paper, somewhere safe.</Text>
      </View>
      {phrase ? (
        <View style={s.grid}>
          {phrase.split(' ').map((w, i) => (
            <View key={i} style={s.word}>
              <Text style={s.index}>{i + 1}</Text>
              <Text style={s.text}>{w}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Banner tone="warning">Make sure nobody can see your screen. Never share these words with anyone.</Banner>
      <Button title="Done" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const s = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // flex: 1 lets the text wrap beside the sticker instead of running off the screen.
  introText: { flex: 1, fontSize: 16, lineHeight: 23 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  word: {
    // Three equal columns that fill the row edge to edge.
    flexGrow: 1,
    flexBasis: '30%',
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
  },
  index: { color: colors.muted, fontSize: 12, width: 16 },
  text: { fontSize: 16, fontWeight: '600' },
});
