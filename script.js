// ═══════════════════════════════════════════════════════════
// 🔧 CONFIG
// ═══════════════════════════════════════════════════════════
const BACKEND_URL = "https://ic-trainer-backend.vercel.app/api/check-circuit"; 

// ═══════════════════════════════════════════════════════════
// 📦 STATE
// ═══════════════════════════════════════════════════════════
const state = {
    inputs: {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0, clk:0},
    outputs: {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0},
    ics: {},
    wires: [],
    memory: {}, 
    isReset: false,
    lastClk: 0 // 👈 Used to track edge-triggering for the 7474
};

const gateDefinitions = {
    '7408':  [[3,1,2,'AND'],  [6,4,5,'AND'],  [8,9,10,'AND'],  [11,12,13,'AND']],
    '7432':  [[3,1,2,'OR'],   [6,4,5,'OR'],   [8,9,10,'OR'],   [11,12,13,'OR']],
    '7400':  [[3,1,2,'NAND'], [6,4,5,'NAND'], [8,9,10,'NAND'], [11,12,13,'NAND']],
    '7486':  [[3,1,2,'XOR'],  [6,4,5,'XOR'],  [8,9,10,'XOR'],  [11,12,13,'XOR']],
    '74266': [[3,1,2,'XNOR'], [6,4,5,'XNOR'], [8,9,10,'XNOR'], [11,12,13,'XNOR']],
    '7402':  [[1,2,3,'NOR'],  [4,5,6,'NOR'],  [10,8,9,'NOR'],  [13,11,12,'NOR']],
    '7404':  [[2,1,null,'NOT'],[4,3,null,'NOT'],[6,5,null,'NOT'],
              [8,9,null,'NOT'],[10,11,null,'NOT'],[12,13,null,'NOT']],
    // 7474: [Q output, D input, CLK input, PRESET, CLEAR]
    // Using pinout: Gate 1: Q=5, D=2, CLK=3, PRE=1, CLR=4
    //               Gate 2: Q=9, D=12, CLK=11, PRE=13, CLR=10
    '7474':  [
        [5, 2, 3, 'DFF', 1, 4], 
        [9, 12, 11, 'DFF', 13, 10]
    ]
};

let isDrawingWire = false, startNode = null, tempPath = null, draggedICType = null;
const svg = document.getElementById("wireLayer"), mainArea = document.querySelector(".main-area");
const inRow = document.getElementById("inputRow"), outRow = document.getElementById("outputRow");

// Generate IO Pins
for (let i = 1; i <= 8; i++) {
    inRow.innerHTML += `<div class="io-item"><div class="io-label">IN${i}</div><div class="io-pin switch" id="sw-${i}" data-type="switch" data-id="${i}">0</div></div>`;
    outRow.innerHTML += `<div class="io-item"><div class="io-label">OUT${i}</div><div class="io-pin led" id="led-${i}" data-type="led" data-id="${i}"></div></div>`;
}

// Add Clock Button
inRow.innerHTML += `<div class="io-item"><div class="io-label" style="color:var(--accent); font-weight:bold;">CLK</div><div class="io-pin switch" id="sw-clk" data-type="clock" data-id="clk" style="border-color:var(--accent); color:var(--accent);">0</div></div>`;

document.getElementById('sw-clk').addEventListener('click', (e) => {
    if (!isDrawingWire) {
        state.inputs['clk'] = state.inputs['clk'] === 0 ? 1 : 0;
        e.target.textContent = state.inputs['clk'];
        e.target.classList.toggle('on', state.inputs['clk'] === 1);
        solveCircuit();
    }
});

document.getElementById("toggleWiresBtn").addEventListener("click", (e) => {
    svg.classList.toggle("hidden-wires");
    e.target.textContent = svg.classList.contains("hidden-wires") ? "Show Wires" : "Hide Wires";
});

document.getElementById("clearWiresBtn").addEventListener("click", () => {
    document.querySelectorAll(".wire").forEach(wire => wire.remove());
    state.wires = []; 
    state.isReset = true;
    solveCircuit();
});

const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

document.querySelectorAll('.ic-drag').forEach(ic => {
    if (isTouchDevice) ic.addEventListener('touchstart', (e) => { draggedICType = e.target.dataset.type; });
    else ic.addEventListener('dragstart', (e) => { e.dataTransfer.setData("text", e.target.dataset.type); });
});

document.querySelectorAll('.ic-slot').forEach(slot => {
    if (isTouchDevice) {
        slot.addEventListener('touchend', () => {
            if (draggedICType && !slot.classList.contains('dropped')) { createICInSlot(slot, draggedICType); draggedICType = null; }
        });
    } else {
        slot.addEventListener('dragover', (e) => e.preventDefault());
        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData("text");
            if (type && !slot.classList.contains('dropped')) createICInSlot(slot, type);
        });
    }
});

function createICInSlot(slot, type) {
    const slotId = slot.dataset.slot;
    slot.classList.add('dropped'); slot.innerHTML = ''; 
    const icBody = document.createElement('div');
    icBody.className = 'ic-body';
    
    icBody.addEventListener('dblclick', () => removeIC(slot, slotId));
    let lastTouch = 0;
    icBody.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouch < 300) { e.preventDefault(); removeIC(slot, slotId); }
        lastTouch = now;
    });

    icBody.innerHTML = `<div class="ic-notch"></div><div class="ic-title">${type}</div><div id="slot-${slotId}-pins" style="display:flex; flex-direction:column; height:100%; justify-content:space-between;"></div>`;
    slot.appendChild(icBody);
    const pinContainer = document.getElementById(`slot-${slotId}-pins`);

    for (let i = 0; i < 7; i++) {
        const row = document.createElement('div'); row.className = 'pin-row';
        row.innerHTML = `
            <div class="pin left" id="ic-${slotId}-pin-${1+i}" data-type="ic" data-slot="${slotId}" data-pin="${1+i}"><span class="pin-label">${1+i}</span></div>
            <div class="pin right" id="ic-${slotId}-pin-${14-i}" data-type="ic" data-slot="${slotId}" data-pin="${14-i}"><span class="pin-label">${14-i}</span></div>
        `;
        pinContainer.appendChild(row);
    }
    pinContainer.querySelectorAll('.pin').forEach(pin => attachWireEvents(pin));
    state.ics[slotId] = { type: type }; solveCircuit();
}

function removeIC(slot, slotId) {
    state.wires = state.wires.filter(w => {
        const isFrom = w.from.type === 'ic' && String(w.from.slot) === String(slotId);
        const isTo = w.to.type === 'ic' && String(w.to.slot) === String(slotId);
        if (isFrom || isTo) { w.path.remove(); return false; }
        return true;
    });
    slot.classList.remove('dropped'); slot.innerHTML = `<span class="slot-text">Slot ${slotId}</span>`;
    delete state.ics[slotId]; solveCircuit();
}

document.querySelectorAll('.io-pin').forEach(pin => {
    attachWireEvents(pin);
    if (pin.dataset.type === 'switch') {
        pin.addEventListener('click', (e) => {
            if (!isDrawingWire) {
                const id = pin.dataset.id;
                state.inputs[id] = state.inputs[id] === 0 ? 1 : 0;
                pin.textContent = state.inputs[id]; pin.classList.toggle('on', state.inputs[id] === 1);
                solveCircuit();
            }
        });
    }
});

function attachWireEvents(pinElement) {
    if (isTouchDevice) pinElement.addEventListener('touchstart', startWireTouch);
    else pinElement.addEventListener('mousedown', startWireMouse);
}

function startWireMouse(e) { if (e.button === 0) { e.stopPropagation(); beginDrawing(e.target.closest('.pin, .io-pin')); } }
function startWireTouch(e) { e.preventDefault(); beginDrawing(e.target.closest('.pin, .io-pin')); }

function beginDrawing(pinElement) {
    if (!pinElement) return;
    isDrawingWire = true;
    startNode = { element: pinElement, type: pinElement.dataset.type, id: pinElement.dataset.id || '', slot: pinElement.dataset.slot || '', pin: pinElement.dataset.pin || '', rect: pinElement.getBoundingClientRect() };
    tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tempPath.setAttribute("class", "wire"); tempPath.setAttribute("style", "stroke: var(--accent); pointer-events: none;");
    svg.appendChild(tempPath);
}

document.addEventListener(isTouchDevice ? 'touchmove' : 'mousemove', (e) => {
    if (!isDrawingWire) return;
    if (isTouchDevice) e.preventDefault();
    const clientX = isTouchDevice ? e.touches[0].clientX : e.clientX;
    const clientY = isTouchDevice ? e.touches[0].clientY : e.clientY;
    drawPath(tempPath, startNode.rect, { left: clientX, top: clientY, width: 0, height: 0 });
}, { passive: false });

document.addEventListener(isTouchDevice ? 'touchend' : 'mouseup', (e) => {
    if (!isDrawingWire) return;
    isDrawingWire = false;
    const clientX = isTouchDevice ? e.changedTouches[0].clientX : e.clientX;
    const clientY = isTouchDevice ? e.changedTouches[0].clientY : e.clientY;
    const targetPin = document.elementFromPoint(clientX, clientY)?.closest('.pin, .io-pin');

    if (targetPin && targetPin !== startNode.element) {
        const endNode = { element: targetPin, type: targetPin.dataset.type, id: targetPin.dataset.id || '', slot: targetPin.dataset.slot || '', pin: targetPin.dataset.pin || '', rect: targetPin.getBoundingClientRect() };
        drawPath(tempPath, startNode.rect, endNode.rect); tempPath.setAttribute("style", "");
        const newWire = { from: startNode, to: endNode, path: tempPath };
        state.wires.push(newWire);

        let lastTouch = 0;
        if (!isTouchDevice) tempPath.addEventListener('dblclick', (ev) => { ev.stopPropagation(); deleteWire(newWire); });
        else tempPath.addEventListener('touchend', (ev) => {
            const now = Date.now();
            if (now - lastTouch < 300) { ev.stopPropagation(); deleteWire(newWire); }
            lastTouch = now;
        });

        solveCircuit();
    } else { tempPath.remove(); }
});

function deleteWire(wireObj) {
    wireObj.path.remove(); state.wires = state.wires.filter(w => w !== wireObj); solveCircuit();
}

function drawPath(path, startRect, endRect) {
    const canvasRect = mainArea.getBoundingClientRect(), scrollLeft = mainArea.scrollLeft, scrollTop = mainArea.scrollTop;
    const x1 = startRect.left - canvasRect.left + startRect.width / 2 + scrollLeft;
    const y1 = startRect.top - canvasRect.top + startRect.height / 2 + scrollTop;
    const x2 = endRect.left - canvasRect.left + endRect.width / 2 + scrollLeft;
    const y2 = endRect.top - canvasRect.top + endRect.height / 2 + scrollTop;
    const dx = Math.abs(x2 - x1) * 0.5;
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
}

// ═══════════════════════════════════════════════════════════
// ⚡ THE SOLVER (Modified for 7474)
// ═══════════════════════════════════════════════════════════
function pinKey(source) {
    return `${source.type}|${source.slot || ''}|${source.pin || ''}|${source.id || ''}`;
}

function buildNets() {
    const parent = new Map();
    function find(x) {
        if (!parent.has(x)) parent.set(x, x);
        if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
        return parent.get(x);
    }
    function union(a, b) {
        const rootA = find(a), rootB = find(b);
        if (rootA !== rootB) parent.set(rootA, rootB);
    }
    state.wires.forEach(w => { union(pinKey(w.from), pinKey(w.to)); });
    
    const nets = new Map();
    function addToNet(source) {
        const key = pinKey(source);
        const root = find(key);
        if (!nets.has(root)) nets.set(root, []);
        nets.get(root).push(source);
    }
    state.wires.forEach(w => { addToNet(w.from); addToNet(w.to); });
    return { find, nets };
}

function getAllGates() {
    const all = [];
    Object.entries(state.ics).forEach(([slot, ic]) => {
        const definitions = gateDefinitions[ic.type];
        if (!definitions) return;
        definitions.forEach((def) => {
            all.push({ 
                slot: String(slot), 
                type: ic.type, 
                out: def[0], 
                a: def[1], 
                b: def[2], 
                operation: def[3], 
                pre: def[4], 
                clr: def[5],
                key: pinKey({ type: 'ic', slot: String(slot), pin: String(def[0]) }) 
            });
        });
    });
    return all;
}

function calculateGate(gate, a, b, preVal, clrVal, isRisingEdge, memVal) {
    // Handle async preset and clear first (Active LOW for 7474)
    if (clrVal === 0) return 0; 
    if (preVal === 0) return 1; 

    if (gate.operation === 'DFF') {
        // D Flip-Flop: Only updates on rising edge of clock
        if (isRisingEdge) {
            return a;
        } else {
            return memVal; // Hold previous state
        }
    }

    // Standard combinational logic
    switch (gate.operation) {
        case 'AND': return a & b; case 'OR': return a | b; case 'NAND': return Number(!(a & b));
        case 'NOR': return Number(!(a | b)); case 'XOR': return a ^ b; case 'XNOR': return Number(a === b);
        case 'NOT': return Number(!a); default: return 0;
    }
}

function solveCircuit() {
    if (state.isReset) { state.memory = {}; state.isReset = false; }

    const { find, nets } = buildNets();
    const gates = getAllGates();
    const gateValues = {};
    gates.forEach(g => { gateValues[g.key] = state.memory[g.key] ?? 0; });

    function getNetValue(source) {
        const key = pinKey(source);
        if (!nets.has(find(key))) return 0;
        const connected = nets.get(find(key));
        let value = 0;
        connected.forEach(node => {
            if (node.type === 'switch') value |= state.inputs[node.id] || 0;
            else if (node.type === 'clock') value |= state.inputs.clk || 0;
            else if (node.type === 'ic') {
                const icKey = pinKey(node);
                if (gateValues[icKey] !== undefined) value |= gateValues[icKey];
            }
        });
        return value;
    }

    let stable = false, passes = 0;
    const currentClk = state.inputs.clk;

    while (!stable && passes < 300) {
        stable = true; passes++;
        for (const gate of gates) {
            const a = getNetValue({ type: 'ic', slot: gate.slot, pin: String(gate.a) });
            const b = gate.b === null ? 0 : getNetValue({ type: 'ic', slot: gate.slot, pin: String(gate.b) });
            
            // For 7474
            const preVal = gate.pre ? getNetValue({ type: 'ic', slot: gate.slot, pin: String(gate.pre) }) : 1;
            const clrVal = gate.clr ? getNetValue({ type: 'ic', slot: gate.slot, pin: String(gate.clr) }) : 1;
            
            // Edge detection
            const isRisingEdge = (gate.operation === 'DFF' && currentClk === 1 && state.lastClk === 0);

            const result = calculateGate(gate, a, b, preVal, clrVal, isRisingEdge, gateValues[gate.key]);
            
            if (gateValues[gate.key] !== result) { gateValues[gate.key] = result; stable = false; }
        }
    }

    gates.forEach(g => { state.memory[g.key] = gateValues[g.key]; });

    // Update lastClk AFTER solving so the next solve knows if it was a rising edge
    state.lastClk = currentClk;

    for (let i = 1; i <= 8; i++) {
        const ledSource = { type: 'led', id: String(i), slot: '', pin: '' };
        const value = getNetValue(ledSource);
        state.outputs[i] = value;
        const led = document.getElementById(`led-${i}`);
        if (led) led.classList.toggle('on', value === 1);
    }
}

// ═══════════════════════════════════════════════════════════
// 🔌 NETLIST GENERATOR
// ═══════════════════════════════════════════════════════════
document.getElementById('netlistBtn').addEventListener('click', () => {
    if (state.wires.length === 0) return alert("No wires connected yet!");
    const modal = document.getElementById('ttModal'), body = document.getElementById('ttModalBody'), title = document.getElementById('ttModalTitle');
    modal.style.display = 'flex'; title.textContent = "🔌 Connection List";

    const connectionsMap = new Map();
    state.wires.forEach(wire => {
        const fromStr = formatNode(wire.from), toStr = formatNode(wire.to);
        if (!connectionsMap.has(fromStr)) connectionsMap.set(fromStr, []);
        if (!connectionsMap.has(toStr)) connectionsMap.set(toStr, []);
        connectionsMap.get(fromStr).push(toStr);
        connectionsMap.get(toStr).push(fromStr);
    });

    let html = `<div style="font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; line-height: 1.6;">`;
    Array.from(connectionsMap.keys()).sort().forEach(key => {
        const destinations = [...new Set(connectionsMap.get(key))];
        html += `<div style="padding: 6px 0; border-bottom: 1px solid #333;">
            <span style="color: var(--accent); font-weight: bold;">${key}</span>
            <span style="color: var(--muted); margin: 0 8px;">➜</span>
            <span style="color: #e7e9eb;">${destinations.join(', ')}</span>
        </div>`;
    });
    html += `</div>`;
    body.innerHTML = html;
});

function formatNode(node) {
    if (node.type === 'switch') return `IN${node.id}`;
    if (node.type === 'clock') return `CLK`;
    if (node.type === 'led') return `OUT${node.id}`;
    if (node.type === 'ic') return `Slot ${node.slot} (${state.ics[node.slot]?.type || 'IC'}) Pin ${node.pin}`;
    return 'Unknown';
}

// ═══════════════════════════════════════════════════════════
// 💾 SAVE & LOAD SYSTEM
// ═══════════════════════════════════════════════════════════
const saveBtn = document.getElementById('saveProjectBtn');
const loadSelect = document.getElementById('loadProjectSelect');

function updateLoadDropdown() {
    const projects = JSON.parse(localStorage.getItem('icTrainerProjects') || '{}');
    loadSelect.innerHTML = '<option value="">-- Load Project --</option>';
    Object.keys(projects).forEach(name => { loadSelect.innerHTML += `<option value="${name}">${name}</option>`; });
}
updateLoadDropdown();

saveBtn.addEventListener('click', () => {
    const projectName = prompt("Enter a name for this circuit:");
    if (!projectName) return;
    const projectData = {
        ics: state.ics,
        wires: state.wires.map(w => ({
            from: { type: w.from.type, id: w.from.id, slot: w.from.slot, pin: w.from.pin },
            to: { type: w.to.type, id: w.to.id, slot: w.to.slot, pin: w.to.pin }
        }))
    };
    const existingProjects = JSON.parse(localStorage.getItem('icTrainerProjects') || '{}');
    existingProjects[projectName] = projectData;
    localStorage.setItem('icTrainerProjects', JSON.stringify(existingProjects));
    updateLoadDropdown();
    alert(`Project "${projectName}" saved successfully! 💾`);
});

loadSelect.addEventListener('change', (e) => {
    const projectName = e.target.value;
    if (!projectName) return;
    const projects = JSON.parse(localStorage.getItem('icTrainerProjects') || '{}');
    const projectData = projects[projectName];
    if (!projectData) return;

    document.querySelectorAll(".wire").forEach(wire => wire.remove());
    document.querySelectorAll(".ic-slot").forEach(slot => {
        slot.classList.remove('dropped'); slot.innerHTML = `<span class="slot-text">Slot ${slot.dataset.slot}</span>`;
    });
    state.wires = []; state.ics = {}; state.isReset = true;

    Object.entries(projectData.ics).forEach(([slotId, icData]) => {
        const slot = document.querySelector(`.ic-slot[data-slot="${slotId}"]`);
        if (slot) createICInSlot(slot, icData.type);
    });

    setTimeout(() => {
        projectData.wires.forEach(savedWire => {
            const fromEl = document.getElementById(getPinId(savedWire.from));
            const toEl = document.getElementById(getPinId(savedWire.to));
            if (fromEl && toEl) {
                const fromRect = fromEl.getBoundingClientRect(), toRect = toEl.getBoundingClientRect();
                const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                tempPath.setAttribute("class", "wire");
                svg.appendChild(tempPath);
                drawPath(tempPath, fromRect, toRect);

                const startNode = { element: fromEl, ...savedWire.from, rect: fromRect };
                const endNode = { element: toEl, ...savedWire.to, rect: toRect };
                const newWire = { from: startNode, to: endNode, path: tempPath };
                state.wires.push(newWire);
                tempPath.addEventListener('dblclick', (ev) => { ev.stopPropagation(); deleteWire(newWire); });
            }
        });
        solveCircuit();
        alert(`Project "${projectName}" loaded! 🚀`);
        loadSelect.value = "";
    }, 100);
});

function getPinId(node) {
    if (node.type === 'switch') return `sw-${node.id}`;
    if (node.type === 'clock') return `sw-clk`;
    if (node.type === 'led') return `led-${node.id}`;
    if (node.type === 'ic') return `ic-${node.slot}-pin-${node.pin}`;
    return '';
}

// ═══════════════════════════════════════════════════════════
// 🧠 AI DEBUGGER
// ═══════════════════════════════════════════════════════════
document.getElementById('checkCircuitBtn').addEventListener('click', async () => {
    const expr = document.getElementById('targetExpr').value.trim().toUpperCase();
    if (!expr) return alert("Please enter a target expression first!");
    if (state.wires.length === 0) return alert("Your board is empty!");

    const hasOutput = state.wires.some(w => w.from.type === 'led' || w.to.type === 'led');
    if (!hasOutput) return alert("You must connect a wire to an Output LED before testing!");

    const btn = document.getElementById('checkCircuitBtn');
    const modal = document.getElementById('aiModal');
    const title = document.getElementById('aiModalTitle');
    const body = document.getElementById('aiModalBody');

    btn.textContent = "Testing...";
    btn.disabled = true;
    modal.style.display = 'flex';
    title.textContent = "Running 256 Tests...";
    title.style.color = "var(--accent)";
    body.innerHTML = "The JS Engine is checking all input combinations...";

    let cleanExpr = expr.split('=').pop().trim(); 
    cleanExpr = cleanExpr.replace(/\./g, ' && ')
                         .replace(/\+/g, ' || ')
                         .replace(/([A-H])(?=[A-H(])/g, '$1 && ')
                         .replace(/([A-H])\(/g, '$1 && (');

    let errorFound = null;

    for (let i = 0; i < 256; i++) {
        let binary = i.toString(2).padStart(8, '0'); 
        
        for(let v=0; v<8; v++) {
            state.inputs[v+1] = parseInt(binary[v]);
        }

        // Reset edge detection for truth table testing
        state.lastClk = 1; 
        state.inputs.clk = 0; 

        solveCircuit(); 
        const physicalOut = state.outputs[1]; 

        let mathOut = 0;
        try {
            mathOut = new Function('A','B','C','D','E','F','G','H', `return (${cleanExpr}) ? 1 : 0;`)
                      (state.inputs[1], state.inputs[2], state.inputs[3], state.inputs[4], state.inputs[5], state.inputs[6], state.inputs[7], state.inputs[8]);
        } catch(e) {
            title.textContent = "Syntax Error";
            body.innerHTML = `<span class='error-text'>Invalid Expression. Use format like AB + C or A.B + C</span>`;
            btn.textContent = "Check Wiring"; btn.disabled = false;
            return;
        }

        if (physicalOut !== mathOut) {
            errorFound = { input: binary, expected: mathOut, actual: physicalOut };
            break; 
        }
    }

    if (!errorFound) {
        title.textContent = "✅ Success!";
        body.innerHTML = "<span class='success-text'>Your physical wiring perfectly matches the expression for all combinations!</span>";
        btn.textContent = "Check Wiring"; 
        btn.disabled = false;
    } else {
        title.textContent = "❌ Circuit Failed";
        body.innerHTML = `<span class='error-text'>Your circuit failed at Inputs: ${errorFound.input}</span><br><br>
        Asking AI Tutor to find the mistake...`;

        try {
            const wiringData = state.wires.map(w => `${formatNode(w.from)} -> ${formatNode(w.to)}`).join('\n');
            const icsData = Object.keys(state.ics).map(slot => `Slot ${slot}: ${state.ics[slot].type}`).join('\n');

            const systemPrompt = `You are a digital logic tutor. 
            The user is trying to build: "${expr}".
            They failed at input combination: ${errorFound.input} (A=${errorFound.input[0]}, B=${errorFound.input[1]}, C=${errorFound.input[2]}, etc.).
            Expected Output: ${errorFound.expected}. Actual Output: ${errorFound.actual}.
            
            Here are the ICs they placed:\n${icsData}
            Here are their wires:\n${wiringData}
            
            Explain exactly what they wired wrong to cause this specific failure. Keep it under 40 words.`;

            const response = await fetch(BACKEND_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ systemPrompt: systemPrompt })
            });

            const data = await response.json();

            if (data.error) {
                body.innerHTML += `<br><br><span class='error-text'>Backend Error: ${data.error}</span>`;
            } else {
                const aiReply = data.choices[0].message.content;
                body.innerHTML += `<br><br><div style="background:rgba(109,168,153,0.1); padding:10px; border-left:3px solid var(--accent); font-size:0.85rem;"><b>AI Tutor:</b> ${aiReply}</div>`;
                
                state.wires.forEach(w => {
                    w.path.classList.add('error-flash');
                    setTimeout(() => w.path.classList.remove('error-flash'), 3000);
                });
            }

        } catch (error) {
            console.error("FETCH ERROR:", error);
            body.innerHTML += `<br><br><span class='error-text'>Network Error: ${error.message}</span>`;
        } finally {
            btn.textContent = "Check Wiring"; 
            btn.disabled = false;
        }
    }
});