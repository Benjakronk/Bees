# BIER

*A hive under your wing.*

A retro, MS-DOS-flavoured game in the spirit of **MAUR** (and Liero, 1998): a
320×200 pixel canvas with a CRT overlay, a hand-drawn bitmap font, and chunky
PC-speaker sound. You play a single worker bee inside a great hollow oak. The
colony lives and works on its own — foragers gather, nurses feed grubs, guards
patrol, the queen lays, honey ripens — and it will *mostly* survive whether or
not you lift a wing. Your job is to help it **thrive** and keep it alive long
enough to reach winter with a full larder.

## Play

Open `index.html` in any modern browser. No build step.

### Controls

| | Player 1 | Player 2 |
|---|---|---|
| Fly | `W A S D` | Arrow keys |
| Sting | `Space` | `.` |
| Gather / Deposit / Feed | `E` | `,` |
| Switch to another bee | `Tab` | `L` |

- **Hold the action key at a flower** to fill up on nectar and pollen.
- **Hold it at a comb cell** to deposit your load (nectar becomes honey; pollen
  is stored as bee bread).
- **Hold it at a hungry grub** (marked `!`) to feed it.
- **Sting** wasps, hornets, robber bees and spiders to drive them off.

`M` map · `Esc`/`P` pause · `C` toggle CRT · `N` toggle sound

Two players share one hive: at the hive-select screen, `Enter` starts one
player and `T` starts split-screen co-op. Toggle the split between **horizontal**
and **vertical** from the pause menu. The title menu's **LANGUAGE** option
switches the whole game between **English** and **Norwegian (Norsk)**; the choice
is remembered between sessions.

### The goal

Stock enough honey to survive the winter. Flowers bloom richly in **summer**
and wither through **autumn** into **winter**, so gather while the gathering is
good. Reach **winter day 10** with a well-stocked comb and the hive endures —
victory. Lose the queen with no brood to raise a new one, or let the colony
starve, and the hive falls.

If your bee dies you take over another member of the colony — the hive lives on.
You can also **switch to another bee at will** (`Tab` / `L`): a roster of nearby
bees appears, and the one you leave returns to its colony duties.

## Project layout

| File | Role |
|---|---|
| `js/font.js` | 5×7 bitmap font + bee/honey/flower icons (incl. Æ Ø Å) |
| `js/lang.js` | English / Norwegian UI strings (`L()` lookup) |
| `js/sfx.js` | WebAudio sound effects + a live wingbeat drone |
| `js/worldgen.js` | seeded meadow + hollow-oak hive generation |
| `js/terrain.js` | pixel-material collision & rendering |
| `js/comb.js` | the honeycomb: a hex grid of honey / pollen / brood cells |
| `js/entities.js` | bees (flight + AI), flowers, threats |
| `js/hive.js` | colony simulation: economy, brood cycle, tasks, seasons |
| `js/save.js` | three save slots (localStorage) |
| `js/main.js` | game loop, input, rendering, HUD, menus |

## Tests

The `test/` scripts drive the game with Playwright (reusing the install from the
sibling `Ants` project) and check for console errors, the core gather→deposit→
feed loop, the win trigger, save/load round-tripping, and long-run economic
stability.

```
node test/smoke.js     # boots and plays a short session, asserts no errors
node test/loop.js      # verifies gather / deposit / feed
node test/win.js       # verifies the winter victory trigger
node test/saveload.js  # verifies a save/load round-trip
node test/stress.js    # fast-forwards days, watches the economy stay stable
node test/season.js    # runs the full spring→winter arc
node test/shots.js     # captures framed screenshots
node test/verify.js    # language toggle, split orientation, iris transition
node test/switch.js    # voluntary switch-to-another-bee + cancel
node test/perf.js      # measures per-frame draw cost (inside / outside)
```
