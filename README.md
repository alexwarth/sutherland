# sutherland

# To run:

```
yarn
vite
```

... then point your web browser at http://localhost:5173/
(or whatever else vite tells you the URL is)

# Controls for iPad + Apple Pencil:

- Drawing, etc.:
  - To **draw lines**, move the pencil around, tapping the `LINE` button each time you want a new segment
  - To **draw an arc**, point the pencil at the center of the arc and tap the `ARC` button; now move it to one of the ends of the arc and tap `ARC` again; then move it to the other end of the arc and tap `ARC` one last time
  - To **move a point / line / arc**, point at it with the pencil, then tap `MOVE` and move the pencil around; lifting the pencil terminates the move
  - To **pan**, move your finger on the background
  - To **zoom in / out**, do a pinch gesture
  - To **delete a line / arc / instance**, point at it with the pencil and tap `DEL`
  - To **clear the current drawing / master**, tap `CLEAR`
- Masters and instances:
  - To **switch drawings**, tap one of the number buttons (`1` through `6`)
  - To **instantiate a drawing**, tap one of the number buttons (`1` through `6`) while pointing at the desired location for that instance
  - To **rotate or scale an instance**, point at it with the pencil and do a pinch gesture (you can rotate your fingers like you're operating a pretend knob to rotate)
  - To **dismember an instance**, point at it with the pencil and tap `DISM`
- Constraints:
  - **horizontal or vertical (HorV)**: point to a line and tap `HORV`
  - **point on line**: move a point to a line, drop it there
  - (this constraint is also added when you draw a line that terminates on another line)
  - To **designate/undesignate a point as an attacher**, point at it with the pencil and tap `ATT`
  - To make several lines have **equal length**, hard-press on them with the pencil while you hold down the `EQ` button
  - To add a **fixed length constraint to a line**, point at it with the pencil and tap `FIX`
  - To add a **fixed position constraint to a point**, point at it with the pencil and tap `FIX`
  - To **constrain an instance to the master's full size**, tap `SIZE` while pointing at it with the pencil
  - To **attach a weight to a point**, point at it with the pencil and tap `WEIGHT`
  - To **run the solver**, hold down the `SOLVE` button
  - To toggle **auto-solve mode** on/off, tap `AUTO`

# Controls for Desktop:

- Drawing, etc.:
  - To **draw lines**, click around while holding down the "meta" key (⌘ or ⊞)
  - To **draw an arc**, hold down the `A` key: 1st click is the center, 2nd and 3rd are the end points
  - To **move a point / line / arc**, just drag it
  - To **pan**, drag the background
  - To **re-center** the scope at the position of the cursor, press `C`
  - To **zoom in / out**, press `+` / `-`
  - To **delete a line / arc / instance**, point at it and press backspace
  - To **toggle flicker on / off**, press `F`
- Masters and instances:
  - To **switch drawings**, press one of the digit keys
  - To **instantiate a drawing**, press `SHIFT` + one of the digit keys
  - To **rotate an instance**, press `Q` / `W` while pointing at it
  - To **scale an instance**, press `+` / `-` while pointing at it
  - To **dismember an instance**, press `SHIFT` + `D` while pointing at it
- Constraints:
  - **horizontal or vertical (HorV)**: point to a line and press `H`
  - **point on line**: drag a point to a line, drop it there
  - (this constraint is also added when you draw a line that terminates on another line)
  - To **designate/undesignate a point as an attacher**, point at it and press `SHIFT` + `A`
  - To make several lines have **equal length**, click on them while pressing `E`
  - To add a **fixed length constraint to a line**, point at it and press `.`
  - To add a **fixed position constraint to a point**, point at it and press `.`
  - ...
  - To **run the solver**, hold down the `SPACE` key
  - To toggle **auto-solve mode** on/off, press `SHIFT` + `S`
