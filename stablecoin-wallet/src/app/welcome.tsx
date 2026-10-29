import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { brandImages, Button, Card, colors, Screen, Text } from '../components/ui';

export default function Welcome() {
  return (
    <Screen honey>
      <View style={s.hero}>
        <Image source={brandImages.laughLoop} style={s.laugh} contentFit="contain" autoplay />
        <Text style={s.wordmark}>pearl</Text>
        <Text style={s.tagline}>her first wallet</Text>
      </View>
      <Card style={s.card}>
        <Text style={s.lead}>Dollars that live on your phone.</Text>
        <Text style={s.body}>
          Hold and send USDT and USDC on Ethereum, BNB Smart Chain and Tron, all from one secret
          phrase.
        </Text>
        <Text style={s.small}>
          Your keys stay on this phone. Nobody, not even Pearl’s makers, can recover your money if
          you lose your phrase.
        </Text>
      </Card>
      <Button title="Create my wallet" variant="dark" onPress={() => router.push('/create')} />
      <Button title="I already have a phrase" variant="secondary" onPress={() => router.push('/import')} />
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 8 },
  laugh: { width: 240, height: 240 },
  wordmark: { fontSize: 64, fontWeight: '700', lineHeight: 70, marginTop: -12 },
  tagline: { fontSize: 22, fontWeight: '600', color: colors.caramel },
  card: { backgroundColor: 'rgba(255,255,255,0.85)', borderColor: 'transparent' },
  lead: { fontSize: 19, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23 },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted },
});
