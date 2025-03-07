import VConsole from 'vconsole';
import config from './config';

let vConsole: VConsole | null = null;
let consoleEl: HTMLDivElement | null = null;
let consoleButton: HTMLDivElement | null = null;

function createConsole() {
    vConsole = new VConsole({ theme: 'dark' });
    consoleEl = document.getElementById('__vconsole') as HTMLDivElement;
    consoleEl.style.cursor = 'pointer';
    consoleButton = consoleEl.querySelector('.vc-switch') as HTMLDivElement;
    consoleButton.style.setProperty('--VC-BRAND', '#666');
    consoleButton.style.right = '20px';
    consoleButton.style.bottom = '0';
    console.log('Hello Ivan');
}

export function showConsole() {
    if (config().console) {
        if (!vConsole) createConsole();
        else consoleEl!.style.display = 'block';
    } else {
        if (vConsole) consoleEl!.style.display = 'none';
    }
}
