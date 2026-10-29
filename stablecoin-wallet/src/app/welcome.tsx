import { router } from 'expo-router';
import { View } from 'react-native';
import { Body, Button, Card, Screen, Title } from '../components/ui';

export default function Welcome() {
  return (
    <Screen>
      <View style={{ height: 48 }} />
      <Title>Stablecoin Wallet</Title>
      <Body muted>
        Hold and send USDT and USDC on Ethereum (ERC-20), BNB Smart Chain (BEP-20) and Tron (TRC-20)
        from one recovery phrase.
      </Body>
      <Card>
        <Body>
          Your keys stay on this phone. Nobody, including the app’s authors, can recover your funds
          if you lose your recovery phrase.
        </Body>
      </Card>
      <Button title="Create a new wallet" onPress={() => router.push('/create')} />
      <Button title="I already have a recovery phrase" variant="secondary" onPress={() => router.push('/import')} />
    </Screen>
  );
}
