import unittest

from native_art.source_csv import animation_blocks, inherited_levels, records


class SourceCsvTests(unittest.TestCase):
    def test_level_inheritance_is_explicit_and_retains_zero_and_false(self):
        raw = records([['Name', 'HP', 'Flying'], ['String', 'int', 'boolean'],
                       ['Dragon', '10', 'TRUE'], ['', '0', 'FALSE'], ['', '20', '']])
        self.assertEqual(raw['Dragon'][2], {'HP': '20'})
        self.assertEqual(inherited_levels(raw['Dragon'])[2],
                         {'Name': 'Dragon', 'HP': '20', 'Flying': 'FALSE'})

    def test_block_headers_vary_and_blank_swf_and_variants_survive(self):
        rows = [['First', '', '', '', ''], ['', 'Name', 'SWF', 'ActionFrame', ''],
                ['', 'String', 'String', 'int', ''], ['', 'attack', 'sc/a.sc', '2', ''],
                ['', '', '', '3', ''], ['', 'die', '', '', ''],
                ['Second', '', '', '', ''], ['', 'Name', 'Looping', '', ''],
                ['', 'String', 'boolean', '', ''], ['', 'idle', 'TRUE', '', '']]
        parsed = animation_blocks(rows)
        self.assertEqual(parsed['First']['rows'][1], {'Name': '', 'SWF': '', 'ActionFrame': '3'})
        self.assertEqual(parsed['First']['rows'][2]['SWF'], '')
        self.assertEqual(parsed['Second']['columns'], ['Name', 'Looping'])
        self.assertNotIn('SWF', parsed['Second']['rows'][0])

    def test_rejects_column_loss_duplicate_records_and_orphans(self):
        with self.assertRaisesRegex(ValueError, 'Malformed'):
            records([['Name', 'HP'], ['String', 'int'], ['Dragon', '1', '2']])
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            records([['Name'], ['String'], ['Dragon'], ['Dragon']])
        with self.assertRaisesRegex(ValueError, 'Orphan'):
            records([['Name', 'HP'], ['String', 'int'], ['', '3']])
        with self.assertRaisesRegex(ValueError, 'exceeds'):
            animation_blocks([['A'], ['', 'Name'], ['', 'String'], ['', 'idle', 'LOST']])
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            animation_blocks([['A'], ['', 'Name'], ['', 'String']])
        with self.assertRaisesRegex(ValueError, 'Orphan animation event'):
            animation_blocks([['A'], ['', 'Name', 'SWF'], ['', 'String', 'String'],
                              ['', '', 'sc/a.sc']])


if __name__ == '__main__':
    unittest.main()
