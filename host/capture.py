#!/usr/bin/env python3
"""Copy one screen rectangle and return a PNG. No window. No file."""

import base64
import json
import struct
import sys

import gi

gi.require_version("Gdk", "3.0")
from gi.repository import Gdk


def send(obj):
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("@I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    length = struct.unpack("@I", raw)[0]
    if length < 2 or length > 1000000:
        return None
    body = sys.stdin.buffer.read(length)
    if len(body) < length:
        return None
    return json.loads(body.decode("utf-8"))


def capture(message):
    x = int(message["x"])
    y = int(message["y"])
    width = int(message["width"])
    height = int(message["height"])
    if width < 1 or height < 1:
        raise ValueError("empty rectangle")
    window = Gdk.get_default_root_window()
    if window is None:
        raise RuntimeError("no screen")
    screen_w = window.get_width()
    screen_h = window.get_height()
    if x < 0:
        width += x
        x = 0
    if y < 0:
        height += y
        y = 0
    if x + width > screen_w:
        width = screen_w - x
    if y + height > screen_h:
        height = screen_h - y
    if width < 1 or height < 1:
        raise ValueError("rectangle is off the screen")
    image = Gdk.pixbuf_get_from_window(window, x, y, width, height)
    if image is None:
        raise RuntimeError("screen copy failed")
    ok, buf = image.save_to_bufferv("png", [], [])
    if not ok:
        raise RuntimeError("png failed")
    encoded = base64.b64encode(buf).decode("ascii")
    chunk = 400000
    parts = [encoded[i:i + chunk] for i in range(0, len(encoded), chunk)] or [""]
    count = len(parts)
    for index, part in enumerate(parts):
        send({"ok": True, "index": index, "count": count, "data": part})


def main():
    while True:
        message = read_message()
        if message is None:
            return
        if not isinstance(message, dict):
            send({"ok": False, "error": "bad message"})
            continue
        try:
            capture(message)
        except Exception as error:
            send({"ok": False, "error": str(error)})


if __name__ == "__main__":
    main()
