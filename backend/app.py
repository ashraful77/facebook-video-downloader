import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import yt_dlp
from flask import Flask, after_this_request, jsonify, request, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": [
    "https://ashraful77.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]}})

MAX_FILE_BYTES = 250 * 1024 * 1024
ALLOWED_HOSTS = {"facebook.com", "www.facebook.com", "m.facebook.com",
                 "web.facebook.com", "fb.watch", "www.fb.watch"}

def validate_facebook_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("Please enter a valid Facebook video link.")
    parsed = urlparse(value.strip())
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not any(
        host == allowed or host.endswith("." + allowed)
        for allowed in ALLOWED_HOSTS
    ):
        raise ValueError("Use a public Facebook video URL beginning with https://.")
    if parsed.username or parsed.password:
        raise ValueError("That link is not supported.")
    return value.strip()

def ydl_options():
    return {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 15,
        "retries": 1,
        "fragment_retries": 1,
        "max_filesize": MAX_FILE_BYTES,
        "format": "best[ext=mp4]/best",
    }

@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "Facebook Video Downloader API"})

@app.post("/api/info")
def info():
    body = request.get_json(silent=True) or {}
    try:
        url = validate_facebook_url(body.get("url", ""))
        with yt_dlp.YoutubeDL(ydl_options()) as ydl:
            data = ydl.extract_info(url, download=False)
        if not data:
            raise ValueError("No video information was returned.")
        return jsonify({
            "ok": True,
            "title": str(data.get("title") or "Facebook video")[:180],
            "duration": data.get("duration"),
            "thumbnail": data.get("thumbnail"),
        })
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception:
        return jsonify({
            "ok": False,
            "error": "Could not read this video. It may be private, unavailable, age-restricted, or unsupported. Try a publicly accessible video link."
        }), 422

@app.post("/api/download")
def download():
    body = request.get_json(silent=True) or {}
    try:
        url = validate_facebook_url(body.get("url", ""))
        temp_dir = tempfile.mkdtemp(prefix="fb-video-")
        output_template = str(Path(temp_dir) / "%(id)s.%(ext)s")
        options = ydl_options()
        options.update({"outtmpl": output_template, "format": "best[ext=mp4]/best"})
        with yt_dlp.YoutubeDL(options) as ydl:
            info_data = ydl.extract_info(url, download=True)
            filename = Path(ydl.prepare_filename(info_data))
        if not filename.exists():
            # Some formats can have a different extension after merging.
            candidates = list(Path(temp_dir).glob("*"))
            if not candidates:
                raise RuntimeError("The video file was not created.")
            filename = candidates[0]
        if filename.stat().st_size > MAX_FILE_BYTES:
            raise ValueError("This video is larger than the 250 MB limit.")
        safe_title = re.sub(r"[^A-Za-z0-9._ -]", "", str(info_data.get("title") or "facebook-video"))
        safe_title = safe_title.strip(" .")[:80] or "facebook-video"
        suffix = filename.suffix or ".mp4"

        @after_this_request
        def cleanup(response):
            try:
                for item in Path(temp_dir).glob("*"):
                    item.unlink(missing_ok=True)
                Path(temp_dir).rmdir()
            except OSError:
                pass
            return response

        return send_file(
            filename,
            as_attachment=True,
            download_name=f"{safe_title}{suffix}",
            mimetype="video/mp4" if suffix.lower() == ".mp4" else "application/octet-stream",
            conditional=True,
        )
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception:
        return jsonify({
            "ok": False,
            "error": "Download failed. This link may be private, unavailable, too large, or not supported by the current extractor."
        }), 422

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
