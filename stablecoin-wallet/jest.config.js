/** Unit tests for the chain logic in src/lib (plain Node, no React Native). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '@react-native-async-storage/async-storage/jest/async-storage-mock',
    '^rpc-websockets$': '<rootDir>/__tests__/stubs/rpc-websockets.js',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node10', esModuleInterop: true, strict: true, types: ['jest', 'node'], ignoreDeprecations: '6.0' } }],
  },
};
