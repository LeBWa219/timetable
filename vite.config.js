import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// деплой на GitHub Pages: https://lebwa219.github.io/timetable/
export default defineConfig({
  base: '/timetable/',
  plugins: [react()],
});
