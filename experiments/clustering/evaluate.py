# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "numpy==2.5.1",
#   "scikit-learn==1.9.0",
# ]
# ///

import argparse
import copy
import json
from pathlib import Path
from typing import Any

from cluster import (
    DEFAULT_ALGORITHM,
    DEFAULT_MINIMUM_CLUSTER_SIZE,
    DEFAULT_SPACE_SCALE_METERS,
    DEFAULT_TIME_SCALE_HOURS,
    cluster,
    project_case,
    vectorize,
)

BASELINE_CONFIG = {
    "algorithm": DEFAULT_ALGORITHM,
    "spaceScaleMeters": DEFAULT_SPACE_SCALE_METERS,
    "timeScaleHours": DEFAULT_TIME_SCALE_HOURS,
    "minimumClusterSize": DEFAULT_MINIMUM_CLUSTER_SIZE,
}


def partition(points: list[Any], labels: Any) -> tuple[tuple[str, ...], ...]:
    groups: dict[int | str, list[str]] = {}
    for point, label in zip(points, labels, strict=True):
        key: int | str = int(label) if label >= 0 else f"noise:{point.observation_id}"
        groups.setdefault(key, []).append(point.observation_id)
    return tuple(sorted(tuple(sorted(group)) for group in groups.values()))


def run(
    case: dict[str, Any], config: dict[str, Any] | None = None
) -> tuple[list[Any], Any, int]:
    config = case.get("config", {}) if config is None else config
    points, skipped = project_case(case)
    vectors = vectorize(
        points,
        space_scale_meters=config.get("spaceScaleMeters", DEFAULT_SPACE_SCALE_METERS),
        time_scale_hours=config.get("timeScaleHours", DEFAULT_TIME_SCALE_HOURS),
    )
    algorithm = config.get("algorithm", DEFAULT_ALGORITHM)
    options = (
        {"clusters": config.get("clusters", 2)}
        if algorithm == "kmeans"
        else {
            "minimum_cluster_size": config.get(
                "minimumClusterSize", DEFAULT_MINIMUM_CLUSTER_SIZE
            )
        }
    )
    labels = cluster(
        vectors,
        algorithm=algorithm,
        **options,
    )
    return points, labels, skipped


def check(case: dict[str, Any], config: dict[str, Any] | None = None) -> list[str]:
    points, labels, skipped = run(case, config)
    assigned = {
        point.observation_id: int(label)
        for point, label in zip(points, labels, strict=True)
    }
    members_by_label = {
        label: [
            point
            for point, point_label in zip(points, labels, strict=True)
            if point_label == label
        ]
        for label in set(labels)
        if label >= 0
    }
    failures = []

    expected_skips = case.get("expect", {}).get("skippedRows", 0)
    if skipped != expected_skips:
        failures.append(f"expected {expected_skips} skipped rows, found {skipped}")

    for group in case.get("expect", {}).get("together", []):
        missing = [
            observation_id for observation_id in group if observation_id not in assigned
        ]
        group_labels = {
            assigned[observation_id]
            for observation_id in group
            if observation_id in assigned
        }
        if missing:
            failures.append(f"missing expected observations: {', '.join(missing)}")
        elif len(group_labels) != 1 or next(iter(group_labels)) < 0:
            failures.append(f"expected one cluster containing: {', '.join(group)}")

    for expected in case.get("expect", {}).get("clusters", []):
        anchor = expected["anchor"]
        label = assigned.get(anchor, -1)
        members = members_by_label.get(label, [])
        sources = {member.source for member in members}
        if anchor not in assigned:
            failures.append(f"missing cluster anchor: {anchor}")
        elif label < 0:
            failures.append(f"cluster anchor was noise: {anchor}")
        elif len(members) < expected.get("minimumSize", 1):
            failures.append(f"cluster around {anchor} was too small")
        elif not set(expected.get("sources", [])).issubset(sources):
            failures.append(f"cluster around {anchor} lacked required sources")

    for first, second in case.get("expect", {}).get("apart", []):
        if first not in assigned or second not in assigned:
            failures.append(f"missing separation pair: {first}, {second}")
        elif assigned[first] >= 0 and assigned[first] == assigned[second]:
            failures.append(f"expected separate groups: {first}, {second}")

    reversed_case = copy.deepcopy(case)
    reversed_case["datasets"].reverse()
    for dataset in reversed_case["datasets"]:
        dataset["rows"].reverse()
    reversed_points, reversed_labels, reversed_skipped = run(reversed_case, config)
    if reversed_skipped != skipped:
        failures.append("skipped row count changed when input order changed")
    if partition(points, labels) != partition(reversed_points, reversed_labels):
        failures.append("membership changed when input order changed")

    return failures


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", action="store_true")
    parser.add_argument("cases", nargs="+", type=Path)
    arguments = parser.parse_args()
    failed = False

    for path in arguments.cases:
        case = json.loads(path.read_text())
        role = case.get("evalRole", "detection-positive")
        if arguments.baseline and role == "archived-negative":
            config = None
            mode = "recorded-config archive"
        elif arguments.baseline:
            config = BASELINE_CONFIG
            mode = "baseline"
        else:
            config = None
            mode = role
        failures = check(case, config)
        status = "PASS" if not failures else "FAIL"
        print(f"{status} {path} [{mode}]")
        for failure in failures:
            print(f"  {failure}")
        failed = failed or bool(failures)

    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
