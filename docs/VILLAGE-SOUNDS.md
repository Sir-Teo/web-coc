# Village sounds

Village feedback plays the client's own sounds, as rows of its `logic/effects.csv`: each row names the Ogg file, its volume and its pitch range.

| Moment | Client effect | Sound | Volume | Pitch |
| --- | --- | --- | --- | --- |
| Collecting Gold, Elixir or Dark Elixir | Collect Gold, Collect Elixir, Collect Dark Elixir | `coins_collect_01`, `elixir_collect_02`, `dark_elixir_collect` | 70%, 70%, 80% | 1 |
| Gems from a cleared obstacle or an achievement | Collect Diamonds | `collect_diamonds_01` | 70% | 1 |
| Placing a building, starting an upgrade (any `build` cue) | Start Building | `building_construct_07` | 80% | 0.75 |
| A building or upgrade finishing | Building Ready | `building_finished_01` | 80% | 1 |
| The Town Hall finishing | TH Upgrade Jingle | `town_hall_upgrade_jingle_01` | 70% | 1 |
| Starting a hero upgrade | Start Hero Upgrade | `hero_upgrade_02` | 80% | 0.64 |
| Starting research | Troop Upgrade Start | `start_troop_upgrade_01` | 70% | 1 |
| Research finishing (at the Laboratory) | Troop Upgrade Finished | `troop_upgrade_finished_01` | 70% | 1 |
| A hero upgrade finishing (at the Hero Hall) | Hero Upgrade Finished | `building_finished_01` | 80% | 1 |
| Buttons and selecting a building | (the interface's own) | `button_click` | 60% | 1 |

Generic Pick Up and Boost Start are imported too, for moments this game does not mark with an effect yet. Finished research and hero upgrades show the completion ring at the Laboratory or Hero Hall with their sound. Defense-specific pickup and placement sounds stay with their families (Archer Tower, Cannon, Mortar and the others).

## Source and loading

`python3 scripts/import-native-village-sounds.py` reads the pinned client's `effects.csv`, copies the 13 Ogg files unchanged to `public/assets/audio/village-native/` (about 200 KB) and writes `reference/village-sounds/sounds.json`; `--check` verifies both against `reference/full-client/manifest.json`.

They are fetched after the first gesture with sound on, never at boot, and decoded like the other native samples. Until a sound is decoded, or where a browser cannot decode Ogg, the generated tone it replaces plays instead. Vibration follows the same moments either way. A sample plays at the client's volume scaled as every native sample is (`volume × 0.12`), and at most eight interface sounds overlap.

`tests/village-sounds.test.ts` checks the pinned rows and files and the one-shot player; `tests/browser/village-sounds.spec.ts` checks that nothing is fetched before the first gesture and that collecting Gold plays the client's coin sound.
