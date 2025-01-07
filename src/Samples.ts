export class Samples {
  readonly samples: number[] = [];

  constructor() {}

  toString() {
    if (this.samples.length === 0) {
      return 'n/a';
    }
    const min = Math.min(...this.samples);
    const avg = this.samples.reduce((x, y) => x + y, 0) / this.samples.length;
    const max = Math.max(...this.samples);
    return `${min}..${avg}..${max}`;
  }
}
