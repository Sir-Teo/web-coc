#!/usr/bin/env python3
"""Compile pinned Home Village level and unlock tables for progression through TH18."""
import argparse,hashlib,json
from pathlib import Path
from native_art.bundle import ROOT,digest
from native_art.source_csv import records,decoded_rows,inherited_levels
from native_art.sc6 import require
BASE=ROOT/'art/source/native-client-18.400.21'
MAPPING={'townhall':'Town Hall','goldmine':'Gold Mine','collector':'Elixir Collector','goldstorage':'Gold Storage','elixirstorage':'Elixir Storage','darkdrill':'Dark Elixir Drill','darkstorage':'Dark Elixir Storage','barracks':'Barracks','camp':'Army Camp','builder':'Builders Hut','laboratory':'Laboratory','spellfactory':'Spell Factory','herohall':'Hero Hall','blacksmith':'Blacksmith','wall':'Wall','cannon':'Cannon','archertower':'Archer Tower','mortar':'Mortar','airdefense':'Air Defense','airsweeper':'Air Sweeper','tesla':'Hidden Tesla','bombtower':'Bomb Tower','wizardtower':'Wizard Tower','xbow':'X-Bow','inferno':'Inferno Tower','clancastle':'Clan Castle'}
EXTRA={'darkbarracks':'Dark Barracks','darkspellfactory':'Dark Spell Factory','workshop':'Siege Workshop','pethouse':'Pet House','eagle':'Eagle Artillery','scattershot':'Scattershot','spelltower':'Spell Tower','monolith':'Monolith','multiarchertower':'Multi Archer Tower','ricochetcannon':'Ricochet Cannon','multigeartower':'Multi Gear Tower','firespitter':'Firespitter','revengetower':'Revenge Tower','superwizardtower':'Super Wizard Tower'}
MAPPING.update(EXTRA)
TRAPS={'bomb':'Bomb','giantbomb':'Giant Bomb','airbomb':'Air Bomb','springtrap':'Spring Trap','seekingairmine':'Seeking Air Mine','skeletontrap':'Skeleton Trap','tornadotrap':'Tornado Trap','gigabomb':'Giga Bomb'}
# Blank Weapon and MergeRequirement cells mean "none": the Town Hall 18 row has neither (official wiki).
EXACT={'Weapon','MergeRequirement'}
TROOPS={'swordsman':'Barbarian','archer':'Archer','giant':'Giant','wizard':'Wizard','balloon':'Balloon','goblin':'Goblin','wallbreaker':'Wall Breaker','healer':'Healer','dragon':'Dragon','pekka':'PEKKA'}
EXTRA_TROOPS={'babydragon':'Baby Dragon','miner':'Miner','electrodragon':'Electro Dragon','yeti':'Yeti','dragonrider':'Dragon Rider','electrotitan':'Electro Titan','rootrider':'Root Rider','thrower':'Thrower','meteorgolem':'Meteor Golem','minion':'Minion','hogrider':'Hog Rider','valkyrie':'Valkyrie','golem':'Golem','witch':'Witch','lavahound':'Lava Hound','bowler':'Bowler','icegolem':'Ice Golem','headhunter':'Headhunter','apprenticewarden':'Apprentice Warden','druid':'Druid','furnace':'Furnace','ruinwitch':'Ruin Witch'}
SIEGE_TROOPS={'wallwrecker': 'Wall Wrecker', 'battleblimp': 'Battle Blimp', 'stoneslammer': 'Stone Slammer', 'siegebarracks': 'Siege Barracks', 'loglauncher': 'Log Launcher', 'flameflinger': 'Flame Flinger', 'battledrill': 'Battle Drill', 'trooplauncher': 'Troop Launcher'}
SUPER_TROOPS={'superbarbarian': 'Super Barbarian', 'superarcher': 'Super Archer', 'supergiant': 'Super Giant', 'sneakygoblin': 'Sneaky Goblin', 'superwallbreaker': 'Super Wall Breaker', 'rocketballoon': 'Rocket Balloon', 'superwizard': 'Super Wizard', 'superdragon': 'Super Dragon', 'infernodragon': 'Inferno Dragon', 'superminer': 'Super Miner', 'superyeti': 'Super Yeti', 'superminion': 'Super Minion', 'superhogrider': 'Super Hog Rider', 'supervalkyrie': 'Super Valkyrie', 'superwitch': 'Super Witch', 'icehound': 'Ice Hound', 'superbowler': 'Super Bowler'}
EXTRA_TROOPS.update(SIEGE_TROOPS)
EXTRA_TROOPS.update(SUPER_TROOPS)
TROOPS.update(EXTRA_TROOPS)
SPELLS={'lightning':'Lightning','heal':'Healing','rage':'Rage'}

def number(row,key,default=0):return float(row.get(key,default) or default)
def seconds(row,prefix):return sum(number(row,prefix+k)*v for k,v in [('D',86400),('H',3600),('M',60),('S',1)])
def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
 fp=(BASE/'fingerprint.json').read_bytes();require(digest(fp)=='ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b','Fingerprint differs')
 members={r['file']:r['sha'] for r in json.loads(fp)['files']};pins={}
 def table(name):
  path=f'logic/{name}.csv';data=(BASE/'files'/path).read_bytes();require(hashlib.sha1(data).hexdigest()==members[path],'Source mismatch');pins[path]=digest(data);return records(decoded_rows(data))
 buildings,traps,townhalls,weapons,characters,spells=map(table,['buildings','traps','townhall_levels','weapons','characters','spells'])
 ths=inherited_levels([townhalls[str(i)][0] for i in range(1,19)])
 b={}
 for kind,name in {**MAPPING,**TRAPS}.items():
  levels=[]
  raw=(traps if kind in TRAPS else buildings)[name]
  for index,row in enumerate(inherited_levels(raw)):
   row={k:v for k,v in row.items() if k not in EXACT or k in raw[index]}
   lv=int(row.get('BuildingLevel',row.get('Level',1)));th=max(1,int(row.get('TownHallLevel',1)))
   if th>18:continue
   weapon=row
   if row.get('Weapon'):
    weapon=inherited_levels(weapons[row['Weapon']])[int(row.get('WeaponLevel',1))-1]
   levels.append(dict(level=lv,townhall=th,hp=number(row,'Hitpoints',1),cost=number(row,'BuildCost'),seconds=seconds(row,'BuildTime'),
    resource={'Gold':'gold','Elixir':'elixir','DarkElixir':'dark','Diamonds':'gems'}.get(row.get('BuildResource'),'gold'),
    size=number(row,'Width',1),capacity=number(row,'HousingSpace',number(row,'HousingSpaceAlt')),
    goldCapacity=number(row,'MaxStoredGold'),elixirCapacity=number(row,'MaxStoredElixir'),darkCapacity=number(row,'MaxStoredDarkElixir'),
    production=number(row,'ResourcePer100Hours')/100,productionCapacity=number(row,'ResourceMax'),
    dps=number(weapon,'DPS') or (number(weapon,'Damage')/(number(weapon,'AttackSpeed',1000)/1000)),damage=number(weapon,'Damage'),minRange=number(weapon,'MinAttackRange')/100,splash=number(weapon,'DamageRadius')/100,hpDamage=number(weapon,'DamagePermilHp')/1000,multiTargets=number(weapon,'NumMultiTargets',1),merge=row.get('MergeRequirement',''),rate=number(weapon,'AttackSpeed')/1000,range=number(weapon,'AttackRange')/100,
    targets='both' if weapon.get('AirTargets')=='TRUE' and weapon.get('GroundTargets')=='TRUE' else 'air' if weapon.get('AirTargets')=='TRUE' else 'ground'))
  b[kind]=dict(name=name,levels=levels,counts=[1 if kind=='townhall' else int(r.get(name,0)) for r in ths])
 t={};troop_defs={}
 for kind,name in TROOPS.items():
  rows=inherited_levels(characters[name]);t[kind]=[];troop_defs[kind]=rows[0]
  for i,r in enumerate(rows):
   previous=rows[max(0,i-1)]
   t[kind].append(dict(hp=number(r,'Hitpoints'),dps=max(0,number(r,'DPS')),heal=max(0,-number(r,'DPS')),cost=number(previous,'UpgradeCost') if i else 0,seconds=seconds(previous,'UpgradeTime') if i else 0,laboratory=number(r,'LaboratoryLevel') if i else 0,deathDamage=number(r,'DieDamage')))
 s={}
 for kind,name in SPELLS.items():
  s[kind]=inherited_levels(spells[name])
 heroes=table('heroes');abilities=table('special_abilities');king=[];rows=inherited_levels(heroes['Barbarian King']);heals=inherited_levels(abilities['BarbarianKingAbilityHeal'])
 for i,row in enumerate(rows):
  previous=rows[max(0,i-1)];king.append(dict(hp=number(row,'Hitpoints'),dps=number(row,'DPS'),cost=number(previous,'UpgradeCost') if i else 0,seconds=seconds(previous,'UpgradeTime') if i else 0,townhall=number(row,'RequiredTownHallLevel'),hall=number(row,'RequiredHeroTavernLevel'),recovery=number(heals[int(row['SpecialAbilitiesLevel'])-1],'HealOnActivation')))
 result=dict(troopDefs=troop_defs,extraTroopKinds=list(EXTRA_TROOPS),king=king,extraKinds=list(EXTRA),clientVersion='18.400.21',sources=pins,buildings=b,troops=t,spells=s)
 path=ROOT/'reference/full-client/progression.json';text=json.dumps(result,indent=2)+'\n'
 if args.check:require(path.read_text()==text,'Progression differs')
 else:path.write_text(text)
 print(f'Compiled {len(b)} building families and {len(t)} troop level tables through TH18')
if __name__=='__main__':main()
