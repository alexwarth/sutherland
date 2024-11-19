import {
  applyToPoint,
  compose,
  inverse,
  Matrix,
  rotate,
  scale,
  translate,
} from 'transformation-matrix';
import { Position } from './helpers';

export default class Transform {
  static readonly identity = new Transform();

  private dx = 0;
  private dy = 0;
  private angle = 0;
  private scale = 1;

  private _matrix: Matrix | null = null;
  private _inverseMatrix: Matrix | null = null;

  constructor() {}

  translateBy(dx: number, dy: number) {
    this.dx += dx;
    this.dy += dy;
    this.forgetMatrices();
  }

  rotateBy(radians: number) {
    this.angle += radians;
    this.forgetMatrices();
  }

  setScale(newScale: number) {
    this.scale = newScale;
    this.forgetMatrices();
  }

  scaleBy(scale: number) {
    this.scale *= scale;
    this.forgetMatrices();
  }

  applyTo(p: Position): Position {
    return applyToPoint(this.matrix(), p);
  }

  applyInverseTo(p: Position): Position {
    return applyToPoint(this.inverseMatrix(), p);
  }

  private forgetMatrices() {
    this._matrix = null;
    this._inverseMatrix = null;
  }

  private matrix() {
    if (!this._matrix) {
      this._matrix = compose(rotate(this.angle), scale(this.scale), translate(this.dx, this.dy));
    }
    return this._matrix;
  }

  private inverseMatrix() {
    if (!this._inverseMatrix) {
      this._inverseMatrix = inverse(this.matrix());
    }
    return this._inverseMatrix;
  }
}
