import { Arc, Instance, Thing } from './things';
import { ctx } from './canvas';
import config from './config';
import { easeOutQuint } from './helpers';
import scope from './scope';

export type Status = { message?: string; referents?: Set<Thing> };

let status: Status | null = null;
let statusTimeMillis = 0;

export function set(newStatus: Status | string) {
  status = typeof newStatus === 'string' ? { message: newStatus } : newStatus;
  statusTimeMillis = Date.now();
}

export function render() {
  if (status === null) {
    return;
  }

  const statusAgeMillis = Date.now() - statusTimeMillis;
  if (statusAgeMillis > config().statusTimeMillis) {
    status = null;
    return;
  }

  const alpha = 1 - easeOutQuint(statusAgeMillis / config().statusTimeMillis);
  const color = `rgba(255,222,33,${alpha})`;

  if (status.message) {
    const fontSizeInPixels = 40;
    ctx.font = `${fontSizeInPixels}px Monaco`;
    const width = ctx.measureText(status.message).width;
    ctx.fillStyle = color;
    ctx.fillText(status.message, (innerWidth - width) / 2, innerHeight - fontSizeInPixels);
  }

  if (config().highlightReferents && status.referents) {
    for (const thing of status.referents) {
      thing.render(scope.toScreenPosition, color, 2);
    }
  }
}
