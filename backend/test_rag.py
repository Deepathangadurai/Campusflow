import unittest

from app import rag


class ExcerptTests(unittest.TestCase):
    def test_includes_answer_adjacent_to_matching_faq_question(self):
        question = "What is the full name of SSMIET?"
        answer = "A: SSMIET stands for SSM Institute of Engineering and Technology."
        text = (
            "Institution overview. "
            "Q: What is the full name of SSMIET? "
            f"{answer} "
            "This unrelated note should not be included."
        )

        excerpt = rag.excerpt(text, question)

        self.assertIn(answer, excerpt)
        self.assertNotIn("unrelated note", excerpt)


if __name__ == "__main__":
    unittest.main()
