# Mark and Copy

A Firefox extension. Select part of the screen, mark it with a highlighter or bingo circles, and copy the picture to the clipboard.

The toolbar button opens the menu. Highlighter or Bingo starts a screen selection: click one corner, then the other corner. The picture opens in its own window. Press Esc or close that window to copy the picture.

## Requirements

- Linux with an X11 session. Wayland is not supported.
- A compositing window manager. The selection window is transparent.
- Python 3 with PyGObject and GTK 3 (`python3-gi`, `gir1.2-gtk-3.0`).
- Firefox 128 or later. The extension is unsigned, so it needs Firefox ESR, Developer Edition, or Nightly with `xpinstall.signatures.required` set to false.

## Install

1. Register the screen copy program with Firefox:

   ```sh
   mkdir -p ~/.mozilla/native-messaging-hosts
   sed "s|@CAPTURE_PY@|$PWD/host/capture.py|" host/mark_and_copy.json.in \
     > ~/.mozilla/native-messaging-hosts/mark_and_copy.json
   chmod +x host/capture.py
   ```

2. Build the extension file and install it from `about:addons` (Install Add-on From File):

   ```sh
   zip -r mark-and-copy.xpi manifest.json *.html *.css *.js icons
   ```

Firefox loads a replaced extension file only after a full quit and restart.

## License

MIT. See LICENSE.
