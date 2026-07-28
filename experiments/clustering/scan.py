# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "numpy==2.5.1",
#   "scikit-learn==1.9.0",
# ]
# ///

import argparse
import json
import math
import os
from collections import Counter
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from cluster import (
    DEFAULT_ALGORITHM,
    DEFAULT_MINIMUM_CLUSTER_SIZE,
    DEFAULT_SPACE_SCALE_METERS,
    DEFAULT_TIME_SCALE_HOURS,
    cluster,
    project_case,
    project_row,
    vectorize,
)

ROW_LIMIT = 50_000
DATASETS = (
    {
        "source": "311",
        "url": "https://data.sfgov.org/resource/vw6y-z8j6.json",
        "select": "service_request_id,requested_datetime,service_name,lat,long,source",
        "time": "requested_datetime",
        "identity": "service_request_id",
        "location": "lat is not null and long is not null",
    },
    {
        "source": "dispatch-closed",
        "url": "https://data.sfgov.org/resource/2zdj-bwza.json",
        "select": (
            "cad_number,received_datetime,call_type_original_desc,"
            "intersection_point,onview_flag,disposition,agency"
        ),
        "time": "received_datetime",
        "identity": "cad_number",
        "location": "intersection_point is not null",
    },
    {
        "source": "fire-ems",
        "url": "https://data.sfgov.org/resource/nuek-vuh3.json",
        "select": (
            "rowid,call_number,incident_number,received_dttm,call_type,"
            "case_location"
        ),
        "time": "received_dttm",
        "identity": "rowid",
        "location": "case_location is not null",
    },
    {
        "source": "police-incidents",
        "url": "https://data.sfgov.org/resource/wg3w-h783.json",
        "select": (
            "row_id,incident_id,incident_number,cad_number,incident_datetime,"
            "incident_category,incident_description,point"
        ),
        "time": "incident_datetime",
        "identity": "row_id",
        "location": "point is not null",
    },
)

def fetch(dataset: dict[str, str], start: str, end: str) -> list[dict[str, Any]]:
    time = dataset["time"]
    query = urlencode(
        {
            "$select": dataset["select"],
            "$where": (
                f"{time} >= '{start}' and {time} < '{end}' and {dataset['location']}"
            ),
            "$order": f"{time},{dataset['identity']}",
            "$limit": ROW_LIMIT,
        }
    )
    headers = {"User-Agent": "public-patterns-clustering-experiment"}
    if token := os.environ.get("DATASF_APP_TOKEN"):
        headers["X-App-Token"] = token

    with urlopen(
        Request(f"{dataset['url']}?{query}", headers=headers), timeout=60
    ) as response:
        payload = json.loads(response.read())

    if not isinstance(payload, list) or not all(
        isinstance(row, dict) for row in payload
    ):
        raise ValueError(f"{dataset['source']} returned invalid JSON")
    if len(payload) == ROW_LIMIT:
        raise ValueError(
            f"{dataset['source']} reached the {ROW_LIMIT}-row safety limit"
        )
    return payload


def summarize_candidate(
    members: list[Any],
    raw_by_id: dict[str, dict[str, Any]],
    *,
    local_duration_hours: float,
    local_span_meters: float,
) -> dict[str, Any]:
    first = min(member.occurred_at for member in members)
    last = max(member.occurred_at for member in members)
    latitude_span = (
        max(member.latitude for member in members)
        - min(member.latitude for member in members)
    ) * 111_320
    longitude_span = (
        (
            max(member.longitude for member in members)
            - min(member.longitude for member in members)
        )
        * 111_320
        * math.cos(math.radians(37.77))
    )
    kinds = Counter(member.kind for member in members)
    sources = Counter(member.source for member in members)
    fire_calls = set()
    police_incidents = set()
    dispatch_cads = set()
    police_cads = set()
    police_incidents_by_cad: dict[str, set[str]] = {}
    for member in members:
        row = raw_by_id.get(member.observation_id, {})
        if member.source == "fire-ems" and isinstance(row.get("call_number"), str):
            fire_calls.add(row["call_number"])
        if member.source == "police-incidents":
            incident_id = row.get("incident_id")
            cad_number = row.get("cad_number")
            if isinstance(incident_id, str):
                police_incidents.add(incident_id)
                if isinstance(cad_number, str):
                    police_incidents_by_cad.setdefault(cad_number, set()).add(
                        incident_id
                    )
        if member.source.startswith("dispatch-") and isinstance(
            row.get("cad_number"), str
        ):
            dispatch_cads.add(row["cad_number"])
        if member.source == "police-incidents" and isinstance(
            row.get("cad_number"), str
        ):
            police_cads.add(row["cad_number"])

    raw_duration_hours = (last - first).total_seconds() / 3_600
    duration_hours = round(raw_duration_hours, 2)
    latitude_span_meters = round(latitude_span)
    longitude_span_meters = round(longitude_span)
    exact_cad_links = dispatch_cads & police_cads
    linked_police_incidents = set().union(
        *(police_incidents_by_cad.get(cad, set()) for cad in exact_cad_links)
    )
    responder_event_count = (
        len(dispatch_cads)
        + len(fire_calls)
        + len(police_incidents - linked_police_incidents)
    )
    member_samples = {
        source: [
            member.observation_id
            for member in members
            if member.source == source
        ][:10]
        for source in sorted(sources)
    }

    return {
        "size": len(members),
        "first": first.isoformat(),
        "last": last.isoformat(),
        "durationHours": duration_hours,
        "latitudeSpanMeters": latitude_span_meters,
        "longitudeSpanMeters": longitude_span_meters,
        "sourceCounts": dict(sorted(sources.items())),
        "kindCounts": dict(kinds.most_common(10)),
        "fireCallCount": len(fire_calls),
        "policeIncidentCount": len(police_incidents),
        "report311Count": sources["311"],
        "responderEventCount": responder_event_count,
        "exactCadLinkCount": len(exact_cad_links),
        "isLocal": (
            raw_duration_hours <= local_duration_hours
            and latitude_span <= local_span_meters
            and longitude_span <= local_span_meters
        ),
        "memberSamples": member_samples,
        "membersTruncated": sum(map(len, member_samples.values())) < len(members),
    }


def scan(
    case: dict[str, Any],
    *,
    algorithm: str,
    space_scale_meters: float,
    time_scale_hours: float,
    minimum_cluster_size: int,
    candidate_limit: int,
    order: str,
) -> dict[str, Any]:
    points, skipped = project_case(case)
    raw_by_id = {}
    for dataset in case["datasets"]:
        source = dataset["source"]
        for row in dataset["rows"]:
            if not isinstance(row, dict):
                continue
            try:
                point = project_row(source, row)
            except (TypeError, ValueError, OverflowError):
                point = None
            if point and (
                point.observation_id not in raw_by_id
                or source == "dispatch-closed"
            ):
                raw_by_id[point.observation_id] = row

    labels = cluster(
        vectorize(
            points,
            space_scale_meters=space_scale_meters,
            time_scale_hours=time_scale_hours,
        ),
        algorithm=algorithm,
        minimum_cluster_size=minimum_cluster_size,
    )
    groups: dict[int, list[Any]] = {}
    for point, label in zip(points, labels, strict=True):
        if label >= 0:
            groups.setdefault(int(label), []).append(point)

    candidates = order_candidates(
        [
            summarize_candidate(
                members,
                raw_by_id,
                local_duration_hours=2 * time_scale_hours,
                local_span_meters=2 * space_scale_meters,
            )
            for members in groups.values()
        ],
        order,
    )
    return {
        "pointCount": len(points),
        "skippedRows": skipped,
        "clusterCount": len(candidates),
        "noiseCount": int(sum(label < 0 for label in labels)),
        "candidates": candidates[:candidate_limit],
    }


def order_candidates(
    candidates: list[dict[str, Any]], order: str
) -> list[dict[str, Any]]:
    if order == "size":
        return sorted(
            candidates,
            key=lambda candidate: (-candidate["size"], candidate["first"]),
        )
    if order != "evidence":
        raise ValueError(f"unsupported candidate order: {order}")

    def key(candidate: dict[str, Any]) -> tuple[Any, ...]:
        source_count = len(candidate["sourceCounts"])
        if not candidate["isLocal"]:
            tier = 3
        elif source_count >= 3:
            tier = 0
        elif source_count == 2:
            tier = 1
        else:
            tier = 2
        return (
            tier,
            -source_count,
            -candidate["responderEventCount"],
            -candidate["exactCadLinkCount"],
            -candidate["size"],
            candidate["first"],
        )

    return sorted(candidates, key=key)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("start", help="inclusive YYYY-MM-DD")
    parser.add_argument("end", help="exclusive YYYY-MM-DD")
    parser.add_argument(
        "--space-scale-meters", type=float, default=DEFAULT_SPACE_SCALE_METERS
    )
    parser.add_argument(
        "--time-scale-hours", type=float, default=DEFAULT_TIME_SCALE_HOURS
    )
    parser.add_argument(
        "--minimum-cluster-size", type=int, default=DEFAULT_MINIMUM_CLUSTER_SIZE
    )
    parser.add_argument("--candidate-limit", type=int, default=25)
    parser.add_argument(
        "--order", choices=["size", "evidence"], default="evidence"
    )
    parser.add_argument(
        "--algorithm",
        choices=["dbscan", "hdbscan"],
        default=DEFAULT_ALGORITHM,
    )
    parser.add_argument(
        "--source",
        choices=["all", *(dataset["source"] for dataset in DATASETS)],
        default="all",
    )
    arguments = parser.parse_args()

    start = datetime.fromisoformat(arguments.start)
    end = datetime.fromisoformat(arguments.end)
    if end <= start or end - start > timedelta(days=7):
        raise ValueError("scan window must be between one moment and seven days")
    if arguments.minimum_cluster_size < 2 or arguments.candidate_limit < 1:
        raise ValueError("cluster size must be at least 2 and candidate limit positive")

    datasets = []
    source_counts = {}
    for dataset in DATASETS:
        if arguments.source != "all" and dataset["source"] != arguments.source:
            continue
        rows = fetch(dataset, arguments.start, arguments.end)
        source_counts[dataset["source"]] = len(rows)
        datasets.append({"source": dataset["source"], "rows": rows})

    result = scan(
        {"datasets": datasets},
        algorithm=arguments.algorithm,
        space_scale_meters=arguments.space_scale_meters,
        time_scale_hours=arguments.time_scale_hours,
        minimum_cluster_size=arguments.minimum_cluster_size,
        candidate_limit=arguments.candidate_limit,
        order=arguments.order,
    )
    print(
        json.dumps(
            {
                "window": {"start": arguments.start, "end": arguments.end},
                "config": {
                    "algorithm": arguments.algorithm,
                    "spaceScaleMeters": arguments.space_scale_meters,
                    "timeScaleHours": arguments.time_scale_hours,
                    "minimumClusterSize": arguments.minimum_cluster_size,
                    "order": arguments.order,
                },
                "sourceCounts": source_counts,
                **result,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
