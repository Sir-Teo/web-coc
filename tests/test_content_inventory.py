import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    'content_inventory', Path(__file__).resolve().parents[1] / 'scripts/content-inventory.py')
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class ImplementedBuildingsTest(unittest.TestCase):
    def test_follows_actual_tier_assignments_without_a_separate_name_map(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            game = root / 'src/game'
            game.mkdir(parents=True)
            (game / 'townhall-catalog.ts').write_text(
                "export const SOURCE_NAME = {\n  townhall: 'Town Hall',\n};\n")
            (game / 'tiers.ts').write_text('BUILDING_COUNTS.testhut = [0, 1];\n')
            (game / 'data.ts').write_text(
                "const BUILDINGS = {\n  testhut: {\n    name: 'Test Hut',\n  },\n};\n")
            with patch.object(inventory, 'ROOT', root):
                self.assertEqual(inventory.implemented_buildings(), {'Town Hall', 'Test Hut'})
                (game / 'tiers.ts').write_text('BUILDING_COUNTS.missing = [1];\n')
                with self.assertRaisesRegex(SystemExit, 'Cannot read explicitly gated building'):
                    inventory.implemented_buildings()

    def test_keeps_the_existing_crafting_station_and_helper_hut_in_the_inventory(self):
        self.assertTrue({'Crafting Station', 'Helper Hut'} <= inventory.implemented_buildings())


if __name__ == '__main__':
    unittest.main()
