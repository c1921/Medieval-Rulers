import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { compilerOptions } from 'vue3-pixi'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions,
      },
    }),
  ],
})
