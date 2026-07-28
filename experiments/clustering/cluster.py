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
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.cluster import DBSCAN, HDBSCAN, KMeans

EARTH_RADIUS_METERS = 6_371_000
SF_REFERENCE_LATITUDE = math.radians(37.77)
SF_REFERENCE_LONGITUDE = math.radians(-122.42)
DISPATCH_SOURCES = {"dispatch-realtime", "dispatch-closed"}
SUPPORTED_SOURCES = {
    "311",
    "building-complaints",
    "building-permits",
    *DISPATCH_SOURCES,
    "fire-ems",
    "police-incidents",
}
DEFAULT_ALGORITHM = "dbscan"
DEFAULT_SPACE_SCALE_METERS = 100
DEFAULT_TIME_SCALE_HOURS = 1
DEFAULT_MINIMUM_CLUSTER_SIZE = 5


@dataclass(frozen=True)
class Point:
    observation_id: str
    source: str
    occurred_at: datetime
    latitude: float
    longitude: float
    kind: str


def project_case(case: dict[str, Any]) -> tuple[list[Point], int]:
    points: dict[str, Point] = {}
    selected_rows = []
    dispatch_rows: dict[str, tuple[str, dict[str, Any]]] = {}
    skipped = 0

    for dataset in case.get("datasets", []):
        if not isinstance(dataset, dict):
            skipped += 1
            continue
        source = dataset.get("source")
        if source not in SUPPORTED_SOURCES:
            raise ValueError(f"unsupported source: {source}")

        for row in dataset.get("rows", []):
            if not isinstance(row, dict):
                skipped += 1
                continue
            if source not in DISPATCH_SOURCES:
                selected_rows.append((source, row))
                continue
            try:
                identifier = required_string(row, "cad_number")
            except ValueError:
                skipped += 1
                continue
            if identifier not in dispatch_rows or source == "dispatch-closed":
                dispatch_rows[identifier] = (source, row)

    selected_rows.extend(dispatch_rows.values())
    for source, row in selected_rows:
        try:
            point = project_row(source, row)
        except (TypeError, ValueError, OverflowError):
            point = None
        if point is None:
            skipped += 1
        else:
            points[point.observation_id] = point

    return sorted(points.values(), key=lambda point: point.observation_id), skipped


def project_row(source: str, row: dict[str, Any]) -> Point | None:
    if source == "311":
        observation_id = f"311:{required_string(row, 'service_request_id')}"
        occurred_at = parse_time(required_string(row, "requested_datetime"))
        coordinates = coordinates_311(row)
        kind = required_string(row, "service_name")
    elif source in DISPATCH_SOURCES:
        observation_id = f"dispatch:{required_string(row, 'cad_number')}"
        occurred_at = parse_time(required_string(row, "received_datetime"))
        coordinates = coordinates_dispatch(row)
        kind = str(
            row.get("call_type_original_desc")
            or row.get("call_type_original")
            or "unknown"
        )
    elif source == "fire-ems":
        observation_id = f"fire-ems:{required_string(row, 'rowid')}"
        occurred_at = parse_time(required_string(row, "received_dttm"))
        coordinates = coordinates_from_point(row.get("case_location"))
        kind = required_string(row, "call_type")
    elif source == "police-incidents":
        observation_id = f"police-incidents:{required_string(row, 'row_id')}"
        occurred_at = parse_time(required_string(row, "incident_datetime"))
        coordinates = coordinates_from_point(row.get("point"))
        kind = str(
            row.get("incident_category")
            or row.get("incident_description")
            or "unknown"
        )
    elif source == "building-complaints":
        observation_id = (
            f"building-complaints:{required_string(row, 'complaint_number')}"
        )
        occurred_at = parse_time(required_string(row, "date_filed"))
        coordinates = coordinates_from_point(row.get("point"))
        kind = str(row.get("nov_type") or row.get("receiving_division") or "unknown")
    else:
        observation_id = f"building-permits:{required_string(row, 'record_id')}"
        occurred_at = parse_time(required_string(row, "filed_date"))
        coordinates = coordinates_from_point(row.get("location"))
        kind = required_string(row, "permit_type_definition")

    if coordinates is None:
        return None
    latitude, longitude = coordinates
    if not (
        math.isfinite(latitude)
        and math.isfinite(longitude)
        and -90 <= latitude <= 90
        and -180 <= longitude <= 180
    ):
        return None
    return Point(
        observation_id=observation_id,
        source=source,
        occurred_at=occurred_at,
        latitude=latitude,
        longitude=longitude,
        kind=kind,
    )


def vectorize(
    points: list[Point],
    *,
    space_scale_meters: float,
    time_scale_hours: float,
) -> np.ndarray:
    if space_scale_meters <= 0 or time_scale_hours <= 0:
        raise ValueError("vector scales must be positive")
    if not points:
        return np.empty((0, 3))

    start = min(point.occurred_at for point in points)
    vectors = []
    for point in points:
        latitude = math.radians(point.latitude)
        longitude = math.radians(point.longitude)
        x = (
            EARTH_RADIUS_METERS
            * (longitude - SF_REFERENCE_LONGITUDE)
            * math.cos(SF_REFERENCE_LATITUDE)
        )
        y = EARTH_RADIUS_METERS * (latitude - SF_REFERENCE_LATITUDE)
        elapsed_hours = (point.occurred_at - start).total_seconds() / 3_600
        vectors.append(
            [
                x / space_scale_meters,
                y / space_scale_meters,
                elapsed_hours / time_scale_hours,
            ]
        )
    return np.asarray(vectors)


def cluster(
    vectors: np.ndarray,
    *,
    algorithm: str,
    minimum_cluster_size: int | None = None,
    clusters: int | None = None,
) -> np.ndarray:
    if len(vectors) == 0:
        return np.asarray([], dtype=int)
    if algorithm in {"dbscan", "hdbscan"}:
        if clusters is not None:
            raise ValueError(f"{algorithm} does not accept clusters")
        if minimum_cluster_size is None or minimum_cluster_size < 2:
            raise ValueError("minimum cluster size must be at least 2")
        if len(vectors) < minimum_cluster_size:
            return np.full(len(vectors), -1, dtype=int)
        if algorithm == "dbscan":
            return DBSCAN(eps=1, min_samples=minimum_cluster_size).fit_predict(vectors)
        return HDBSCAN(
            allow_single_cluster=True,
            copy=True,
            min_cluster_size=minimum_cluster_size,
            min_samples=minimum_cluster_size,
        ).fit_predict(vectors)
    if algorithm == "kmeans":
        if minimum_cluster_size is not None:
            raise ValueError("kmeans does not accept minimum cluster size")
        if clusters is None or clusters < 1 or clusters > len(vectors):
            raise ValueError("clusters must be between 1 and the point count")
        return KMeans(
            n_clusters=clusters,
            n_init=10,
            random_state=0,
        ).fit_predict(vectors)
    raise ValueError(f"unsupported algorithm: {algorithm}")


def summarize(
    points: list[Point],
    labels: np.ndarray,
    *,
    algorithm: str,
    skipped: int,
) -> dict[str, Any]:
    groups: dict[int, list[Point]] = {}
    noise = []
    for point, label in zip(points, labels, strict=True):
        if label < 0:
            noise.append(point.observation_id)
        else:
            groups.setdefault(int(label), []).append(point)

    return {
        "algorithm": algorithm,
        "pointCount": len(points),
        "skippedRows": skipped,
        "clusters": [
            {
                "label": label,
                "size": len(members),
                "members": [member.observation_id for member in members],
                "sources": sorted({member.source for member in members}),
                "kinds": sorted({member.kind for member in members}),
            }
            for label, members in sorted(groups.items())
        ],
        "noise": sorted(noise),
    }


def coordinates_311(row: dict[str, Any]) -> tuple[float, float] | None:
    if row.get("lat") is not None and row.get("long") is not None:
        return float(row["lat"]), float(row["long"])
    return coordinates_from_point(row.get("point") or row.get("point_geom"))


def coordinates_dispatch(row: dict[str, Any]) -> tuple[float, float] | None:
    return coordinates_from_point(row.get("intersection_point"))


def coordinates_from_point(value: Any) -> tuple[float, float] | None:
    if not isinstance(value, dict):
        return None
    coordinates = value.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return None
    longitude, latitude = coordinates[:2]
    return float(latitude), float(longitude)


def required_string(row: dict[str, Any], field: str) -> str:
    value = row.get(field)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field} must be a non-empty string")
    return value


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.removesuffix("Z"))
    return parsed.replace(tzinfo=None)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("case", type=Path)
    parser.add_argument("--algorithm", choices=["dbscan", "hdbscan", "kmeans"])
    parser.add_argument("--space-scale-meters", type=float)
    parser.add_argument("--time-scale-hours", type=float)
    parser.add_argument("--minimum-cluster-size", type=int)
    parser.add_argument("--clusters", type=int)
    arguments = parser.parse_args()

    case = json.loads(arguments.case.read_text())
    config = case.get("config", {})
    algorithm = arguments.algorithm or config.get("algorithm", DEFAULT_ALGORITHM)
    space_scale_meters = (
        config.get("spaceScaleMeters", DEFAULT_SPACE_SCALE_METERS)
        if arguments.space_scale_meters is None
        else arguments.space_scale_meters
    )
    time_scale_hours = (
        config.get("timeScaleHours", DEFAULT_TIME_SCALE_HOURS)
        if arguments.time_scale_hours is None
        else arguments.time_scale_hours
    )
    minimum_cluster_size: int | None = (
        config.get("minimumClusterSize", DEFAULT_MINIMUM_CLUSTER_SIZE)
        if arguments.minimum_cluster_size is None
        else arguments.minimum_cluster_size
    )
    clusters: int | None = (
        config.get("clusters", 2) if arguments.clusters is None else arguments.clusters
    )
    if algorithm == "kmeans":
        if arguments.minimum_cluster_size is not None:
            parser.error("--minimum-cluster-size does not apply to kmeans")
        minimum_cluster_size = None
    else:
        if arguments.clusters is not None:
            parser.error("--clusters applies only to kmeans")
        clusters = None
    points, skipped = project_case(case)
    vectors = vectorize(
        points,
        space_scale_meters=space_scale_meters,
        time_scale_hours=time_scale_hours,
    )
    labels = cluster(
        vectors,
        algorithm=algorithm,
        minimum_cluster_size=minimum_cluster_size,
        clusters=clusters,
    )
    print(
        json.dumps(
            summarize(points, labels, algorithm=algorithm, skipped=skipped),
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
