import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.verify_page_pdf_export import contains_text_fragment, source_visible_text_character_count, validate_selectable_content


class SelectableTextEvidenceTests(unittest.TestCase):
    def test_rasterized_and_hidden_card_values_do_not_count_as_expected_text(self):
        source = {
            "blocks": [
                {"hiddenFromPage": True, "lines": [{"spans": [{"text": "540 / 873"}]}]},
                {"lines": [{"rasterizedDuplicate": True, "spans": [{"text": "60"}]}]},
                {"lines": [{"spans": [{"text": "Combatant Loot Deck Setup"}]}]},
            ]
        }
        self.assertEqual(source_visible_text_character_count(source), len("Combatant Loot Deck Setup"))

    def test_short_valid_text_is_accepted_when_most_page_content_is_artwork(self):
        source = {
            "blocks": [
                {"hiddenFromPage": True, "lines": [{"spans": [{"text": "hidden repeated card values"}]}]},
                {"lines": [{"spans": [{"text": "Combatant Loot Deck Setup"}]}]},
            ]
        }
        expected = validate_selectable_content(source, "Combatant Loot Deck Setup 2020", image_count=2)
        self.assertEqual(expected, len("Combatant Loot Deck Setup"))

    def test_normal_text_pages_keep_a_bounded_minimum_extraction_check(self):
        source = {"lines": [{"spans": [{"text": "A" * 600}]}]}
        with self.assertRaisesRegex(ValueError, "at least 100 expected"):
            validate_selectable_content(source, "only a few chars", image_count=1)

    def test_image_only_page_can_pass_without_text_but_empty_page_cannot(self):
        self.assertEqual(validate_selectable_content({}, "", image_count=1), 0)
        with self.assertRaisesRegex(ValueError, "neither selectable source text"):
            validate_selectable_content({}, "", image_count=0)

    def test_styled_single_letter_list_marker_may_join_following_capitalized_run(self):
        self.assertTrue(contains_text_fragment("b. Faça uma Rolagem", "b.Faça uma Rolagem"))
        self.assertTrue(contains_text_fragment("b. Faça uma Rolagem", "b. Faça uma Rolagem"))

    def test_normal_prose_whitespace_is_not_relaxed(self):
        self.assertFalse(contains_text_fragment("Miniatura que usa", "Miniaturaque usa"))


if __name__ == "__main__":
    unittest.main()
