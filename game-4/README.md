# Popcorn Panic (game 4)

A third-person, cartoon-shaded 3D game set in a popcorn factory where things keep going wrong.
Built with plain Three.js + TypeScript + Vite. Made for the web, played on an iPad.

## Run

```bash
bun install
bun run dev        # serves on localhost and the LAN
```

Open the `Network:` URL Vite prints on the iPad (same Wi-Fi). `bun run typecheck` type-checks;
`bun run build` makes `dist/`.

## Controls

| | Touch (iPad) | Keyboard + mouse |
|---|---|---|
| Walk | Thumb anywhere on the left side — a stick appears under it | WASD / arrows |
| Look | Drag anywhere else | Click to grab the mouse, then move it (Esc lets go) |
| Action | Big round button, bottom right | Click, E, or Space |

The action depends on where you are: **SCOOP** kernels, **TOSS** a loaded shovel, or **PUMP** when
standing at the pump (hold to push the handle down, let go to let it up — one down-and-up is a
stroke).

## The factory today

1. **Corn husker** — cobs ride in on a belt, kernels ride out to the cleaner.
2. **Kernel cleaner** — *jammed!* Its spout pours kernels onto the floor (alarm flashing).
3. **Popper** — shovel kernels into its yellow hopper; popcorn shoots out into the bin beside it.
4. **Pump → Butter & salt** — pump the handle to push popcorn from the bin up the glass pipe.

There's no score, timer, or goal yet. Those are for the game designer to decide.

## Where things live

| File | What's in it |
|---|---|
| `src/config.ts` | **Every tunable number**: speeds, camera, kernel counts, shovel size, station names/colours/positions |
| `src/factory.ts` | The room and every machine, built from simple shapes |
| `src/player.ts` | The worker model, walk cycle, shovel poses |
| `src/kernels.ts` | Kernel physics (piling, wading, shovelling, falling into hoppers) |
| `src/puffs.ts` | Flying popcorn (arcs into the bin, rides the pipe) |
| `src/input.ts` | Keyboard, mouse, and multi-touch → move / look / action |
| `src/hud.ts` | On-screen buttons and hints. New right-side buttons go here |
| `src/toon.ts` | The cartoon look: banded toon shading and ink outlines |
| `src/game.ts` | Glue: the frame update, shovel/pump rules, camera |
