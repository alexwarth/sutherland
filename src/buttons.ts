const BUTTONS = [
    ['1',     '2'],
    ['3',     '4'],
    ['5',     '6'],
    ['LINE',  'ARC'],
    ['MOVE',  'EQ'],
    ['HORV',  'FIX'],
    ['SIZE',  'WGHT'],
    ['DISM',  'ATT'],
    ['DEL',   'CLR'],
    ['SOLV', 'TIME'],
];

const KEYS = {
    'LINE': 'cmd',
    'ARC': 'A',
    'DEL': 'backspace',
    'HORV': 'H',
    'DISM': 'Shift-D',
    'ATT': 'Shift-A',
    'EQ': 'E',
    'FIX': '.',
    'SOLV': 'space',
    'WGHT': 'Shift-W',
};

export function init(buttons: HTMLDivElement) {
    const buttonBox = document.createElement('div');
    buttons.appendChild(buttonBox);

    BUTTONS.forEach(row => {
        const buttonRow = document.createElement('div');
        row.forEach(label => {
            const b = document.createElement('div');
            b.innerText = label;
            b.onclick = () => console.log(label);
            if (!isTouch()) {
                const key = KEYS[label];
                if (key) {
                    const label = document.createElement('div');
                    label.innerText = key;
                    b.appendChild(label);
                }
            }

            buttonRow.appendChild(b);
        });
        buttonBox.appendChild(buttonRow);
    });
}


function isTouch() {
    return 'ontouchstart' in window;
}
