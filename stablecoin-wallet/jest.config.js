/** Unit tests for the chain logic in src/lib (plain Node, no React Native). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node10', esModuleInterop: true, strict: true, types: ['jest', 'node'], ignoreDeprecations: '6.0' } }],
  },
};
