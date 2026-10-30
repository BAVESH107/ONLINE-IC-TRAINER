// ==========================================
// 🧠 IC TRAINER ENGINE - FIXED
// ==========================================

// Wait for DOM to load before running
document.addEventListener("DOMContentLoaded", () => {
  renderIO();
  
  // Attach Clear Wire Button
  document.getElementById('clearWiresBtn').addEventListener('click', () => {
    document.querySelectorAll('.wire').forEach(w => w.remove());
    state.wires = [];
    solveCircuit();
  });
});

const state = {
  inputs: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
  outputs: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
  ics: {}, 
  wires: [] 
};

let isDrawingWire = false;
let startNode = null;
let tempPath = null;
const svg = document.getElementById('wireLayer');

// ==========================================
// 🎛️ UI GENERATION
// ==========================================
function renderIO() {
  const inRow = document.getElementById('inputRow');
  const outRow = document.getElementById('outputRow');

  inRow.innerHTML = '';
  outRow.innerHTML = '';

  for (let i = 1; i <= 8; i++) {
    // Inputs
    const inItem = document.createElement('div');
    inItem.className = 'io-item';
    inItem.innerHTML = `
      <div class="io-label">IN ${i}</div>
      <div class="io-pin switch" id="sw-${i}" data-type="switch" data-id="${i}" onclick="toggleSwitch(${i})">0</div>
    `;
    inRow.appendChild(inItem);

    // Outputs
    const outItem = document.createElement('div');
    outItem.className = 'io-item';
    outItem.innerHTML = `
      <div class="io-label">OUT ${i}</div>
      <div class="io-pin led" id="led-${i}" data-type="led" data-id="${i}"></div>
    `;
    outRow.appendChild(outItem);
  }

  document.querySelectorAll('.io-pin').forEach(pin => {
    pin.addEventListener('mousedown', startWire);
  });
}

window.toggleSwitch = function(id) {
  state.inputs[id] = state.inputs[id] === 0 ? 1 : 0;
  const el = document.getElementById(`sw-${id}`);
  el.textContent = state.inputs[id];
  el.classList.toggle('on', state.inputs[id] === 1);
  solveCircuit();
}

// ==========================================
// 📦 DRAG AND DROP ICS (FIXED)
// ==========================================
window.allowDrop = function(ev) {
  ev.preventDefault();
}

window.dragIC = function(ev) {
  ev.dataTransfer.setData("text", ev.target.dataset.type);
}

window.dropIC = function(ev) {
  ev.preventDefault();
  const type = ev.dataTransfer.getData("text");
  
  // Find the slot we dropped on
  const slot = ev.target.closest('.ic-slot');
  
  if (!slot || slot.classList.contains('dropped')) return;

  const slotId = slot.dataset.slot;
  slot.classList.add('dropped');
  slot.innerHTML = ''; 

  // Create IC Body
  const icBody = document.createElement('div');
  icBody.className = 'ic-body';
  icBody.innerHTML = `
    <div class="ic-notch"></div>
    <div class="ic-title">${type}</div>
    <div id="slot-${slotId}-pins" style="display:flex; flex-direction:column; height:100%; justify-content:space-between;"></div>
  `;
  slot.appendChild(icBody);

  const pinContainer = document.getElementById(`slot-${slotId}-pins`);

  for (let i = 0; i < 10; i++) {
    const leftPin = 1 + i;
    const rightPin = 20 - i;

    const row = document.createElement('div');
    row.className = 'pin-row';
    row.innerHTML = `
      <div class="pin left" id="ic-${slotId}-pin-${leftPin}" data-type="ic" data-slot="${slotId}" data-pin="${leftPin}">
        <span class="pin-label">${leftPin}</span>
      </div>
      <div class="pin right" id="ic-${slotId}-pin-${rightPin}" data-type="ic" data-slot="${slotId}" data-pin="${rightPin}">
        <span class="pin-label">${rightPin}</span>
      </div>
    `;
    pinContainer.appendChild(row);
  }

  pinContainer.querySelectorAll('.pin').forEach(pin => {
    pin.addEventListener('mousedown', startWire);
  });

  state.ics[slotId] = { type: type };
  solveCircuit();
}

// ==========================================
// 🔌 WIRING LOGIC (FIXED)
// ==========================================
function startWire(e) {
  e.stopPropagation();
  isDrawingWire = true;
  
  // Get the actual pin element (in case we clicked a label)
  const pinElement = e.target.closest('.pin, .io-pin');
  if (!pinElement) return;

  startNode = {
    element: pinElement,
    type: pinElement.dataset.type,
    id: pinElement.dataset.id,
    slot: pinElement.dataset.slot,
    pin: pinElement.dataset.pin,
    rect: pinElement.getBoundingClientRect()
  };

  tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  tempPath.setAttribute("class", "wire");
  tempPath.setAttribute("style", "stroke: var(--primary); pointer-events: none;");
  svg.appendChild(tempPath);
}

document.addEventListener('mousemove', (e) => {
  if (!isDrawingWire) return;
  drawPath(tempPath, startNode.rect, { left: e.clientX, top: e.clientY, width: 0, height: 0 });
});

document.addEventListener('mouseup', (e) => {
  if (!isDrawingWire) return;
  isDrawingWire = false;

  const targetElement = document.elementFromPoint(e.clientX, e.clientY);
  const targetPin = targetElement ? targetElement.closest('.pin, .io-pin') : null;

  if (targetPin && targetPin !== startNode.element) {
    const endNode = {
      element: targetPin,
      type: targetPin.dataset.type,
      id: targetPin.dataset.id,
      slot: targetPin.dataset.slot,
      pin: targetPin.dataset.pin,
      rect: targetPin.getBoundingClientRect()
    };

    drawPath(tempPath, startNode.rect, endNode.rect);
    tempPath.setAttribute("style", ""); 
    
    const newWire = { from: startNode, to: endNode, path: tempPath };
    state.wires.push(newWire);

    tempPath.addEventListener('click', () => {
      tempPath.remove();
      state.wires = state.wires.filter(w => w !== newWire);
      solveCircuit();
    });

    solveCircuit();
  } else {
    tempPath.remove();
  }
});

function drawPath(path, startRect, endRect) {
  const canvasRect = document.querySelector('.canvas').getBoundingClientRect();
  
  const x1 = startRect.left - canvasRect.left + startRect.width / 2;
  const y1 = startRect.top - canvasRect.top + startRect.height / 2;
  const x2 = endRect.left - canvasRect.left + endRect.width / 2;
  const y2 = endRect.top - canvasRect.top + endRect.height / 2;

  const dx = Math.abs(x2 - x1) * 0.5;
  path.setAttribute("d", `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
}

// ==========================================
// 🧠 THE SOLVER 
// ==========================================
function solveCircuit() {
  for (let i = 1; i <= 8; i++) state.outputs[i] = 0;

  const getICPinValue = (slotId, pinNum) => {
    const wire = state.wires.find(w => 
      (w.from.type === 'ic' && w.from.slot === slotId && w.from.pin === String(pinNum)) ||
      (w.to.type === 'ic' && w.to.slot === slotId && w.to.pin === String(pinNum))
    );

    if (!wire) return 0;

    const otherEnd = (wire.from.type === 'ic' && wire.from.slot === slotId && wire.from.pin === String(pinNum)) ? wire.to : wire.from;
    if (otherEnd.type === 'switch') return state.inputs[otherEnd.id];
    return 0; 
  };

  for (const slotId in state.ics) {
    const ic = state.ics[slotId];
    
    if (ic.type === '7408') { 
      const outVal = (getICPinValue(slotId, 1) && getICPinValue(slotId, 2)) ? 1 : 0;
      updateConnectedLEDs(slotId, 3, outVal);
    }
    
    if (ic.type === '7432') { 
      const outVal = (getICPinValue(slotId, 1) || getICPinValue(slotId, 2)) ? 1 : 0;
      updateConnectedLEDs(slotId, 3, outVal);
    }

    if (ic.type === '7404') { 
      const outVal = getICPinValue(slotId, 1) ? 0 : 1;
      updateConnectedLEDs(slotId, 2, outVal);
    }
  }

  for (let i = 1; i <= 8; i++) {
    const led = document.getElementById(`led-${i}`);
    if (led) {
      led.classList.toggle('on', state.outputs[i] === 1);
    }
  }
}

function updateConnectedLEDs(slotId, outputPin, val) {
  state.wires.forEach(w => {
    let otherEnd = null;
    if (w.from.type === 'ic' && w.from.slot === slotId && w.from.pin === String(outputPin)) otherEnd = w.to;
    if (w.to.type === 'ic' && w.to.slot === slotId && w.to.pin === String(outputPin)) otherEnd = w.from;

    if (otherEnd && otherEnd.type === 'led') {
      state.outputs[otherEnd.id] = val;
    }
  });
}