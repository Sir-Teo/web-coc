"""Collect pinned client effect, particle emitter and export references into lazy runtime packs.

A pack is one ``graph.json`` plus cropped source texture pages. It keeps the declared source
records (effects.csv rows, particle_emitters.csv rows, projectile rows) next to one runtime
mesh graph per SC scene, so the browser can play every referenced timeline without other
tables. Exports that the strict SC6 reader cannot retain (masks) are listed under
``skipped`` instead of being approximated.
"""
import json
import re
from functools import lru_cache

from PIL import Image

from .bundle import ROOT, digest
from .scene_graph import crop_textures
from .sc6 import decode_sctx, require
from .source_csv import decoded_rows, inherited_levels, records

FINGERPRINT = 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b'

# Town Hall 11-18 defenses whose battle rules live in src/game/native-defenses.ts.
DEFENSES = {'eagle': 'Eagle Artillery', 'scattershot': 'Scattershot', 'spelltower': 'Spell Tower',
            'monolith': 'Monolith', 'multiarchertower': 'Multi Archer Tower', 'ricochetcannon': 'Ricochet Cannon',
            'multigeartower': 'Multi Gear Tower', 'firespitter': 'Firespitter', 'revengetower': 'Revenge Tower',
            'superwizardtower': 'Super Wizard Tower', 'builder': 'Builders Hut', 'townhall': 'Town Hall'}
TRAPS = {'tornadotrap': 'Tornado Trap', 'gigabomb': 'Giga Bomb'}
BUILDING_EFFECTS = ['AttackEffect', 'AttackEffect2', 'AttackEffectAlt', 'HitEffect', 'HitEffect2', 'PreAttackEffect',
                    'LoadAmmoEffect', 'NoAmmoEffect', 'ToggleAttackModeEffect', 'AttackEffectLv2', 'AttackEffectLv3',
                    'TransitionEffectLv2', 'TransitionEffectLv3', 'DieDamageEffect', 'CombatActivationEffect']
WEAPON_EFFECTS = ['AttackEffect', 'AttackEffect2', 'HitEffect', 'DieDamageEffect', 'ActivationEffect']
SPELL_EFFECTS = ['PreDeployEffect', 'DeployEffect', 'DeployEffect2', 'ChargingEffect', 'HitEffect', 'EnemyDeployEffect',
                 'EndEffect']
TRAP_EFFECTS = ['Effect', 'Effect2', 'DamageEffect', 'EffectBroken', 'AppearEffect']
PROJECTILE_EFFECTS = ['Effect', 'SpawnEffect', 'DestroyedEffect', 'BounceEffect']


def scene_id(path):
    return path.split('/')[-1].removesuffix('.sc')


def slug(name):
    return re.sub('[^a-z0-9]+', '-', name.lower()).strip('-')


class Library:
    """Source tables and scenes read through the fingerprint-verified catalog reader."""

    def __init__(self, art):
        raw = (art.ARCHIVE / 'fingerprint.json').read_bytes()
        require(digest(raw) == FINGERPRINT, 'Fingerprint differs')
        art.MEMBERS = {r['file']: r['sha'] for r in json.loads(raw)['files']}
        self.art = art
        self._tables = {}

    def table(self, path):
        if path not in self._tables:
            self._tables[path] = records(decoded_rows(self.art.read(path)))
        return self._tables[path]

    @property
    def effects(self):
        return self.table('logic/effects.csv')

    @property
    def emitters(self):
        return self.table('csv/particle_emitters.csv')

    def scene(self, path):
        return self.art.scene(path)

    @lru_cache(maxsize=12)
    def texture(self, path, index):
        sc = self.art.scene(path)
        external = sc.textures[index]['external']
        return sc.embedded_texture(index) if external is None else decode_sctx(self.art.read('sc/' + external))

    def directional(self, path, prefix):
        """An exact export, or its numbered direction roots (``prefix_1`` ...) in numeric order."""
        exports = self.scene(path).exports
        if prefix in exports:
            return [prefix]
        return sorted([n for n in exports if re.fullmatch(re.escape(prefix) + r'_\d+', n)],
                      key=lambda n: int(n.rsplit('_', 1)[1]))

    def projectile_rows(self):
        """Client rows for every projectile the battle tables reference, in combat.json order."""
        rows = self.table('logic/projectiles.csv')
        combat = json.loads((ROOT / 'reference/full-client/combat.json').read_text())
        result = {}
        for name in combat['projectiles']:
            declared = rows.get(name)
            require(declared and len(declared) == 1, f'Unexpected projectile record {name}')
            result[name] = declared[0]
        return result

    def defense_references(self):
        """Effect, spell, projectile and animation references declared for the new defenses and traps.

        Returns ``{kind: dict(levels=[...], weapons={...}, spells={...}, abilities={...})}`` where every
        level keeps the effect columns of its building row and every weapon/spell/ability keeps its own.
        """
        buildings, weapons = self.table('logic/buildings.csv'), self.table('logic/weapons.csv')
        spells, traps = self.table('logic/spells.csv'), self.table('logic/traps.csv')
        abilities, projectiles = self.table('logic/special_abilities.csv'), self.table('logic/projectiles.csv')
        from .source_csv import animation_blocks
        blocks = animation_blocks(decoded_rows(self.art.read('csv/animations.csv')))
        result = {}

        def pick(row, columns):
            return {c: row[c] for c in columns if row.get(c)}

        def spell(name, into):
            if not name or name in into:
                return
            require(name in spells, f'Missing spell {name}')
            into[name] = [pick(r, SPELL_EFFECTS + ['Radius', 'DeployTimeMS', 'NumberOfHits', 'TimeBetweenHitsMS'])
                          for r in inherited_levels(spells[name])]

        def projectile(name, into):
            for part in (name or '').split(';'):
                if part and part in projectiles:
                    spell(projectiles[part][0].get('HitSpell'), into)

        for kind, name in {**DEFENSES, **TRAPS}.items():
            entry = dict(levels=[], weapons={}, spells={}, abilities={})
            table = traps if kind in TRAPS else buildings
            for row in inherited_levels(table[name]):
                level = dict(level=int(row.get('BuildingLevel', row.get('Level', 1))))
                level.update(pick(row, TRAP_EFFECTS if kind in TRAPS else BUILDING_EFFECTS))
                for column in ('ExportNameBeamStart', 'ExportNameBeamEnd', 'DefenderCharacter', 'DefenderCount',
                               'DefenderZ', 'AltDefenderZ', 'Weapon', 'Projectile', 'AltProjectile', 'Spell',
                               'SpecialAbilities', 'SpecialAbilitiesLevel', 'Animation', 'AnimationActionFrame',
                               'UnlockWeaponMode', 'SWF'):
                    if row.get(column):
                        level[column] = row[column]
                entry['levels'].append(level)
                spell(row.get('Spell'), entry['spells'])
                projectile(row.get('Projectile'), entry['spells'])
                projectile(row.get('AltProjectile'), entry['spells'])
                weapon_names = [row['Weapon']] if row.get('Weapon') else []
                if kind == 'spelltower':
                    weapon_names = [w for w in weapons if w.startswith('SpellTower')]
                for weapon in weapon_names:
                    if weapon in entry['weapons']:
                        continue
                    levels = []
                    for w in inherited_levels(weapons[weapon]):
                        levels.append(dict(pick(w, WEAPON_EFFECTS + ['ExportName', 'SWF', 'Projectile', 'DieDamageSpell'])))
                        spell(w.get('DieDamageSpell'), entry['spells'])
                        projectile(w.get('Projectile'), entry['spells'])
                    entry['weapons'][weapon] = levels
                for ability in (row.get('SpecialAbilities') or '').split(';'):
                    if ability and ability not in entry['abilities']:
                        declared = inherited_levels(abilities[ability])
                        levels = []
                        for a in declared:
                            block = blocks.get(a.get('Animation'), {'rows': []})
                            levels.append(dict(pick(a, ['OverrideExportName', 'Animation', 'Projectile']),
                                               animation=[{k: v for k, v in r.items() if v} for r in block['rows']]))
                            projectile(a.get('Projectile'), entry['spells'])
                        entry['abilities'][ability] = levels
            result[kind] = entry
        return result


class Collector:
    """Every source record and export one runtime pack needs, following effect references."""

    def __init__(self, library):
        self.lib = library
        self.effects, self.emitters, self.exports, self.missing = {}, {}, {}, []

    def export(self, path, name):
        require(path and name, 'Empty export reference')
        require(name in self.lib.scene(path).exports, f'Missing {path}:{name}')
        self.exports.setdefault(path, set()).add(name)

    def emitter(self, name):
        if not name or name in self.emitters:
            return
        rows = self.lib.emitters.get(name)
        if rows is None:
            self.missing.append(f'emitter:{name}')
            return
        self.emitters[name] = rows
        swf = None
        for row in rows:
            # Variant rows inherit the first row's scene when they leave ParticleSwf blank.
            swf = row.get('ParticleSwf') or swf
            if row.get('ParticleExportName'):
                self.export(swf, row['ParticleExportName'])

    def effect(self, name):
        if not name or name in self.effects:
            return
        rows = self.lib.effects.get(name)
        if rows is None:
            self.missing.append(f'effect:{name}')
            return
        self.effects[name] = rows
        for row in rows:
            if row.get('SWF') and row.get('ExportName'):
                self.export(row['SWF'], row['ExportName'])
            for column in ('ParticleEmitter', 'AltParticleEmitter'):
                self.emitter(row.get(column))
            self.effect(row.get('SpawnEffect'))

    def signature(self):
        return json.dumps(dict(exports={k: sorted(v) for k, v in sorted(self.exports.items())},
                               effects=sorted(self.effects), emitters=sorted(self.emitters)), sort_keys=True)


def write_pack(lib, collector, pack_dir, url_prefix, meta, check):
    """Serialize one pack; ``check`` compares graph bytes, decoded texels and the file set."""
    art = lib.art
    scenes, skipped, files = {}, {}, {'graph.json'}
    for path, names in sorted(collector.exports.items()):
        sc = lib.scene(path)
        kept = []
        for name in sorted(names):
            try:
                art.graph_for(sc, [name])
                kept.append(name)
            except ValueError as error:
                skipped[f'{path}:{name}'] = str(error)
        if not kept:
            continue
        sid = scene_id(path)
        require(sid not in scenes, f'Duplicate scene name {sid}')
        graph = art.graph_for(sc, kept)
        used = {t for commands in graph['shapes'].values() for t, _ in commands}
        images, _, runtime = crop_textures(graph, {t: lib.texture(path, t) for t in used}, f'{url_prefix}/{sid}')
        for relative, image in images.items():
            target = ROOT / 'public' / relative
            files.add(target.relative_to(pack_dir).as_posix())
            if check:
                with Image.open(target) as old:
                    require(old.mode == image.mode and old.size == image.size and old.tobytes() == image.tobytes(),
                            f'Texture differs: {relative}')
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                image.save(target, optimize=True)
        scenes[sid] = runtime
    pack = dict(meta, effects=dict(sorted(collector.effects.items())),
                emitters=dict(sorted(collector.emitters.items())), scenes=scenes)
    if skipped:
        pack['skipped'] = skipped
    serialized = json.dumps(pack, separators=(',', ':')) + '\n'
    target = pack_dir / 'graph.json'
    if check:
        require(target.read_text() == serialized, f'Native graph differs: {target.relative_to(ROOT)}')
        present = {f.relative_to(pack_dir).as_posix() for f in pack_dir.rglob('*') if f.is_file() and not f.name.startswith('.')}
        require(present == files, f'Unexpected files in native pack: {pack_dir.relative_to(ROOT)}')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(serialized)
        for stale in [f for f in pack_dir.rglob('*') if f.is_file() and f.relative_to(pack_dir).as_posix() not in files]:
            stale.unlink()
    size = sum((pack_dir / f).stat().st_size for f in files)
    return dict(sha256=digest(serialized.encode()), bytes=size, skipped=skipped)


def unique_ids(names, used=None):
    """Stable, collision-free slugs for source record names."""
    used, result = set(used or ()), {}
    for name in names:
        base = slug(name) or 'record'
        candidate, n = base, 2
        while candidate in used:
            candidate, n = f'{base}-{n}', n + 1
        used.add(candidate)
        result[name] = candidate
    return result


def sync_pack_dirs(output, wanted, check):
    """Remove (or, when checking, reject) pack directories that no longer correspond to a record."""
    import shutil
    present = {p.name for p in output.iterdir() if p.is_dir()} if output.exists() else set()
    if check:
        require(present == set(wanted), f'Unexpected packs under {output.relative_to(ROOT)}: {sorted(present ^ set(wanted))}')
    else:
        for stale in present - set(wanted):
            shutil.rmtree(output / stale)
