#!/usr/bin/env python3
"""Makes the site's media from Stevy's own Dropbox folders.

Reads tools/selectie.json (jobs by their Dropbox folder, photos from 07_BEST-OF)
and writes:
  media/clips/<job>-<n>-loop.mp4   6 s, silent, 960 wide - the loudest stretch
                                   of the clip (the drop), for hover and the hero
  media/clips/<job>-<n>.jpg        its poster
  media/clips/<job>-<n>.mp4        the clip itself at 1080p with sound
  media/photos/<name>.jpg / -s.jpg the photo at 2200 px and 900 px
  data/site.json                   everything the page needs, ordered the way
                                   his Dropbox is: category > artist > YYYY.MM | job

The source files are never touched. Run again after changing the selection;
files already made are kept.
"""
import json
import os
import re
import subprocess
import sys
import unicodedata

HIER = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HIER)
LOOP = 6.0


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"failed: {' '.join(cmd)}\n{r.stderr[-1500:]}")
    return r


def duur(pad):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", pad])
    return float(r.stdout.strip())


def luidste(pad, d):
    """Start of the LOOP-second stretch with the highest momentary loudness."""
    r = subprocess.run(["ffmpeg", "-nostats", "-i", pad, "-filter_complex", "ebur128=framelog=verbose",
                        "-f", "null", "-"], capture_output=True, text=True)
    ts, ms = [], []
    for m in re.finditer(r"t:\s*([\d.]+)\s+TARGET.*?M:\s*(-?[\d.]+)", r.stderr):
        ts.append(float(m.group(1)))
        ms.append(max(-70.0, float(m.group(2))))
    if not ts or d < LOOP + 2:
        return max(0.0, d / 2 - LOOP / 2)
    n = max(1, int(LOOP / 0.1))
    beste, start = -1e9, 1.0
    som = sum(ms[:n])
    for i in range(len(ms) - n):
        t = ts[i]
        if 1.0 <= t <= d - LOOP - 1.0 and som / n > beste:
            beste, start = som / n, t
        som += ms[i + n] - ms[i]
    return round(start, 2)


def klus_titel(map_naam, artiest):
    datum, _, titel = map_naam.partition(" | ")
    a = unicodedata.normalize("NFC", artiest).lower()
    t = unicodedata.normalize("NFC", titel)
    if t.lower().startswith(a + " - "):
        t = t[len(a) + 3:]
    return datum.strip(), t.strip()


def foto_info(naam, namen):
    m = re.match(r"^(\d{6}|\d{8})_(\d{2})(\d{2})_([A-Z]+)", os.path.basename(naam))
    if not m:
        return None
    d, hh, mm, token = m.groups()
    if len(d) == 8:
        jaar, maand, dag = d[:4], d[4:6], d[6:]
    else:                                   # DDMMYY, except the odd YYMMDD
        dag, maand, jaar = d[:2], d[2:4], "20" + d[4:]
        if int(jaar) < 2015 or int(maand) > 12:
            jaar, maand, dag = "20" + d[:2], d[2:4], d[4:]
    return {"date": f"{jaar}.{maand}.{dag}", "time": f"{hh}:{mm}", "event": namen.get(token, token.title())}


def maat(pad):
    r = run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", pad])
    w = int(re.search(r"pixelWidth: (\d+)", r.stdout).group(1))
    h = int(re.search(r"pixelHeight: (\d+)", r.stdout).group(1))
    return w, h


def main():
    sel = json.load(open(os.path.join(HIER, "selectie.json")))
    root = os.path.expanduser(sel["root"])
    os.makedirs(os.path.join(SITE, "media/clips"), exist_ok=True)
    os.makedirs(os.path.join(SITE, "media/photos"), exist_ok=True)

    jobs = []
    for job in sel["jobs"]:
        map_naam = os.path.basename(job["folder"])
        datum, titel = klus_titel(map_naam, job["artist"])
        jid = slug(f"{job['artist']}-{titel}")
        clips = []
        for n, rel in enumerate(job["clips"], 1):
            bron = os.path.join(root, job["folder"], rel)
            basis = os.path.join(SITE, "media/clips", f"{jid}-{n}")
            print(f"[{jid} {n}] {os.path.basename(bron)}", flush=True)
            d = duur(bron)
            meta = basis + ".json"
            if os.path.exists(meta):
                start = json.load(open(meta))["start"]
            else:
                start = luidste(bron, d)
                json.dump({"start": start}, open(meta, "w"))
            if not os.path.exists(basis + "-loop.mp4"):
                run(["ffmpeg", "-y", "-v", "error", "-ss", str(start), "-i", bron, "-t", str(LOOP), "-an",
                     "-vf", "scale=960:-2,fps=25", "-c:v", "libx264", "-preset", "slow", "-crf", "27",
                     "-pix_fmt", "yuv420p", "-movflags", "+faststart", basis + "-loop.mp4"])
            if not os.path.exists(basis + ".jpg"):
                run(["ffmpeg", "-y", "-v", "error", "-ss", str(start + 0.4), "-i", bron, "-frames:v", "1",
                     "-vf", "scale=1280:-2", "-q:v", "3", basis + ".jpg"])
            if not os.path.exists(basis + ".mp4"):
                run(["ffmpeg", "-y", "-v", "error", "-i", bron, "-vf", "scale='min(1920,iw)':-2",
                     "-c:v", "h264_videotoolbox", "-b:v", "7M", "-pix_fmt", "yuv420p",
                     "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", basis + ".mp4"])
            clips.append({"loop": f"media/clips/{jid}-{n}-loop.mp4", "poster": f"media/clips/{jid}-{n}.jpg",
                          "src": f"media/clips/{jid}-{n}.mp4", "duration": round(d, 2), "file": os.path.basename(rel)})
        jobs.append({"id": jid, "category": job["category"], "artist": job["artist"], "date": datum,
                     "title": titel, "folder": map_naam, "path": job["folder"], "clips": clips})

    photos = []
    pmap = sel["photos"]
    for rel in pmap["files"]:
        info = foto_info(rel, pmap["names"])
        if not info:
            print("skipped (no time in the name):", rel)
            continue
        bron = os.path.join(root, pmap["folder"], rel)
        naam = slug(os.path.splitext(os.path.basename(rel))[0])
        groot = os.path.join(SITE, "media/photos", naam + ".jpg")
        klein = os.path.join(SITE, "media/photos", naam + "-s.jpg")
        print(f"[photo] {os.path.basename(rel)}", flush=True)
        if not os.path.exists(groot):
            run(["sips", "-Z", "2200", "-s", "format", "jpeg", "-s", "formatOptions", "82", bron, "--out", groot])
        if not os.path.exists(klein):
            run(["sips", "-Z", "900", "-s", "format", "jpeg", "-s", "formatOptions", "78", groot, "--out", klein])
        w, h = maat(groot)
        photos.append({**info, "src": f"media/photos/{naam}.jpg", "small": f"media/photos/{naam}-s.jpg", "w": w, "h": h})

    photos.sort(key=lambda p: p["date"], reverse=True)
    data = {
        "categories": [
            {"id": "events", "name": "Events", "folder": "01_EVENTS"},
            {"id": "brands", "name": "Commercial & Brands", "folder": "02_COMMERCIAL&BRANDS"},
            {"id": "portraits", "name": "Portraits & Presskits", "folder": "03_PORTRAITS"},
        ],
        "jobs": sorted(jobs, key=lambda j: j["date"], reverse=True),
        "photos": photos,
    }
    with open(os.path.join(SITE, "data/site.json"), "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"DONE {len(jobs)} jobs, {sum(len(j['clips']) for j in jobs)} clips, {len(photos)} photos")


if __name__ == "__main__":
    main()
