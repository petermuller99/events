// Polyfills must load before ethers, so they run ahead of the router entry.
import './src/polyfills';
import 'expo-router/entry';
