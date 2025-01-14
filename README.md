# sutherland

# To run:

```
yarn
vite
```

... then point your web browser at http://localhost:5173/
(or whatever else vite tells you the URL is)

# Controls:

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
  - to **designate/undesignate a point as an attacher**, point at it and press `SHIFT` + `A`
  - to make several lines have **equal length**, click on them while pressing `E`
  - ...
  - To **run the solver**, hold down the `SPACE` key
  - To toggle **auto-solve mode** on/off, press `SHIFT` + `S`
