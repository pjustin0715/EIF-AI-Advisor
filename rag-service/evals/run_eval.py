#!/usr/bin/env python3
"""Run retrieval + generation evals against the RAG service."""

import json
import os
import sys
from pathlib import Path

import httpx

EVALS_DIR = Path(__file__).parent
GOLDEN_PATH = EVALS_DIR / "golden.json"

RAG_URL = os.getenv("RAG_SERVICE_URL", "http://localhost:8001")
RAG_SECRET = os.getenv("RAG_SERVICE_SECRET", "")


def load_golden() -> dict:
    with open(GOLDEN_PATH, encoding="utf-8") as f:
        return json.load(f)


def retrieval_hit_at_k(expected_sections: list[str], citations: list[str], k: int = 5) -> float:
    if not expected_sections:
        return 1.0
    cited = " ".join(citations).lower()
    hits = sum(1 for section in expected_sections if section.lower() in cited)
    return hits / len(expected_sections)


def run_retrieval_evals(cases: list[dict]) -> dict:
    headers = {"X-RAG-Secret": RAG_SECRET} if RAG_SECRET else {}
    results = []

    with httpx.Client(base_url=RAG_URL, timeout=60.0) as client:
        for case in cases:
            resp = client.post(
                "/retrieve",
                params={"advisor_id": case["advisor_id"]},
                json={"query": case["query"]},
                headers=headers,
            )
            if resp.status_code != 200:
                results.append(
                    {
                        "id": case["id"],
                        "hit_at_k": 0.0,
                        "error": resp.text,
                    }
                )
                continue

            data = resp.json()
            hit = retrieval_hit_at_k(
                case.get("expected_sections", []),
                data.get("citations", []),
            )
            results.append(
                {
                    "id": case["id"],
                    "hit_at_k": hit,
                    "citations": data.get("citations", []),
                    "low_grounding": data.get("low_grounding", False),
                }
            )

    avg_hit = sum(r["hit_at_k"] for r in results) / max(len(results), 1)
    return {"cases": results, "avg_hit_at_k": avg_hit}


def main() -> int:
    golden = load_golden()
    cases = golden["cases"]

    print("Running retrieval evals...")
    retrieval_report = run_retrieval_evals(cases)

    print(f"\nRetrieval eval: avg hit@k = {retrieval_report['avg_hit_at_k']:.2f}")
    for case in retrieval_report["cases"]:
        status = "PASS" if case["hit_at_k"] >= 0.5 else "FAIL"
        print(f"  [{status}] {case['id']}: hit@k={case['hit_at_k']:.2f}")

    report_path = EVALS_DIR / "report.json"
    report = {
        "retrieval": retrieval_report,
        "pass_threshold": golden.get("pass_threshold", 3.5),
    }
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport written to {report_path}")

    return 0 if retrieval_report["avg_hit_at_k"] >= 0.5 else 1


if __name__ == "__main__":
    sys.exit(main())
