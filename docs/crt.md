# Sketchpad CRT Display

Sketchpad ran on the TX-2 computer with a Cathod Ray Tube to display its graphical interface on a 7" x 7" screen: [video](crt.mp4)

![tx2 photo](crt1.jpg)

According to [Ivan Sutherland's thesis](https://dspace.mit.edu/handle/1721.1/14979), it stored 32,000 "spots" in a display table (or more precisely, two display tables for double-buffering), each a 36 bit word:

* 10 bit horizontal and 10 bit vertical deflection of ray, origin at center, "signed fraction of full scope deflection" (pg. 70)
* 16 bit tag (to identify what part of the drawing is sensed by the light pen)

This means it had a "resolution" of 1024x1024 spot positions, which some reports incorrectly call a 1024x1024 pixel display. But this was not a raster display, it displayed individual points. Normally the spots bleed into each other visually, but they can be drawn apart too, in some cases due to interlaced rendering to reduce flicker (as in this screenshot from the later Sketchpad-3D):

![interlaced spot rendering](crt2.jpg)

## Display Speed

The electrostatic deflection system on the TX-2 was able to display spots at a rate of up to 100,000 per second. The display subprogram took 20 microseconds per spot so that time was "left over for computation." That means the actual rate was up to 50,000 spots per second (pg. 67). The display table stored up to 32,000 words, but half of it was used for double-buffering.

The system displayed dots either consecutively, or "interlaced" showing every 8th spot. This reduced flicker at the expense of a crawling pattern and can be switched on by the user (pg. 68).

Another display mode is "twinkling", using a random order which is "pleasing to the eye" (pg. 68). This, too, could be enabled by the user.

### Display Emulation

Here is a faithful emulation of the TX-2 display using WebGL to draw Gaussian splats. The spot locations are quantized to 1024 positions:

[Click to run](emu.html)

This emulation does take the TX-2's drawing speed into account, which leads to flickering. It implements both interlaced and twinkling rendering, which reduce the flicker. It also simulates the phosphor's fluorescence (which produces a slight after-image effect making movement less jerky).

The source code for this emulation is available [here](https://github.com/codefrau/sutherland/blob/3b69c3ff4eba7e9382d8a1f79560a7aca0375fa2/src/display.ts#L1) (the other files in the repo are unused for this experiment). It uses 64 bits per spot, putting the x and y coordinates into the upper half of each 32 bit word (having them in the upper half makes sign extension simpler in the shader). The lower 16 bits are used for a spot ID in one word, and a spot index in the other word, which I used for distinguishing spots by color while debugging.

## Pen Tracker

The Light Pen required a tracking pattern to determine which way the pen moved. Figure 4.4 of the thesis shows several patterns. Sutherland writes "I use the logarithmic scan with 4 arms." The middle of the pattern is left empty. This is used to show a "pseudo pen location" as a "bright dot" that jumps away from the pattern when snapping to a point or line (pg. 66).

The emulation recreates the pen tracker by showing the pattern and the "pseudo pen location" as a bright dot. The pattern can be moved by moving your pointing device. The bright dot snaps to the nearest spot continuously.

The pen spots are rendered in each frame, so they do not flicker. This matches the original display which needed the pattern to be steady and responsive for the light pen to work.