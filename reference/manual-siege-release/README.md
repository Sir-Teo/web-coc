# Manually ending a deployed siege machine

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [character and ability tables](../full-client/combat.json) give all eight
siege families an intrinsic ability with `SelfDestruct=TRUE` and
`ActiveAfterPlayerInput=TRUE`. Battle Drill and Troop Launcher carry additional
abilities in their semicolon-separated lists; the adapter searches each entry.

| Machine        | Source self-destruct ability           |
| -------------- | -------------------------------------- |
| Wall Wrecker   | `SiegeMachineRamSelfDestruct`          |
| Battle Blimp   | `SiegeMachineFlyerSelfDestruct`        |
| Stone Slammer  | `SiegeMachineBallonSelfDestruct`       |
| Siege Barracks | `SiegeMachineCarrierSelfDestruct`      |
| Log Launcher   | `SiegeMachineLogLauncherSelfDestruct`  |
| Flame Flinger  | `SiegeMachineCatapultSelfDestruct`     |
| Battle Drill   | `SiegeMachineBattleDrillSelfDestruct`  |
| Troop Launcher | `SiegeMachineCommandTowerSelfDestruct` |

After deploying a machine in a current battle, its army card becomes **End
siege**, retaining its portrait, research level and live health bar. The button's
accessible name identifies the machine. It appears even if other troops started
the battle first. Other siege cards remain unavailable. No deployment hotkey
activates self-destruct. The card returns to its spent state after either a
manual or natural death. Replay viewing offers no live self-destruct control.

`GameModel.endSiege()` records a successful `siege-end` input, sets the living
machine's health to zero and records its defeat time. Self-destruct bypasses
Freeze and damage protection. The ordinary casualty pass owns all subsequent
death effects; marking the machine spent here would incorrectly skip them.
The one-siege deployment slot remains consumed. Repeated, stale, finished-battle
and replay-viewer calls return false without recording another input.

Existing Blimp and Stone Slammer death delays and blasts remain active. Already
spawned Barracks troops survive, while its unspawned roster is lost. Released
logs, Flame Flinger shots/burn areas and airborne Troop Launcher barrels continue
through their existing simulation paths. This feature adds no Clan Castle cargo
or transport system, so the control says End siege rather than promising a cargo
release. Exact modern executable self-destruct timing is not established here.

Combat version **232** enables `nativeSiegeManualRelease` only for initial armies
carrying a siege. Its action needs no unit identifier because the battle allows
only one player-deployed machine. Validation rejects the action in versions
before 232 and in armies without a siege. The portable replay-file envelope
remains version 1. Version 231 and earlier retain complete prior battle states.

Sixteen historical minimum/maximum recordings, covering every machine, were
captured twice and reconstructed through portable forward/backward seeks before
the change. Their full-state hashes are pinned. Current untouched battles equal
those old states after removing the new capability flag. Current manual inputs
also reconstruct complete states around death and delayed effects at every tier.
Focused effect tests cover death blasts, roster loss, surviving logs, burns and
barrels, protection bypass, stale calls and deployment-slot limits. Browser checks
exercise actual tray clicks, portable reconstruction in Node and the browser,
read-only replay controls, and phone/landscape/desktop layouts across all eight
families.
