#!/usr/bin/env python3
"""Copy one screen rectangle and return a PNG. No file is saved.

The grab command copies a rectangle and does not open a window.
The select command opens one transparent window. Two clicks set the
corners. Esc closes it and copies nothing.
"""

import base64
import json
import struct
import sys
import time

import gi

gi.require_version("Gdk", "3.0")
from gi.repository import Gdk, GLib

MINIMUM_CSS = 44


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


def screen_box(x1, y1, x2, y2, minimum=MINIMUM_CSS):
    # GDK 3 gives event and root sizes in logical pixels, and
    # pixbuf_get_from_window takes logical pixels and returns device pixels.
    # So no scale factor is applied here.
    css_w = abs(x2 - x1)
    css_h = abs(y2 - y1)
    if css_w < minimum or css_h < minimum:
        return None
    return (
        int(round(min(x1, x2))),
        int(round(min(y1, y2))),
        max(1, int(round(css_w))),
        max(1, int(round(css_h))),
    )


def send_png(image):
    ok, buf = image.save_to_bufferv("png", [], [])
    if not ok:
        raise RuntimeError("png failed")
    encoded = base64.b64encode(buf).decode("ascii")
    chunk = 400000
    parts = [encoded[i:i + chunk] for i in range(0, len(encoded), chunk)] or [""]
    count = len(parts)
    for index, part in enumerate(parts):
        send({"ok": True, "index": index, "count": count, "data": part})


def grab_rect(x, y, width, height):
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
    send_png(image)


def marquee_cursor(dash_offset):
    import cairo

    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 32, 32)
    context = cairo.Context(surface)
    context.set_line_width(5)
    context.set_source_rgb(0x1a / 255, 0x1a / 255, 0x1a / 255)
    context.rectangle(4.5, 4.5, 22, 22)
    context.stroke()
    context.set_line_width(3)
    context.set_source_rgb(1, 1, 1)
    context.rectangle(4.5, 4.5, 22, 22)
    context.stroke()
    context.set_line_width(2)
    context.set_dash([6, 4], dash_offset)
    context.set_source_rgb(0, 0x5f / 255, 0xcc / 255)
    context.rectangle(4.5, 4.5, 22, 22)
    context.stroke()
    return Gdk.pixbuf_get_from_surface(surface, 0, 0, 32, 32)


def select_rect():
    gi.require_version("Gtk", "3.0")
    import cairo
    from gi.repository import Gtk

    root = Gdk.get_default_root_window()
    if root is None:
        raise RuntimeError("no screen")
    width = max(1, root.get_width())
    height = max(1, root.get_height())
    screen = Gdk.Screen.get_default()
    visual = screen.get_rgba_visual() if screen is not None else None
    if visual is None:
        raise RuntimeError("no transparent screen")

    outcome = {"rect": None, "cancel": False, "done": False}
    first = {"point": None}
    hover = {"point": None}
    frame = {"n": 0}

    win = Gtk.Window(type=Gtk.WindowType.POPUP)
    win.set_app_paintable(True)
    win.set_visual(visual)
    win.set_default_size(width, height)
    win.move(0, 0)
    win.set_can_focus(True)
    win.set_accept_focus(True)
    win.add_events(
        Gdk.EventMask.BUTTON_PRESS_MASK
        | Gdk.EventMask.POINTER_MOTION_MASK
        | Gdk.EventMask.KEY_PRESS_MASK
    )

    def paint(_widget, context):
        context.set_operator(cairo.OPERATOR_SOURCE)
        context.set_source_rgba(0, 0, 0, 0)
        context.paint()
        context.set_operator(cairo.OPERATOR_OVER)
        point = first["point"]
        current = hover["point"]
        if point is None or current is None:
            return False
        # Draw the marquee outside the box so none of it is inside the copy.
        gap = 3
        left = min(point[0], current[0]) - gap
        top = min(point[1], current[1]) - gap
        box_w = abs(current[0] - point[0]) + gap * 2
        box_h = abs(current[1] - point[1]) + gap * 2
        context.set_line_width(5)
        context.set_source_rgb(0x1a / 255, 0x1a / 255, 0x1a / 255)
        context.rectangle(left, top, box_w, box_h)
        context.stroke()
        context.set_line_width(3)
        context.set_source_rgb(1, 1, 1)
        context.rectangle(left, top, box_w, box_h)
        context.stroke()
        context.set_line_width(2)
        context.set_dash([8, 6], frame["n"] * 4)
        context.set_source_rgb(0, 0x5f / 255, 0xcc / 255)
        context.rectangle(left, top, box_w, box_h)
        context.stroke()
        return False

    def on_motion(_widget, event):
        if first["point"] is None:
            return False
        hover["point"] = (event.x, event.y)
        win.queue_draw()
        return False

    def finish(cancel, rect):
        if outcome["done"]:
            return
        outcome["done"] = True
        outcome["cancel"] = cancel
        outcome["rect"] = rect
        Gtk.main_quit()

    def on_button(_widget, event):
        if event.button != 1:
            return True
        if first["point"] is None:
            first["point"] = (event.x, event.y)
            hover["point"] = (event.x, event.y)
            send({"ok": True, "event": "status", "text": "Click the other corner."})
            win.queue_draw()
            return True
        rect = screen_box(first["point"][0], first["point"][1], event.x, event.y)
        if rect is None:
            send({"ok": True, "event": "status", "text": "Click a corner farther away."})
            return True
        finish(False, rect)
        return True

    def on_key(_widget, event):
        if event.keyval == Gdk.KEY_Escape:
            finish(True, None)
            return True
        return False

    def on_stdin(_source, _condition):
        finish(True, None)
        return False

    win.connect("draw", paint)
    win.connect("motion-notify-event", on_motion)
    win.connect("button-press-event", on_button)
    win.connect("key-press-event", on_key)
    win.connect("delete-event", lambda *_args: finish(True, None) or True)
    GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_HUP | GLib.IO_ERR, on_stdin)

    cursors = []
    display = Gdk.Display.get_default()
    for offset in (0, 6):
        pixbuf = marquee_cursor(offset)
        cursors.append(Gdk.Cursor.new_from_pixbuf(display, pixbuf, 4, 4))

    def animate():
        if outcome["done"]:
            return True
        frame["n"] = (frame["n"] + 1) % 2
        gdk_window = win.get_window()
        if gdk_window is not None:
            gdk_window.set_cursor(cursors[frame["n"]])
        if first["point"] is not None:
            win.queue_draw()
        return True

    win.show_all()
    gdk_window = win.get_window()
    if gdk_window is not None:
        gdk_window.set_cursor(cursors[0])
        gdk_window.focus(Gdk.CURRENT_TIME)
    seat = display.get_default_seat() if display is not None else None
    if seat is not None and gdk_window is not None:
        seat.grab(
            gdk_window,
            Gdk.SeatCapabilities.POINTER | Gdk.SeatCapabilities.KEYBOARD,
            False,
            None,
            None,
            None,
            None,
        )
    send({"ok": True, "event": "status", "text": "Click one corner."})
    timer = GLib.timeout_add(180, animate)
    Gtk.main()
    GLib.source_remove(timer)
    if seat is not None:
        seat.ungrab()
    win.hide()
    while Gtk.events_pending():
        Gtk.main_iteration_do(False)
    Gdk.flush()
    if outcome["rect"] is not None:
        # Give the compositor time to take the window off the screen.
        time.sleep(0.15)
        while Gtk.events_pending():
            Gtk.main_iteration_do(False)
    win.destroy()
    if outcome["cancel"] or outcome["rect"] is None:
        return None
    return outcome["rect"]


def main():
    while True:
        message = read_message()
        if message is None:
            return
        if not isinstance(message, dict):
            send({"ok": False, "error": "bad message"})
            continue
        try:
            if message.get("cmd") == "select":
                rect = select_rect()
                if rect is None:
                    send({"ok": False, "error": "cancel"})
                    continue
                grab_rect(rect[0], rect[1], rect[2], rect[3])
                continue
            grab_rect(
                int(message["x"]),
                int(message["y"]),
                int(message["width"]),
                int(message["height"]),
            )
        except Exception as error:
            send({"ok": False, "error": str(error)})


if __name__ == "__main__":
    main()
