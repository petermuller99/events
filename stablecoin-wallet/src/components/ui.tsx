import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type RefreshControlProps,
  type TextInputProps,
  type TextProps,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Pearl brand: honey gradient, cocoa text, caramel accents, sky-blue hexagon, pink.
export const colors = {
  honeyTop: '#FFD55B',
  honeyBottom: '#FFA62B',
  honey: '#FFBE45',
  honeyShadow: '#E8901F',
  bg: '#FFF8EA',
  card: '#FFFFFF',
  text: '#3B2209',
  muted: '#7A5A3A',
  caramel: '#A05A14',
  border: '#F3E4C6',
  sky: '#7EC4F0',
  skyLight: '#E1F2FD',
  skyDark: '#1F6FA3',
  pink: '#F09CA9',
  pinkLight: '#FDE6EA',
  pinkDark: '#B4475A',
  danger: '#B3261E',
  dangerBg: '#FDE8E6',
  warning: '#7A4A00',
  warningBg: '#FFEFC2',
  info: '#1E5C86',
  infoBg: '#E3F2FC',
  success: '#2E6B30',
  successBg: '#E6F4E2',
};

export const honeyGradient = [colors.honeyTop, colors.honeyBottom] as const;

export const fonts = {
  regular: 'Fredoka_400Regular',
  medium: 'Fredoka_500Medium',
  semibold: 'Fredoka_600SemiBold',
  bold: 'Fredoka_700Bold',
};

export const chainColors: Record<string, string> = {
  ethereum: '#627EEA',
  bsc: '#E0A800',
  tron: '#E50914',
};

const stickers = {
  wheee: require('../../assets/brand/stickers/wheee.png'),
  laugh: require('../../assets/brand/stickers/laugh.png'),
  hello: require('../../assets/brand/stickers/hello.png'),
  cheeky: require('../../assets/brand/stickers/cheeky.png'),
  hmm: require('../../assets/brand/stickers/hmm.png'),
  curious: require('../../assets/brand/stickers/curious.png'),
};

export const brandImages = {
  mark: require('../../assets/brand/mark.png'),
  laughLoop: require('../../assets/brand/laugh-loop.webp'),
};

export type StickerName = keyof typeof stickers;

export function Sticker({ name, size = 120, style }: { name: StickerName; size?: number; style?: ImageStyle }) {
  return (
    <Image
      source={stickers[name]}
      style={[{ width: size, height: size }, style]}
      contentFit="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

const familyForWeight: Record<string, string> = {
  normal: fonts.regular,
  '300': fonts.regular,
  '400': fonts.regular,
  '500': fonts.medium,
  '600': fonts.semibold,
  bold: fonts.bold,
  '700': fonts.bold,
  '800': fonts.bold,
  '900': fonts.bold,
};

/**
 * Text in the brand font. Custom fonts ship one file per weight, so fontWeight is
 * turned into the matching Fredoka family (Android ignores fontWeight on custom fonts).
 */
export function Text({ style, ...props }: TextProps) {
  const { fontWeight, fontFamily, ...rest } = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const family = fontFamily ?? familyForWeight[String(fontWeight ?? '400')] ?? fonts.regular;
  return <RNText {...props} style={[{ color: colors.text }, rest, { fontFamily: family }]} />;
}

export function HoneyBackground({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  return (
    <LinearGradient colors={honeyGradient} style={[{ flex: 1 }, style]}>
      {children}
    </LinearGradient>
  );
}

export function Screen({
  children,
  refreshControl,
  scroll = true,
  honey = false,
  tab = false,
}: {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  scroll?: boolean;
  /** Full honey-gradient background, for brand moments like onboarding. */
  honey?: boolean;
  /** Tab screens: no navigation header above, tab bar below. */
  tab?: boolean;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }]}>{children}</View>
  );
  if (honey) {
    return (
      <HoneyBackground>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
          {body}
        </SafeAreaView>
      </HoneyBackground>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={tab ? ['top', 'left', 'right'] : ['bottom', 'left', 'right']}>
      {body}
    </SafeAreaView>
  );
}

/** primary: honey gradient. dark: cocoa, for use on honey backgrounds. */
type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const inactive = disabled || loading;
  const label = loading ? (
    <ActivityIndicator color={variant === 'dark' ? colors.honeyTop : colors.text} />
  ) : (
    <Text
      style={[
        styles.buttonText,
        variant === 'danger' && { color: colors.danger },
        variant === 'dark' && { color: colors.honeyTop },
      ]}
    >
      {title}
    </Text>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        inactive && styles.buttonDisabled,
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={honeyGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.buttonFill}
        >
          {label}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.buttonFill,
            variant === 'dark' && styles.buttonFill_dark,
            variant === 'danger' && styles.buttonFill_danger,
          ]}
        >
          {label}
        </View>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const bannerPalette = {
  info: [colors.infoBg, colors.info],
  warning: [colors.warningBg, colors.warning],
  danger: [colors.dangerBg, colors.danger],
  success: [colors.successBg, colors.success],
} as const;

export function Banner({
  tone,
  children,
  sticker,
}: {
  tone: keyof typeof bannerPalette;
  children: ReactNode;
  sticker?: StickerName;
}) {
  const [bg, fg] = bannerPalette[tone];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      {sticker ? <Sticker name={sticker} size={44} /> : null}
      <Text style={[styles.bannerText, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function Field({
  label,
  error,
  right,
  ...input
}: TextInputProps & { label: string; error?: string | null; right?: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor={colors.caramel}
          {...input}
          style={[styles.input, error ? { borderColor: colors.danger } : null, input.style]}
        />
        {right}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} selectable>
        {value}
      </Text>
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }]}>{children}</Text>;
}

/** Inline text button, e.g. "Paste" or "Max" next to an input. */
export function LinkButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button">
      <Text style={styles.link}>{title}</Text>
    </Pressable>
  );
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23 },
  mono: { fontFamily: 'monospace' },
  link: { color: colors.caramel, fontWeight: '600', fontSize: 15 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 16,
    gap: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  // Candy look: the darker bottom edge shows under the button face.
  button: { minHeight: 56, borderRadius: 999, overflow: 'hidden', paddingBottom: 5 },
  buttonFill: {
    flex: 1,
    minHeight: 51,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonFill_dark: { backgroundColor: colors.text },
  buttonFill_danger: { backgroundColor: colors.dangerBg },
  button_primary: { backgroundColor: colors.honeyShadow },
  button_dark: { backgroundColor: '#1E1004' },
  button_secondary: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.text, paddingBottom: 0 },
  button_danger: { backgroundColor: '#F4C7C2' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 17, fontWeight: '600', color: colors.text },
  banner: { borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bannerText: { fontSize: 14, lineHeight: 20, flex: 1 },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text,
    backgroundColor: colors.card,
  },
  error: { color: colors.danger, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { fontSize: 15, fontWeight: '500' },
  chipTextSelected: { color: colors.honeyTop },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 14, flexShrink: 1, textAlign: 'right' },
});
