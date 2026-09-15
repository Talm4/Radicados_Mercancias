import unittest

from scripts.actualizar_notas import (
    TARGETS, encode_firestore_value, names_compatible, normalize,
    normalize_id, platform_course_type, rounded_grade,
)


class NotesRulesTest(unittest.TestCase):
    def test_course_variants(self):
        self.assertEqual(platform_course_type("Básico Inicial"), "inicial")
        self.assertEqual(platform_course_type("CURSO BASICO INICIAL DE MERCANCÍAS PELIGROSAS"), "inicial")
        self.assertEqual(platform_course_type("Básico repaso"), "recurrente")
        self.assertEqual(platform_course_type("BÁSICO RECURRENTE"), "recurrente")
        self.assertIsNone(platform_course_type("Curso no relacionado"))

    def test_report_courses(self):
        self.assertEqual(TARGETS[normalize("MERCANCIAS PELIGROSAS BASICO 8 HORAS - TALMA - INICIAL _ 2026V2")], "inicial")
        self.assertEqual(TARGETS[normalize("MERCANCIAS PELIGROSAS BASICO 4 HORAS - TALMA - RECURRENTE _ 2026V2")], "recurrente")

    def test_identifiers_and_rounding(self):
        self.assertEqual(normalize_id("1.036.961.650"), "1036961650")
        self.assertEqual(rounded_grade("80,5"), 81)
        self.assertEqual(rounded_grade("93.4"), 93)
        self.assertIsNone(rounded_grade("sin nota"))
        self.assertIsNone(rounded_grade("101"))

    def test_identity_and_firestore_encoding(self):
        self.assertTrue(names_compatible("ALEXANDER ESCOBAR PAJARO", "PAJARO ALEXANDER ESCOBAR"))
        self.assertFalse(names_compatible("ALEXANDER ESCOBAR", "MARIA PEREZ"))
        self.assertEqual(encode_firestore_value(81), {"integerValue": "81"})
        self.assertEqual(
            encode_firestore_value({"inicial": "curso"}),
            {"mapValue": {"fields": {"inicial": {"stringValue": "curso"}}}},
        )


if __name__ == "__main__":
    unittest.main()
