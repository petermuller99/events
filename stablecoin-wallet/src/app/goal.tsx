import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Body, Button, Chips, Field, Screen, Sticker } from '../components/ui';
import { loadGoal, saveGoal } from '../lib/goal';

const IDEAS = ['a new bike', 'toys', 'school', 'a trip', 'a gift'];

export default function Goal() {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [hasGoal, setHasGoal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGoal().then((g) => {
      if (!g) return;
      setHasGoal(true);
      setName(g.name);
      setTarget(String(g.target));
    });
  }, []);

  const save = async () => {
    const amount = Number(target.replace(/[,$\s]/g, ''));
    if (!name.trim()) return setError('What are you saving for?');
    if (!Number.isFinite(amount) || amount < 1 || amount > 10_000_000) return setError('Enter an amount like 500');
    await saveGoal({ name: name.trim(), target: Math.round(amount) });
    router.back();
  };

  const remove = async () => {
    await saveGoal(null);
    router.back();
  };

  return (
    <Screen>
      <View style={s.intro}>
        <Sticker name="curious" size={90} />
        <Body>Pick something to save for. Your honey pot fills up as your dollars grow.</Body>
      </View>
      <Field
        label="I’m saving for"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        placeholder="a new bike"
        autoCapitalize="sentences"
        maxLength={30}
      />
      <Chips
        value={IDEAS.includes(name) ? name : ''}
        onChange={(v) => {
          setName(v);
          setError(null);
        }}
        options={IDEAS.map((i) => ({ value: i, label: i }))}
      />
      <Field
        label="Goal amount ($)"
        value={target}
        onChangeText={(t) => {
          setTarget(t);
          setError(null);
        }}
        placeholder="500"
        keyboardType="number-pad"
        error={error}
      />
      <Button title="Save goal" onPress={save} />
      {hasGoal ? <Button title="Remove goal" variant="secondary" onPress={remove} /> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
