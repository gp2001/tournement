// Global variables
let tournamentData = {};
let currentTab = 'groupa';

// Google Sheets configuration (PRIMARY DATA SOURCE - no CORS issues!)
// Your Google Sheets: https://docs.google.com/spreadsheets/d/1eoNSjljsRO9ekIcDHeMTM2e4E9cuitG5iCvN5kDyygI/edit?usp=sharing
const GOOGLE_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1eoNSjljsRO9ekIcDHeMTM2e4E9cuitG5iCvN5kDyygI/export?format=xlsx';

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
            console.log('❌ Unable to load Google Sheets:', error.message);
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
        'Dames': 'dames',
        'Playoffs': 'playoffs',
        'playoffs': 'playoffs'
    };

    console.log('Available sheets:', workbook.SheetNames);

    // Process each sheet
    workbook.SheetNames.forEach(sheetName => {
        // Skip Options sheet
        if (sheetName === 'Options') {
            console.log('Skipping Options sheet');
            return;
        }

        const normalizedName = sheetName.toLowerCase();
        const tabId = sheetMapping[sheetName] || normalizedName.replace(/\s+/g, '');
        const sheet = workbook.Sheets[sheetName];

        // Handle Playoffs sheet differently (case-insensitive)
        if (normalizedName === 'playoffs') {
            tournamentData[tabId] = parsePlayoffsSheet(sheet);
        } else {
            const displayName = sheetName.replace('Group', 'Group '); // Add space for display
            tournamentData[tabId] = parseSheet(sheet, displayName);
        }
    });

    console.log('Parsed tournament data:', Object.keys(tournamentData));

    // ALWAYS calculate qualified teams from current group standings
    console.log('🔄 Calculating qualified teams from current group standings...');
    const liveQualifiedTeams = calculateQualifiedTeams();

    const playoffsParsed = tournamentData.playoffs;
    const hasParsedSemis = playoffsParsed?.semiFinals?.length > 0;

    if (playoffsParsed) {
        // Use live qualified teams (always current)
        playoffsParsed.qualifiedTeams = liveQualifiedTeams;
        console.log('✅ Playoffs data merged:', {
            qualified: liveQualifiedTeams.length,
            semiFinals: hasParsedSemis ? playoffsParsed.semiFinals.length : 0,
            final: !!playoffsParsed?.final,
            thirdPlace: !!playoffsParsed?.thirdPlace
        });
    } else {
        // No playoffs sheet at all, generate everything
        console.log('⚠️ No playoffs sheet found, generating from group standings...');
        generatePlayoffs();
    }

    // Display the current tab
    displayContent();
}

function parsePlayoffsSheet(sheet) {
    console.log('\n=== Parsing playoffs ===');
    console.log('🔥 NEW CODE VERSION 5 - DIRECT ROW MAPPING 🔥');

    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

    const result = {
        name: '🏆 Knockout Stage',
        qualifiedTeams: [],
        semiFinals: [],
        final: null,
        thirdPlace: null,
        teams: [],
        standings: [],
        matches: []
    };

    // Show first 25 rows for debugging
    console.log('DEBUG: First 25 rows of Playoffs sheet:');
    for (let i = 0; i < Math.min(25, data.length); i++) {
        console.log(`  Row ${i} (Excel ${i+1}):`, data[i].slice(0, 10));
    }

    // Parse qualified teams (rows 4-8, 0-based)
    console.log('\n📊 Parsing Qualified Teams (rows 5-9):');
    for (let rowIdx = 4; rowIdx <= 8; rowIdx++) {
        const row = data[rowIdx] || [];
        const teamName = row[0] ? String(row[0]).trim() : '';
        const group = row[1] ? String(row[1]).trim().toLowerCase() : '';

        if (teamName && group && !teamName.toLowerCase().includes('team')) {
            result.qualifiedTeams.push({
                team: teamName,
                group,
                position: Number.parseInt(row[2]) || result.qualifiedTeams.length + 1,
                pts: Number.parseInt(row[3]) || 0,
                gd: Number.parseInt(row[4]) || 0,
                gf: Number.parseInt(row[5]) || 0
            });
            console.log(`  ✅ ${teamName} (${group}, pos ${result.qualifiedTeams[result.qualifiedTeams.length - 1].position})`);
        }
    }

    // Parse semi-finals (rows 13-14, 0-based indices)
    console.log('\n⚽ Parsing Semi-Finals (rows 14-15):');
    for (let rowIdx = 13; rowIdx <= 14; rowIdx++) {
        const row = data[rowIdx] || [];
        const home = row[0] ? String(row[0]).trim() : '';
        const away = row[1] ? String(row[1]).trim() : '';
        const sep = row[3] ? String(row[3]).trim() : '';

        console.log(`  🔍 Row ${rowIdx} (Excel ${rowIdx+1}): home="${home}", away="${away}", sep="${sep}"`);

        // Check if this is a header row (has "Home Team" or "Away Team" text, not just containing "home")
        const isHeaderRow = home.toLowerCase().includes('home team') || away.toLowerCase().includes('away team');

        console.log(`    isHeaderRow=${isHeaderRow}`);

        if (home && away && sep === ':' && !isHeaderRow) {
            const homeScoreRaw = row[2];
            const awayScoreRaw = row[4];
            const homeScore = homeScoreRaw !== undefined && homeScoreRaw !== '' ? String(homeScoreRaw).trim() : '-';
            const awayScore = awayScoreRaw !== undefined && awayScoreRaw !== '' ? String(awayScoreRaw).trim() : '-';

            result.semiFinals.push({
                home,
                away,
                homeScore,
                awayScore,
                homeGroup: '',
                awayGroup: '',
                matchName: `Semi-Final ${result.semiFinals.length + 1}`
            });
            console.log(`    ✅ SF${result.semiFinals.length}: ${home} ${homeScore} - ${awayScore} ${away}`);
        } else {
            console.log(`    ⏭️ SKIPPED because: home="${home}", away="${away}", sep="${sep}", isHeaderRow=${isHeaderRow}`);
        }
    }

    // Parse Final (row 19, 0-based)
    console.log('\n🏆 Parsing Final (row 20):');
    if (data[19]) {
        const row = data[19];
        const home = row[0] ? String(row[0]).trim() : '';
        const away = row[1] ? String(row[1]).trim() : '';
        const sep = row[3] ? String(row[3]).trim() : '';

        if (home && away && sep === ':' && !home.toLowerCase().includes('home')) {
            const homeScoreRaw = row[2];
            const awayScoreRaw = row[4];
            const homeScore = homeScoreRaw !== undefined && homeScoreRaw !== '' ? String(homeScoreRaw).trim() : '-';
            const awayScore = awayScoreRaw !== undefined && awayScoreRaw !== '' ? String(awayScoreRaw).trim() : '-';

            result.final = {
                home,
                away,
                homeScore,
                awayScore,
                matchName: 'Final'
            };
            console.log(`  ✅ Final: ${home} ${homeScore} - ${awayScore} ${away}`);
        }
    }

    // Parse 3rd Place (row 22, 0-based)
    console.log('\n🥉 Parsing 3rd Place (row 23):');
    if (data[22]) {
        const row = data[22];
        const home = row[0] ? String(row[0]).trim() : '';
        const away = row[1] ? String(row[1]).trim() : '';
        const sep = row[3] ? String(row[3]).trim() : '';

        if (home && away && sep === ':' && !home.toLowerCase().includes('home')) {
            const homeScoreRaw = row[2];
            const awayScoreRaw = row[4];
            const homeScore = homeScoreRaw !== undefined && homeScoreRaw !== '' ? String(homeScoreRaw).trim() : '-';
            const awayScore = awayScoreRaw !== undefined && awayScoreRaw !== '' ? String(awayScoreRaw).trim() : '-';

            result.thirdPlace = {
                home,
                away,
                homeScore,
                awayScore,
                matchName: '3rd Place'
            };
            console.log(`  ✅ 3rd Place: ${home} ${homeScore} - ${awayScore} ${away}`);
        }
    }

    console.log(`\n✅ Playoffs: ${result.qualifiedTeams.length} qualified, ${result.semiFinals.length} semi-finals, ${result.final ? 'final' : 'no final'}, ${result.thirdPlace ? '3rd place' : 'no 3rd place'}`);

    return result;
}

function calculateQualifiedTeams() {
    console.log('📊 Calculating qualified teams from group standings...');

    const qualifiedTeams = [];
    const secondPlaceTeams = [];

    // Get winners and runners-up from each boys group (Group A, B, C)
    ['groupa', 'groupb', 'groupc'].forEach(groupId => {
        if (tournamentData[groupId] && tournamentData[groupId].standings && tournamentData[groupId].standings.length > 0) {
            const standings = tournamentData[groupId].standings;

            // Group winner (1st place)
            if (standings[0] && standings[0].team) {
                const winner = {
                    team: standings[0].team,
                    group: groupId,
                    position: 1,
                    pts: standings[0].pts || 0,
                    gd: standings[0].gd || 0,
                    gf: standings[0].gf || 0
                };
                qualifiedTeams.push(winner);
                console.log(`  ✅ ${groupId.toUpperCase()} Winner: ${winner.team} (${winner.pts} pts, GD ${winner.gd})`);
            }

            // Runner-up (2nd place)
            if (standings[1] && standings[1].team) {
                const runnerUp = {
                    team: standings[1].team,
                    group: groupId,
                    position: 2,
                    pts: standings[1].pts || 0,
                    gd: standings[1].gd || 0,
                    gf: standings[1].gf || 0
                };
                secondPlaceTeams.push(runnerUp);
                console.log(`  🥈 ${groupId.toUpperCase()} Runner-up: ${runnerUp.team} (${runnerUp.pts} pts, GD ${runnerUp.gd})`);
            }
        }
    });

    // Sort second place teams to find the best one
    secondPlaceTeams.sort((a, b) => {
        // Sort by: Points > Goal Difference > Goals For
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        return b.gf - a.gf;
    });

    // Add best second place team to qualified teams
    if (secondPlaceTeams.length > 0) {
        const best2nd = secondPlaceTeams[0];
        qualifiedTeams.push(best2nd);
        console.log(`  🌟 Best 2nd Place: ${best2nd.team} from ${best2nd.group.toUpperCase()} (${best2nd.pts} pts, GD ${best2nd.gd})`);
    }

    console.log(`✅ Total Qualified: ${qualifiedTeams.length} teams`);
    return qualifiedTeams;
}

function generatePlayoffs() {
    console.log('🔄 Generating playoffs from group data...');

    // Use the shared calculation function
    const qualifiedTeams = calculateQualifiedTeams();

    // Create playoffs data structure
    tournamentData.playoffs = {
        name: '🏆 Knockout Stage',
        qualifiedTeams: qualifiedTeams,
        semiFinals: [],
        final: null,
        teams: [],
        standings: [],
        matches: []
    };

    // Generate semi-finals if we have 4 qualified teams
    // Rule: Teams from the same group cannot play each other
    if (qualifiedTeams.length >= 4) {
        const [team1, team2, team3, team4] = qualifiedTeams;

        // Check if the best 2nd place (team4) is from the same group as Group A winner (team1)
        const best2ndFromGroupA = team4.group === team1.group;

        if (best2ndFromGroupA) {
            // If best 2nd is from Group A, they can't play team1
            // Semi-final 1: Group A winner vs Group C winner
            tournamentData.playoffs.semiFinals.push({
                home: team1.team,
                away: team3.team,
                homeGroup: team1.group,
                awayGroup: team3.group,
                homeScore: '-',
                awayScore: '-',
                matchName: 'Semi-Final 1'
            });

            // Semi-final 2: Group B winner vs Best 2nd place
            tournamentData.playoffs.semiFinals.push({
                home: team2.team,
                away: team4.team,
                homeGroup: team2.group,
                awayGroup: team4.group,
                homeScore: '-',
                awayScore: '-',
                matchName: 'Semi-Final 2'
            });
        } else if (team4.group === team2.group) {
            // If best 2nd is from Group B, they can't play team2
            // Semi-final 1: Group A winner vs Group B winner
            tournamentData.playoffs.semiFinals.push({
                home: team1.team,
                away: team2.team,
                homeGroup: team1.group,
                awayGroup: team2.group,
                homeScore: '-',
                awayScore: '-',
                matchName: 'Semi-Final 1'
            });

            // Semi-final 2: Group C winner vs Best 2nd place
            tournamentData.playoffs.semiFinals.push({
                home: team3.team,
                away: team4.team,
                homeGroup: team3.group,
                awayGroup: team4.group,
                homeScore: '-',
                awayScore: '-',
                matchName: 'Semi-Final 2'
            });
        } else if (team4.group === team3.group) {
            // If best 2nd is from Group C, they can't play team3
            // Semi-final 1: Group A winner vs Best 2nd place
            tournamentData.playoffs.semiFinals.push({
                home: team1.team,
                away: team4.team,
                homeGroup: team1.group,
                awayGroup: team4.group,
                homeScore: '-',
                awayScore: '-',
                matchName: 'Semi-Final 1'
            });

            // Semi-final 2: Group B winner vs Group C winner
            tournamentData.playoffs.semiFinals.push({
                home: team2.team,
                away: team3.team,
                homeGroup: team2.group,
                awayGroup: team3.group,
                homeScore: '-',
                awayScore: '-',
                matchName: 'Semi-Final 2'
            });
        } else {
            // Default case (shouldn't happen with 3 groups, but just in case)
            // Semi-final 1: Group A winner vs Best 2nd place
            tournamentData.playoffs.semiFinals.push({
                home: team1.team,
                away: team4.team,
                homeGroup: team1.group,
                awayGroup: team4.group,
                homeScore: '-',
                awayScore: '-',
                matchName: 'Semi-Final 1'
            });

            // Semi-final 2: Group B winner vs Group C winner
            tournamentData.playoffs.semiFinals.push({
                home: team2.team,
                away: team3.team,
                homeGroup: team2.group,
                awayGroup: team3.group,
                homeScore: '-',
                awayScore: '-',
                matchName: 'Semi-Final 2'
            });
        }

        console.log('✅ Semi-finals generated with group separation:');
        console.log(`  SF1: ${tournamentData.playoffs.semiFinals[0].home} (${tournamentData.playoffs.semiFinals[0].homeGroup}) vs ${tournamentData.playoffs.semiFinals[0].away} (${tournamentData.playoffs.semiFinals[0].awayGroup})`);
        console.log(`  SF2: ${tournamentData.playoffs.semiFinals[1].home} (${tournamentData.playoffs.semiFinals[1].homeGroup}) vs ${tournamentData.playoffs.semiFinals[1].away} (${tournamentData.playoffs.semiFinals[1].awayGroup})`);

        // Placeholder for final
        tournamentData.playoffs.final = {
            home: 'Winner SF1',
            away: 'Winner SF2',
            homeScore: '-',
            awayScore: '-',
            matchName: 'Final'
        };
    }
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
        if (!data[startRow]) continue;

        // Check if any cell in this row contains "round" text
        const hasRoundHeader = data[startRow].some(cell =>
            cell && String(cell).toLowerCase().includes('round')
        );

        if (hasRoundHeader) {
            console.log(`Found ROUND at row ${startRow} (Excel row ${startRow+1})`);
            console.log(`  Header row content:`, data[startRow].slice(0, 10));

            // Matches should be in the next rows - read ALL matches until we hit empty rows or standings
            let emptyRowCount = 0;
            for (let rowIdx = startRow + 1; rowIdx < data.length && emptyRowCount < 3; rowIdx++) {
                if (!data[rowIdx]) {
                    emptyRowCount++;
                    continue;
                }

                const row = data[rowIdx];
                // New format: Location | Time | Home | Away | HomeScore | : | AwayScore
                const location = row[0] ? String(row[0]).trim() : '';
                const time = row[1] ? String(row[1]).trim() : '';
                const home = row[2] ? String(row[2]).trim() : '';
                const away = row[3] ? String(row[3]).trim() : '';

                // DEBUG: Show first 8 columns of this row
                console.log(`  Row ${rowIdx} data:`, row.slice(0, 8).map((cell, idx) =>
                    `[${idx}]="${cell === null || cell === undefined || cell === '' ? '-' : cell}"`
                ).join(' '));

                // Stop if we hit the standings section - but ONLY if GP/PTS is in the FIRST 4 columns
                // (matches can have standings headers in later columns)
                const firstFourCells = row.slice(0, 4);
                const hasStandingsHeaderInMatchArea = firstFourCells.some(cell =>
                    cell && (String(cell).trim() === 'GP' || String(cell).trim() === 'PTS')
                );
                if (hasStandingsHeaderInMatchArea) {
                    console.log(`  Stopped at row ${rowIdx}: Found standings section in first 4 columns`);
                    break;
                }

                console.log(`  Row ${rowIdx}: location="${location}", time="${time}", home="${home}", away="${away}"`);

                // Check if this is a completely empty row (no data in first 4 columns)
                const isCompletelyEmpty = !location && !time && !home && !away;
                if (isCompletelyEmpty) {
                    emptyRowCount++;
                    console.log(`    Empty row detected (${emptyRowCount}/3)`);
                    continue;
                }

                // Reset empty row counter when we find any data
                emptyRowCount = 0;

                // Skip if no valid team names or if it's header text
                if (!home || !away || home.toLowerCase().includes('round') || away.toLowerCase().includes('round')) {
                    console.log(`    Skipped: missing team names or header row`);
                    continue;
                }


                const homeScore = row[4];
                const awayScore = row[6];

                const match = {
                    location: location,
                    time: time,
                    home: home,
                    away: away,
                    homeScore: (homeScore !== undefined && homeScore !== null && homeScore !== '') ? homeScore : '-',
                    awayScore: (awayScore !== undefined && awayScore !== null && awayScore !== '') ? awayScore : '-'
                };

                result.matches.push(match);
                console.log(`    ✓ Match: ${location} ${time} - ${home} ${match.homeScore} : ${match.awayScore} ${away}`);
            }
            break;
        }
    }

    // If no matches found yet, try alternate approach - look for actual match data patterns
    if (result.matches.length === 0) {
        console.log('\n⚠️ No ROUND header found, trying alternate match detection...');
        let emptyRowCount = 0;
        for (let rowIdx = 11; rowIdx < Math.min(data.length, 50) && emptyRowCount < 3; rowIdx++) {
            if (!data[rowIdx]) {
                emptyRowCount++;
                continue;
            }

            const row = data[rowIdx];
            const col0 = row[0] ? String(row[0]).trim() : '';
            const col1 = row[1] ? String(row[1]).trim() : '';
            const col2 = row[2] ? String(row[2]).trim() : '';
            const col3 = row[3] ? String(row[3]).trim() : '';
            const col4 = row[4] ? String(row[4]).trim() : '';
            const col5 = row[5] ? String(row[5]).trim() : '';
            const col6 = row[6] ? String(row[6]).trim() : '';

            // Stop if we hit the standings section - but ONLY if GP/PTS is in the FIRST 4 columns
            const firstFourCells = row.slice(0, 4);
            const hasStandingsHeaderInMatchArea = firstFourCells.some(cell =>
                cell && (String(cell).trim() === 'GP' || String(cell).trim() === 'PTS')
            );
            if (hasStandingsHeaderInMatchArea) {
                console.log(`  Stopped at row ${rowIdx}: Found standings section in first 4 columns`);
                break;
            }

            // Check if this looks like a match row:
            // Option 1: Has location, time, both teams, AND colon in column 5
            // Option 2: Has location, time, both teams, AND scores in columns 4 and 6
            const hasColon = col5 === ':' || col5.includes(':');
            const hasScores = (col4 !== '' && col4 !== '-') || (col6 !== '' && col6 !== '-');
            const looksLikeMatch = col0 && col1 && col2 && col3 && (hasColon || hasScores);

            console.log(`  Row ${rowIdx} check: loc="${col0 ? '✓' : '✗'}" time="${col1 ? '✓' : '✗'}" home="${col2 ? '✓' : '✗'}" away="${col3 ? '✓' : '✗'}" col5="${col5}" hasColon=${hasColon} hasScores=${hasScores} → looksLikeMatch=${looksLikeMatch}`);

            if (looksLikeMatch && !col2.toLowerCase().includes('home team') && !col2.toLowerCase().includes('locatie') && !col2.toLowerCase().includes('round')) {
                console.log(`  ✅ Found match at row ${rowIdx}: ${col0} | ${col1} | ${col2} vs ${col3}`);
                emptyRowCount = 0; // Reset counter when we find a match

                const match = {
                    location: col0,
                    time: col1,
                    home: col2,
                    away: col3,
                    homeScore: (row[4] !== undefined && row[4] !== null && row[4] !== '') ? row[4] : '-',
                    awayScore: (row[6] !== undefined && row[6] !== null && row[6] !== '') ? row[6] : '-'
                };

                result.matches.push(match);
                console.log(`    ✓ Added: ${match.location} ${match.time} - ${match.home} ${match.homeScore} : ${match.awayScore} ${match.away}`);
            } else {
                if (!looksLikeMatch) {
                    console.log(`    ⏭️ Skipped: doesn't look like match (missing data or no colon)`);
                } else if (col2.toLowerCase().includes('home team') || col2.toLowerCase().includes('locatie') || col2.toLowerCase().includes('round')) {
                    console.log(`    ⏭️ Skipped: header row detected (col2="${col2}")`);
                }

                // Only count as empty if there's no data in first 4 columns
                if (!col0 && !col1 && !col2 && !col3) {
                    emptyRowCount++;
                    console.log(`    Empty row (${emptyRowCount}/3)`);
                }
            }
        }
    }

    console.log(`\n📊 Match parsing complete: Found ${result.matches.length} matches`);
    if (result.matches.length > 0) {
        console.log('Matches:', result.matches.map(m => `${m.home} vs ${m.away}`).join(', '));
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
        content.innerHTML = '<div class="loading"><p>No data loaded yet.</p><p class="loading-hint">Click "🔄 Reload Data" to load the tournament data</p></div>';
        return;
    }

    // Create content for all tabs
    let html = '';

    for (const [tabId, data] of Object.entries(tournamentData)) {
        const isActive = tabId === currentTab;

        // Special handling for playoffs tab
        if (tabId === 'playoffs') {
            html += `
                <div class="group-content ${isActive ? 'active' : ''}" data-tab="${tabId}">
                    <h2 class="group-title">${data.name}</h2>
                    ${createPlayoffsSection(data)}
                </div>
            `;
        } else {
            html += `
                <div class="group-content ${isActive ? 'active' : ''}" data-tab="${tabId}">
                    <h2 class="group-title">${data.name}</h2>
                    
                    ${createStatsSection(data)}
                    ${createStandingsSection(data)}
                    ${createMatchesSection(data)}
                </div>
            `;
        }
    }

    content.innerHTML = html;
}

function createPlayoffsSection(data) {
    if (!data.qualifiedTeams || data.qualifiedTeams.length === 0) {
        return `
            <div class="playoffs-info">
                <p><strong>🏆 Knockout Stage</strong></p>
                <p>The playoff bracket will be generated once all group stage matches are completed.</p>
                <br>
                <p><strong>Qualification Rules:</strong></p>
                <ul>
                    <li>✅ Winners of Group A, B, and C advance</li>
                    <li>✅ Best 2nd place team advances</li>
                    <li>📊 Best 2nd place is determined by: Points → Goal Difference → Goals For</li>
                </ul>
            </div>
        `;
    }

    let html = `
        <div class="playoffs-info">
            <p><strong>🎯 Qualified Teams</strong></p>
        </div>
        <div class="qualified-teams">
    `;

    // Display qualified teams
    data.qualifiedTeams.forEach((team, index) => {
        const groupName = team.group.replace('group', 'Group ').toUpperCase();
        const positionBadge = team.position === 1 ? '🥇 Winner' : '🥈 2nd Place (Best)';

        html += `
            <div class="qualified-team-card">
                <div class="team-badge">${index + 1}</div>
                <div class="team-info">
                    <div class="team-name-large">${team.team}</div>
                    <div class="team-stats">
                        ${groupName} - ${positionBadge}<br>
                        <small>PTS: ${team.pts} | GD: ${team.gd > 0 ? '+' : ''}${team.gd} | GF: ${team.gf}</small>
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;

    // Display bracket if semi-finals are available
    if (data.semiFinals && data.semiFinals.length > 0) {
        const sf1 = data.semiFinals[0];
        const sf2 = data.semiFinals[1] || null;
        const final = data.final;
        const thirdPlace = data.thirdPlace;

        // DEBUG: Log what scores we have
        console.log('🏆 Displaying bracket with scores:');
        console.log(`  SF1: ${sf1.home} ${sf1.homeScore} - ${sf1.awayScore} ${sf1.away}`);
        if (sf2) {
            console.log(`  SF2: ${sf2.home} ${sf2.homeScore} - ${sf2.awayScore} ${sf2.away}`);
        } else {
            console.log(`  SF2: Not yet populated`);
        }
        if (final) {
            console.log(`  Final: ${final.home} ${final.homeScore} - ${final.awayScore} ${final.away}`);
        } else {
            console.log(`  Final: Not yet populated`);
        }
        if (thirdPlace) {
            console.log(`  3rd Place: ${thirdPlace.home} ${thirdPlace.homeScore} - ${thirdPlace.awayScore} ${thirdPlace.away}`);
        }

        // Helper function to safely convert scores to numbers for comparison
        const scoreToNum = (score) => {
            if (score === '-' || score === null || score === undefined || score === '') return null;
            const num = Number(score);
            return isNaN(num) ? null : num;
        };

        // Convert scores to numbers for comparison
        const sf1HomeNum = scoreToNum(sf1.homeScore);
        const sf1AwayNum = scoreToNum(sf1.awayScore);
        const sf2HomeNum = sf2 ? scoreToNum(sf2.homeScore) : null;
        const sf2AwayNum = sf2 ? scoreToNum(sf2.awayScore) : null;
        const finalHomeNum = final ? scoreToNum(final.homeScore) : null;
        const finalAwayNum = final ? scoreToNum(final.awayScore) : null;

        html += `
            <div class="section">
                <h3 class="section-title">🏆 Tournament Bracket</h3>
                <div class="bracket-container">
                    <!-- Left Side: Semi-Final 1 -->
                    <div class="bracket-column">
                        <div class="bracket-round-title">Semi-Finals</div>
                        <div class="bracket-match">
                            <div class="bracket-team ${sf1HomeNum !== null && sf1AwayNum !== null && sf1HomeNum > sf1AwayNum ? 'winner' : ''}">
                                <span class="bracket-team-name">${sf1.home}</span>
                                <span class="bracket-score">${sf1.homeScore}</span>
                            </div>
                            <div class="bracket-connector"></div>
                            <div class="bracket-team ${sf1AwayNum !== null && sf1HomeNum !== null && sf1AwayNum > sf1HomeNum ? 'winner' : ''}">
                                <span class="bracket-team-name">${sf1.away}</span>
                                <span class="bracket-score">${sf1.awayScore}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Center: Lines to Final -->
                    <div class="bracket-lines">
                        <svg viewBox="0 0 100 200" preserveAspectRatio="none">
                            <path d="M 0 50 L 50 50 L 50 100 L 100 100" fill="none" stroke="#ddd" stroke-width="2"/>
                            <path d="M 0 150 L 50 150 L 50 100 L 100 100" fill="none" stroke="#ddd" stroke-width="2"/>
                        </svg>
                    </div>

                    <!-- Center: Final -->
                    <div class="bracket-column final-column">
                        <div class="bracket-round-title">🏆 Final</div>
                        <div class="bracket-match final-bracket-match">
                            ${final ? `
                            <div class="bracket-team ${finalHomeNum !== null && finalAwayNum !== null && finalHomeNum > finalAwayNum ? 'winner champion' : ''}">
                                <span class="bracket-team-name">${final.home}</span>
                                <span class="bracket-score">${final.homeScore}</span>
                            </div>
                            <div class="bracket-connector"></div>
                            <div class="bracket-team ${finalAwayNum !== null && finalHomeNum !== null && finalAwayNum > finalHomeNum ? 'winner champion' : ''}">
                                <span class="bracket-team-name">${final.away}</span>
                                <span class="bracket-score">${final.awayScore}</span>
                            </div>
                            ` : `
                            <div class="bracket-team">
                                <span class="bracket-team-name">Winner SF1</span>
                                <span class="bracket-score">-</span>
                            </div>
                            <div class="bracket-connector"></div>
                            <div class="bracket-team">
                                <span class="bracket-team-name">Winner SF2</span>
                                <span class="bracket-score">-</span>
                            </div>
                            `}
                        </div>
                    </div>

                    <!-- Right Side Lines from Final -->
                    <div class="bracket-lines">
                        <svg viewBox="0 0 100 200" preserveAspectRatio="none">
                            <path d="M 0 100 L 50 100 L 50 50 L 100 50" fill="none" stroke="#ddd" stroke-width="2"/>
                            <path d="M 0 100 L 50 100 L 50 150 L 100 150" fill="none" stroke="#ddd" stroke-width="2"/>
                        </svg>
                    </div>

                    <!-- Right Side: Semi-Final 2 -->
                    <div class="bracket-column">
                        <div class="bracket-round-title">Semi-Finals</div>
                        <div class="bracket-match">
                            ${sf2 ? `
                            <div class="bracket-team ${sf2HomeNum !== null && sf2AwayNum !== null && sf2HomeNum > sf2AwayNum ? 'winner' : ''}">
                                <span class="bracket-team-name">${sf2.home}</span>
                                <span class="bracket-score">${sf2.homeScore}</span>
                            </div>
                            <div class="bracket-connector"></div>
                            <div class="bracket-team ${sf2AwayNum !== null && sf2HomeNum !== null && sf2AwayNum > sf2HomeNum ? 'winner' : ''}">
                                <span class="bracket-team-name">${sf2.away}</span>
                                <span class="bracket-score">${sf2.awayScore}</span>
                            </div>
                            ` : `
                            <div class="bracket-team">
                                <span class="bracket-team-name">TBD</span>
                                <span class="bracket-score">-</span>
                            </div>
                            <div class="bracket-connector"></div>
                            <div class="bracket-team">
                                <span class="bracket-team-name">TBD</span>
                                <span class="bracket-score">-</span>
                            </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add 3rd place match if available
        if (thirdPlace) {
            const thirdHomeNum = scoreToNum(thirdPlace.homeScore);
            const thirdAwayNum = scoreToNum(thirdPlace.awayScore);

            html += `
                <div class="section" style="margin-top: 2rem;">
                    <h3 class="section-title">🥉 3rd Place Match</h3>
                    <div class="third-place-container" style="max-width: 500px; margin: 0 auto;">
                        <div class="bracket-match" style="background: linear-gradient(135deg, #cd7f32 0%, #b87333 100%); border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 15px rgba(205, 127, 50, 0.3);">
                            <div class="bracket-team ${thirdHomeNum !== null && thirdAwayNum !== null && thirdHomeNum > thirdAwayNum ? 'winner' : ''}" style="background: rgba(255,255,255,0.95); border-radius: 8px; padding: 1rem; margin-bottom: 0.5rem;">
                                <span class="bracket-team-name" style="font-size: 1.1rem; font-weight: 600;">${thirdPlace.home}</span>
                                <span class="bracket-score" style="font-size: 1.3rem; font-weight: bold; color: #cd7f32;">${thirdPlace.homeScore}</span>
                            </div>
                            <div class="bracket-connector" style="text-align: center; color: white; font-weight: bold; margin: 0.5rem 0;">VS</div>
                            <div class="bracket-team ${thirdAwayNum !== null && thirdHomeNum !== null && thirdAwayNum > thirdHomeNum ? 'winner' : ''}" style="background: rgba(255,255,255,0.95); border-radius: 8px; padding: 1rem; margin-top: 0.5rem;">
                                <span class="bracket-team-name" style="font-size: 1.1rem; font-weight: 600;">${thirdPlace.away}</span>
                                <span class="bracket-score" style="font-size: 1.3rem; font-weight: bold; color: #cd7f32;">${thirdPlace.awayScore}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    return html;
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
    console.log(`🏟️ createMatchesSection called for "${data.name}": ${data.matches.length} matches`);

    if (data.matches.length === 0) {
        console.log(`  ⚠️ No matches to display for ${data.name}`);
        return '';
    }

    console.log(`  ✅ Displaying ${data.matches.length} matches`);

    let html = `
        <div class="section">
            <h3 class="section-title">⚽ Matches</h3>
            <table class="matches-table">
                <thead>
                    <tr>
                        <th>Location</th>
                        <th>Time</th>
                        <th>Home</th>
                        <th>Score</th>
                        <th>Away</th>
                    </tr>
                </thead>
                <tbody>
    `;

    data.matches.forEach(match => {
        // Only show score if match has been played (has actual score values)
        const hasScore = match.homeScore !== '-' && match.homeScore !== '' &&
                        match.awayScore !== '-' && match.awayScore !== '';
        const score = hasScore
            ? `${match.homeScore} : ${match.awayScore}`
            : 'vs';

        html += `
            <tr>
                <td>${match.location || '-'}</td>
                <td>${match.time || '-'}</td>
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
