import * as THREE from "three";
import { Game } from "./game";
import { Hud } from "./hud";
import { Input } from "./input";

const parent = document.getElementById("game")!;
const hudEl = document.getElementById("hud")!;
const probe = document.getElementById("safe-area-probe")!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
// Retina iPads report 2; more than that costs a lot for little gain.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
parent.prepend(renderer.domElement);

const input = new Input(renderer.domElement, hudEl);
const hud = new Hud(hudEl, input);
const game = new Game(input, hud);

// iOS/iPadOS report a layout viewport taller than what's actually on screen,
// so size from visualViewport instead, minus the home-indicator inset.
function fitToViewport(): void {
  const vv = window.visualViewport;
  const doc = document.documentElement;
  const width = Math.round(Math.min(vv?.width ?? Infinity, window.innerWidth, doc.clientWidth));
  const height = Math.round(
    Math.min(vv?.height ?? Infinity, window.innerHeight, doc.clientHeight) - probe.offsetHeight
  );
  parent.style.width = `${width}px`;
  parent.style.height = `${height}px`;
  renderer.setSize(width, height);
  game.camera.aspect = width / height;
  game.camera.updateProjectionMatrix();
}
fitToViewport();
window.addEventListener("resize", fitToViewport);
window.visualViewport?.addEventListener("resize", fitToViewport);
// Safari settles its viewport a beat after the rotation finishes.
window.addEventListener("orientationchange", () => setTimeout(fitToViewport, 200));

function frame(dt: number): void {
  game.update(dt);
  renderer.render(game.scene, game.camera);
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  // Clamp so a hiccup (or a backgrounded tab) doesn't teleport everything.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
});

// Dev-only handle for debugging / automated playtesting.
if (import.meta.env.DEV) {
  (window as any).__game = { game, input, renderer, step: (dt = 1 / 60) => frame(dt) };
}
