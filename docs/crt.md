# Sketchpad CRT Display

Sketchpad ran on the TX-2 computer with a 7" x 7" Cathod Ray Tube to display its graphical interface: [youtube video](https://www.youtube.com/embed/GVlqhIzSUUY?si=Y40xSiqU16LgaUVg)

![sketchpad photo](crt1.jpg)

According to Ivan Sutherland's thesis, it stored 32,000 "spots" in a display table (or more precisely, two display tables for double-buffering), each a 36 bit word:

* 10 bit horizontal and 10 bit vertical deflection of ray, origin at center, "signed fraction of full scope deflection" (pg. 70)
* 16 bit tag (to identify what part of the drawing is sensed by the light pen)

This means it had a "resolution" of 1024x1024 spot positions, which some reports incorrectly call a 1024x1024 pixel display. But this was not a raster display, but displayed individual points. Normally the spots bleed into each other visually, but they can be drawn apart too, in this case due to interlaced rendering to reduce flicker (this screenshot is from the later Sketchpad-3D):

![interlaced spot rendering](crt2.jpg)

## Display

The display system, or "scope" on the TX-2 is able to draw up to 100,000 spots per second, but with Sketchpad the program used 20 microseconds per spot, so the actual rate was more like 50,000 spots per second (pg. 67). The display table stored up to 16,000 spots (32,000 words due to double-buffering).

The system displayed dots either consecutively, or "interlaced" showing every 8th spot. This reduced flicker at the expense of a crawling pattern and can be switched on by the user (pg. 68).

Another display mode is "twinkling", using a random order which is "pleasing to the eye" (pg. 68). This, too, could be enabled by the user.

### Display Emulation

Here is a faithful emulation of the display using Gaussian splats as points. The spot locations are quantized to 1024 positions:

[Click to run](emu.html)

This emulation does take the TX-2's drawing speed into account, which leads to flickering. It implements both interlaced and twinkling rendering, which reduce the flicker. It also simulates the phosphor's fluorescence (which produces a slight after-image effect making movement less jerky).

The source code for this emulation is available [here](https://github.com/codefrau/sutherland/blob/388825238e6c477f760bd327755db768bc67fed5/src/display.ts#L1) (the other files in the repo are unused for this experiment). It uses 64 bits per spot, putting the x and y coordinates into the upper half of each 32 bit word. The lower 16 bits are used for a spot ID in one word, and a spot index in the other word, which I used for distinguishing spots by color while debugging.

## Pen Tracker

The Light Pen required a tracking pattern to determine which way the pen moved. Figure 4.4 of the thesis shows several patterns. Sutherland writes "I use the logarithmic scan with 4 arms." The middle of the pattern is left empty. This is used to show a "pseudo pen location" as a "bright dot" that jumps away from the pattern when snapping to a point or line (pg. 66).

The emulation recreates the pen tracker by showing the pattern and the "pseudo pen location" as a bright dot. The pattern can be moved by moving your pointing device. The bright dot snaps to the nearest spot continuously.

The pen spots are rendered in each frame, so they do not flicker. This matches the original display which needed the pattern to be steady and responsive for the light pen to work.