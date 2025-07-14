// server/gameLogic.js - Tank Deathmatch Game Logic

class TankGame {
  constructor(io) {
    this.io = io;
    this.players = {}; // { socketId: { x, y, angle, health, kills, deaths, isAlive } }
    this.bullets = []; // [ { x, y, vx, vy, owner, lifetime } ]
    this.tickRate = 60; // 60 FPS for smooth gameplay
    this.bulletSpeed = 500; // pixels per second
    this.bulletLifetime = 2; // seconds
    this.shootCooldown = 0.3; // seconds
    // Responsive arena size
    this.arenaWidth = 1200; // Normal size
    this.arenaHeight = 800; // Normal size
    this.tankSize = 30;
    this.bulletSize = 6;
    this.borderThickness = 24; // Match client border thickness
    
    // Game settings
    this.respawnTime = 3; // seconds

    this.obstacles = [
      // Arena border as obstacles
      { x: 0, y: 0, w: this.arenaWidth, h: this.borderThickness }, // Top
      { x: 0, y: this.arenaHeight - this.borderThickness, w: this.arenaWidth, h: this.borderThickness }, // Bottom
      { x: 0, y: 0, w: this.borderThickness, h: this.arenaHeight }, // Left
      { x: this.arenaWidth - this.borderThickness, y: 0, w: this.borderThickness, h: this.arenaHeight }, // Right
      // Map obstacles
      { x: 300, y: 200, w: 120, h: 40 },
      { x: 700, y: 400, w: 180, h: 50 },
      { x: 500, y: 600, w: 80, h: 120 },
      { x: 900, y: 150, w: 100, h: 40 },
      { x: 200, y: 500, w: 60, h: 100 }
    ];
  }

  // Add a new player to the game
  addPlayer(socketId, playerData = {}) {
    const spawnPoint = this.getRandomSpawnPoint();
    
    this.players[socketId] = {
      x: spawnPoint.x,
      y: spawnPoint.y,
      angle: 0, // facing right initially
      kills: 0,
      deaths: 0,
      isAlive: true,
      lastShot: 0,
      respawnTime: 0,
      username: playerData.username || `Player_${socketId.slice(0, 6)}`,
      invincible: true,
      invincibleTimer: 1.5
    };
    
  }

  // Remove a player from the game
  removePlayer(socketId) {
    delete this.players[socketId];
  }

  // Get a random spawn point within the arena (now: four corners)
  getRandomSpawnPoint() {
    const margin = 50;
    const corners = [
      { x: margin, y: margin }, // top-left
      { x: this.arenaWidth - margin, y: margin }, // top-right
      { x: margin, y: this.arenaHeight - margin }, // bottom-left
      { x: this.arenaWidth - margin, y: this.arenaHeight - margin } // bottom-right
    ];
    return corners[Math.floor(Math.random() * corners.length)];
  }

  // Handle player input (movement and shooting)
  handleInput(socketId, input) {
    const player = this.players[socketId];
    if (!player || !player.isAlive) return;

    const { keys, mouseX, mouseY, shoot } = input;
    
    // Update player angle based on mouse position
    if (mouseX !== undefined && mouseY !== undefined) {
      player.angle = Math.atan2(mouseY - player.y, mouseX - player.x);
    }
    
    // Handle movement
    const moveSpeed = 200; // pixels per second
    let vx = 0, vy = 0;
    
    if (keys.w || keys.ArrowUp) vy -= moveSpeed;
    if (keys.s || keys.ArrowDown) vy += moveSpeed;
    if (keys.a || keys.ArrowLeft) vx -= moveSpeed;
    if (keys.d || keys.ArrowRight) vx += moveSpeed;
    
    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      vx *= 0.707; // 1/√2
      vy *= 0.707;
    }
    
    // Try move, but block on obstacles and border
    let newX = player.x + vx / this.tickRate;
    let newY = player.y + vy / this.tickRate;
    // Use a slightly larger collision box for stricter blocking
    const collisionSize = this.tankSize * 0.9;
    if (!this.collidesWithObstacle(newX, player.y, collisionSize) &&
        newX >= this.tankSize/2 && newX <= this.arenaWidth - this.tankSize/2) player.x = newX;
    if (!this.collidesWithObstacle(player.x, newY, collisionSize) &&
        newY >= this.tankSize/2 && newY <= this.arenaHeight - this.tankSize/2) player.y = newY;
    
    // Keep player within arena bounds
    player.x = Math.max(this.tankSize/2, Math.min(this.arenaWidth - this.tankSize/2, player.x));
    player.y = Math.max(this.tankSize/2, Math.min(this.arenaHeight - this.tankSize/2, player.y));
    
    // Handle shooting
    if (shoot) {
      const now = Date.now() / 1000;
      if (now - player.lastShot >= this.shootCooldown) {
        this.spawnBullet(socketId);
        player.lastShot = now;
      }
    }
  }

  // Spawn a bullet from a player
  spawnBullet(ownerId) {
    const player = this.players[ownerId];
    if (!player || !player.isAlive) return;

    // Calculate bullet spawn position (in front of tank)
    const spawnDistance = this.tankSize / 2 + 5;
    const startX = player.x + Math.cos(player.angle) * spawnDistance;
    const startY = player.y + Math.sin(player.angle) * spawnDistance;
    
    // Calculate bullet velocity
    const vx = Math.cos(player.angle) * this.bulletSpeed;
    const vy = Math.sin(player.angle) * this.bulletSpeed;
    
    const bullet = {
      x: startX,
      y: startY,
      vx: vx,
      vy: vy,
      owner: ownerId,
      lifetime: this.bulletLifetime
    };
    
    this.bullets.push(bullet);
  }

  // Update game state (called every frame)
  update() {
    // Update bullets
    this.updateBullets();
    // Update invincibility timers
    for (const player of Object.values(this.players)) {
      if (player.invincible) {
        player.invincibleTimer -= 1 / this.tickRate;
        if (player.invincibleTimer <= 0) {
          player.invincible = false;
          player.invincibleTimer = 0;
        }
      }
    }
    // Update respawn timers
    this.updateRespawns();
    // Broadcast game state to all players
    this.broadcastGameState();
  }

  // Update bullet positions and handle collisions
  updateBullets() {
    this.bullets = this.bullets.filter(bullet => {
      // Move bullet
      bullet.x += bullet.vx / this.tickRate;
      bullet.y += bullet.vy / this.tickRate;
      bullet.lifetime -= 1 / this.tickRate;
      // Remove bullets that hit arena boundaries or expired
      if (this.isBulletOutOfBounds(bullet) || bullet.lifetime <= 0) {
        // Impact at border
        this.io.sockets.emit('bulletImpact', { x: bullet.x, y: bullet.y, type: 'border' });
        return false;
      }
      // Check bullet-obstacle collisions
      if (this.collidesWithObstacle(bullet.x, bullet.y, this.bulletSize * 2)) {
        // Impact at wall/obstacle
        this.io.sockets.emit('bulletImpact', { x: bullet.x, y: bullet.y, type: 'wall' });
        return false; // Remove bullet
      }
      // Check bullet-tank collisions
      for (const [playerId, player] of Object.entries(this.players)) {
        if (!player.isAlive || playerId === bullet.owner) continue;
        if (player.invincible) continue; // Skip invincible players
        const distance = Math.hypot(bullet.x - player.x, bullet.y - player.y);
        if (distance < this.tankSize / 2) {
          this.handlePlayerHit(playerId, bullet.owner);
          // (No need to emit impact here, handled by hit/death logic)
          return false; // Remove bullet
        }
      }
      return true;
    });
  }

  // Check if bullet is out of arena bounds
  isBulletOutOfBounds(bullet) {
    return bullet.x < 0 || bullet.x > this.arenaWidth || 
           bullet.y < 0 || bullet.y > this.arenaHeight;
  }

  // Handle player being hit by a bullet
  handlePlayerHit(targetId, shooterId) {
    const target = this.players[targetId];
    const shooter = this.players[shooterId];
    if (!target || !target.isAlive) return;
    // Instantly kill the player on hit
    this.io.to(targetId).emit('playerHit', { killerId: shooterId });
    this.io.to(shooterId).emit('hitConfirmed', { targetId });
    this.handlePlayerDeath(targetId, shooterId);
  }

  // Handle player death
  handlePlayerDeath(deadPlayerId, killerId) {
    const deadPlayer = this.players[deadPlayerId];
    if (!deadPlayer) return;
    deadPlayer.isAlive = false;
    deadPlayer.deaths += 1;
    deadPlayer.respawnTime = Date.now() / 1000;
    let killerUsername = null;
    let killerColor = null;
    if (killerId && this.players[killerId]) {
      this.players[killerId].kills += 1;
      this.io.to(killerId).emit('playerKilled', { targetId: deadPlayerId });
      killerUsername = this.players[killerId].username;
      killerColor = this.players[killerId].tankColor;
    }
    this.io.to(deadPlayerId).emit('playerDied', { killerId, killerUsername, killerColor });
  }

  // Update respawn timers
  updateRespawns() {
    for (const [playerId, player] of Object.entries(this.players)) {
      if (!player.isAlive && player.respawnTime > 0) {
        player.respawnTime -= 1 / this.tickRate;
        
        if (player.respawnTime <= 0) {
          this.respawnPlayer(playerId);
        }
      }
    }
  }

  // Respawn a player
  respawnPlayer(playerId) {
    const player = this.players[playerId];
    if (!player) return;
    
    const spawnPoint = this.getRandomSpawnPoint();
    
    player.x = spawnPoint.x;
    player.y = spawnPoint.y;
    player.angle = 0;
    player.isAlive = true;
    player.lastShot = 0;
    player.respawnTime = 0;
    player.invincible = true;
    player.invincibleTimer = 1.5;
    
    this.io.to(playerId).emit('playerRespawned', {});
  }

  // Broadcast game state to all players
  broadcastGameState() {
    this.io.sockets.emit('gameState', {
      players: this.players,
      bullets: this.bullets.map(bullet => ({ x: bullet.x, y: bullet.y, owner: bullet.owner })),
      obstacles: this.obstacles
    });
  }

  // Broadcast scoreboard to all players
  broadcastScoreboard() {
    const scoreboard = Object.values(this.players).map(p => ({
      id: p.id || '',
      username: p.username,
      kills: p.kills,
      deaths: p.deaths
    })).sort((a, b) => b.kills - a.kills);
    this.io.sockets.emit('scoreboard', scoreboard);
  }

  // Get current game stats
  getGameStats() {
    return {
      playerCount: Object.keys(this.players).length,
      bulletCount: this.bullets.length,
      arenaSize: { width: this.arenaWidth, height: this.arenaHeight }
    };
  }

  collidesWithObstacle(x, y, size) {
    return this.obstacles.some(obs =>
      x + size/2 > obs.x && x - size/2 < obs.x + obs.w &&
      y + size/2 > obs.y && y - size/2 < obs.y + obs.h
    );
  }
}

module.exports = TankGame;
