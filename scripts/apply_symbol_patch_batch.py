#!/usr/bin/env python3
"""Plan, apply, and exactly roll back selected audited inline-symbol patches.

The command always requires an explicit dry-run receipt before it can write.
It only touches page sidecars and assets named by the selected prepared patch
objects; it never writes Payload, translations, DOM files, or source artwork.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import difflib
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PATCH = ROOT / "output/proofs/symbol-activation-2026-10-13/patches"


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path) -> str:
    return sha_bytes(path.read_bytes())


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def stable_json(data) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def element_key(element: dict) -> str:
    candidate = (element.get("provenance") or {}).get("candidateId")
    if candidate:
        return f"candidate:{candidate}"
    return "element:" + sha_bytes(stable_json(element))


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def page_dir(project_root: Path, page: int) -> Path:
    return project_root / "apps/web/public/pages" / f"page_{page:03d}"


def patch_page_dir(patch_root: Path, page: int) -> Path:
    return patch_root / "pages" / f"page_{page:03d}"


def build_plan(project_root: Path, patch_root: Path, manifest_path: Path, ids: set[str], allow_nonready_simulation: bool) -> dict:
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes.decode("utf-8"))
    candidates = {cid for page in manifest["pages"] for cid in page["candidateIds"]}
    unknown = sorted(ids - candidates)
    if unknown:
        raise ValueError(f"candidate IDs absent from prepared manifest: {unknown}")
    if not ids:
        raise ValueError("select at least one --id")
    eligibility_path = patch_root.parent / "activation-status.json"
    eligibility_bytes = eligibility_path.read_bytes()
    eligibility = json.loads(eligibility_bytes.decode("utf-8"))
    ready_ids = set(eligibility.get("readyToApplyCandidateIds", []))
    nonready = sorted(ids - ready_ids)
    if nonready:
        simulation_root = (patch_root.parent / "simulation").resolve()
        is_isolated_simulation = project_root.resolve().is_relative_to(simulation_root)
        if not (allow_nonready_simulation and is_isolated_simulation):
            raise ValueError(f"non-ready candidates cannot be applied: {nonready[:12]} (total {len(nonready)}); isolated simulation only")

    files = []
    totals = {"selected": len(ids), "alreadyApplied": 0, "toAdd": 0, "assetsToCopy": 0}
    for page_spec in manifest["pages"]:
        page_ids = [cid for cid in page_spec["candidateIds"] if cid in ids]
        if not page_ids:
            continue
        page = page_spec["page"]
        src_dir = patch_page_dir(patch_root, page)
        dst_dir = page_dir(project_root, page)
        dom_path = dst_dir / f"page_{page:03d}_dom.json"
        side_path = dst_dir / "inline_elements.json"
        if not dom_path.is_file() or sha_file(dom_path) != page_spec["domSha256"]:
            raise ValueError(f"p{page}: DOM hash precondition failed")

        current_bytes = side_path.read_bytes() if side_path.exists() else None
        current_sha = sha_bytes(current_bytes) if current_bytes is not None else None
        expected_original = page_spec["originalSidecarSha256"]
        prepared = read_json(src_dir / "inline_elements.json")
        desired = [e for e in prepared["elements"]
                   if (e.get("provenance") or {}).get("candidateId") in page_ids]
        if len(desired) != len(page_ids):
            raise ValueError(f"p{page}: patch sidecar does not contain exactly the selected candidate IDs")
        desired_by_id = {(e.get("provenance") or {}).get("candidateId"): e for e in desired}
        if len(desired_by_id) != len(desired):
            raise ValueError(f"p{page}: duplicate candidate ID in prepared additions")

        current = json.loads(current_bytes.decode("utf-8")) if current_bytes is not None else {"schemaVersion": 1, "elements": []}
        current_elements = current.get("elements")
        if not isinstance(current_elements, list):
            raise ValueError(f"p{page}: malformed current sidecar")
        current_keys = [element_key(e) for e in current_elements]
        if len(current_keys) != len(set(current_keys)):
            raise ValueError(f"p{page}: duplicate existing placement identity")
        current_by_id = {(e.get("provenance") or {}).get("candidateId"): e
                         for e in current_elements if (e.get("provenance") or {}).get("candidateId")}

        already = []
        to_add = []
        for cid in page_ids:
            existing = current_by_id.get(cid)
            if existing is None:
                # Prevent the same semantic object from having been inserted under
                # another provenance key since preparation.
                target = desired_by_id[cid]
                duplicate_signature = (target.get("symbolId"), target.get("anchor"), target.get("bbox"))
                for old in current_elements:
                    if (old.get("symbolId"), old.get("anchor"), old.get("bbox")) == duplicate_signature:
                        raise ValueError(f"p{page} {cid}: duplicate placement exists under another ID")
                to_add.append(target)
            elif stable_json(existing) == stable_json(desired_by_id[cid]):
                already.append(cid)
            else:
                raise ValueError(f"p{page} {cid}: candidate ID exists with different content")

        if current_sha != expected_original:
            # The only accepted post-audit state is a fully idempotent no-op.
            if current_sha is None and expected_original is None and not to_add and already:
                pass
            elif current_sha is not None and expected_original is not None and current_sha == expected_original and not already:
                pass
            elif not to_add and len(already) == len(page_ids):
                pass
            else:
                raise ValueError(
                    f"p{page}: sidecar hash precondition failed (expected {expected_original}, got {current_sha}); "
                    "only an exact already-applied no-op is accepted"
                )

        assets = []
        for e in to_add:
            urls = [e.get("mask", {}).get("url"), e.get("metrics", {}).get("sourceAssetUrl")]
            expected_hashes = [
                (e.get("provenance") or {}).get("maskSha256"),
                (e.get("provenance") or {}).get("assetSha256"),
            ]
            for url, expected_hash in zip(urls, expected_hashes):
                if not url:
                    continue
                name = Path(url).name
                source = src_dir / name
                if not source.is_file():
                    raise ValueError(f"p{page} {cid}: prepared asset missing: {source}")
                actual_hash = sha_file(source)
                if expected_hash and actual_hash != expected_hash:
                    raise ValueError(f"p{page}: prepared asset hash mismatch: {name}")
                destination = dst_dir / name
                destination_hash = sha_file(destination) if destination.exists() else None
                if destination_hash is not None and destination_hash != actual_hash:
                    raise ValueError(f"p{page}: destination asset conflict: {name}")
                assets.append({"name": name, "source": str(source), "destination": str(destination),
                               "sha256": actual_hash, "alreadyPresent": destination_hash == actual_hash})
        # Existing elements are carried over byte-for-byte at the JSON-object level.
        updated = dict(current)
        updated["elements"] = [*current_elements, *to_add]
        updated_bytes = stable_json(updated) if to_add else current_bytes
        diff = ""
        if to_add:
            before_text = current_bytes.decode("utf-8").splitlines(keepends=True) if current_bytes is not None else []
            after_text = updated_bytes.decode("utf-8").splitlines(keepends=True)
            diff = "".join(difflib.unified_diff(before_text, after_text,
                       fromfile=f"page_{page:03d}/inline_elements.json (before)",
                       tofile=f"page_{page:03d}/inline_elements.json (after)"))
        files.append({
            "page": page, "candidateIds": page_ids, "alreadyAppliedIds": already,
            "toAddIds": [cid for cid in page_ids if cid not in already],
            "domSha256": page_spec["domSha256"], "expectedOriginalSidecarSha256": expected_original,
            "beforeSidecarExists": current_bytes is not None, "beforeSidecarSha256": current_sha,
            "beforeSidecarBase64": base64.b64encode(current_bytes).decode("ascii") if current_bytes is not None else None,
            "beforeElementKeys": current_keys, "beforeElementCount": len(current_elements),
            "afterSidecarSha256": sha_bytes(updated_bytes) if updated_bytes is not None else None,
            "afterElementCount": len(updated["elements"]), "assets": assets, "diff": diff,
        })
        totals["alreadyApplied"] += len(already)
        totals["toAdd"] += len(to_add)
        totals["assetsToCopy"] += sum(not a["alreadyPresent"] for a in assets)
    if sum(len(f["candidateIds"]) for f in files) != len(ids):
        raise ValueError("selected candidate coverage mismatch")
    return {"schemaVersion": 1, "mode": "dry-run", "createdAtUtc": datetime.now(timezone.utc).isoformat(),
            "projectRoot": str(project_root), "patchRoot": str(patch_root), "manifestPath": str(manifest_path),
            "manifestSha256": sha_bytes(manifest_bytes), "eligibilityPath": str(eligibility_path),
            "eligibilitySha256": sha_bytes(eligibility_bytes), "selectedIds": sorted(ids),
            "nonreadySimulationOnly": bool(nonready), "totals": totals, "files": files}


def restore_from_plan(plan: dict, changed_sidecars: set[str], created_assets: list[dict], strict: bool) -> list[str]:
    issues = []
    for path_text in sorted(changed_sidecars):
        path = Path(path_text)
        file_entry = next(f for f in plan["files"] if str(path) == str(page_dir(Path(plan["projectRoot"]), f["page"]) / "inline_elements.json"))
        current_sha = sha_file(path) if path.exists() else None
        if strict and current_sha != file_entry["afterSidecarSha256"]:
            issues.append(f"sidecar changed after apply; left untouched: {path}")
            continue
        before = file_entry["beforeSidecarBase64"]
        if before is None:
            path.unlink(missing_ok=True)
        else:
            atomic_write(path, base64.b64decode(before))
    for asset in reversed(created_assets):
        path = Path(asset["destination"])
        if not path.exists():
            continue
        if strict and sha_file(path) != asset["sha256"]:
            issues.append(f"asset changed after apply; left untouched: {path}")
            continue
        path.unlink()
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--project-root", type=Path, default=ROOT, help="project root containing apps/web/public/pages")
    common.add_argument("--patch-root", type=Path, default=DEFAULT_PATCH)
    common.add_argument("--manifest", type=Path)
    selection = common.add_mutually_exclusive_group(required=True)
    selection.add_argument("--ids", help="comma-separated prepared candidate IDs")
    selection.add_argument("--id-file", type=Path, help="UTF-8 text file containing comma- or newline-separated candidate IDs")
    common.add_argument("--receipt", type=Path, required=True)
    common.add_argument("--allow-nonready-for-isolated-simulation", action="store_true",
                         help="test all candidates only inside the package's isolated simulation directory")
    sub.add_parser("dry-run", parents=[common], help="required first: compute exact diff and hash preconditions")
    sub.add_parser("apply", parents=[common], help="apply exactly the selected IDs using a matching dry-run receipt")
    rollback = sub.add_parser("rollback", help="restore exact pre-apply bytes and remove only assets created by that receipt")
    rollback.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "rollback":
        plan = read_json(args.receipt)
        if plan.get("mode") != "applied" or plan.get("status") not in {"applied", "rolled-back"}:
            raise ValueError("rollback requires an applied receipt")
        if plan.get("status") == "rolled-back":
            print("Already rolled back; no changes made.")
            return 0
        issues = restore_from_plan(plan, set(plan.get("changedSidecars", [])), plan.get("createdAssets", []), strict=True)
        if issues:
            plan["rollbackIssues"] = issues
            plan["status"] = "rollback-incomplete"
            args.receipt.write_bytes(stable_json(plan))
            raise ValueError("rollback stopped safely: " + "; ".join(issues))
        plan["status"] = "rolled-back"
        plan["rolledBackAtUtc"] = datetime.now(timezone.utc).isoformat()
        args.receipt.write_bytes(stable_json(plan))
        print(json.dumps({"status": "rolled-back", "selectedCount": len(plan["selectedIds"]),
                          "pages": [f["page"] for f in plan["files"]]}, ensure_ascii=False))
        return 0

    project_root = args.project_root.resolve()
    patch_root = args.patch_root.resolve()
    manifest_path = (args.manifest or (patch_root / "patch-manifest.json")).resolve()
    raw_ids = args.ids if args.ids is not None else args.id_file.read_text(encoding="utf-8")
    ids = {value.strip() for value in raw_ids.replace("\n", ",").split(",") if value.strip()}
    if args.command == "dry-run":
        plan = build_plan(project_root, patch_root, manifest_path, ids, args.allow_nonready_for_isolated_simulation)
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_bytes(stable_json(plan))
        print(json.dumps({"status": "dry-run-only", "selected": plan["totals"]["selected"],
                          "toAdd": plan["totals"]["toAdd"], "alreadyApplied": plan["totals"]["alreadyApplied"],
                          "assetsToCopy": plan["totals"]["assetsToCopy"], "pages": [f["page"] for f in plan["files"]],
                          "receipt": str(args.receipt.resolve())}, ensure_ascii=False))
        return 0

    plan = read_json(args.receipt)
    if plan.get("mode") != "dry-run":
        raise ValueError("apply requires a dry-run receipt")
    if plan.get("projectRoot") != str(project_root) or plan.get("patchRoot") != str(patch_root):
        raise ValueError("dry-run receipt target or patch root mismatch")
    if plan.get("selectedIds") != sorted(ids):
        raise ValueError("dry-run receipt selection differs from --ids")
    current_manifest_hash = sha_file(manifest_path)
    if current_manifest_hash != plan["manifestSha256"]:
        raise ValueError("prepared patch manifest changed after dry-run")
    if sha_file(Path(plan["eligibilityPath"])) != plan["eligibilitySha256"]:
        raise ValueError("activation eligibility changed after dry-run")
    # Recompute immediately before write; the plan must remain byte-for-byte stable.
    fresh = build_plan(project_root, patch_root, manifest_path, ids, args.allow_nonready_for_isolated_simulation)
    for old, now in zip(plan["files"], fresh["files"]):
        if ((old["beforeSidecarSha256"], old["domSha256"], old["toAddIds"], old["alreadyAppliedIds"], old["afterSidecarSha256"])
                != (now["beforeSidecarSha256"], now["domSha256"], now["toAddIds"], now["alreadyAppliedIds"], now["afterSidecarSha256"])):
            raise ValueError(f"p{old['page']}: dry-run preconditions changed; rerun dry-run")
    changed_sidecars: set[str] = set()
    created_assets: list[dict] = []
    try:
        for file_entry in plan["files"]:
            dst_dir = page_dir(project_root, file_entry["page"])
            side_path = dst_dir / "inline_elements.json"
            # Copy only referenced, verified assets; never remove old assets.
            for asset in file_entry["assets"]:
                destination = Path(asset["destination"])
                if asset["alreadyPresent"] or destination.exists():
                    if not destination.exists() or sha_file(destination) != asset["sha256"]:
                        raise ValueError(f"asset changed after dry-run: {destination}")
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(asset["source"], destination)
                if sha_file(destination) != asset["sha256"]:
                    raise ValueError(f"copied asset hash mismatch: {destination}")
                created_assets.append(asset)
            if file_entry["toAddIds"]:
                if (sha_file(side_path) if side_path.exists() else None) != file_entry["beforeSidecarSha256"]:
                    raise ValueError(f"p{file_entry['page']}: sidecar changed during apply")
                current = json.loads(side_path.read_text(encoding="utf-8")) if side_path.exists() else {"schemaVersion": 1, "elements": []}
                prepared = read_json(patch_page_dir(patch_root, file_entry["page"]) / "inline_elements.json")
                wanted = set(file_entry["toAddIds"])
                additions = [e for e in prepared["elements"] if (e.get("provenance") or {}).get("candidateId") in wanted]
                if { (e.get("provenance") or {}).get("candidateId") for e in additions } != wanted:
                    raise ValueError(f"p{file_entry['page']}: selected patch set changed during apply")
                original_keys = [element_key(e) for e in current["elements"]]
                current["elements"].extend(additions)
                data = stable_json(current)
                atomic_write(side_path, data)
                changed_sidecars.add(str(side_path))
                if sha_file(side_path) != file_entry["afterSidecarSha256"]:
                    raise ValueError(f"p{file_entry['page']}: post-apply sidecar hash mismatch")
                actual = read_json(side_path)["elements"]
                actual_keys = [element_key(e) for e in actual]
                if actual_keys[:len(original_keys)] != original_keys or len(actual_keys) != len(set(actual_keys)):
                    raise ValueError(f"p{file_entry['page']}: preexisting elements changed or duplicate identity appeared")
        plan["mode"] = "applied"
        plan["status"] = "applied"
        plan["appliedAtUtc"] = datetime.now(timezone.utc).isoformat()
        plan["changedSidecars"] = sorted(changed_sidecars)
        plan["createdAssets"] = created_assets
        plan["activatedIds"] = [cid for f in plan["files"] for cid in f["toAddIds"]]
        plan["idempotentIds"] = [cid for f in plan["files"] for cid in f["alreadyAppliedIds"]]
        args.receipt.write_bytes(stable_json(plan))
        print(json.dumps({"status": "applied-in-selected-target", "activated": len(plan["activatedIds"]),
                          "alreadyApplied": len(plan["idempotentIds"]), "pages": [f["page"] for f in plan["files"]],
                          "receipt": str(args.receipt.resolve())}, ensure_ascii=False))
        return 0
    except Exception:
        issues = restore_from_plan(plan, changed_sidecars, created_assets, strict=False)
        if issues:
            print("Automatic rollback issue: " + "; ".join(issues), file=sys.stderr)
        raise


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(2)
