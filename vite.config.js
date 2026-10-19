import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (p) => fileURLToPath(new URL(p, import.meta.url));

// Site multi-pages : le menu + un dossier par jeu
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: page('./index.html'),
        neon: page('./neon-drift/index.html'),
        cosmo: page('./cosmo-hop/index.html'),
        prism: page('./prism-blocks/index.html'),
        slice: page('./slice-rush/index.html'),
        wall: page('./dont-hit-the-wall/index.html'),
        bounce: page('./bounce-bash/index.html'),
        hyper: page('./hyper-lane/index.html'),
        dash: page('./djellaba-dash/index.html'),
        dial: page('./dial-in/index.html'),
        falafel: page('./yalla-falafel/index.html'),
        world: page('./world-quiz/index.html'),
        roll: page('./roll-rush/index.html'),
        bullseye: page('./bullseye-blitz/index.html'),
        snake: page('./snake-studio/index.html'),
        drop4: page('./drop-four/index.html'),
        rubik: page('./rubiks-cube/index.html'),
        buddy: page('./buddy-smash/index.html'),
        pot: page('./pot-peak/index.html'),
        sky: page('./sky-stack/index.html'),
        petit: page('./petit-bac/index.html'),
        pong: page('./pong-3d/index.html'),
      },
    },
  },
});