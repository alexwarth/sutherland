import * as app from './app';
import scope from './scope';
import { SizeConstraint } from './constraints';
import { lettersDo } from './font';
import { Instance } from './things';

export function write(msg: string, scale = 1): Instance[] {
  const drawing = app.drawing();
  const instances: Instance[] = [];
  lettersDo(msg, scale, (letter, x, ls) => {
    const instance = drawing.addInstance(letter, { x, y: scope.center.y }, letter.size * ls, 0)!;
    drawing.constraints.add(new SizeConstraint(instance, ls));
    const lastInstance = instances.at(-1);
    if (lastInstance) {
      drawing.replaceHandle(instance.attachers[0], lastInstance.attachers[1]);
    }
    instances.push(instance);
  });
  return instances;
}

// TODO: this doesn't quite work right now b/c I'm merging the handles in write()
export function wanderingLetters(msg: string, scale = 1) {
  const instances = write(msg, scale);
  for (const instance of instances) {
    const pos = scope.fromScreenPosition({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
    });
    instance.x = pos.x;
    instance.x = pos.y;
  }
}
