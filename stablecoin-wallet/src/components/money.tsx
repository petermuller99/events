import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ActivityItem } from '../lib/activity';
import { formatAmount, formatDollars } from '../lib/amount';
import { getChain, type ChainId, type NetworkMode } from '../lib/config';
import { ArrowDown, ArrowUp, Clock, Cross } from './icons';
import { ChainLogo, TokenLogo } from './TokenLogo';
import { colors, shortAddress, Text } from './ui';

/** The token's official logo; a lettered circle for anything without one. */
export function TokenBadge({
  symbol,
  chain,
  native,
  size = 42,
}: {
  symbol: string;
  chain?: ChainId;
  /** The network's own coin (ETH, BNB, TRX, SOL): shown with the network's logo. */
  native?: boolean;
  size?: number;
}) {
  if (native && chain) return <ChainLogo chain={chain} size={size} />;
  if (symbol === 'USDT' || symbol === 'USDC') return <TokenLogo symbol={symbol} chain={chain} size={size} />;
  return (
    <View style={[s.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.caramel }]}>
      <Text style={[s.badgeText, { fontSize: size * 0.4 }]}>{symbol.slice(0, 1)}</Text>
    </View>
  );
}

/** White card holding rows separated by dashed lines. */
export function ListCard({ children }: { children: ReactNode }) {
  return <View style={s.list}>{children}</View>;
}

export function ListRow({
  left,
  title,
  subtitle,
  right,
  onPress,
  last,
}: {
  left?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [s.row, !last && s.rowDivider, pressed && { opacity: 0.6 }]}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? <Text style={s.title}>{title}</Text> : title}
        {subtitle ? (
          <Text style={s.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function activityTitle(item: ActivityItem): string {
  if (item.direction === 'in') return `Got ${item.symbol}`;
  if (item.status === 'pending') return `Sending ${item.symbol}`;
  if (item.status === 'failed') return `${item.symbol} send failed`;
  return `Sent ${item.symbol}`;
}

/** Stablecoins as dollars ("25.00"); fee coins with up to 4 decimals. */
export function itemAmount(item: ActivityItem): string {
  const amount = BigInt(item.amount);
  return item.assetId === 'native' ? formatAmount(amount, item.decimals, 4) : formatDollars(amount, item.decimals);
}

export function activityAmount(item: ActivityItem): string {
  return `${item.direction === 'in' ? '+' : '−'}${itemAmount(item)}`;
}

function ActivityIcon({ item }: { item: ActivityItem }) {
  const [bg, icon] =
    item.status === 'pending'
      ? [colors.warningBg, <Clock key="c" size={20} color={colors.warning} />]
      : item.status === 'failed'
        ? [colors.dangerBg, <Cross key="x" size={20} color={colors.danger} />]
        : item.direction === 'in'
          ? [colors.skyLight, <ArrowDown key="d" size={20} color={colors.skyDark} />]
          : [colors.pinkLight, <ArrowUp key="u" size={20} color={colors.pinkDark} />];
  return <View style={[s.icon, { backgroundColor: bg }]}>{icon}</View>;
}

export function ActivityRow({
  item,
  mode,
  onPress,
  last,
}: {
  item: ActivityItem;
  mode: NetworkMode;
  onPress: () => void;
  last?: boolean;
}) {
  const chain = getChain(mode, item.chain).name;
  const who = item.counterparty
    ? `${item.direction === 'in' ? 'from' : 'to'} ${shortAddress(item.counterparty)} · ${chain}`
    : `${item.assetId === 'native' ? 'Fee coins' : 'Wallet'} · ${chain}`;
  return (
    <ListRow
      onPress={onPress}
      last={last}
      left={<ActivityIcon item={item} />}
      title={activityTitle(item)}
      subtitle={who}
      right={
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text
            style={[
              s.amount,
              item.direction === 'in' && { color: colors.skyDark },
              item.status === 'failed' && { color: colors.muted, textDecorationLine: 'line-through' },
            ]}
          >
            {activityAmount(item)}
          </Text>
          {item.status === 'pending' ? <Text style={s.chip}>On its way</Text> : null}
        </View>
      }
    />
  );
}

const s = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '700' },
  list: {
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: 1.5, borderBottomColor: colors.border },
  title: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 13, color: colors.muted },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  amount: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chip: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.warning,
    backgroundColor: colors.warningBg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
