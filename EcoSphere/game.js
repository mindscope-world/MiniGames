// --- Game State ---
let gameState = {
    planetName: "Genesis Prime",
    health: 100,
    biodiversity: 10,
    stability: 50,
    energy: 50,
    water: 50,
    dna: 10,
    researchLevel: 0, // Affects efficiency
    virtualTrees: 0,
    gameOver: false,
    turn: 0,
    corruptorIdentified: false,
};

let neighbors = [];
let corruptorIndex = -1; // Index of the corruptor in the neighbors array

let currentEvent = null; // { name: string, effect: function, duration: number }
let currentPolicy = null; // { proposal: string, id: number, voteEndTime: number }
let playerVotedOnCurrentPolicy = false; // Track if player voted on the *current* policy

const MAX_HEALTH = 100;
const MIN_RESOURCE_COST = 1; // Prevent costs from going below 1

// --- UI Element References ---
const ui = {
    planetName: document.getElementById('planet-name'),
    health: document.getElementById('health'), // Keep separate for class manipulation
    biodiversity: document.getElementById('biodiversity'),
    stability: document.getElementById('stability'),
    energy: document.getElementById('energy'),
    water: document.getElementById('water'),
    dna: document.getElementById('dna'),
    efficiency: document.getElementById('efficiency'),
    log: document.getElementById('log'),
    neighborsList: document.getElementById('neighbors'),
    eventStatus: document.getElementById('event-status'),
    galaxyEventsBox: document.getElementById('galaxy-events'), // Container div for event styling
    policyProposal: document.getElementById('policy-proposal'),
    policyVoteBox: document.getElementById('policy-vote'),     // Container div for policy styling
    voteYesButton: document.getElementById('vote-yes'),
    voteNoButton: document.getElementById('vote-no'),
    accusationButtons: document.getElementById('accusation-buttons'),
    virtualTrees: document.getElementById('virtual-trees'),
};

// --- Core Functions ---

function logMessage(message) {
    const p = document.createElement('p');
    // Simple check to avoid adding Turn number to multiline messages or special markers
    if (!message.startsWith('---') && !message.includes('\n')) {
        p.textContent = `Turn ${gameState.turn}: ${message}`;
    } else {
        p.textContent = message; // Keep special formatting
    }
    ui.log.appendChild(p);
    // Auto-scroll to bottom
    ui.log.scrollTop = ui.log.scrollHeight;
    console.log(`LOG (Turn ${gameState.turn}): ${message}`); // Also log to console for debugging
}

function updateDisplay() {
    // Update core stats/resources text
    ui.planetName.textContent = gameState.planetName;
    ui.health.textContent = gameState.health;
    ui.biodiversity.textContent = gameState.biodiversity;
    ui.stability.textContent = gameState.stability;
    ui.energy.textContent = gameState.energy;
    ui.water.textContent = gameState.water;
    ui.dna.textContent = gameState.dna;
    ui.efficiency.textContent = gameState.researchLevel * 5;
    ui.virtualTrees.textContent = gameState.virtualTrees;

    // Health Styling
    ui.health.classList.remove('low-health', 'critical-health');
    if (gameState.health < 50) ui.health.classList.add('low-health');
    if (gameState.health < 25) ui.health.classList.add('critical-health');

    // Update neighbor display (with new classes and structure)
    let neighborHTML = '<ul>';
    neighbors.forEach((n, index) => {
        let statusClass = '';
        let statusText = '';
        if (n.isEjected) {
            statusClass = 'neighbor-ejected';
            statusText = ' (Ejected)';
        }
        // Append Corruptor status only if revealed *and* they haven't been ejected before reveal
        if (n.isRevealedCorruptor && !n.isEjected) {
             statusText += '<span class="revealed-corruptor"> (Corruptor!)</span>';
        } else if (n.isRevealedCorruptor && n.isEjected) {
             // If ejected *then* revealed (e.g. game end), show both
             statusText = ' (Ejected - Was Corruptor!)';
             if(!statusClass) statusClass = 'neighbor-ejected'; // Ensure class is set
        }


        neighborHTML += `<li class="${statusClass}">
            <span>${n.name} (Health: ${n.health}%)${statusText}</span>
            ${!n.isEjected ? `<button onclick="stealFromNeighbor(${index})" title="Attempt to steal resources" ${gameState.gameOver ? 'disabled' : ''}>Steal</button>` : ''}
         </li>`;
    });
    neighborHTML += '</ul>';
    ui.neighborsList.innerHTML = neighborHTML;

    // Update accusation buttons area
    let accusationHTML = '';
     if (!gameState.corruptorIdentified && !gameState.gameOver) {
         neighbors.forEach((n, index) => {
            // Only show accuse button for neighbors not already ejected
            if (!n.isEjected) {
               accusationHTML += `<button onclick="accuseNeighbor(${index})" ${gameState.gameOver ? 'disabled' : ''}>Accuse ${n.name}</button> `;
            }
         });
    } else if (gameState.corruptorIdentified && gameState.gameOver) {
         // Specific message if game ended due to successful identification
         accusationHTML = '<p>Corruptor successfully identified! Guardians win.</p>';
     } else if (gameState.gameOver) {
         // Generic game over message if ended otherwise (e.g., planet collapse)
          accusationHTML = '<p>Game Over.</p>';
          if (corruptorIndex !== -1 && neighbors[corruptorIndex].isRevealedCorruptor){
            accusationHTML += ` The Corruptor was ${neighbors[corruptorIndex].name}.`;
          }
     }
     // Ensure the container is updated even if empty (to clear old buttons)
     ui.accusationButtons.innerHTML = accusationHTML || '<p>No active accusations possible.</p>';


    // Update event display and container style
    if (currentEvent) {
        ui.eventStatus.textContent = `${currentEvent.name} (Turns left: ${currentEvent.duration})`;
        ui.galaxyEventsBox.classList.add('active-event');
    } else {
        ui.eventStatus.textContent = "None currently active.";
        ui.galaxyEventsBox.classList.remove('active-event');
    }

    // Update policy display and container style
    if (currentPolicy) {
        ui.policyProposal.textContent = currentPolicy.proposal;
        ui.policyVoteBox.classList.add('active-policy');
        // Buttons should be enabled if there's a policy, player hasn't voted yet, and game isn't over
        const enableVoteButtons = !playerVotedOnCurrentPolicy && !gameState.gameOver;
        ui.voteYesButton.disabled = !enableVoteButtons;
        ui.voteNoButton.disabled = !enableVoteButtons;
    } else {
        ui.policyProposal.textContent = "No active proposals.";
        ui.policyVoteBox.classList.remove('active-policy');
        ui.voteYesButton.disabled = true;
        ui.voteNoButton.disabled = true;
    }

    // Disable all main action buttons if game is over
    if (gameState.gameOver) {
        document.querySelectorAll('.actions-panel button').forEach(b => b.disabled = true);
        // Steal buttons are handled in the neighbor loop
        // Accusation buttons are handled in their specific logic block above
        // Vote buttons are handled in the policy logic block above
    }
}


function calculateCost(baseCost) {
    const efficiencyBonus = 1 - (gameState.researchLevel * 0.05); // 5% reduction per level
    return Math.max(MIN_RESOURCE_COST, Math.floor(baseCost * efficiencyBonus));
}

function gatherResource(type) {
    if (gameState.gameOver) return;
    let gain = 0;
    let healthCost = 1;

    switch (type) {
        case 'energy':
            gain = 10;
            gameState.energy += gain;
            break;
        case 'water':
            gain = 10;
            gameState.water += gain;
            break;
        case 'dna':
            gain = 5;
            healthCost = 2; // DNA gathering is more intrusive
            gameState.dna += gain;
            break;
    }

    gameState.health = Math.max(0, gameState.health - healthCost); // Prevent negative health
    logMessage(`Gathered ${gain} ${type}. Health decreased by ${healthCost}.`);
    checkGameOver(); // Check immediately after health change
    if (!gameState.gameOver) updateDisplay(); // Update display if game continues
}

function develop(type) {
    if (gameState.gameOver) return;
    let costE = 0, costW = 0, costD = 0;
    let bioGain = 0, stabilityGain = 0;

    switch (type) {
        case 'flora':
            costE = calculateCost(20);
            costW = calculateCost(10);
            if (gameState.energy >= costE && gameState.water >= costW) {
                gameState.energy -= costE;
                gameState.water -= costW;
                bioGain = 5;
                stabilityGain = 2;
                gameState.biodiversity += bioGain;
                gameState.stability = Math.min(100, gameState.stability + stabilityGain);
                gameState.virtualTrees += 10; // Real-world link trigger
                logMessage(`Developed Flora (+${bioGain} Bio, +${stabilityGain} Stability). Cost: ${costE}E, ${costW}W.`);
            } else {
                logMessage("Not enough resources to develop Flora.");
                return; // Don't proceed if costs aren't met
            }
            break;
        case 'fauna':
            costE = calculateCost(15);
            costW = calculateCost(15);
            costD = calculateCost(5);
             if (gameState.energy >= costE && gameState.water >= costW && gameState.dna >= costD) {
                gameState.energy -= costE;
                gameState.water -= costW;
                gameState.dna -= costD;
                bioGain = 10;
                stabilityGain = 5;
                gameState.biodiversity += bioGain;
                gameState.stability = Math.min(100, gameState.stability + stabilityGain);
                 logMessage(`Developed Fauna (+${bioGain} Bio, +${stabilityGain} Stability). Cost: ${costE}E, ${costW}W, ${costD}D.`);
            } else {
                logMessage("Not enough resources to develop Fauna.");
                return; // Don't proceed if costs aren't met
            }
            break;
         default:
             logMessage("Unknown development type.");
             return;
    }
    // No need to call checkGameOver here unless development itself could cause game over
    updateDisplay();
}

function research() {
     if (gameState.gameOver) return;
     const costE = calculateCost(30);
     const costD = calculateCost(10);

     if (gameState.energy >= costE && gameState.dna >= costD) {
         gameState.energy -= costE;
         gameState.dna -= costD;
         gameState.researchLevel++;
         const stabilityGain = 5;
         gameState.stability = Math.min(100, gameState.stability + stabilityGain);
         logMessage(`Research successful! Level ${gameState.researchLevel} reached (+${stabilityGain} Stability). Efficiency increased. Cost: ${costE}E, ${costD}D.`);
     } else {
         logMessage("Not enough resources for Research.");
         return; // Don't proceed
     }
     updateDisplay();
}

function stealFromNeighbor(index) {
    if (gameState.gameOver || neighbors[index].isEjected) return;

    const targetNeighbor = neighbors[index];
    // Higher stability makes stealing harder (example implementation)
    const successChance = Math.max(0.1, 0.6 - (targetNeighbor.health / 250)); // Base 60%, reduced by target health
    logMessage(`Attempting to steal from ${targetNeighbor.name}...`);

    if (Math.random() < successChance) {
        const stolenE = Math.floor(Math.random() * 8) + 4; // Range 4-11
        const stolenW = Math.floor(Math.random() * 8) + 4;
        gameState.energy += stolenE;
        gameState.water += stolenW;
        // Simulate effect on neighbor
        targetNeighbor.health = Math.max(0, targetNeighbor.health - (Math.floor(Math.random() * 5) + 3)); // Lower neighbor health slightly more
        logMessage(`Success! Stole ${stolenE} Energy and ${stolenW} Water from ${targetNeighbor.name}. Their health decreased.`);
    } else {
        // Simulate retaliation risk
        const retaliationDamage = Math.floor(Math.random() * 6) + 3; // Range 3-8
        gameState.health = Math.max(0, gameState.health - retaliationDamage);
        logMessage(`Failed! Stealing attempt detected by ${targetNeighbor.name}. Suffered ${retaliationDamage} retaliation damage.`);
    }
    checkGameOver(); // Check after potential health loss
    if (!gameState.gameOver) updateDisplay();
}


// --- Simulation Loop (Turn-based / Interval) ---

function gameTick() {
    if (gameState.gameOver) return; // Stop ticks if game over

    gameState.turn++;
    logMessage(`--- Turn ${gameState.turn} Start ---`);

    // 1. Passive Resource Generation / Consumption
    const passiveEnergy = Math.floor(gameState.stability / 15) - 1; // Example: Stability helps, base drain
    const passiveWater = Math.floor(gameState.biodiversity / 8) - 1; // Example: Bio helps, base drain
    gameState.energy += passiveEnergy;
    gameState.water += passiveWater;
    // Ensure resources don't go below 0 passively
    gameState.energy = Math.max(0, gameState.energy);
    gameState.water = Math.max(0, gameState.water);
    // logMessage(`Resource change: ${passiveEnergy >= 0 ? '+' : ''}${passiveEnergy}E, ${passiveWater >= 0 ? '+' : ''}${passiveWater}W.`);


    // 2. Ecosystem Health Check & Regeneration
    let healthChange = 0;
    if (gameState.stability < 35) { // Increased threshold for damage
        healthChange -= 2; // Increased damage
        logMessage(`Planet unstable! Ecosystem suffering.`);
    } else if (gameState.stability > 75 && gameState.biodiversity > 40 && gameState.health < MAX_HEALTH) {
        healthChange += 1; // Slow regeneration under good conditions
    }
     // Low resources also damage health
     if (gameState.water < 10 || gameState.energy < 10) {
         healthChange -= 1;
         logMessage(`Critical resource shortage! Ecosystem suffering.`);
     }

    gameState.health = Math.max(0, Math.min(MAX_HEALTH, gameState.health + healthChange));
    if (healthChange !== 0) {
        // logMessage(`Health changed by ${healthChange}. Current: ${gameState.health}`);
    }

    // 3. Galactic Event Handling
    handleEvents();

    // 4. Policy Handling
    handlePolicies();

    // 5. Corruptor Action (Simulated)
    handleCorruptorAction();

    // 6. Neighbor Health Fluctuation (Simulated - make galaxy feel alive)
    simulateNeighborActivity();

    // 7. Check Game Over Conditions
    checkGameOver();

    // 8. Update UI (only if game is not over)
    if (!gameState.gameOver) {
        updateDisplay();
    }
    logMessage(`--- Turn ${gameState.turn} End ---`);
}

function handleEvents() {
    // Decrement active event duration
    if (currentEvent) {
        currentEvent.duration--;
        if (currentEvent.duration <= 0) {
            logMessage(`Event ended: ${currentEvent.name}.`);
            currentEvent = null;
        } else {
             // logMessage(`Event ongoing: ${currentEvent.name} (${currentEvent.duration} turns left).`);
        }
    }

    // Chance to trigger a new event (e.g., 12% chance per turn if no event active)
    if (!currentEvent && Math.random() < 0.12) {
        triggerRandomEvent();
    }
}

function triggerRandomEvent() {
    const events = [
        { name: "Solar Flare", duration: 3, effect: () => { gameState.energy += 25; gameState.water = Math.max(0,gameState.water - 20); logMessage("Solar Flare: Energy surged (+25 E), but water evaporated (-20 W)!"); } },
        { name: "Asteroid Impact", duration: 1, effect: () => { const dmg = Math.floor(Math.random() * 15) + 5; gameState.health = Math.max(0, gameState.health - dmg); const dnaGain = Math.floor(Math.random() * 10) + 5; gameState.dna += dnaGain; logMessage(`Asteroid Impact: Planet damaged (-${dmg} Health), but found rare samples (+${dnaGain} DNA)!`); } },
        { name: "Micrometeorite Shower", duration: 4, effect: () => { const stabilityLoss = 5; gameState.stability = Math.max(0, gameState.stability - stabilityLoss); logMessage(`Micrometeorite Shower: Planetary shields strained (-${stabilityLoss} Stability).`); } },
        { name: "Cosmic Bloom", duration: 4, effect: () => { gameState.dna += 15; gameState.biodiversity += 5; logMessage("Cosmic Bloom: Strange spores enhance local life (+15 DNA, +5 Biodiversity)!"); } },
        { name: "Galactic Recession", duration: 5, effect: () => { logMessage("Galactic Recession: Passive resource generation halted temporarily."); /* Modify passive gain logic if implemented complexly */ } }, // Needs more complex implementation
    ];
    currentEvent = { ...events[Math.floor(Math.random() * events.length)] }; // Clone event object
    logMessage(`New Galactic Event: ${currentEvent.name} starts! Duration: ${currentEvent.duration} turns.`);
    currentEvent.effect(); // Apply immediate effect
}

function handlePolicies() {
     // Check if current vote ended
    if (currentPolicy && gameState.turn >= currentPolicy.voteEndTime) {
        // Simulate simple majority vote (60% chance for prototype, Corruptor could influence)
        let passed = Math.random() < 0.60;
        logMessage(`Policy Vote Ended: "${currentPolicy.proposal}" ${passed ? 'PASSED' : 'FAILED'}.`);
        if (passed) {
            applyPolicyEffect(currentPolicy.id); // Apply effects if passed
        }
        currentPolicy = null; // Clear the current policy
        playerVotedOnCurrentPolicy = false; // Reset voting flag
    }

     // Chance to propose a new policy (e.g., 8% chance per turn if none active)
    if (!currentPolicy && Math.random() < 0.08) {
        proposeRandomPolicy();
    }
}

function proposeRandomPolicy() {
    const policies = [
        { id: 1, proposal: "Enforce Strict Pollution Control (All Actions: +1 Health Cost, +2 Stability/turn)", duration: 5 },
        { id: 2, proposal: "Subsidize Water Purification (+5 Water/turn, -5 Energy/turn)", duration: 4 },
        { id: 3, proposal: "Mandatory Biodiversity Scan (All Players: -10 DNA, +10 Stability)", duration: 1 }, // Instant effect on pass
        { id: 4, proposal: "Emergency Energy Hoarding (Gather Energy: -50% Yield, +5 Stability/turn)", duration: 3 },
    ];
    const proposal = policies[Math.floor(Math.random() * policies.length)];
    currentPolicy = {
        ...proposal, // Clone policy object
        voteEndTime: gameState.turn + 2 // Players have 2 turns (current + next) to vote
    };
    playerVotedOnCurrentPolicy = false; // Reset vote flag for new policy
    logMessage(`New Policy Proposal: ${currentPolicy.proposal} (Vote ends after Turn ${currentPolicy.voteEndTime})`);
}

function castVote(voteYes) {
    if (!currentPolicy || playerVotedOnCurrentPolicy || gameState.gameOver) return; // Prevent voting multiple times or when invalid
    logMessage(`You voted ${voteYes ? 'YES' : 'NO'} on "${currentPolicy.proposal}".`);
    playerVotedOnCurrentPolicy = true; // Mark that player has voted
    // Disable buttons immediately via updateDisplay call
    updateDisplay();
}

function applyPolicyEffect(policyId) {
    // Placeholder for actual policy effects
    logMessage(`Policy ${policyId} effects are now active (Conceptual).`);
    // Example: if (policyId === 2) { gameState.water += 5; gameState.energy -= 5; } // Would need temporary effect system
}


function handleCorruptorAction() {
    if (gameState.gameOver || gameState.corruptorIdentified) return;

    // Ensure corruptor exists and hasn't been ejected
    if (corruptorIndex === -1 || neighbors[corruptorIndex].isEjected) return;

    // Simulate the hidden Corruptor acting (e.g., 25% chance per turn)
     if (Math.random() < 0.25) {
        const corruptor = neighbors[corruptorIndex];
        // Choose a random sabotage action
        const sabotageType = Math.random();

        if (sabotageType < 0.4) { // Damage Player Health subtly
            const damage = Math.floor(Math.random() * 4) + 2; // 2-5 damage
            gameState.health = Math.max(0, gameState.health - damage);
            logMessage(`A sudden malfunction drains vital systems! (-${damage} Health)`);
        } else if (sabotageType < 0.7) { // Damage Player Stability
            const stabilityLoss = Math.floor(Math.random() * 8) + 3; // 3-10 loss
            gameState.stability = Math.max(0, gameState.stability - stabilityLoss);
            logMessage(`Strange interference patterns destabilize the planet! (-${stabilityLoss} Stability)`);
        } else { // Damage a Neighbor (to sow discord / weaken others)
             // Find a valid target (not self, not ejected)
             let validTargets = neighbors.filter((n, i) => i !== corruptorIndex && !n.isEjected);
             if (validTargets.length > 0) {
                 const targetNeighbor = validTargets[Math.floor(Math.random() * validTargets.length)];
                 const neighborDamage = Math.floor(Math.random() * 10) + 5; // 5-14 damage
                 targetNeighbor.health = Math.max(0, targetNeighbor.health - neighborDamage);
                 logMessage(`Whispers from the void... ${targetNeighbor.name}'s planet suffers a major setback.`);
             }
        }
    }
}

function simulateNeighborActivity() {
    // Make neighbors' health fluctuate slightly to seem dynamic
    neighbors.forEach((n, index) => {
        if (!n.isEjected && index !== corruptorIndex) { // Don't affect ejected or the corruptor this way
            const change = Math.floor(Math.random() * 7) - 3; // Change between -3 and +3
            n.health = Math.max(0, Math.min(100, n.health + change));
        }
        // Corruptor might slowly regenerate if not damaged
        else if(index === corruptorIndex && !n.isEjected) {
             const recovery = Math.floor(Math.random() * 3); // 0-2 recovery
             n.health = Math.min(100, n.health + recovery);
        }
    });
}

function accuseNeighbor(index) {
    if (gameState.gameOver || gameState.corruptorIdentified || neighbors[index].isEjected) return;

    const accused = neighbors[index];
    logMessage(`You initiated a vote to eject ${accused.name}...`);

    // Simulate voting outcome (e.g., 60% chance the accusation passes, maybe influence by stability?)
    const basePassChance = 0.6;
    const votePasses = Math.random() < basePassChance;

    if (votePasses) {
        logMessage(`The vote passes! ${accused.name} is ejected from the galaxy.`);
        accused.isEjected = true; // Mark as ejected

        if (index === corruptorIndex) {
            logMessage(`SUCCESS! ${accused.name} was the Corruptor! The galaxy is safe. Guardians win!`);
            gameState.corruptorIdentified = true;
            accused.isRevealedCorruptor = true; // Mark for display
            gameState.gameOver = true; // End game on successful ID
        } else {
            logMessage(`FAILURE! ${accused.name} was an innocent Guardian! The Corruptor remains hidden...`);
            // Penalty for wrong accusation: Stability loss
            const stabilityPenalty = 15;
            gameState.stability = Math.max(0, gameState.stability - stabilityPenalty);
            logMessage(`Galactic trust shattered. Stability decreased by ${stabilityPenalty}.`);
        }
    } else {
        logMessage(`The vote fails! ${accused.name} remains. The failed accusation causes further tension.`);
        // Minor penalty for failed vote
        const stabilityPenalty = 5;
        gameState.stability = Math.max(0, gameState.stability - stabilityPenalty);
    }

    // Update display immediately to show ejection/results, check game over state
    checkGameOver(); // Check if stability loss caused game over
    updateDisplay(); // Update UI to reflect ejection/outcome/game over state
}


function checkGameOver() {
    if (gameState.gameOver) return; // Prevent multiple game over triggers

    let gameOverTriggered = false;
    let message = "";

    if (gameState.health <= 0) {
        message = "Your planet's ecosystem has collapsed! GAME OVER.";
        gameOverTriggered = true;
    } else if (!gameState.corruptorIdentified && gameState.health < 15 && gameState.stability < 20) {
        // Corruptor wins if player is very weak and corruptor not found
        message = "Your planet is on the brink, defenses failing... The Corruptor's sabotage prevails! Corruptors win! GAME OVER.";
        if (corruptorIndex !== -1 && !neighbors[corruptorIndex].isEjected) {
            neighbors[corruptorIndex].isRevealedCorruptor = true; // Reveal the winner
            message += ` The Corruptor was ${neighbors[corruptorIndex].name}.`;
        }
        gameOverTriggered = true;
    }
    // Add potential Guardian win condition (e.g., survive X turns)
    else if (!gameState.corruptorIdentified && gameState.turn >= 50) { // Example: Survive 50 turns
         message = "You have successfully guided your planet through numerous challenges! The Corruptor remains hidden, but your world endures. Guardians Win (Survival)!";
         gameOverTriggered = true;
    }


    if (gameOverTriggered) {
        gameState.gameOver = true;
        logMessage(message);
        updateDisplay(); // Call final update to disable buttons, show final state
    }
}


// --- Initialization ---

function initializeGame() {
    logMessage("Initializing EcoSphere Prototype v0.2...");

    // Create simulated neighbors
    const names = ["Xylar Delta", "Cygnus Station", "Kepler Mock-2", "Andoria Colony", "Proxima Centauri B"];
    neighbors = names.map(name => ({
        name: name,
        health: Math.floor(Math.random() * 21) + 80, // Start neighbors with 80-100 health
        isCorruptor: false,
        isEjected: false,
        isRevealedCorruptor: false,
    }));

    // Randomly assign one neighbor as the Corruptor
    corruptorIndex = Math.floor(Math.random() * neighbors.length);
    neighbors[corruptorIndex].isCorruptor = true;
    // Don't log this to the player! Keep it secret.
    console.log(`DEBUG: Corruptor is ${neighbors[corruptorIndex].name} at index ${corruptorIndex}`);

    // Reset game state variables
    gameState.health = 100;
    gameState.biodiversity = 10;
    gameState.stability = 50;
    gameState.energy = 50;
    gameState.water = 50;
    gameState.dna = 10;
    gameState.researchLevel = 0;
    gameState.virtualTrees = 0;
    gameState.turn = 0;
    gameState.gameOver = false;
    gameState.corruptorIdentified = false;
    currentEvent = null;
    currentPolicy = null;
    playerVotedOnCurrentPolicy = false;

     // Clear log visually
     ui.log.innerHTML = '<p>Welcome, Guardian! Initializing simulation...</p>';

    updateDisplay(); // Initial display setup

    // Start the game loop (tick every 5 seconds)
    // Clear any existing interval before starting a new one (important for potential restarts)
    if (window.gameLoopInterval) {
        clearInterval(window.gameLoopInterval);
    }
    window.gameLoopInterval = setInterval(gameTick, 5000); // Store interval ID globally

    logMessage("Simulation started. Balance your world, watch your neighbors, and survive.");
}

// --- Start Game ---
initializeGame(); // Call initialization when the script loads