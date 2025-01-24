import { Thing } from './things';
import { ctx } from './canvas';
import config from './config';
import { easeOutQuint } from './helpers';

export type Status = { message?: string; referents?: Set<Thing> };

let status: Status | null = null;
let statusTimeMillis = 0;

export function set(newStatus: Status | string) {
  // TODO: check canvas.initialized? (hope not!)
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

  if (status.message) {
    const fontSizeInPixels = 40;
    ctx.font = `${fontSizeInPixels}px Monaco`;
    const width = ctx.measureText(status.message).width;
    const alpha = 1 - easeOutQuint(statusAgeMillis / config().statusTimeMillis);
    ctx.fillStyle = `rgba(255,222,33,${alpha})`;
    ctx.fillText(status.message, (innerWidth - width) / 2, innerHeight - fontSizeInPixels);
  }

  if (status.referents) {
    // TODO
  }
}
