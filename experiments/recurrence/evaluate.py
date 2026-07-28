import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any


def summarize(series: dict[str, Any]) -> dict[str, Any]:
    targets = counts(series, "targets")
    controls = counts(series, "controls")
    target_mean = sum(targets) / len(targets)
    control_mean = sum(controls) / len(controls)
    difference = target_mean - control_mean
    direction = "flat"
    if difference > 0:
        direction = "positive"
    elif difference < 0:
        direction = "negative"
    if direction == "positive":
        supporting_targets = sum(value > control_mean for value in targets)
    elif direction == "negative":
        supporting_targets = sum(value < control_mean for value in targets)
    else:
        supporting_targets = sum(value == control_mean for value in targets)

    return {
        "source": required_string(series, "source"),
        "targetEpisodes": len(targets),
        "controlEpisodes": len(controls),
        "targetTotal": sum(targets),
        "controlTotal": sum(controls),
        "targetMean": round(target_mean, 3),
        "controlMean": round(control_mean, 3),
        "meanDifference": round(difference, 3),
        "meanRatio": None
        if control_mean == 0
        else round(target_mean / control_mean, 3),
        "direction": direction,
        "supportingTargets": supporting_targets,
        "targetCounts": targets,
    }


def classify(summaries: list[dict[str, Any]]) -> str:
    directions = {summary["direction"] for summary in summaries}
    if len(summaries) == 1:
        return f"single-source-{summaries[0]['direction']}"
    if directions == {"positive"}:
        return "all-sources-positive"
    if directions == {"negative"}:
        return "all-sources-negative"
    if directions == {"flat"}:
        return "neutral"
    return "mixed"


def evaluate(case: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    series = case.get("series")
    if not isinstance(series, list) or not series:
        raise ValueError("series must be a non-empty list")
    target_windows = dates(case, "targetWindows")
    control_windows = dates(case, "controlWindows")
    if len(target_windows) != len(set(target_windows)):
        raise ValueError("targetWindows must be unique")
    if len(control_windows) != len(set(control_windows)):
        raise ValueError("controlWindows must be unique")
    if set(target_windows) & set(control_windows):
        raise ValueError("targetWindows and controlWindows must not overlap")
    strings(case, "targetEvidence")

    sources = [required_string(item, "source") for item in series]
    if len(sources) != len(set(sources)):
        raise ValueError("series sources must be unique")
    for item in series:
        required_string(item, "dataset")
        required_string(item, "query")
        required_string(item, "capturedOn")

    summaries = [summarize(item) for item in series]
    for summary in summaries:
        if summary["targetEpisodes"] != len(target_windows):
            raise ValueError("target counts must match targetWindows")
        if summary["controlEpisodes"] != len(control_windows):
            raise ValueError("control counts must match controlWindows")

    classification = classify(summaries)
    expected = required_string(case.get("expect", {}), "classification")
    failures = (
        []
        if expected == classification
        else [f"expected classification {expected}, found {classification}"]
    )
    return {
        "id": required_string(case, "id"),
        "classification": classification,
        "series": summaries,
    }, failures


def counts(series: dict[str, Any], field: str) -> list[int]:
    values = series.get(field)
    if not isinstance(values, list) or not values:
        raise ValueError(f"{field} must be a non-empty list")
    if not all(
        not isinstance(value, bool) and isinstance(value, int) and value >= 0
        for value in values
    ):
        raise ValueError(f"{field} must contain non-negative integers")
    return values


def dates(value: dict[str, Any], field: str) -> list[date]:
    values = strings(value, field)
    try:
        result = [date.fromisoformat(item) for item in values]
    except ValueError as error:
        raise ValueError(f"{field} must contain YYYY-MM-DD dates") from error
    if any(
        raw != parsed.isoformat() for raw, parsed in zip(values, result, strict=True)
    ):
        raise ValueError(f"{field} must contain canonical YYYY-MM-DD dates")
    return result


def strings(value: dict[str, Any], field: str) -> list[str]:
    result = value.get(field)
    if (
        not isinstance(result, list)
        or not result
        or not all(isinstance(item, str) and item for item in result)
    ):
        raise ValueError(f"{field} must be a non-empty list of strings")
    return result


def required_string(value: dict[str, Any], field: str) -> str:
    result = value.get(field)
    if not isinstance(result, str) or not result:
        raise ValueError(f"{field} must be a non-empty string")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cases", nargs="+", type=Path)
    arguments = parser.parse_args()
    failed = False

    for path in arguments.cases:
        result, failures = evaluate(json.loads(path.read_text()))
        status = "PASS" if not failures else "FAIL"
        print(f"{status} {path} [{result['classification']}]")
        for summary in result["series"]:
            ratio = summary["meanRatio"] if summary["meanRatio"] is not None else "n/a"
            print(
                "  "
                f"{summary['source']} [{summary['direction']}]: "
                f"target {summary['targetTotal']}/{summary['targetEpisodes']} "
                f"(mean {summary['targetMean']}), "
                f"control {summary['controlTotal']}/{summary['controlEpisodes']} "
                f"(mean {summary['controlMean']}), "
                f"difference {summary['meanDifference']}, "
                f"ratio {ratio}, "
                f"support {summary['supportingTargets']}/"
                f"{summary['targetEpisodes']} targets, "
                f"counts {summary['targetCounts']}"
            )
        for failure in failures:
            print(f"  {failure}")
        failed = failed or bool(failures)

    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
