// Global state
let tableData = JSON.parse(JSON.stringify(TABLE_DATA));
let headers = [...TABLE_HEADERS];
let zoomLevels = { fixTable: 1, resultsTable: 1 };
let lastResults = null;

document.addEventListener('DOMContentLoaded', () => {
    renderFixTable();
    setupZoom();
    document.getElementById('searchInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
    });
});

// ============ ZOOM ============
function setupZoom() {
    ['fixTableWrapper', 'resultsTableWrapper'].forEach(id => {
        const wrapper = document.getElementById(id);
        if (!wrapper) return;
        wrapper.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const key = id.replace('Wrapper', '');
                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                zoomLevels[key] = Math.max(0.3, Math.min(3, zoomLevels[key] + delta));
                applyZoom(key);
            }
        }, { passive: false });
    });
}
function zoomIn(t) { zoomLevels[t] = Math.min(3, zoomLevels[t] + 0.15); applyZoom(t); }
function zoomOut(t) { zoomLevels[t] = Math.max(0.3, zoomLevels[t] - 0.15); applyZoom(t); }
function zoomReset(t) { zoomLevels[t] = 1; applyZoom(t); }
function applyZoom(t) {
    const wrapper = document.getElementById(t + 'Wrapper');
    if (!wrapper) return;
    const inner = wrapper.querySelector('.table-inner');
    if (inner) inner.style.transform = `scale(${zoomLevels[t]})`;
}

// ============ BUILD TABLE HELPER ============
function buildTable(wrapperId, tableId, highlightMap) {
    const wrapper = document.getElementById(wrapperId);
    wrapper.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'table-inner';
    const table = document.createElement('table');
    table.id = tableId;

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const rn = document.createElement('th');
    rn.textContent = 'No.';
    rn.className = 'row-number';
    hr.appendChild(rn);
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tableData.forEach((row, ri) => {
        const tr = document.createElement('tr');
        const rnTd = document.createElement('td');
        rnTd.className = 'row-number';
        rnTd.textContent = ri + 1;
        tr.appendChild(rnTd);
        row.forEach((cell, ci) => {
            const td = document.createElement('td');
            td.textContent = cell;
            td.setAttribute('data-row', ri);
            td.setAttribute('data-col', ci);
            const key = `${ri}-${ci}`;
            if (highlightMap && highlightMap[key]) {
                td.className = `highlight-${highlightMap[key]}`;
            } else if (!highlightMap) {
                td.className = 'editable';
                td.onclick = () => editCell(ri, ci, td);
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    inner.appendChild(table);
    wrapper.appendChild(inner);
    return { wrapper, table, inner };
}

// ============ FIX TABLE ============
function renderFixTable() {
    buildTable('fixTableWrapper', 'fixTable', null);
}

function editCell(ri, ci, td) {
    const cur = tableData[ri][ci];
    const input = document.createElement('input');
    input.type = 'text';
    input.value = cur;
    input.style.cssText = 'width:40px;text-align:center;background:#0f3460;color:#fff;border:1px solid #00d4ff;';
    input.onblur = () => {
        let v = input.value.trim();
        if (v !== '') { try { v = String(parseInt(v)).padStart(3, '0'); } catch (e) {} }
        tableData[ri][ci] = v;
        td.textContent = v;
    };
    input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
    td.textContent = '';
    td.appendChild(input);
    input.focus();
}

function addColumn() {
    const h = prompt('Enter new column name:');
    if (h === null) return;
    headers.push(h);
    tableData.forEach(r => r.push('000'));
    renderFixTable();
    if (lastResults) performSearch();
}

// ============ SEARCH: gap=sum ============
function performSearch() {
    const input = document.getElementById('searchInput').value.trim();
    if (!input) return;

    const m = input.match(/^(\d+)\s*=\s*(\d{1,3})$/);
    if (!m) {
        alert('Invalid format. Use: gap=sum  e.g. 7=789');
        return;
    }
    const gap = parseInt(m[1]);
    const sumStr = m[2].padStart(3, '0');

    if (gap < 0 || gap > 15) {
        alert('Gap must be between 0 and 15.');
        return;
    }

    const sumDigits = sumStr.split('').map(Number);
    const matches = findPlusSquares(gap, sumDigits);

    // Build highlight map: cell A (yellow) and cell B (green)
    const highlightMap = {};
    matches.forEach(mt => {
        highlightMap[`${mt.aRow}-${mt.aCol}`] = 'a';
        highlightMap[`${mt.bRow}-${mt.bCol}`] = 'b';
    });

    lastResults = { gap, sumStr, matches };

    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('resultsDesc').textContent =
        `Gap = ${gap}, Sum = ${sumStr}. Found ${matches.length} pair(s). Yellow = first cell, Green = paired cell (gap rows away, continuing across columns).`;

    const built = buildTable('resultsTableWrapper', 'resultsTable', highlightMap);
    setTimeout(() => drawPairLines(built.wrapper, built.table, built.inner, matches), 200);
}

// Find pairs where cellA + cellB == sum, B is `gap` rows after A (continuing to next column on overflow)
function findPlusSquares(gap, sumDigits) {
    const matches = [];
    const numRows = tableData.length; // 24
    const numCols = headers.length;

    for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
            // Compute the paired cell position: gap rows after (row, col)
            // Linear position within the column-flow
            let targetLinear = col * numRows + row + gap;
            const bCol = Math.floor(targetLinear / numRows);
            const bRow = targetLinear % numRows;

            if (bCol >= numCols) continue; // beyond table

            const aVal = tableData[row][col];
            const bVal = tableData[bRow][bCol];
            if (!aVal || !bVal || aVal.length < 3 || bVal.length < 3) continue;

            // digit-wise add per position
            const d0 = parseInt(aVal[0]) + parseInt(bVal[0]);
            const d1 = parseInt(aVal[1]) + parseInt(bVal[1]);
            const d2 = parseInt(aVal[2]) + parseInt(bVal[2]);

            if (d0 === sumDigits[0] && d1 === sumDigits[1] && d2 === sumDigits[2]) {
                matches.push({
                    aRow: row, aCol: col,
                    bRow: bRow, bCol: bCol,
                    aVal, bVal
                });
            }
        }
    }
    return matches;
}

// ============ DRAW BLUE LINES BETWEEN PAIRS ============
function drawPairLines(wrapper, table, inner, matches) {
    const existing = inner.querySelector('.svg-overlay');
    if (existing) existing.remove();
    if (!matches || matches.length === 0) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('svg-overlay');
    svg.style.width = table.scrollWidth + 'px';
    svg.style.height = table.scrollHeight + 'px';
    svg.setAttribute('width', table.scrollWidth);
    svg.setAttribute('height', table.scrollHeight);

    const tableRect = table.getBoundingClientRect();

    matches.forEach(mt => {
        const aCell = getTableCell(table, mt.aRow, mt.aCol);
        const bCell = getTableCell(table, mt.bRow, mt.bCol);
        if (aCell && bCell) {
            svg.appendChild(makeLine(aCell, bCell, tableRect));
        }
    });

    inner.appendChild(svg);
}

function getTableCell(table, rowIdx, colIdx) {
    const rows = table.querySelectorAll('tbody tr');
    if (rowIdx < 0 || rowIdx >= rows.length) return null;
    const cells = rows[rowIdx].querySelectorAll('td');
    if (colIdx + 1 >= cells.length) return null;
    return cells[colIdx + 1];
}

function makeLine(c1, c2, tableRect) {
    const r1 = c1.getBoundingClientRect();
    const r2 = c2.getBoundingClientRect();
    const x1 = r1.left - tableRect.left + r1.width / 2;
    const y1 = r1.top - tableRect.top + r1.height / 2;
    const x2 = r2.left - tableRect.left + r2.width / 2;
    const y2 = r2.top - tableRect.top + r2.height / 2;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#007bff');
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-opacity', '0.85');
    line.setAttribute('stroke-linecap', 'round');
    return line;
}
