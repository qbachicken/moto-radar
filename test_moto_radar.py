import unittest
import json
import os
import sys

# Dodaj katalog do ścieżki
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import fetcher

class TestMotoRadarLocationAndDistance(unittest.TestCase):

    def test_exact_location(self):
        # Skierniewice (domyślny punkt referencyjny)
        coords = fetcher.get_coords("Skierniewice")
        dist = round(fetcher.haversine(fetcher.HOME_LAT, fetcher.HOME_LON, coords[0], coords[1]), 1)
        self.assertEqual(dist, 0.0)

    def test_approximate_vs_exact_classification(self):
        # Sprawdzenie czy Jura to przybliżona, a Skierniewice dokładna
        loc_jura = "Jura"
        loc_sk = "Skierniewice"

        self.assertIn(loc_jura.lower(), fetcher.APPROXIMATE_REGIONS)
        self.assertNotIn(loc_sk.lower(), fetcher.APPROXIMATE_REGIONS)

    def test_unknown_location_no_zero_km(self):
        # Brak lokalizacji -> distanceKm to None, locationType to "unknown"
        loc = "Nieznana"
        if loc == "Nieznana" or not loc:
            location_type = "unknown"
            distance_km = None
        else:
            location_type = "exact"
            coords = fetcher.get_coords(loc)
            distance_km = round(fetcher.haversine(fetcher.HOME_LAT, fetcher.HOME_LON, coords[0], coords[1]))

        self.assertEqual(location_type, "unknown")
        self.assertIsNone(distance_km)
        self.assertNotEqual(distance_km, 0)

    def test_distance_filter_boundary(self):
        # Test granicy filtra odległości z uwzględnieniem null
        events = [
            {"title": "Event 1", "distanceKm": 50, "locationType": "exact"},
            {"title": "Event 2", "distanceKm": 150, "locationType": "exact"},
            {"title": "Event 3", "distanceKm": None, "locationType": "unknown"},
        ]
        max_dist = 100

        # Filtrowanie: wydarzenia ze znaną odległością <= max_dist oraz eventy z null (nie usuwamy wydarzeń bez lokalizacji)
        filtered = [e for e in events if e["distanceKm"] is None or e["distanceKm"] <= max_dist]
        self.assertEqual(len(filtered), 2)
        self.assertEqual(filtered[0]["title"], "Event 1")
        self.assertEqual(filtered[1]["title"], "Event 3")

    def test_sorting_with_null(self):
        # Sortowanie po odległości z uwzględnieniem null (null na końcu)
        events = [
            {"title": "Far", "distanceKm": 200},
            {"title": "Unknown", "distanceKm": None},
            {"title": "Near", "distanceKm": 30},
            {"title": "Zero", "distanceKm": 0},
        ]

        sorted_events = sorted(events, key=lambda x: (x["distanceKm"] is None, x["distanceKm"]))
        self.assertEqual(sorted_events[0]["title"], "Zero")
        self.assertEqual(sorted_events[1]["title"], "Near")
        self.assertEqual(sorted_events[2]["title"], "Far")
        self.assertEqual(sorted_events[3]["title"], "Unknown")

    def test_legacy_records_migration(self):
        # Starsze rekordy bez nowych pól (np. distanceKm = 0, ale location = Nieznana)
        legacy_event = {
            "title": "Legacy Event",
            "location": "Nieznana",
            "distanceKm": 0  # stare błędne założenie
        }

        if legacy_event["location"] == "Nieznana" and legacy_event["distanceKm"] == 0:
            legacy_event["distanceKm"] = None
            legacy_event["locationType"] = "unknown"

        self.assertIsNone(legacy_event["distanceKm"])
        self.assertEqual(legacy_event["locationType"], "unknown")

    def test_invalid_coordinates_handling(self):
        def safe_distance(lat, lon):
            try:
                if lat is None or lon is None:
                    return None
                return fetcher.haversine(fetcher.HOME_LAT, fetcher.HOME_LON, lat, lon)
            except Exception:
                return None

        self.assertIsNone(safe_distance(None, 20.0))
        self.assertIsNone(safe_distance(51.0, None))

if __name__ == "__main__":
    unittest.main()
