#!/usr/bin/env python3
"""Score localized pending-symbol evidence and produce three review panels."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from collections import Counter, defaultdict

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/proofs/symbol-activation-2026-10-13"
BATCH = OUT / "batch-95"
REFS = BATCH / "references"
PANELS = BATCH / "panels"
THRESHOLD_CHANNEL = 16


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.int16)


def roi(array: np.ndarray, bbox: list[float], clip_pt: list[float]) -> np.ndarray:
    h, w = array.shape[:2]
    sx = w / (clip_pt[2] - clip_pt[0])
    sy = h / (clip_pt[3] - clip_pt[1])
    x0 = max(0, min(w, round((bbox[0] - clip_pt[0]) * sx)))
    y0 = max(0, min(h, round((bbox[1] - clip_pt[1]) * sy)))
    x1 = max(x0 + 1, min(w, round((bbox[2] - clip_pt[0]) * sx)))
    y1 = max(y0 + 1, min(h, round((bbox[3] - clip_pt[1]) * sy)))
    return array[y0:y1, x0:x1]


def normalize_physical_roi(array: np.ndarray, bbox: list[float], clip_pt: list[float], scale: float = 4.0) -> np.ndarray:
    """Crop by page points, then normalize to the PDF reference's 4 px/pt grid."""
    cropped = roi(array, bbox, clip_pt)
    width = max(1, round((bbox[2] - bbox[0]) * scale))
    height = max(1, round((bbox[3] - bbox[1]) * scale))
    if cropped.shape[1] == width and cropped.shape[0] == height:
        return cropped
    image = Image.fromarray(np.clip(cropped, 0, 255).astype(np.uint8))
    return np.asarray(image.resize((width, height), Image.Resampling.LANCZOS), dtype=np.int16)


def maxdiff(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    if a.shape != b.shape:
        b = np.asarray(Image.fromarray(np.clip(b,0,255).astype(np.uint8)).resize((a.shape[1],a.shape[0]),Image.Resampling.LANCZOS),dtype=np.int16)
    return np.abs(a - b).max(axis=2)


def metrics(item: dict, reference: dict, control: bool) -> dict:
    if control:
        empty = item["emptyCapture"]["path"]
        empty_meta = item["emptyCapture"]
        viewer = item["viewerSourceCapture"]["path"]
        viewer_meta = item["viewerSourceCapture"]
        reinserted = item["reinsertedCapture"]["path"]
        reinserted_meta = item["reinsertedCapture"]
    else:
        empty = item["emptyCapture"]
        empty_meta = item["emptyCaptureMeta"]
        viewer = item["viewerSourceCapture"]
        viewer_meta = item["viewerSourceCaptureMeta"]
        reinserted = item["reinsertedCapture"]
        reinserted_meta = item["reinsertedCaptureMeta"]
    cid = item["candidateId"]
    clean_full = load_rgb(ROOT / reference["cleanVectorRemovedCrop"])
    source_pdf = load_rgb(ROOT / reference["sourcePdfCrop"])
    clip = empty_meta["pageClipPt"]
    mask = item["maskBbox"]
    clean_roi = normalize_physical_roi(clean_full, mask, clip)
    source_pdf_roi = normalize_physical_roi(source_pdf, mask, clip)
    empty_roi = normalize_physical_roi(load_rgb(Path(empty)), mask, empty_meta["pageClipPt"])
    viewer_roi = normalize_physical_roi(load_rgb(Path(viewer)), mask, viewer_meta["pageClipPt"])
    reinsert_roi = normalize_physical_roi(load_rgb(Path(reinserted)), mask, reinserted_meta["pageClipPt"])
    # Compare only normalized, same-point-space crops. The source signal is
    # the original visible glyph against the vector-removed PDF reference.
    signal = maxdiff(viewer_roi, clean_roi)
    residual = maxdiff(empty_roi, clean_roi)
    reinsert = maxdiff(reinsert_roi, viewer_roi)
    signal_mask = signal > THRESHOLD_CHANNEL
    residual_mask = residual > THRESHOLD_CHANNEL
    signal_pixels = int(signal_mask.sum())
    residual_pixels = int(residual_mask.sum())
    overlap = int((signal_mask & residual_mask).sum())
    outside = int((~signal_mask & residual_mask).sum())
    signal_energy = int(signal.sum())
    residual_energy = int(residual.sum())
    reinsert_energy = int(reinsert.sum())
    denom = max(signal_energy, 1)
    # Local side-effect check: did vector removal alter pixels outside the
    # placement's prepared mask rectangle in its 5pt context crop?
    source_crop = load_rgb(ROOT / reference["sourcePdfCrop"])
    clean_crop = load_rgb(ROOT / reference["cleanVectorRemovedCrop"])
    full_source_diff = maxdiff(source_crop, clean_crop)
    full_clip = empty_meta["pageClipPt"]
    full_mask = np.zeros(full_source_diff.shape, dtype=bool)
    sx = full_source_diff.shape[1] / (full_clip[2] - full_clip[0])
    sy = full_source_diff.shape[0] / (full_clip[3] - full_clip[1])
    x0=max(0,round((mask[0]-full_clip[0])*sx));y0=max(0,round((mask[1]-full_clip[1])*sy))
    x1=min(full_mask.shape[1],round((mask[2]-full_clip[0])*sx));y1=min(full_mask.shape[0],round((mask[3]-full_clip[1])*sy))
    full_mask[y0:y1,x0:x1]=True
    outside_ref=full_source_diff[~full_mask]
    outside_ref_pixels=int(np.count_nonzero(outside_ref > THRESHOLD_CHANNEL))
    outside_ref_max=int(outside_ref.max()) if outside_ref.size else 0
    return {
        "candidateId":cid,"page":item["page"],"symbolId":item["symbolId"],"control":control,
        "roiSizePx":list(clean_roi.shape[1::-1]),"signalPixels":signal_pixels,"residualPixels":residual_pixels,
        "residualOverlapWithSourceInk":overlap,"residualOutsideSourceInk":outside,
        "normalizedResidualEnergy":round(residual_energy/denom,6),
        "residualInkOverlapFraction":round(overlap/max(signal_pixels,1),6),
        "residualOutsideFraction":round(outside/max(residual.size,1),6),
        "sourceSignalEnergy":signal_energy,"emptyResidualEnergy":residual_energy,
        "reinsertEnergy":reinsert_energy,"reinsertDeviationNormalized":round(reinsert_energy/denom,6),
        "localReferenceCollateralPixelsOutsideMask":outside_ref_pixels,
        "localReferenceCollateralMaxChannelDiff":outside_ref_max,
        "localReferenceValid":outside_ref_pixels<=2,
        "sourceCrop":reference["sourcePdfCrop"],"cleanCrop":reference["cleanVectorRemovedCrop"],
        "emptyCapture":str(empty),"viewerSourceCapture":str(viewer),"reinsertedCapture":str(reinserted),
        "movedCapture":item.get("movedCapture"),
    }


def choose_font(size: int):
    for path in [r"C:\Windows\Fonts\arial.ttf",r"C:\Windows\Fonts\segoeui.ttf"]:
        if Path(path).exists():
            return ImageFont.truetype(path,size)
    return ImageFont.load_default()


def open_image(path: str | None, size: tuple[int,int]) -> Image.Image:
    if path and Path(path).exists():
        image=Image.open(path).convert("RGB")
        return ImageOps.contain(image,size,Image.Resampling.LANCZOS)
    return Image.new("RGB",size,(44,50,60))


def panel(path: Path, cases: list[dict], label: str, cols: int=3) -> None:
    tile_w,tile_h=690,250
    cols=max(1,cols);rows=max(1,math.ceil(len(cases)/cols))
    canvas=Image.new("RGB",(cols*tile_w,rows*tile_h),(24,29,38));draw=ImageDraw.Draw(canvas)
    title_font=choose_font(16);small=choose_font(12);state_font=choose_font(11)
    states=[("PDF fonte",lambda c:c.get("sourcePdfCrop")),("Viewer EN",lambda c:c.get("viewerSourceCapture")),
      ("reinserido",lambda c:c.get("reinsertedCapture")),("vazio",lambda c:c.get("emptyCapture")),
      ("movido",lambda c:c.get("movedCapture")),("PDF limpo",lambda c:c.get("cleanCrop"))]
    if not cases:
        draw.text((24,86),"Nenhum placement foi classificado com confiança suficiente.",font=title_font,fill=(255,207,129))
        draw.text((24,116),"Os cinco controles negativos não foram todos detectados; a liberação permanece suspensa.",font=small,fill=(220,226,236))
    for idx,c in enumerate(cases):
        x=(idx%cols)*tile_w;y=(idx//cols)*tile_h
        draw.rectangle((x+1,y+1,x+tile_w-2,y+tile_h-2),fill=(35,42,54),outline=(86,102,124),width=1)
        status=c.get("classification",label)
        residual=c.get("normalizedResidualEnergy")
        residual_text=f" • resíduo {residual:.3f}" if isinstance(residual,(float,int)) else ""
        draw.text((x+10,y+8),f"p.{c.get('page')} • {c.get('candidateId')} • {c.get('symbolId')}",font=title_font,fill=(241,244,250))
        draw.text((x+10,y+31),f"{status}{residual_text}",font=small,fill=(255,197,106) if c.get("control") or status=="ANOMALIA" else (172,207,245))
        gap=6;img_w=(tile_w-20-gap*5)//6;img_h=165
        for sidx,(state,getter) in enumerate(states):
            sx=x+10+sidx*(img_w+gap);sy=y+55
            draw.text((sx,sy),state,font=state_font,fill=(196,205,218))
            img=open_image(getter(c),(img_w,img_h))
            canvas.paste(img,(sx,sy+17))
    draw.text((10,canvas.height-18),f"{label} • {len(cases)} placements • recortes rasterizados na mesma escala por estado",font=small,fill=(160,172,190))
    path.parent.mkdir(parents=True,exist_ok=True);canvas.save(path,optimize=True)


def main() -> None:
    batch=read(BATCH/"batch-results.json")
    controls=read(OUT/"blocked-controls/control-captures.json")
    refs=read(REFS/"reference-manifest.json")
    refs_by={x["candidateId"]:x for x in refs["results"]}
    placements={x["candidateId"]:x for x in batch["placements"]}
    control_rows={x["candidateId"]:x for x in controls["results"]}
    metrics_rows=[]
    for cid,item in placements.items():metrics_rows.append(metrics(item,refs_by[cid],False))
    for cid,item in control_rows.items():metrics_rows.append(metrics(item,refs_by[cid],True))
    pending=[x for x in metrics_rows if not x["control"]]
    control_metrics=[x for x in metrics_rows if x["control"]]
    mapping_exact={cid:group["symbolMappingExact"] for group in batch["groups"] for cid in group["candidateIds"]}
    base=[x["normalizedResidualEnergy"] for x in pending if x["localReferenceValid"]]
    median=float(np.median(base)) if base else 0.0
    mad=float(np.median(np.abs(np.asarray(base)-median))) if base else 0.0
    threshold=max(.02,median+6*mad)
    # A large residual is only meaningful when vector removal did not change
    # the local reference outside this placement's mask. The p85 compound
    # paths violate that condition and must not count as detected controls.
    controls_flagged=[x["candidateId"] for x in control_metrics
      if x["localReferenceValid"] and x["normalizedResidualEnergy"]>threshold]
    detector_reliable=len(controls_flagged)==5
    for row in pending:
        placement=placements[row["candidateId"]]
        row["uiMoveExecuted"]=placement.get("moveContract")=="passed" and placement.get("movedCapture") is not None
        row["uiMappingExact"]=bool(mapping_exact.get(row["candidateId"],False))
        row["uiMovePassed"]=row["uiMoveExecuted"] and row["uiMappingExact"]
        row["uiError"]=placement.get("error")
        row["maskTechnique"]="source-pdf-clean-raster-alpha-refined" if "refined" in str(placement.get("maskBbox")) else "source-pdf-clean-rectangle"
        if not detector_reliable or not row["localReferenceValid"] or not row["uiMovePassed"]:
            row["classification"]="INCONCLUSIVO"
        elif row["normalizedResidualEnergy"]>threshold:
            row["classification"]="ANOMALIA"
        else:
            row["classification"]="CANDIDATE_APPROVABLE"
    for row in control_metrics:
        if not row["localReferenceValid"]:
            row["classification"]="INCONCLUSIVE_REFERENCE_INVALID"
        else:
            row["classification"]="ANOMALIA" if row["normalizedResidualEnergy"]>threshold else "NEGATIVE_CONTROL_NOT_DETECTED"
        row["uiMovePassed"]=False
        row["maskTechnique"]="source-pdf-clean-raster-alpha-refined"
    # Pending mask technique comes from exact staged filename, not visual guess.
    sidecars={}
    for page in json.loads((OUT/"patches/patch-manifest.json").read_text(encoding="utf-8"))["pages"]:
        side=read(OUT/"patches/pages"/f"page_{page['page']:03d}"/"inline_elements.json")
        sidecars.update({(e.get("provenance") or {}).get("candidateId"):e for e in side["elements"] if e.get("provenance")})
    for row in metrics_rows:
        e=sidecars.get(row["candidateId"],{})
        row["maskTechnique"]="source-pdf-clean-raster-alpha-refined" if "refined" in Path(e.get("mask",{}).get("url","" )).name else "source-pdf-clean-rectangle"
    # Do not mark a placement READY here. PDF export representatives are a
    # required second contract and the authoritative eligibility list changes
    # only after all calibrated evidence is present.
    classifications=Counter(x["classification"] for x in pending)
    grouped=defaultdict(lambda:Counter())
    for row in pending:grouped[(row["symbolId"],row["maskTechnique"])][row["classification"]]+=1
    raw_control_outliers=[x["candidateId"] for x in control_metrics if x["normalizedResidualEnergy"]>threshold]
    summary={"status":"raster analysis complete; authoritative readiness not changed",
      "pendingCount":len(pending),"newlyUIMovedAndRendered":sum(x["uiMovePassed"] for x in pending),
      "uiMoveExecutedCount":sum(x["uiMoveExecuted"] for x in pending),
      "uiMoveExecutedButIdentityAmbiguous":sum(x["uiMoveExecuted"] and not x["uiMappingExact"] for x in pending),
      "newlyUIInconclusive":sum(not x["uiMovePassed"] for x in pending),"classificationCounts":dict(classifications),
      "knownNegativeControls":5,"controlsDetected":len(controls_flagged),"controlIdsDetected":controls_flagged,
      "rawAboveThresholdControlIds":raw_control_outliers,
      "detectorReliableForRelease":detector_reliable,"score":"sum(max-channel pixel difference empty-vs-vector-clean / source-viewer-vs-vector-clean), limited to exact prepared mask bbox",
      "threshold":threshold,"noiseMedian":median,"noiseMAD":mad,
      "referenceRasterIntegrityWholePages":all(x["imageVisualOutsideRedactionsEqual"] for x in refs["results"]),
      "groups":[{"symbolId":k[0],"maskTechnique":k[1],"counts":dict(v)} for k,v in sorted(grouped.items())],
      "controlMetrics":control_metrics,"placements":pending}
    (BATCH/"visual-analysis.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    PANELS.mkdir(parents=True,exist_ok=True)
    approved=[x for x in pending if x["classification"]=="CANDIDATE_APPROVABLE"]
    anomalous=[x for x in pending if x["classification"]=="ANOMALIA"]+[x for x in control_metrics if x["classification"]=="ANOMALIA"]
    inconclusive=[x for x in pending if x["classification"]=="INCONCLUSIVO"]
    panel(PANELS/"panel-aprovaveis.png",approved,"APROVÁVEIS — candidatos, ainda sem liberação até o PDF representativo")
    panel(PANELS/"panel-anomalias.png",anomalous,"ANOMALIAS — inclui controles negativos conhecidos")
    panel(PANELS/"panel-inconclusivos.png",inconclusive,"INCONCLUSIVOS — cobertura insuficiente ou referência local inválida")
    print(json.dumps({"classificationCounts":dict(classifications),"controlsDetected":len(controls_flagged),"threshold":threshold,"panels":str(PANELS)},ensure_ascii=False))


if __name__=="__main__":main()
