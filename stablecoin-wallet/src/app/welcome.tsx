import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ChainLogo, TokenLogo } from '../components/TokenLogo';
import { brandImages, Button, Screen, Text } from '../components/ui';
import type { ChainId } from '../lib/config';

const NETWORKS: { id: ChainId; name: string }[] = [
  { id: 'ethereum', name: 'Ethereum' },
  { id: 'bsc', name: 'BNB' },
  { id: 'solana', name: 'Solana' },
];

function Chip({ logo, label }: { logo: ReactNode; label: string }) {
  return (
    <View style={s.chip}>
      {logo}
      <Text style={s.chipText}>{label}</Text>
    </View>
  );
}

export default function Welcome() {
  return (
    <Screen honey>
      <View style={s.hero}>
        <Image source={brandImages.laughLoop} style={s.laugh} contentFit="contain" autoplay />
        <Text style={s.wordmark} adjustsFontSizeToFit numberOfLines={1}>
          Pearl Wallet
        </Text>
        <Text style={s.headline}>Digital dollars, made for kids.</Text>
        <View style={s.chips}>
          <Chip logo={<TokenLogo symbol="USDT" size={24} />} label="USDT" />
          <Chip logo={<TokenLogo symbol="USDC" size={24} />} label="USDC" />
        </View>
        <View style={s.chips}>
          {NETWORKS.map((n) => (
            <Chip key={n.id} logo={<ChainLogo chain={n.id} size={24} />} label={n.name} />
          ))}
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <Button title="Create my wallet" variant="dark" onPress={() => router.push('/create')} />
      <Button title="I already have a wallet" variant="secondary" onPress={() => router.push('/import')} />
      <Text style={s.small}>🔒 Only you hold the key to your money.</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 8 },
  laugh: { width: 200, height: 200 },
  wordmark: { fontSize: 46, fontWeight: '700', lineHeight: 54, marginTop: -6 },
  headline: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  small: { fontSize: 13.5, color: '#5A3A1A', textAlign: 'center' },
});
