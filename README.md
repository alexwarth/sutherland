# sutherland

To run:
```
yarn
vite
```

Controls:
* Drawing, etc.:
  * To **draw lines**, click around while holding down the "meta" key (⌘ or ⊞)
  * To **draw an arc**, hold down the `A` key: 1st click is the center, 2nd and 3rd are the end points
  * To **move a point / line / arc**, just drag it
  * To **pan**, drag the background
  * To **zoom in / out**, press `+` / `-`
  * To **delete a line / arc / instance**, point at it and press backspace
* Masters and instances:
  * To **switch drawings**, press one of the digit keys
  * To **instantiate a drawing**, press one of the digit keys while holding `SHIFT`
  * To **rotate an instance**, press `Q` / `W` while pointing at it
  * To **scale an instance**, press `+` / `-` while pointing at it
* Constraints:
  * **horizontal or vertical (horv)**: point to a line and press `H`
  * **point on line**: drag a point to a line, drop it there
  * (this constraint is also added when you draw a line that terminates on another line)
  * ...
  * To **run the solver**, hold down the `SPACE` key
