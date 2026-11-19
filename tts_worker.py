#!/usr/bin/env python3
"""
Persistent Thai TTS worker (Microsoft Edge neural voices via `edge-tts`).

Protocol (JSON lines) is unchanged from the original ZeroTTS worker:
  stdin : {"id": 1, "text": "...", "voice": "premwadee"}
  stdout: {"type": "ready"|"status"|"error"|"result", ...}

Requires internet access (edge-tts calls Microsoft's online service). Unofficial API, no key needed.
"""
import asyncio
import hashlib
import json
import re
import sys
import time
import traceback
import unicodedata
from pathlib import Path

import edge_tts

CACHE_DIR = Path(__file__).resolve().parent / "data" / "tts-cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

VOICES = {
    "premwadee": "th-TH-PremwadeeNeural",
    "niwat": "th-TH-NiwatNeural",
    "achara": "th-TH-AcharaNeural",
}
DEFAULT_VOICE = "premwadee"

# เก็บเฉพาะอักษรไทย ละติน ตัวเลข และเครื่องหมายวรรคตอนพื้นฐาน
ALLOWED_RE = re.compile(r"[^0-9a-zA-Z฀-๿\s.,!?]")
BRACKET_EMOTE_RE = re.compile(r"\[[^\]]{1,24}\]")
MULTI_PUNCT_RE = re.compile(r"([.,!?])\1+")
REPEATED_CHARS_RE = re.compile(r"(.)\1{3,}")
MULTI_SPACE_RE = re.compile(r"\s+")


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def clean_text(raw: str) -> str:
    if not raw:
        return ""
    text = unicodedata.normalize("NFC", unicodedata.normalize("NFKC", str(raw)))
    text = BRACKET_EMOTE_RE.sub(" ", text)
    text = ALLOWED_RE.sub(" ", text)
    text = MULTI_PUNCT_RE.sub(r"\1", text)
    text = REPEATED_CHARS_RE.sub(r"\1\1\1", text)  # ไทยใช้ซ้ำได้ (เช่น 555) จึงเก็บไว้ 3 ตัว
    text = MULTI_SPACE_RE.sub(" ", text).strip(" .,!?-")
    if len(re.findall(r"[a-zA-Zก-๎]", text)) < 2:
        return ""
    return text[:200]  # จำกัดความยาวต่อประโยค


async def synth(text: str, voice_id: str, out_path: Path) -> None:
    tmp = out_path.with_suffix(".part")
    try:
        await edge_tts.Communicate(text, VOICES[voice_id], rate="-8%").save(str(tmp))
        tmp.replace(out_path)
    finally:
        tmp.unlink(missing_ok=True)


def main() -> None:
    emit({"type": "status", "status": "loading", "model": "edge-tts"})
    emit({
        "type": "ready",
        "model": "edge-tts (th-TH neural)",
        "voice": DEFAULT_VOICE,
        "voices": list(VOICES),
        "sampleRate": 24000,
        "loadSec": 0.0,
    })

    loop = asyncio.new_event_loop()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            voice = (req.get("voice") or DEFAULT_VOICE).strip().lower()
            if voice not in VOICES:
                voice = DEFAULT_VOICE

            text = clean_text((req.get("text") or "").strip())
            if not text:
                emit({"type": "result", "id": req_id, "ok": False, "error": "Filtered empty/spam text"})
                continue

            key = hashlib.sha1(f"th1::{voice}::{text}".encode("utf-8")).hexdigest()[:20]
            out_name = f"{voice}_{key}.mp3"
            out_path = CACHE_DIR / out_name
            cached = out_path.is_file() and out_path.stat().st_size > 200

            t0 = time.time()
            if not cached:
                loop.run_until_complete(synth(text, voice, out_path))
            emit({
                "type": "result", "id": req_id, "ok": True, "cached": cached,
                "voice": voice, "file": out_name, "url": f"/tts-cache/{out_name}",
                "synthSec": 0.0 if cached else round(time.time() - t0, 2),
            })
        except Exception as exc:
            emit({"type": "result", "id": req_id, "ok": False, "error": str(exc)})
            sys.stderr.write(traceback.format_exc())


if __name__ == "__main__":
    main()
