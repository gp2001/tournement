// Global variables
let tournamentData = {};
let currentTab = 'groupa';

// Google Sheets configuration (PRIMARY DATA SOURCE - no CORS issues!)
// Your Google Sheets: https://docs.google.com/spreadsheets/d/1eoNSjljsRO9ekIcDHeMTM2e4E9cuitG5iCvN5kDyygI/edit?usp=sharing
const GOOGLE_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1eoNSjljsRO9ekIcDHeMTM2e4E9cuitG5iCvN5kDyygI/export?format=xlsx';

// OneDrive file configuration (fallback)
const ONEDRIVE_EMBED_URL = 'https://onedrive.live.com/embed?resid=3803F96A79A37673%21110&authkey=%21AFlqWi8_9ubQqLWo729UnmhAaOio_ELKwuPB5St6n2YbAo&em=2';
const ONEDRIVE_DOWNLOAD_URL = ONEDRIVE_EMBED_URL.replace('embed', 'download').replace('&em=2', '');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    updateLastUpdated();
    // Try to auto-load data
    loadFromOneDrive();
});

function setupEventListeners() {

    // Load default data button
    document.getElementById('load-default').addEventListener('click', loadDefaultFile);

    // Tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
}


function loadFromOneDrive() {
    // Show loading state
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading"><p>📥 Loading tournament data...</p><p class="loading-hint">Trying Google Sheets...</p></div>';

    // Try Google Sheets first (BEST - no CORS issues!)
    console.log('🌐 Attempting to load from Google Sheets...');
    fetch(GOOGLE_SHEETS_URL)
        .then(response => {
            if (response.ok) {
                console.log('✅ Loading from Google Sheets!');
                return response.arrayBuffer();
            }
            throw new Error('Google Sheets not accessible: ' + response.status);
        })
        .then(data => {
            console.log('✅ Data loaded from Google Sheets, parsing...');
            const workbook = XLSX.read(data, { type: 'array' });
            parseWorkbook(workbook);
            updateLastUpdated({ name: 'Google Sheets', source: 'cloud', modified: new Date().toLocaleString() });
        })
        .catch(error => {
            console.log('⚠️ Google Sheets failed:', error.message);
            console.log('📁 Trying local file as fallback...');

            // Try local file as fallback
            fetch('Competitie.xlsx')
                .then(response => {
                    if (response.ok) {
                        console.log('✅ Loading from local file...');
                        return response.arrayBuffer();
                    }
                    throw new Error('Local file not found');
                })
                .then(data => {
                    console.log('✅ Data loaded from local file');
                    const workbook = XLSX.read(data, { type: 'array' });
                    parseWorkbook(workbook);
                    updateLastUpdated({ name: 'Competitie.xlsx', source: 'local' });
                })
                .catch(error => {
                    console.log('❌ All automatic loading failed');
                    showError(`<h3 style="margin-top: 0;">📊 Tournament Stand</h3>
                        <p><strong>Unable to load tournament data.</strong></p>
                        <hr style="margin: 1.5rem 0; opacity: 0.3;">
                        <p style="font-size: 0.9rem; color: #666;">
                            <strong>Google Sheets is not accessible.</strong><br><br>
                            Please make sure the Google Sheet is <strong>published to web</strong>:<br>
                            File → Share → Publish to web → Format: "Microsoft Excel (.xlsx)" → Publish
                        </p>
                        <p style="margin-top: 1rem;">
                            <a href="https://docs.google.com/spreadsheets/d/1eoNSjljsRO9ekIcDHeMTM2e4E9cuitG5iCvN5kDyygI/edit?usp=sharing" target="_blank" style="color: #0033A0; text-decoration: underline;">📊 Open Google Sheets</a>
                        </p>`);
                });
        });
}

function loadDefaultFile() {
    loadFromOneDrive();
}

function parseWorkbook(workbook) {
    tournamentData = {};

    // Map sheet names to our tab identifiers (match actual Excel sheet names!)
    const sheetMapping = {
        'GroupA': 'groupa',
        'GroupB': 'groupb',
        'GroupC': 'groupc',
        'Dames': 'dames'
    };

    console.log('Available sheets:', workbook.SheetNames);

    // Process each sheet
    workbook.SheetNames.forEach(sheetName => {
        // Skip Options sheet
        if (sheetName === 'Options') {
            console.log('Skipping Options sheet');
            return;
        }

        const tabId = sheetMapping[sheetName] || sheetName.toLowerCase().replace(/\s+/g, '');
        const sheet = workbook.Sheets[sheetName];
        const displayName = sheetName.replace('Group', 'Group '); // Add space for display
        tournamentData[tabId] = parseSheet(sheet, displayName);
    });

    console.log('Parsed tournament data:', Object.keys(tournamentData));

    // Display the current tab
    displayContent();
}

function parseSheet(sheet, sheetName) {
    // Read the sheet as JSON with row data (0-based indexing)
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

    const result = {
        name: sheetName,
        teams: [],
        standings: [],
        matches: []
    };

    console.log(`\n=== Parsing ${sheetName} ===`);
    console.log(`Total rows in sheet: ${data.length}`);

    // DEBUG: Show first 20 rows to see the actual structure
    console.log('DEBUG: First 20 rows:');
    for (let i = 0; i < Math.min(20, data.length); i++) {
        const rowPreview = data[i].slice(0, 16).map(cell => {
            if (cell === null || cell === undefined || cell === '') return '-';
            const str = String(cell);
            return str.length > 20 ? str.substring(0, 20) + '...' : str;
        });
        console.log(`  Row ${i} (Excel ${i+1}):`, rowPreview);
    }

    // Excel cell references (1-based) → JavaScript array indices (0-based)
    // Let's check all possible row ranges to find the data

    // Parse matches - try different row ranges
    console.log('\nLooking for matches...');
    for (let startRow = 10; startRow <= 15; startRow++) {
        if (data[startRow] && data[startRow][0] && String(data[startRow][0]).toLowerCase().includes('round')) {
            console.log(`Found ROUND at row ${startRow} (Excel row ${startRow+1})`);
            // Matches should be in the next rows
            for (let rowIdx = startRow + 1; rowIdx <= startRow + 6; rowIdx++) {
                if (!data[rowIdx]) continue;

                const row = data[rowIdx];
                const home = row[0] ? String(row[0]).trim() : '';
                const away = row[1] ? String(row[1]).trim() : '';

                console.log(`  Row ${rowIdx}: home="${home}", away="${away}"`);

                // Skip if no valid team names or if it's header text
                if (!home || !away || home.toLowerCase().includes('round') || away.toLowerCase().includes('round')) {
                    continue;
                }

                const homeScore = row[2];
                const awayScore = row[4];

                const match = {
                    home: home,
                    away: away,
                    homeScore: (homeScore !== undefined && homeScore !== null && homeScore !== '') ? homeScore : '-',
                    awayScore: (awayScore !== undefined && awayScore !== null && awayScore !== '') ? awayScore : '-'
                };

                result.matches.push(match);
                console.log(`    ✓ Match: ${home} ${match.homeScore} : ${match.awayScore} ${away}`);
            }
            break;
        }
    }

    // Parse standings - look for GP, W, D, L headers
    console.log('\nLooking for standings...');
    for (let rowIdx = 10; rowIdx <= 15; rowIdx++) {
        if (!data[rowIdx]) continue;

        const row = data[rowIdx];
        // Check if this row has GP, W, D, L, PTS headers
        const hasGP = row.some(cell => cell && String(cell).trim() === 'GP');
        const hasPTS = row.some(cell => cell && String(cell).trim() === 'PTS');

        if (hasGP && hasPTS) {
            console.log(`Found standings header at row ${rowIdx} (Excel row ${rowIdx+1})`);
            console.log(`  Header row:`, row.slice(7, 16));

            // Find column indices
            const gpCol = row.findIndex(h => h && String(h).trim() === 'GP');
            const teamCol = gpCol - 1; // Team should be one column before GP

            console.log(`  Team column: ${teamCol}, GP column: ${gpCol}`);

            // Read next 4-6 rows for team data
            for (let teamRowIdx = rowIdx + 1; teamRowIdx <= rowIdx + 6; teamRowIdx++) {
                if (!data[teamRowIdx]) continue;

                const teamRow = data[teamRowIdx];
                const teamName = teamRow[teamCol] ? String(teamRow[teamCol]).trim() : '';

                console.log(`  Row ${teamRowIdx}: col ${teamCol}="${teamName}", col ${gpCol}="${teamRow[gpCol]}"`);

                // Skip if no team name or if it's empty
                if (!teamName || teamName === '' || teamName === '-') {
                    continue;
                }

                const standing = {
                    position: result.standings.length + 1,
                    team: teamName,
                    gp: parseInt(teamRow[gpCol]) || 0,
                    w: parseInt(teamRow[gpCol + 1]) || 0,
                    d: parseInt(teamRow[gpCol + 2]) || 0,
                    l: parseInt(teamRow[gpCol + 3]) || 0,
                    gf: parseInt(teamRow[gpCol + 4]) || 0,
                    ga: parseInt(teamRow[gpCol + 5]) || 0,
                    gd: parseInt(teamRow[gpCol + 6]) || 0,
                    pts: parseInt(teamRow[gpCol + 7]) || 0
                };

                result.standings.push(standing);
                console.log(`    ✓ ${standing.position}. ${teamName}: GP=${standing.gp} W=${standing.w} D=${standing.d} L=${standing.l} GF=${standing.gf} GA=${standing.ga} GD=${standing.gd} PTS=${standing.pts}`);
            }
            break;
        }
    }

    console.log(`✅ ${sheetName}: ${result.standings.length} teams, ${result.matches.length} matches\n`);

    return result;
}

function displayContent() {
    const content = document.getElementById('content');

    if (Object.keys(tournamentData).length === 0) {
        content.innerHTML = '<div class="loading"><p>No data loaded yet.</p><p class="loading-hint">Click "Upload Excel File" to load the tournament data</p></div>';
        return;
    }

    // Create content for all tabs
    let html = '';

    for (const [tabId, data] of Object.entries(tournamentData)) {
        const isActive = tabId === currentTab;
        html += `
            <div class="group-content ${isActive ? 'active' : ''}" data-tab="${tabId}">
                <h2 class="group-title">${data.name}</h2>
                
                ${createStatsSection(data)}
                ${createStandingsSection(data)}
                ${createMatchesSection(data)}
            </div>
        `;
    }

    content.innerHTML = html;
}

function createStatsSection(data) {
    if (data.standings.length === 0) return '';

    const totalMatches = data.matches.filter(m => m.homeScore !== '-').length;
    const totalGoals = data.standings.reduce((sum, team) => sum + team.gf, 0);
    const teamsCount = data.standings.length;

    return `
        <div class="stats-summary">
            <div class="stat-card">
                <h3>Teams</h3>
                <div class="value">${teamsCount}</div>
            </div>
            <div class="stat-card">
                <h3>Matches Played</h3>
                <div class="value">${totalMatches}</div>
            </div>
            <div class="stat-card">
                <h3>Total Goals</h3>
                <div class="value">${totalGoals}</div>
            </div>
        </div>
    `;
}

function createStandingsSection(data) {
    if (data.standings.length === 0) {
        return '<p>No standings data available.</p>';
    }

    let html = `
        <div class="section">
            <h3 class="section-title">📊 Standings</h3>
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>Team</th>
                        <th>GP</th>
                        <th>W</th>
                        <th>D</th>
                        <th>L</th>
                        <th>GF</th>
                        <th>GA</th>
                        <th>GD</th>
                        <th>PTS</th>
                    </tr>
                </thead>
                <tbody>
    `;

    data.standings.forEach((team, index) => {
        let highlightClass = '';
        if (index === 0) highlightClass = 'highlight-first';
        else if (index === 1) highlightClass = 'highlight-second';

        html += `
            <tr class="${highlightClass}">
                <td class="position">${team.position}</td>
                <td class="team-name">${team.team}</td>
                <td>${team.gp}</td>
                <td>${team.w}</td>
                <td>${team.d}</td>
                <td>${team.l}</td>
                <td>${team.gf}</td>
                <td>${team.ga}</td>
                <td>${team.gd >= 0 ? '+' : ''}${team.gd}</td>
                <td><strong>${team.pts}</strong></td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    return html;
}

function createMatchesSection(data) {
    if (data.matches.length === 0) {
        return '';
    }

    let html = `
        <div class="section">
            <h3 class="section-title">⚽ Matches</h3>
            <table class="matches-table">
                <thead>
                    <tr>
                        <th>Home</th>
                        <th>Score</th>
                        <th>Away</th>
                    </tr>
                </thead>
                <tbody>
    `;

    data.matches.forEach(match => {
        const score = match.homeScore === '-'
            ? 'vs'
            : `${match.homeScore} : ${match.awayScore}`;

        html += `
            <tr>
                <td class="team-name">${match.home}</td>
                <td class="match-score">${score}</td>
                <td class="team-name">${match.away}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    return html;
}

function switchTab(tabId) {
    currentTab = tabId;

    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === tabId);
    });

    // Update content visibility
    document.querySelectorAll('.group-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tab === tabId);
    });
}

function showError(message) {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="error">
            <strong>⚠️ Error:</strong> ${message}
        </div>
    `;
}

function updateLastUpdated(fileInfo) {
    const now = new Date();
    let displayText = now.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    if (fileInfo) {
        if (fileInfo.source === 'cloud') {
            displayText += ` | Source: ${fileInfo.name} ☁️`;
        } else if (fileInfo.source === 'local') {
            displayText += ` | Source: ${fileInfo.name} 📁`;
        } else if (fileInfo.modified) {
            displayText += ` | File: ${fileInfo.name} (Modified: ${fileInfo.modified}) 📤`;
        }
    }

    document.getElementById('last-updated').textContent = displayText;
}

