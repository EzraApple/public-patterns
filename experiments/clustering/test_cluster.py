# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "numpy==2.5.1",
#   "scikit-learn==1.9.0",
# ]
# ///

import json
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from cluster import Point, project_case
from scan import order_candidates, summarize_candidate


class ClusteringExperimentTest(unittest.TestCase):
    def test_projects_both_sources_and_reconciles_dispatch(self) -> None:
        case = {
            "datasets": [
                {
                    "source": "311",
                    "rows": [
                        {
                            "service_request_id": "one",
                            "requested_datetime": "2026-07-24T10:00:00",
                            "service_name": "Noise",
                            "lat": "37.77",
                            "long": "-122.42",
                        }
                    ],
                },
                {
                    "source": "dispatch-realtime",
                    "rows": [dispatch_row("same", "Initial")],
                },
                {
                    "source": "dispatch-closed",
                    "rows": [dispatch_row("same", "Final")],
                },
            ]
        }

        points, skipped = project_case(case)

        self.assertEqual(skipped, 0)
        self.assertEqual(
            [point.observation_id for point in points],
            ["311:one", "dispatch:same"],
        )
        dispatch = next(
            point for point in points if point.source.startswith("dispatch")
        )
        self.assertEqual(dispatch.source, "dispatch-closed")
        self.assertEqual(dispatch.kind, "Final")

    def test_locationless_closed_dispatch_suppresses_realtime_point(self) -> None:
        closed = dispatch_row("same", "Final")
        del closed["intersection_point"]
        case = {
            "datasets": [
                {
                    "source": "dispatch-realtime",
                    "rows": [dispatch_row("same", "Initial")],
                },
                {"source": "dispatch-closed", "rows": [closed]},
            ]
        }

        points, skipped = project_case(case)

        self.assertEqual(points, [])
        self.assertEqual(skipped, 1)

    def test_malformed_rows_are_counted_as_skipped(self) -> None:
        malformed = {
            "datasets": [
                {
                    "source": "311",
                    "rows": [
                        {
                            "service_request_id": "bad",
                            "requested_datetime": "2026-07-24T10:00:00",
                            "service_name": "Noise",
                            "lat": "nan",
                            "long": "-122.42",
                        }
                    ],
                },
                {
                    "source": "dispatch-closed",
                    "rows": [{"cad_number": ""}, None],
                },
            ]
        }

        points, skipped = project_case(malformed)

        self.assertEqual(points, [])
        self.assertEqual(skipped, 3)

    def test_evidence_order_preserves_frozen_relative_cases(self) -> None:
        case = json.loads(
            (
                Path(__file__).parent
                / "ranking"
                / "frozen-ordering.json"
            ).read_text()
        )
        ordered = order_candidates(case["candidates"], "evidence")

        self.assertEqual(
            [item["name"] for item in ordered],
            case["expectedOrder"],
        )

    def test_exact_cad_link_counts_as_one_distinct_event(self) -> None:
        when = datetime.fromisoformat("2026-02-14T01:00:00")
        members = [
            Point("311:report", "311", when, 37.77, -122.42, "Noise"),
            Point(
                "dispatch:cad",
                "dispatch-closed",
                when,
                37.77,
                -122.42,
                "Call",
            ),
            Point(
                "police-incidents:row-one",
                "police-incidents",
                when,
                37.77,
                -122.42,
                "Report",
            ),
            Point(
                "police-incidents:row-two",
                "police-incidents",
                when,
                37.77,
                -122.42,
                "Report",
            ),
        ]
        raw = {
            "311:report": {},
            "dispatch:cad": {"cad_number": "cad"},
            "police-incidents:row-one": {
                "incident_id": "incident",
                "cad_number": "cad",
            },
            "police-incidents:row-two": {
                "incident_id": "second-incident",
                "cad_number": "cad",
            },
        }

        result = summarize_candidate(
            members,
            raw,
            local_duration_hours=2,
            local_span_meters=200,
        )

        self.assertEqual(result["exactCadLinkCount"], 1)
        self.assertEqual(result["policeIncidentCount"], 2)
        self.assertEqual(result["responderEventCount"], 1)
        self.assertEqual(result["report311Count"], 1)

    def test_locality_uses_unrounded_values(self) -> None:
        when = datetime.fromisoformat("2026-02-14T01:00:00")
        origin = Point("one", "311", when, 37.77, -122.42, "Noise")
        exact_time = Point(
            "two",
            "311",
            when + timedelta(hours=2),
            37.77,
            -122.42,
            "Noise",
        )
        over_time = Point(
            "three",
            "311",
            when + timedelta(hours=2, seconds=1),
            37.77,
            -122.42,
            "Noise",
        )
        over_space = Point(
            "four",
            "311",
            when,
            37.77 + 200.1 / 111_320,
            -122.42,
            "Noise",
        )

        exact = summarize_candidate(
            [origin, exact_time],
            {},
            local_duration_hours=2,
            local_span_meters=200,
        )
        rounded_time = summarize_candidate(
            [origin, over_time],
            {},
            local_duration_hours=2,
            local_span_meters=200,
        )
        rounded_space = summarize_candidate(
            [origin, over_space],
            {},
            local_duration_hours=2,
            local_span_meters=200,
        )

        self.assertTrue(exact["isLocal"])
        self.assertEqual(rounded_time["durationHours"], 2.0)
        self.assertFalse(rounded_time["isLocal"])
        self.assertEqual(rounded_space["latitudeSpanMeters"], 200)
        self.assertFalse(rounded_space["isLocal"])


def dispatch_row(identifier: str, kind: str) -> dict:
    return {
        "cad_number": identifier,
        "received_datetime": "2026-07-24T10:00:00",
        "call_type_original_desc": kind,
        "intersection_point": {
            "type": "Point",
            "coordinates": [-122.42, 37.77],
        },
    }


if __name__ == "__main__":
    unittest.main()
