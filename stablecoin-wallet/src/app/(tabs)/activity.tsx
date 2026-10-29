import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityRow, ListCard } from '../../components/money';
import { Chips, colors, LinkButton, Screen, Sticker, Text } from '../../components/ui';
import { groupByDay } from '../../lib/activity';
import { CHAIN_IDS, getChain } from '../../lib/config';
import { addressFor } from '../../lib/wallet';
import { useActivity } from '../../state/ActivityContext';
import { useUnlockedWallet } from '../../state/WalletContext';

type Filter = 'all' | 'in' | 'out';

export default function Activity() {
  const { keys, mode } = useUnlockedWallet();
  const { items, refreshing, refresh } = useActivity();
  const [filter, setFilter] = useState<Filter>('all');
  const shown = filter === 'all' ? items : items.filter((i) => i.direction === filter);
  const groups = groupByDay(shown);

  return (
    <Screen tab refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Text style={s.title}>Activity</Text>
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'in', label: 'Money in' },
          { value: 'out', label: 'Money out' },
        ]}
      />

      {groups.length === 0 ? (
        <View style={s.empty}>
          <Sticker name="curious" size={150} />
          <Text style={s.emptyTitle}>{filter === 'all' ? 'No activity yet' : 'Nothing here yet'}</Text>
          <Text style={s.muted}>When money comes in or goes out, you’ll see it here.</Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            <Text style={s.day}>{g.title}</Text>
            <ListCard>
              {g.items.map((item, i) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  mode={mode}
                  last={i === g.items.length - 1}
                  onPress={() => router.push({ pathname: '/tx', params: { id: item.id } })}
                />
              ))}
            </ListCard>
          </View>
        ))
      )}

      <View style={s.older}>
        <Text style={s.muted}>Older activity? See it on</Text>
        <View style={s.links}>
          {CHAIN_IDS.map((id) => {
            const chain = getChain(mode, id);
            return (
              <LinkButton
                key={id}
                title={chain.explorerName}
                onPress={() => Linking.openURL(chain.explorerAddressUrl(addressFor(keys, id)))}
              />
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '700', marginTop: 4 },
  day: { fontSize: 13, fontWeight: '600', color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 4 },
  empty: { alignItems: 'center', gap: 6, marginTop: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  muted: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  older: { alignItems: 'center', gap: 4, marginTop: 8 },
  links: { flexDirection: 'row', gap: 16 },
});
