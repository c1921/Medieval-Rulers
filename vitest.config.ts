import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { compilerOptions } from 'vue3-pixi'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/tests/**/*.test.ts'],
    setupFiles: ['src/tests/setup.ts'],
  },
})
