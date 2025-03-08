import config from './config';

let systemConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
};

let consoleEl: HTMLElement | null = null;
let consoleLines: HTMLElement[] = [];

export function showHideConsole() {
    const show = config().console;
    if (show) {
        if (!consoleEl) {
            consoleEl = createConsole();
            for (const line of consoleLines) showLine(line);
        }
        consoleEl.style.display = 'block';
    } else if (consoleEl) {
        consoleEl.style.display = 'none';
    }
}

function createConsole() {
    const builder = document.createElement('div');
    builder.innerHTML = `<div style="position: absolute; right: 0; bottom: 0; padding: 5px; width: fit-content; white-space: pre; font-family: monospace; background: rgba(0,0,0,0.5)"></div>`;
    const el = builder.children[0] as HTMLElement;
    document.body.appendChild(el);
    return el;
}

function intercept(method: keyof typeof systemConsole) {
    return function (...args: any[]) {
        systemConsole[method](...args);
        const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a, null, 2)).join(' ');
        const line = document.createElement('div');
        const color = method === 'error' ? '#F33' : method === 'warn' ? '#FD4' : '#CCC';
        const time = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(11, 23);
        line.innerHTML = `<span style="color: #999">${time}:</span> <span style="color: ${color}">${msg}</span>`;
        if (consoleLines.length > 100) consoleLines.shift();
        consoleLines.push(line);
        showLine(line);
    }
}

function showLine(el: HTMLElement) {
    if (!consoleEl) return;
    consoleEl.appendChild(el);
    while (consoleEl.getBoundingClientRect().height > window.innerHeight * 2 && consoleEl.children[1]) {
        consoleEl.children[0].remove();
    }
    consoleEl.scrollTop = consoleEl.scrollHeight;
}

console.log = intercept('log');
console.warn = intercept('warn');
console.error = intercept('error');
console.log('Hi Ivan!');
showHideConsole();
