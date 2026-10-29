import Svg, { Circle, Path } from 'react-native-svg';

type IconProps = { size?: number; color: string };

export function ArrowUp({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 19V6M6 11l6-6 6 6" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ArrowDown({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v13M6 13l6 6 6-6" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Clock({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={2.6} />
      <Path d="M12 8v4l3 2" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

export function Cross({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 7l10 10M17 7L7 17" stroke={color} strokeWidth={2.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Hexagon, echoing the Pearl mark. */
export function HomeIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3l8 4.6v8.8L12 21l-8-4.6V7.6z" stroke={color} strokeWidth={2.4} strokeLinejoin="round" />
    </Svg>
  );
}

export function ListIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8 7h11M8 12h11M8 17h11" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
      <Circle cx={4} cy={7} r={1.6} fill={color} />
      <Circle cx={4} cy={12} r={1.6} fill={color} />
      <Circle cx={4} cy={17} r={1.6} fill={color} />
    </Svg>
  );
}

export function GearIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={2.4} />
      <Path
        d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function Chevron({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
