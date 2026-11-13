import unittest
from channels import build_filters, member, SOURCE, ENGINE

class ChannelTests(unittest.TestCase):
    def test_one_union_query_for_distinct_users(self):
        filters=build_filters([['a','Ads'],['b','Ads']],[['ad','ad.first','Ads'],['ad','ad.second','Ads']])
        self.assertIn(SOURCE+"=.('a','b')",filters['Ads'])
        self.assertIn(ENGINE+"=.('ad.first','ad.second')",filters['Ads'])
        self.assertIn('NOT('+SOURCE,filters['Ads'])
    def test_filter_values_are_escaped_and_chunks_bounded(self):
        self.assertIn("a\\'b",member(SOURCE,["a'b"]))
        self.assertEqual(member(SOURCE,[str(i) for i in range(201)]).count('=.('),3)

if __name__=='__main__': unittest.main()
