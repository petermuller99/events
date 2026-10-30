import type { JSX } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import type { ChainId } from '../lib/config';

// Official USDT (Tether) and USDC (Circle) marks and network logos, from the CC0
// cryptocurrency-icons set, using each issuer's brand colour.

function Usdt({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx={16} cy={16} r={16} fill="#26A17B" />
      <Path
        fill="#FFF"
        d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117"
      />
    </Svg>
  );
}

function Usdc({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx={16} cy={16} r={16} fill="#2775CA" />
      <G fill="#FFF">
        <Path d="M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.243-2.193-.728-2.193-1.578 0-.85.61-1.396 1.828-1.396 1.097 0 1.707.364 2.011 1.275a.458.458 0 00.427.303h.975a.416.416 0 00.427-.425v-.06a3.04 3.04 0 00-2.743-2.489V9.142c0-.243-.183-.425-.487-.486h-.915c-.243 0-.426.182-.487.486v1.396c-1.829.242-2.986 1.456-2.986 2.974 0 2.002 1.218 2.791 3.778 3.095 1.707.303 2.255.668 2.255 1.639 0 .97-.853 1.638-2.011 1.638-1.585 0-2.133-.667-2.316-1.578-.06-.242-.244-.364-.427-.364h-1.036a.416.416 0 00-.426.425v.06c.243 1.518 1.219 2.61 3.23 2.914v1.457c0 .242.183.425.487.485h.915c.243 0 .426-.182.487-.485V21.34c1.829-.303 3.047-1.578 3.047-3.217z" />
        <Path d="M12.892 24.497c-4.754-1.7-7.192-6.98-5.424-11.653.914-2.55 2.925-4.491 5.424-5.402.244-.121.365-.303.365-.607v-.85c0-.242-.121-.424-.365-.485-.061 0-.183 0-.244.06a10.895 10.895 0 00-7.13 13.717c1.096 3.4 3.717 6.01 7.13 7.102.244.121.488 0 .548-.243.061-.06.061-.122.061-.243v-.85c0-.182-.182-.424-.365-.546zm6.46-18.936c-.244-.122-.488 0-.548.242-.061.061-.061.122-.061.243v.85c0 .243.182.485.365.607 4.754 1.7 7.192 6.98 5.424 11.653-.914 2.55-2.925 4.491-5.424 5.402-.244.121-.365.303-.365.607v.85c0 .242.121.424.365.485.061 0 .183 0 .244-.06a10.895 10.895 0 007.13-13.717c-1.096-3.46-3.778-6.07-7.13-7.162z" />
      </G>
    </Svg>
  );
}

function Ethereum({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx={16} cy={16} r={16} fill="#627EEA" />
      <G fill="#FFF">
        <Path fillOpacity={0.602} d="M16.498 4v8.87l7.497 3.35z" />
        <Path d="M16.498 4L9 16.22l7.498-3.35z" />
        <Path fillOpacity={0.602} d="M16.498 21.968v6.027L24 17.616z" />
        <Path d="M16.498 27.995v-6.028L9 17.616z" />
        <Path fillOpacity={0.2} d="M16.498 20.573l7.497-4.353-7.497-3.348z" />
        <Path fillOpacity={0.602} d="M9 16.22l7.498 4.353v-7.701z" />
      </G>
    </Svg>
  );
}

function Bnb({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx={16} cy={16} r={16} fill="#F3BA2F" />
      <Path
        fill="#FFF"
        d="M12.116 14.404L16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26zM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003 2.263-2.257zM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16zm-3.188-.002h.002V16L16 18.294l-2.291-2.29-.004-.004.004-.003.401-.402.195-.195L16 13.706l2.293 2.293z"
      />
    </Svg>
  );
}

function Solana({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx={16} cy={16} r={16} fill="#66F9A1" />
      <Path
        fill="#FFF"
        d="M9.925 19.687a.59.59 0 01.415-.17h14.366a.29.29 0 01.207.497l-2.838 2.815a.59.59 0 01-.415.171H7.294a.291.291 0 01-.207-.498l2.838-2.815zm0-10.517A.59.59 0 0110.34 9h14.366c.261 0 .392.314.207.498l-2.838 2.815a.59.59 0 01-.415.17H7.294a.291.291 0 01-.207-.497L9.925 9.17zm12.15 5.225a.59.59 0 00-.415-.17H7.294a.291.291 0 00-.207.498l2.838 2.815c.11.109.26.17.415.17h14.366a.291.291 0 00.207-.498l-2.838-2.815z"
      />
    </Svg>
  );
}

const CHAIN_LOGOS: Record<ChainId, (p: { size: number }) => JSX.Element> = {
  ethereum: Ethereum,
  bsc: Bnb,
  solana: Solana,
};

export function ChainLogo({ chain, size = 20 }: { chain: ChainId; size?: number }) {
  const Logo = CHAIN_LOGOS[chain];
  return <Logo size={size} />;
}

/** Coin logo with a small network badge in the corner, e.g. USDT with a BNB Chain badge. */
export function TokenLogo({ symbol, chain, size = 42 }: { symbol: 'USDT' | 'USDC'; chain?: ChainId; size?: number }) {
  const badge = Math.round(size * 0.46);
  return (
    <View style={{ width: size, height: size }}>
      {symbol === 'USDT' ? <Usdt size={size} /> : <Usdc size={size} />}
      {chain ? (
        <View
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            borderRadius: badge,
            borderWidth: 2,
            borderColor: '#fff',
            backgroundColor: '#fff',
          }}
        >
          <ChainLogo chain={chain} size={badge} />
        </View>
      ) : null}
    </View>
  );
}
