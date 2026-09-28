export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'dist/**',
      'coverage/**',
      '.wb-probe/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
  },
]
