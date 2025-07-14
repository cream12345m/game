const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const path = require('path');
const TankGame = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = socketio(server, { 
  cors: { 
    origin: "*", 
    methods: ["GET", "POST"] 
  } 
});

// Enable CORS
app.use(cors());

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client/src')));

// Serve menu.html at root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/src/menu.html'));
});

// Create game instance
const game = new TankGame(io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);
  
  // Add player to game (will be updated when player sends join data)
  game.addPlayer(socket.id);

  // Send initial game state
  socket.emit('gameState', {
    players: game.players,
    bullets: game.bullets.map(bullet => ({
      x: bullet.x,
      y: bullet.y,
      owner: bullet.owner
    }))
  });
  
  // Send scoreboard
  game.broadcastScoreboard();
  
  // Handle player join with data
  socket.on('playerJoin', (playerData) => {
    console.log(`🎮 Player joining with data:`, playerData);
    // Update player with their data
    if (game.players[socket.id]) {
      game.players[socket.id].username = playerData.username || game.players[socket.id].username;
      game.players[socket.id].tankColor = playerData.tankColor || game.players[socket.id].tankColor;
      game.players[socket.id].bulletColor = playerData.bulletColor || game.players[socket.id].bulletColor;
    }
  });
  
  // Handle player input
  socket.on('playerInput', (input) => {
    game.handleInput(socket.id, input);
  });
  
  // Handle ping for latency measurement
  socket.on('ping', () => {
    socket.emit('pong');
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 Disconnected: ${socket.id}`);
    game.removePlayer(socket.id);
    game.broadcastScoreboard();
  });
});

// Game loop - update at 60 FPS
const gameLoop = setInterval(() => {
  game.update();
}, 1000 / game.tickRate);

// Health check endpoint
app.get('/health', (req, res) => {
  const stats = game.getGameStats();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    gameStats: stats
  });
});

// Start server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`🚀 Tank Deathmatch Server running on port ${PORT}`);
  console.log(`🎮 Game settings:`);
  console.log(`   - Arena: ${game.arenaWidth}x${game.arenaHeight}`);
  console.log(`   - Tick rate: ${game.tickRate} FPS`);
  console.log(`   - Bullet speed: ${game.bulletSpeed} px/s`);
  console.log(`   - Respawn time: ${game.respawnTime}s`);
  console.log(`   - Health: ${game.maxHealth} HP`);
  console.log(`   - Bullet damage: ${game.bulletDamage} HP`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  clearInterval(gameLoop);
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
