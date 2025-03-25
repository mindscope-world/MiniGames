const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const restartInfo = document.getElementById('restart-info');

// --- Game Settings ---
canvas.width = 500;
canvas.height = 500; // Increased height for dropping room
let score = 0;
let gameOver = false;
let gameLoopId; // To store the animation frame ID

// --- Item Properties ---
const itemTypes = {
    ORANGE_FRUIT: {
        color: '#ff9800', // Orange
        radius: 12,
        score: 1,
        speed: 2.5,
        probability: 0.60 // 60% chance
    },
    GOLD_FRUIT: {
        color: '#ffeb3b', // Gold/Yellow
        radius: 10,
        score: 5,
        speed: 3.5, // Faster
        probability: 0.10 // 10% chance
    },
    STONE: {
        color: '#607d8b', // Grey
        radius: 15,
        score: 0, // No score for stones
        speed: 4, // Fastest
        probability: 0.30 // 30% chance
    }
};

// --- Player (Caveman) ---
const player = {
    x: canvas.width / 2 - 20,
    y: canvas.height - 50,
    width: 35,
    height: 45,
    color: '#8d6e63',
    speed: 7, // Faster horizontal speed might be better
    dx: 0
    // dy is removed - player only moves left/right
};

// --- Items Array ---
let items = [];
let spawnTimer = 0;
const spawnInterval = 60; // Spawn a new item roughly every 60 frames (adjust for difficulty)

// --- Game State ---
const keysPressed = {
    ArrowRight: false,
    ArrowLeft: false
    // Up/Down removed
};

// --- Functions ---

// Draw the player (caveman)
function drawPlayer() {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // Optional: Add a simple "face" or detail
    ctx.fillStyle = '#3e2723'; // Darker brown for eyes/mouth
    ctx.fillRect(player.x + 7, player.y + 10, 5, 5); // Left eye
    ctx.fillRect(player.x + player.width - 12, player.y + 10, 5, 5); // Right eye
    ctx.fillRect(player.x + 10, player.y + 25, player.width - 20, 5); // Mouth
}

// Draw a single item (fruit or stone)
function drawItem(item) {
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
    ctx.fillStyle = item.color;
    ctx.fill();
    // Optional: Add outline for visibility
    if (item.type === itemTypes.STONE) {
        ctx.strokeStyle = '#263238'; // Darker grey outline for stone
        ctx.lineWidth = 2;
        ctx.stroke();
    } else {
        ctx.strokeStyle = '#4e342e'; // Brownish outline for fruits
         ctx.lineWidth = 1;
        ctx.stroke();
    }
    ctx.closePath();
}

// Spawn a new random item at the top
function spawnItem() {
    const rand = Math.random();
    let cumulativeProbability = 0;
    let chosenTypeKey = null;

    // Determine item type based on probability
    for (const key in itemTypes) {
        cumulativeProbability += itemTypes[key].probability;
        if (rand <= cumulativeProbability) {
            chosenTypeKey = key;
            break;
        }
    }
    // Fallback in case of floating point issues
    if (!chosenTypeKey) chosenTypeKey = 'ORANGE_FRUIT';

    const itemDetails = itemTypes[chosenTypeKey];

    const newItem = {
        type: itemDetails, // Store the whole type object
        x: Math.random() * (canvas.width - itemDetails.radius * 2) + itemDetails.radius,
        y: -itemDetails.radius, // Start just above the canvas
        radius: itemDetails.radius,
        color: itemDetails.color,
        speed: itemDetails.speed,
        score: itemDetails.score
    };
    items.push(newItem);
}

// Update player position based on dx and keep within bounds
function updatePlayerPosition() {
    player.x += player.dx;

    // Boundary detection (horizontal only)
    if (player.x < 0) {
        player.x = 0;
    }
    if (player.x + player.width > canvas.width) {
        player.x = canvas.width - player.width;
    }
}

// Update all falling items
function updateItems() {
    // Iterate backwards to safely remove items during loop
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.y += item.speed; // Move item down

        // Check collision with player
        if (checkCollision(player, item)) {
            if (item.type === itemTypes.STONE) {
                // Game Over!
                gameOver = true;
                return; // Stop updating items immediately
            } else {
                // Collect fruit
                score += item.score;
                updateScore();
                items.splice(i, 1); // Remove collected fruit from array
                continue; // Skip to the next item
            }
        }

        // Remove item if it goes off the bottom of the screen
        if (item.y - item.radius > canvas.height) {
            items.splice(i, 1);
        }
    }
}

// Check for collision between player rectangle and item circle
function checkCollision(playerRect, itemCircle) {
    // Find the closest point to the circle within the rectangle
    const closestX = Math.max(playerRect.x, Math.min(itemCircle.x, playerRect.x + playerRect.width));
    const closestY = Math.max(playerRect.y, Math.min(itemCircle.y, playerRect.y + playerRect.height));

    // Calculate the distance between the circle's center and this closest point
    const distanceX = itemCircle.x - closestX;
    const distanceY = itemCircle.y - closestY;
    const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

    // If the distance is less than the circle's radius squared, a collision occurred
    return distanceSquared < (itemCircle.radius * itemCircle.radius);
}

// Clear the canvas
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Update the score display
function updateScore() {
    scoreDisplay.textContent = score;
}

// Set player movement direction based on pressed keys
function setPlayerMovement() {
    player.dx = 0; // Reset horizontal movement each frame
    if (keysPressed.ArrowLeft) {
        player.dx = -player.speed;
    }
    if (keysPressed.ArrowRight) {
        player.dx = player.speed;
    }
}

// Display Game Over message
function showGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black overlay
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = '40px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER!', canvas.width / 2, canvas.height / 2 - 30);

    ctx.font = '24px sans-serif';
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 10);

    restartInfo.style.display = 'block'; // Show "Click to Restart" message
}

// Reset game state for restarting
function restartGame() {
    score = 0;
    gameOver = false;
    items = []; // Clear all items
    player.x = canvas.width / 2 - player.width / 2; // Reset player position
    player.dx = 0;
    keysPressed.ArrowLeft = false; // Reset keys just in case
    keysPressed.ArrowRight = false;
    spawnTimer = 0; // Reset spawn timer
    restartInfo.style.display = 'none'; // Hide restart message
    updateScore();
    gameLoop(); // Start the loop again
}


// --- Main Game Loop ---
function gameLoop() {
    if (gameOver) {
        showGameOver();
        cancelAnimationFrame(gameLoopId); // Stop the loop
        return; // Exit the function
    }

    clearCanvas();

    // --- Spawning ---
    spawnTimer++;
    if (spawnTimer >= spawnInterval) {
        spawnItem();
        spawnTimer = 0; // Reset timer
         // Optional: Gradually decrease spawnInterval to increase difficulty
        // if (spawnInterval > 20) spawnInterval -= 0.1;
    }

    // --- Updates ---
    setPlayerMovement(); // Determine direction based on keys
    updatePlayerPosition(); // Move the player and check bounds
    updateItems(); // Move items, check collisions, remove off-screen

    // --- Drawing ---
    // Draw items first so player appears on top
    items.forEach(drawItem);
    drawPlayer();

    gameLoopId = requestAnimationFrame(gameLoop); // Keep the loop going
}

// --- Event Listeners ---
function keyDownHandler(e) {
    if (gameOver) return; // Ignore input if game is over

    if (e.key === 'ArrowRight' || e.key === 'Right') {
        keysPressed.ArrowRight = true;
    } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        keysPressed.ArrowLeft = true;
    }
    // Prevent default browser action for arrow keys (scrolling)
    if (e.key.startsWith('Arrow')) {
        e.preventDefault();
    }
}

function keyUpHandler(e) {
    if (e.key === 'ArrowRight' || e.key === 'Right') {
        keysPressed.ArrowRight = false;
    } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        keysPressed.ArrowLeft = false;
    }
}

// Add click listener for restarting
canvas.addEventListener('click', () => {
    if (gameOver) {
        restartGame();
    }
});
// Also listen on the info text in case the click misses the canvas slightly
restartInfo.addEventListener('click', () => {
    if (gameOver) {
        restartGame();
    }
});


document.addEventListener('keydown', keyDownHandler);
document.addEventListener('keyup', keyUpHandler);

// --- Start Game ---
updateScore(); // Initialize score display
gameLoop();  // Start the animation loop