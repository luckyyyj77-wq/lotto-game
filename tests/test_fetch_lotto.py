"""실행: python -m unittest discover tests (requests, beautifulsoup4 필요)"""
import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import fetch_lotto as f  # noqa: E402

NAVER_HTML = """
<div>1000회차 (2022.01.29.)</div>
<div class="win_area type_lotto">
  <div class="winning_number">
    <span class="ball">2</span><span class="ball">8</span><span class="ball">19</span>
    <span class="ball">22</span><span class="ball">32</span><span class="ball">42</span>
  </div>
  <div class="bonus_number"><span class="ball">39</span></div>
  <p class="win_text">1등 당첨금 1,246,819,620 원 (당첨게임 수 22개)</p>
</div>
"""


def draw(**overrides):
    base = {"round": 1, "date": "2002-12-07", "nums": [1, 2, 3, 4, 5, 6], "bonus": 7, "amount": 0, "winners": 0}
    base.update(overrides)
    return base


class LatestDrawnRound(unittest.TestCase):
    def test_changes_at_draw_time(self):
        self.assertEqual(f.latest_drawn_round(datetime(2026, 10, 31, 20, 34, tzinfo=f.KST)), 1247)
        self.assertEqual(f.latest_drawn_round(datetime(2026, 10, 31, 20, 35, tzinfo=f.KST)), 1248)
        self.assertEqual(f.latest_drawn_round(datetime(2026, 11, 2, 9, 0, tzinfo=f.KST)), 1248)


class ParseNaver(unittest.TestCase):
    def test_parses_requested_round(self):
        self.assertEqual(
            f.parse_naver(NAVER_HTML, 1000),
            {"round": 1000, "date": "2022-01-29", "nums": [2, 8, 19, 22, 32, 42],
             "bonus": 39, "amount": 1246819620, "winners": 22},
        )

    def test_rejects_other_round(self):
        self.assertIsNone(f.parse_naver(NAVER_HTML, 1001))

    def test_rejects_page_without_widget(self):
        self.assertIsNone(f.parse_naver("<html>차단</html>", 1000))


class Validation(unittest.TestCase):
    def test_valid(self):
        self.assertTrue(f.is_valid_draw(draw()))

    def test_rejects_bad_draws(self):
        self.assertFalse(f.is_valid_draw(draw(nums=[1, 1, 3, 4, 5, 6])))
        self.assertFalse(f.is_valid_draw(draw(nums=[1, 2, 3, 4, 5, 46])))
        self.assertFalse(f.is_valid_draw(draw(bonus=6)))
        self.assertFalse(f.is_valid_draw(draw(date="")))


class Outputs(unittest.TestCase):
    def test_stats_counts_main_numbers_only(self):
        stats = f.build_stats([draw(), draw(round=2, nums=[1, 8, 9, 10, 11, 12], bonus=2)])
        self.assertEqual(stats["lastRound"], 2)
        self.assertEqual(stats["counts"]["1"], 2)
        self.assertEqual(stats["counts"]["7"], 0)
        self.assertEqual(sum(stats["counts"].values()), 12)

    def test_latest_keeps_api_schema(self):
        latest = f.build_latest(draw(amount=100, winners=2))
        self.assertEqual(latest["drwtNo6"], 6)
        self.assertEqual(latest["bnusNo"], 7)
        self.assertEqual(latest["firstWinamnt"], 100)
        self.assertEqual(latest["firstPrzwnerCo"], 2)

    def test_gap_is_rejected(self):
        with self.assertRaises(ValueError):
            f.check_contiguous([draw(), draw(round=3)])


if __name__ == "__main__":
    unittest.main()
