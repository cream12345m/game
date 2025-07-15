// client/src/game.js - Enhanced Tank Deathmatch Client

class TankGameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        // Removed legacy responsive canvas resizing code
        
        // Get parameters from URL
        this.gameParams = this.getUrlParameters();
        this.username = this.gameParams.username || 'Player';
        this.serverUrl = this.gameParams.server || window.location.origin;
        
        this.socket = io(this.serverUrl);
        
        // Game state
        this.players = {};
        this.bullets = [];
        this.myId = null;
        this.isAlive = true;
        
        // Client-side prediction and interpolation
        this.predictedPlayers = {}; // Local predictions for smooth movement
        this.interpolatedPlayers = {}; // Smooth interpolation for other players
        this.interpolatedBullets = []; // Smooth interpolation for bullets
        this.serverUpdateRate = 60; // Expected server updates per second
        this.interpolationDelay = 100; // ms delay for interpolation (adjusts for ping)
        this.lastServerUpdate = 0;
        this.serverUpdateBuffer = []; // Buffer for interpolation
        this.reconciliationThreshold = 50; // pixels - if server position differs by more than this, snap to server
        
        // Performance tracking
        this.fps = 60;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.ping = 0;
        this.lastPingTime = 0;
        
        // Animation and effects
        this.particles = [];
        this.screenShake = 0;
        this.flashEffect = 0;
        this.bulletImpacts = [];
        
        // Input state
        this.keys = {
            w: false, s: false, a: false, d: false,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false
        };
        this.mouseX = 0; // world
        this.mouseY = 0; // world
        this.mouseScreenX = 0; // canvas/screen
        this.mouseScreenY = 0; // canvas/screen
        this.isShooting = false;
        this.mouseInside = false;
        
        // Game settings
        this.tankSize = 30;
        this.bulletSize = 6;
        this.arenaWidth = 7500; // New size
        this.arenaHeight = 7500; // New size
        this.borderThickness = 150; // Proportional border
        // Camera/viewport
        this.viewportWidth = 1200; // Canvas size (window into the map)
        this.viewportHeight = 800;
        this.cameraX = 0;
        this.cameraY = 0;
        
        // UI elements
        this.scoreboardContent = document.getElementById('scoreboardContent');
        this.gameOver = document.getElementById('gameOver');
        this.respawnTimer = document.getElementById('respawnTimer');
        this.killerName = document.getElementById('killerName');
        this.loading = document.getElementById('loading');
        this.playerCount = document.getElementById('playerCount');
        this.fpsCounter = document.getElementById('fpsCounter');
        this.pingValue = document.getElementById('pingValue');
        
        this.obstacles = [];
        
        this.init();
        this.lastShotTime = 0;
        // Add user gesture handler to unlock audio
        // Sound effects (paths relative to HTML file)
        this.sounds = {
            spawn: new Audio('assets/spawn.wav'),
            shoot: new Audio('assets/shoot.wav'),
            death: new Audio('assets/death.wav'),
            kill: new Audio('assets/kill.wav')
        };
        // Set all sound volumes to 1.0
        Object.values(this.sounds).forEach(audio => { audio.volume = 1.0; });
        // Make shooting sound 50% lower volume
        this.sounds.shoot.volume = 0.25;
        // Unlock audio on any user interaction (pointerdown, keydown, click)
        const unlockAudio = () => {
            Object.values(this.sounds).forEach(audio => {
                if (audio && audio.paused) {
                    audio.play().catch(() => {});
                    audio.pause();
                    audio.currentTime = 0;
                }
            });
            window.removeEventListener('pointerdown', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('click', unlockAudio);
        };
        window.addEventListener('pointerdown', unlockAudio);
        window.addEventListener('keydown', unlockAudio);
        window.addEventListener('click', unlockAudio);
        this.killPopupTimer = 0;
        this.killPopupText = '';
    }
    
    getUrlParameters() {
        const params = {};
        const queryString = window.location.search.substring(1);
        const pairs = queryString.split('&');
        
        for (const pair of pairs) {
            const [key, value] = pair.split('=');
            if (key && value) {
                params[decodeURIComponent(key)] = decodeURIComponent(value);
            }
        }
        
        return params;
    }
    
    init() {
        // Reset input state on new game
        Object.keys(this.keys).forEach(k => this.keys[k] = false);
        this.isShooting = false;
        // Set mouse to player position and enable aiming immediately
        if (this.myId && this.players[this.myId]) {
            this.mouseX = this.players[this.myId].x;
            this.mouseY = this.players[this.myId].y;
        } else {
            this.mouseX = this.arenaWidth / 2;
            this.mouseY = this.arenaHeight / 2;
        }
        this.mouseInside = true;
        this.setupEventListeners();
        this.setupSocketListeners();
        this.updatePlayerName();
        this.gameLoop();
    }
    
    updatePlayerName() {
        const playerNameElement = document.getElementById('playerName');
        if (playerNameElement) {
            playerNameElement.textContent = this.username;
        }
    }
    
    setupEventListeners() {
        // Remove any previous listeners to prevent duplication
        if (this._eventListenersSet) return;
        this._eventListenersSet = true;
        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (this.keys.hasOwnProperty(e.key)) {
                this.keys[e.key] = true;
            }
        });
        document.addEventListener('keyup', (e) => {
            if (this.keys.hasOwnProperty(e.key)) {
                this.keys[e.key] = false;
            }
        });
        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            // Convert mouse position to canvas (viewport) coordinates
            const canvasX = Math.max(0, Math.min((e.clientX - rect.left) * scaleX, this.canvas.width));
            const canvasY = Math.max(0, Math.min((e.clientY - rect.top) * scaleY, this.canvas.height));
            this.mouseScreenX = canvasX;
            this.mouseScreenY = canvasY;
            // Convert to world coordinates using camera offset
            this.mouseX = this.cameraX + canvasX;
            this.mouseY = this.cameraY + canvasY;
            // Clamp to map bounds
            this.mouseX = Math.max(0, Math.min(this.arenaWidth, this.mouseX));
            this.mouseY = Math.max(0, Math.min(this.arenaHeight, this.mouseY));
        });
        this.canvas.addEventListener('mouseenter', () => {
            this.mouseInside = true;
        });
        this.canvas.addEventListener('mouseleave', () => {
            this.mouseInside = false;
            // Reset mouse to tank center and disable shooting
            if (this.myId && this.players[this.myId]) {
                this.mouseX = this.players[this.myId].x;
                this.mouseY = this.players[this.myId].y;
            } else {
                this.mouseX = this.arenaWidth / 2;
                this.mouseY = this.arenaHeight / 2;
            }
            this.isShooting = false;
        });
        this.canvas.addEventListener('mousedown', () => {
            this.isShooting = true;
            // Remove shooting sound from here
        });
        this.canvas.addEventListener('mouseup', () => {
            this.isShooting = false;
        });
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    
    setupSocketListeners() {
        
        this.socket.on('connect', () => {
            this.loading.style.display = 'none';
            
            // Send player data to server
            this.socket.emit('playerJoin', {
                username: this.username,
            });
            
            // Start ping measurement
            this.startPingMeasurement();
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('🔌 Connection error:', error);
            this.loading.textContent = 'Connection failed. Retrying...';
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('🔌 Disconnected from server:', reason);
            this.loading.style.display = 'block';
        });
        
        this.socket.on('error', (error) => {
            console.error('🔌 Socket error:', error);
        });
        
        this.socket.on('gameState', (gameState) => {
            // Store server update with timestamp for interpolation
            const updateTime = Date.now();
            this.serverUpdateBuffer.push({
                timestamp: updateTime,
                players: gameState.players,
                bullets: gameState.bullets
            });
            
            // Keep only recent updates (last 500ms)
            this.serverUpdateBuffer = this.serverUpdateBuffer.filter(
                update => updateTime - update.timestamp < 500
            );
            
            // Update obstacles (static, no interpolation needed)
            this.obstacles = gameState.obstacles || [];
            
            // Set my ID if not set
            if (!this.myId && gameState.players[this.socket.id]) {
                this.myId = this.socket.id;
                this.updateUI();
            }
            
            // Update interpolation delay based on ping
            this.interpolationDelay = Math.max(50, Math.min(200, this.ping * 0.5));
        });
        
        this.socket.on('scoreboard', (scoreboard) => {
            this.updateScoreboard(scoreboard);
        });
        
        this.socket.on('playerHit', (data) => {
            this.handlePlayerHit(data);
        });
        
        this.socket.on('playerDied', (data) => {
            this.handlePlayerDeath(data);
        });
        
        this.socket.on('playerKilled', (data) => {
            this.handlePlayerKill(data);
        });
        
        this.socket.on('playerRespawned', (data) => {
            this.handlePlayerRespawn(data);
        });

        this.socket.on('bulletImpact', (data) => {
            this.spawnBulletImpactEffect(data.x, data.y, data.type);
        });

        this.socket.on('bulletFired', () => {
            this.playSound('shoot');
        });
    }
    
    sendInput() {
        if (!this.myId || !this.isAlive || !this.mouseInside) return;
        
        // Apply client-side prediction for local player
        this.predictLocalPlayer();
        
        // Send input to server with timestamp for anti-cheat
        // Send mouseX/mouseY in world coordinates
        this.socket.emit('playerInput', {
            keys: this.keys,
            mouseX: this.mouseX,
            mouseY: this.mouseY,
            shoot: this.isShooting,
            clientTime: Date.now()
        });
    }
    
    predictLocalPlayer() {
        if (!this.myId || !this.players[this.myId]) return;
        if (!this.obstacles || this.obstacles.length === 0) return;
        // Use a separate prediction state, never mutate server state
        const serverPlayer = this.players[this.myId];
        let predicted = this.predictedPlayers[this.myId] || { ...serverPlayer };
        const moveSpeed = 200; // pixels per second
        let vx = 0, vy = 0;
        if (this.keys.w || this.keys.ArrowUp) vy -= moveSpeed;
        if (this.keys.s || this.keys.ArrowDown) vy += moveSpeed;
        if (this.keys.a || this.keys.ArrowLeft) vx -= moveSpeed;
        if (this.keys.d || this.keys.ArrowRight) vx += moveSpeed;
        if (vx !== 0 && vy !== 0) {
            vx *= 0.707;
            vy *= 0.707;
        }
        const deltaTime = 1 / 60;
        let predictedX = predicted.x + vx * deltaTime;
        let predictedY = predicted.y + vy * deltaTime;
        const collisionSize = this.tankSize * 0.9;
        if (!this.collidesWithObstacle(predictedX, predicted.y, collisionSize)) {
            predicted.x = predictedX;
        }
        if (!this.collidesWithObstacle(predicted.x, predictedY, collisionSize)) {
            predicted.y = predictedY;
        }
        predicted.angle = Math.atan2(this.mouseY - predicted.y, this.mouseX - predicted.x);
        this.predictedPlayers[this.myId] = { ...predicted };
    }
    
    updateUI() {
        if (!this.myId || !this.players[this.myId]) return;
        
        // Update game stats
        this.playerCount.textContent = Object.keys(this.players).length;
        this.fpsCounter.textContent = this.fps;
        this.pingValue.textContent = `${this.ping}ms`;
    }
    
    updateScoreboard(scoreboard) {
        this.scoreboardContent.innerHTML = '';
        // If there's a heading element, set it to 'Leaderboard'
        const heading = document.querySelector('#scoreboard h3');
        if (heading) heading.textContent = '🏆 Leaderboard';
        scoreboard.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = `player-score ${player.id === this.myId ? 'you' : ''}`;
            const displayName = player.id === this.myId ? 'You' : (player.username || `Player ${player.id.slice(0, 6)}`);
            playerDiv.innerHTML = `
                <span>${index + 1}. ${displayName}</span>
                <span>${player.kills}/${player.deaths}</span>
            `;
            this.scoreboardContent.appendChild(playerDiv);
        });
    }
    
    handlePlayerHit(data) {
        // Enhanced hit effects
        this.screenShake = 0.3;
        this.flashEffect = 0.3;
        // Create hit particles
        if (this.myId && this.players[this.myId]) {
            const player = this.players[this.myId];
            this.createParticles(player.x, player.y, '#ff0000', 8);
        }
        this.playSound('hit');
    }
    
    playSound(type) {
        if (this.sounds && this.sounds[type]) {
            this.sounds[type].currentTime = 0;
            this.sounds[type].play().catch(e => {
                // Log error if sound fails to play
                console.warn('Sound play error:', type, e);
            });
        }
        // Visual effects for shooting
        if (type === 'shoot' && this.myId && this.players[this.myId]) {
            const player = this.players[this.myId];
            // Muzzle flash at cannon
            this.createParticles(
                player.x + Math.cos(player.angle) * (this.tankSize/2 + 8),
                player.y + Math.sin(player.angle) * (this.tankSize/2 + 8),
                '#FFD600', 8
            );
            this.flashEffect = Math.max(this.flashEffect, 0.08);
        }
    }
    
    startPingMeasurement() {
        setInterval(() => {
            this.lastPingTime = Date.now();
            this.socket.emit('ping');
        }, 1000);
        
        this.socket.on('pong', () => {
            this.ping = Date.now() - this.lastPingTime;
        });
    }
    
    handlePlayerDeath(data) {
        this.isAlive = false;
        this.gameOver.style.display = 'block';
        // Show killer info
        if (data.killerUsername) {
            this.killerName.textContent = data.killerUsername;
            this.killerName.style.color = data.killerColor || '#ffd700';
        } else {
            this.killerName.textContent = 'Unknown';
            this.killerName.style.color = '#ffd700';
        }
        this.playSound('death');
        // Death explosion effect
        if (this.myId && this.players[this.myId]) {
            const player = this.players[this.myId];
            this.createParticles(player.x, player.y, '#ff0000', 24);
            this.screenShake = 0.5;
            this.flashEffect = 0.4;
        }
        // Spectate killer for 5 seconds, then return to menu
        let timeLeft = 5;
        this.respawnTimer.textContent = `Spectating killer... Returning to menu in ${timeLeft}`;
        const spectateInterval = setInterval(() => {
            timeLeft--;
            this.respawnTimer.textContent = `Spectating killer... Returning to menu in ${timeLeft}`;
            if (timeLeft <= 0) {
                clearInterval(spectateInterval);
                this.gameOver.style.display = 'none';
                window.location.href = 'menu.html';
            }
        }, 1000);
    }
    
    handlePlayerKill(data) {
        // Show kill confirmation
        this.playSound('kill');
        this.killPopupText = 'KILL!';
        this.killPopupTimer = 60; // Show for 1 second (60 frames)
        // Extra effect: brief glow
        if (this.myId && this.players[this.myId]) {
            const player = this.players[this.myId];
            this.createParticles(player.x, player.y, '#FFD600', 12);
            this.flashEffect = Math.max(this.flashEffect, 0.18);
        }
    }
    
    handlePlayerRespawn(data) {
        this.gameOver.style.display = 'none';
        this.isAlive = true;
        // Reset input state
        Object.keys(this.keys).forEach(k => this.keys[k] = false);
        this.isShooting = false;
        // Set mouse to player position and enable aiming immediately
        if (this.myId && this.players[this.myId]) {
            this.mouseX = this.players[this.myId].x;
            this.mouseY = this.players[this.myId].y;
        } else {
            this.mouseX = this.arenaWidth / 2;
            this.mouseY = this.arenaHeight / 2;
        }
        this.mouseInside = true;
        // Play spawn sound and effect
        this.playSound('spawn');
        this.createParticles(this.mouseX, this.mouseY, '#00eaff', 18);
        this.flashEffect = 0.15;
    }
    
    render() {
        // Camera follows the PREDICTED position of the local player for smoothness
        let camX = 0, camY = 0;
        const minimapMargin = 180; // px
        let localPlayer = this.players[this.myId];
        // Use predicted position if available
        if (this.myId && this.predictedPlayers[this.myId]) {
            localPlayer = this.predictedPlayers[this.myId];
        }
        if (this.myId && localPlayer) {
            camX = localPlayer.x - this.viewportWidth / 2;
            camY = localPlayer.y - this.viewportHeight / 2;
            // Clamp camera to map bounds, but add margin for minimap
            camX = Math.max(minimapMargin, Math.min(this.arenaWidth - this.viewportWidth, camX));
            camY = Math.max(minimapMargin, Math.min(this.arenaHeight - this.viewportHeight, camY));
            this.cameraX = camX;
            this.cameraY = camY;
        }
        // Always recalculate mouseX/mouseY from mouseScreenX/mouseScreenY and camera
        this.mouseX = this.cameraX + this.mouseScreenX;
        this.mouseY = this.cameraY + this.mouseScreenY;
        this.mouseX = Math.max(0, Math.min(this.arenaWidth, this.mouseX));
        this.mouseY = Math.max(0, Math.min(this.arenaHeight, this.mouseY));
        // Set canvas size to viewport
        this.canvas.width = this.viewportWidth;
        this.canvas.height = this.viewportHeight;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // All drawing is offset by camera
        this.ctx.save();
        this.ctx.translate(-this.cameraX, -this.cameraY);
        // Fill the entire map (void) with #F3F3F3
        this.ctx.fillStyle = '#F3F3F3';
        this.ctx.fillRect(0, 0, this.arenaWidth, this.arenaHeight);
        // Draw thick #B4B4B4 border around the arena
        this.ctx.save();
        this.ctx.strokeStyle = '#B4B4B4';
        this.ctx.lineWidth = this.borderThickness;
        this.ctx.shadowBlur = 0;
        this.ctx.strokeRect(
            this.borderThickness/2,
            this.borderThickness/2,
            this.arenaWidth - this.borderThickness,
            this.arenaHeight - this.borderThickness
        );
        this.ctx.restore();
        // Fill the arena area with #EAEAEA
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(this.borderThickness, this.borderThickness, this.arenaWidth - 2*this.borderThickness, this.arenaHeight - 2*this.borderThickness);
        this.ctx.clip();
        this.ctx.fillStyle = '#EAEAEA';
        this.ctx.fillRect(this.borderThickness, this.borderThickness, this.arenaWidth - 2*this.borderThickness, this.arenaHeight - 2*this.borderThickness);
        // Draw thin gray grid inside the arena
        this.ctx.strokeStyle = '#D0D0D0';
        this.ctx.lineWidth = 1;
        for (let x = this.borderThickness; x <= this.arenaWidth - this.borderThickness; x += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.borderThickness);
            this.ctx.lineTo(x, this.arenaHeight - this.borderThickness);
            this.ctx.stroke();
        }
        for (let y = this.borderThickness; y <= this.arenaHeight - this.borderThickness; y += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.borderThickness, y);
            this.ctx.lineTo(this.arenaWidth - this.borderThickness, y);
            this.ctx.stroke();
        }
        this.ctx.restore();
        // Draw obstacles as #B4B4B4 (only those in viewport)
        this.obstacles.forEach(obs => {
            if (
                obs.x + obs.w > this.cameraX &&
                obs.x < this.cameraX + this.viewportWidth &&
                obs.y + obs.h > this.cameraY &&
                obs.y < this.cameraY + this.viewportHeight
            ) {
                this.ctx.fillStyle = '#B4B4B4';
                this.ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            }
        });
        
        // Optimized rendering: only draw visible players
        Object.entries(this.players).forEach(([id, player]) => {
            if (!player.isAlive) return;
            let renderPlayer = player;
            // For the local player, use the predicted position for rendering
            if (id === this.myId && this.predictedPlayers[this.myId]) {
                renderPlayer = this.predictedPlayers[this.myId];
            }
            if (
                renderPlayer.x + this.tankSize/2 > 0 &&
                renderPlayer.x - this.tankSize/2 < this.arenaWidth &&
                renderPlayer.y + this.tankSize/2 > 0 &&
                renderPlayer.y - this.tankSize/2 < this.arenaHeight
            ) {
                const isMe = id === this.myId;
                // Draw invincibility aura if player is invincible
                if (player.invincible && player.invincibleTimer > 0) {
                    this.ctx.save();
                    const auraAlpha = Math.max(0.25, player.invincibleTimer / 1.5 * 0.7); // Fade out
                    this.ctx.globalAlpha = auraAlpha;
                    this.ctx.beginPath();
                    this.ctx.arc(player.x, player.y, this.tankSize * 0.95, 0, Math.PI * 2);
                    this.ctx.fillStyle = isMe ? 'rgba(0,200,255,0.5)' : 'rgba(255,255,0,0.5)';
                    this.ctx.shadowColor = isMe ? '#00eaff' : '#ffe600';
                    this.ctx.shadowBlur = 18;
                    this.ctx.fill();
                    this.ctx.restore();
                }
                // Draw happy face (entire face rotates to aim at mouse, mouth at front)
                this.ctx.save();
                this.ctx.translate(renderPlayer.x, renderPlayer.y);
                // Calculate angle from face to mouse
                let faceAngle = 0;
                if (id === this.myId && this.mouseInside) {
                    faceAngle = Math.atan2(this.mouseY - renderPlayer.y, this.mouseX - renderPlayer.x);
                } else if (renderPlayer.angle !== undefined) {
                    faceAngle = renderPlayer.angle;
                }
                // Rotate so mouth is at the front (anticlockwise 90deg)
                this.ctx.rotate(faceAngle - Math.PI/2);
                // Face base
                this.ctx.beginPath();
                this.ctx.arc(0, 0, this.tankSize/2, 0, Math.PI * 2);
                this.ctx.fillStyle = '#FFD600';
                this.ctx.fill();
                this.ctx.lineWidth = 2;
                this.ctx.strokeStyle = '#000';
                this.ctx.stroke();
                // Eyes
                this.ctx.beginPath();
                this.ctx.arc(-this.tankSize/6, -this.tankSize/8, this.tankSize/12, 0, Math.PI * 2);
                this.ctx.arc(this.tankSize/6, -this.tankSize/8, this.tankSize/12, 0, Math.PI * 2);
                this.ctx.fillStyle = '#000';
                this.ctx.fill();
                // Smile (arc)
                this.ctx.beginPath();
                this.ctx.arc(0, this.tankSize/4.5, this.tankSize/5, 0.15 * Math.PI, 0.85 * Math.PI);
                this.ctx.lineWidth = 2;
                this.ctx.strokeStyle = '#000';
                this.ctx.stroke();
                // Mouth opening (for bullet spawn)
                this.ctx.beginPath();
                this.ctx.arc(0, this.tankSize/3.2, this.tankSize/10, 0, Math.PI * 2);
                this.ctx.fillStyle = '#fff';
                this.ctx.fill();
                // Cannon sticking out of the mouth
                this.ctx.fillStyle = '#222';
                this.ctx.fillRect(-this.tankSize/16, this.tankSize/3.2, this.tankSize/8, this.tankSize/2.2);
                this.ctx.restore();
                
                // Add red glow for enemies only
                if (!isMe) {
                    this.ctx.save();
                    this.ctx.shadowColor = '#e53935';
                    this.ctx.shadowBlur = 18;
                    this.ctx.beginPath();
                    this.ctx.arc(player.x, player.y, this.tankSize * 0.7, 0, Math.PI * 2);
                    this.ctx.fillStyle = 'rgba(229,57,53,0.18)';
                    this.ctx.fill();
                    this.ctx.restore();
                }
            }
        });
        
        // Optimized rendering: only draw visible bullets
        this.bullets.forEach(bullet => {
            if (
                bullet.x + this.bulletSize > 0 &&
                bullet.x - this.bulletSize < this.arenaWidth &&
                bullet.y + this.bulletSize > 0 &&
                bullet.y - this.bulletSize < this.arenaHeight
            ) {
                const isMyBullet = bullet.owner === this.myId;
                const color = isMyBullet ? '#000' : '#e53935';
                this.ctx.save();
                // Bullet trail
                this.ctx.globalAlpha = 0.18;
                for (let t = 1; t <= 4; t++) {
                    this.ctx.beginPath();
                    this.ctx.ellipse(
                        bullet.x - (bullet.vx/this.fps) * t * 0.7,
                        bullet.y - (bullet.vy/this.fps) * t * 0.7,
                        this.bulletSize * 0.8 * (1 - t*0.13),
                        this.bulletSize * 0.5 * (1 - t*0.13),
                        0, 0, Math.PI * 2
                    );
                    this.ctx.fillStyle = color;
                    this.ctx.fill();
                }
                this.ctx.globalAlpha = 1.0;
                // Animate bullet scale for realism
                const scale = 1 + 0.12 * Math.sin(Date.now()/60 + bullet.x + bullet.y);
                this.ctx.beginPath();
                this.ctx.ellipse(bullet.x, bullet.y, this.bulletSize * 0.8 * scale, this.bulletSize * 0.5 * scale, 0, 0, Math.PI * 2);
                this.ctx.fillStyle = color;
                this.ctx.fill();
                this.ctx.lineWidth = 1;
                this.ctx.strokeStyle = '#000';
                this.ctx.stroke();
                this.ctx.restore();
            }
        });
        
        // Draw particles
        this.particles.forEach(particle => {
            this.ctx.save();
            this.ctx.globalAlpha = particle.alpha;
            this.ctx.fillStyle = particle.color;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });
        
        // Draw bullet impact shockwaves
        this.bulletImpacts.forEach(impact => {
            this.ctx.save();
            this.ctx.globalAlpha = impact.alpha;
            this.ctx.beginPath();
            this.ctx.arc(impact.x, impact.y, impact.radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = impact.type === 'wall' ? '#888' : '#FFD600';
            this.ctx.lineWidth = 2.5;
            this.ctx.shadowColor = impact.type === 'wall' ? '#888' : '#FFD600';
            this.ctx.shadowBlur = 8;
            this.ctx.stroke();
            this.ctx.restore();
        });
        
        this.ctx.restore(); // End camera translation
        // --- Draw screen-space overlays (crosshair, flash, popups, minimap) ---
        // Draw minimap in top-left
        this.drawMinimap();
        // Draw crosshair for current player (no aiming line)
        if (this.myId && this.players[this.myId] && this.isAlive && this.mouseInside) {
            // Use mouseScreenX/mouseScreenY for crosshair
            const clampedX = Math.max(0, Math.min(this.viewportWidth, this.mouseScreenX));
            const clampedY = Math.max(0, Math.min(this.viewportHeight, this.mouseScreenY));
            // Draw a '+' crosshair at mouse position
            const size = 10;
            this.ctx.save();
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            // Horizontal line
            this.ctx.moveTo(clampedX - size, clampedY);
            this.ctx.lineTo(clampedX + size, clampedY);
            // Vertical line
            this.ctx.moveTo(clampedX, clampedY - size);
            this.ctx.lineTo(clampedX, clampedY + size);
            this.ctx.stroke();
            this.ctx.restore();
        }
        // Draw flash effect (always covers the whole canvas)
        if (this.flashEffect > 0) {
            this.ctx.save();
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.flashEffect})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }
        // Draw kill popup if active (screen space)
        if (this.killPopupTimer > 0) {
            this.ctx.save();
            this.ctx.globalAlpha = Math.min(1, this.killPopupTimer / 20);
            this.ctx.font = 'bold 48px Segoe UI, Arial';
            this.ctx.fillStyle = '#FFD600';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(this.killPopupText, this.canvas.width/2, 80);
            this.ctx.restore();
        }
        
        // Improve game over effect
        if (!this.isAlive) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.6;
            this.ctx.fillStyle = '#fff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalAlpha = 1.0;
            this.ctx.font = 'bold 54px Segoe UI, Arial';
            this.ctx.fillStyle = '#222';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Game Over', this.canvas.width/2, this.canvas.height/2 - 30);
            this.ctx.font = '24px Segoe UI, Arial';
            this.ctx.fillStyle = '#444';
            this.ctx.fillText('You fought bravely! Click to play again.', this.canvas.width/2, this.canvas.height/2 + 20);
            this.ctx.restore();
        }
        
        this.ctx.restore();
    }
    
    updateQuitBarPosition() {
        const quitBarContainer = document.getElementById('quitBarContainer');
        if (!quitBarContainer || !this.myId || !this.players[this.myId]) return;
        // Ensure the bar is visible before measuring
        quitBarContainer.style.display = 'block';
        const player = this.players[this.myId];
        const canvas = this.canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        quitBarContainer.style.left = (rect.left + (player.x - this.cameraX) * scaleX - quitBarContainer.offsetWidth/2) + 'px';
        quitBarContainer.style.top = (rect.top + (player.y - this.cameraY - 60) * scaleY) + 'px';
        quitBarContainer.style.position = 'fixed';
        // Optionally hide again if needed elsewhere
    }
    
    gameLoop(currentTime) {
        // Calculate FPS
        if (this.lastFrameTime) {
            const deltaTime = currentTime - this.lastFrameTime;
            this.fps = Math.round(1000 / deltaTime);
        }
        this.lastFrameTime = currentTime;
        
        // Update effects
        this.updateEffects();
        
        // Interpolate game state for smooth rendering
        this.interpolateGameState();
        
        // Send input
        this.sendInput();
        
        // Render
        this.render();
        
        // Update UI
        this.updateUI();
        this.updateQuitBarPosition();
        
        // Continue loop
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    interpolateGameState() {
        if (this.serverUpdateBuffer.length < 2) return;
        
        const currentTime = Date.now();
        const targetTime = currentTime - this.interpolationDelay;
        
        // Find the two server updates to interpolate between
        let prevUpdate = null;
        let nextUpdate = null;
        
        for (let i = 0; i < this.serverUpdateBuffer.length - 1; i++) {
            if (this.serverUpdateBuffer[i].timestamp <= targetTime && 
                this.serverUpdateBuffer[i + 1].timestamp >= targetTime) {
                prevUpdate = this.serverUpdateBuffer[i];
                nextUpdate = this.serverUpdateBuffer[i + 1];
                break;
            }
        }
        
        if (!prevUpdate || !nextUpdate) return;
        
        // Calculate interpolation factor
        const timeDiff = nextUpdate.timestamp - prevUpdate.timestamp;
        const alpha = timeDiff > 0 ? (targetTime - prevUpdate.timestamp) / timeDiff : 0;
        
        // Interpolate players
        this.interpolatedPlayers = {};
        const allPlayerIds = new Set([
            ...Object.keys(prevUpdate.players),
            ...Object.keys(nextUpdate.players)
        ]);
        
        allPlayerIds.forEach(playerId => {
            const prevPlayer = prevUpdate.players[playerId];
            const nextPlayer = nextUpdate.players[playerId];
            
            if (prevPlayer && nextPlayer) {
                // Interpolate position and angle
                this.interpolatedPlayers[playerId] = {
                    ...prevPlayer,
                    x: prevPlayer.x + (nextPlayer.x - prevPlayer.x) * alpha,
                    y: prevPlayer.y + (nextPlayer.y - prevPlayer.y) * alpha,
                    angle: this.interpolateAngle(prevPlayer.angle, nextPlayer.angle, alpha)
                };
            } else if (prevPlayer) {
                this.interpolatedPlayers[playerId] = prevPlayer;
            } else if (nextPlayer) {
                this.interpolatedPlayers[playerId] = nextPlayer;
            }
        });
        
        // Interpolate bullets
        this.interpolatedBullets = [];
        const allBullets = new Set([
            ...prevUpdate.bullets.map(b => b.owner + '_' + b.x + '_' + b.y),
            ...nextUpdate.bullets.map(b => b.owner + '_' + b.x + '_' + b.y)
        ]);
        
        allBullets.forEach(bulletKey => {
            const prevBullet = prevUpdate.bullets.find(b => b.owner + '_' + b.x + '_' + b.y === bulletKey);
            const nextBullet = nextUpdate.bullets.find(b => b.owner + '_' + b.x + '_' + b.y === bulletKey);
            
            if (prevBullet && nextBullet) {
                this.interpolatedBullets.push({
                    ...prevBullet,
                    x: prevBullet.x + (nextBullet.x - prevBullet.x) * alpha,
                    y: prevBullet.y + (nextBullet.y - prevBullet.y) * alpha
                });
            } else if (prevBullet) {
                this.interpolatedBullets.push(prevBullet);
            } else if (nextBullet) {
                this.interpolatedBullets.push(nextBullet);
            }
        });
        
        // Use interpolated data for rendering
        this.players = this.interpolatedPlayers;
        this.bullets = this.interpolatedBullets;
        // Clean up players/bullets that no longer exist on the server
        const serverPlayerIds = new Set(Object.keys(nextUpdate.players));
        Object.keys(this.predictedPlayers).forEach(pid => {
            if (!serverPlayerIds.has(pid)) delete this.predictedPlayers[pid];
        });
        // Apply client-side prediction for local player with smoothing reconciliation
        if (this.myId && this.predictedPlayers[this.myId]) {
            const serverPlayer = this.interpolatedPlayers[this.myId];
            const predictedPlayer = this.predictedPlayers[this.myId];
            if (serverPlayer) {
                // Check if server position is too different from prediction
                const distance = Math.hypot(serverPlayer.x - predictedPlayer.x, serverPlayer.y - predictedPlayer.y);
                if (distance > this.reconciliationThreshold) {
                    // Server caught cheating or major desync - snap to server position
                    this.predictedPlayers[this.myId] = { ...serverPlayer };
                    this.players[this.myId] = { ...serverPlayer };
                    // Optionally, log or show a warning
                } else {
                    // Smoothly lerp predicted position toward server position
                    const smoothing = 0.15; // 0 = no smoothing, 1 = instant snap
                    this.predictedPlayers[this.myId].x += (serverPlayer.x - predictedPlayer.x) * smoothing;
                    this.predictedPlayers[this.myId].y += (serverPlayer.y - predictedPlayer.y) * smoothing;
                    this.predictedPlayers[this.myId].angle = this.interpolateAngle(predictedPlayer.angle, serverPlayer.angle, smoothing);
                    // Use predicted for rendering
                    this.players[this.myId] = this.predictedPlayers[this.myId];
                }
            } else {
                // No server data yet, use prediction
                this.players[this.myId] = predictedPlayer;
            }
        }
    }
    
    interpolateAngle(prevAngle, nextAngle, alpha) {
        // Handle angle wrapping for smooth rotation
        let diff = nextAngle - prevAngle;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        return prevAngle + diff * alpha;
    }
    
    updateEffects() {
        // Update screen shake
        if (this.screenShake > 0) {
            this.screenShake *= 0.9;
            if (this.screenShake < 0.1) this.screenShake = 0;
        }
        
        // Update flash effect
        if (this.flashEffect > 0) {
            this.flashEffect *= 0.95;
            if (this.flashEffect < 0.05) this.flashEffect = 0;
        }
        
        // Update particles
        this.particles = this.particles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life -= 1;
            particle.alpha *= 0.98;
            return particle.life > 0 && particle.alpha > 0.1;
        });

        // Update bullet impact shockwaves
        this.bulletImpacts = this.bulletImpacts.filter(impact => {
            impact.radius += 2.5;
            impact.alpha *= 0.92;
            return impact.radius < impact.maxRadius && impact.alpha > 0.05;
        });

        // Update kill popup timer
        if (this.killPopupTimer > 0) {
            this.killPopupTimer--;
        }
    }
    
    createParticles(x, y, color, count = 5) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                color: color,
                life: 30,
                alpha: 1
            });
        }
    }

    spawnBulletImpactEffect(x, y, type) {
        // Burst of particles
        const color = type === 'wall' ? '#888' : '#FFD600';
        this.createParticles(x, y, color, 12);
        // Shockwave effect
        this.bulletImpacts.push({ x, y, radius: 0, maxRadius: 22, alpha: 0.35, type });
    }

    // Add client-side collidesWithObstacle
    collidesWithObstacle(x, y, size) {
        return this.obstacles.some(obs =>
            x + size/2 > obs.x && x - size/2 < obs.x + obs.w &&
            y + size/2 > obs.y && y - size/2 < obs.y + obs.h
        );
    }

    // Remove resizeCanvas() method
    drawMinimap() {
        // Minimap config
        const mapW = 160, mapH = 160;
        const pad = 16;
        const x0 = pad, y0 = pad; // Top-left corner
        // Background
        this.ctx.save();
        this.ctx.globalAlpha = 0.75;
        this.ctx.fillStyle = '#fff';
        this.ctx.strokeStyle = '#bbb';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.roundRect(x0, y0, mapW, mapH, 14);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.globalAlpha = 1.0;
        // Map scale
        const scaleX = mapW / this.arenaWidth;
        const scaleY = mapH / this.arenaHeight;
        // Obstacles
        this.obstacles.forEach(obs => {
            this.ctx.save();
            this.ctx.fillStyle = '#B4B4B4';
            this.ctx.globalAlpha = 0.7;
            this.ctx.fillRect(
                x0 + obs.x * scaleX,
                y0 + obs.y * scaleY,
                obs.w * scaleX,
                obs.h * scaleY
            );
            this.ctx.restore();
        });
        // Other players (red shining dots)
        Object.entries(this.players).forEach(([id, player]) => {
            if (!player.isAlive) return;
            if (id === this.myId) return;
            const px = x0 + player.x * scaleX;
            const py = y0 + player.y * scaleY;
            this.ctx.save();
            // Shining effect
            const shine = 0.5 + 0.5 * Math.sin(Date.now() / 200 + player.x + player.y);
            this.ctx.globalAlpha = 0.7 + 0.3 * shine;
            this.ctx.beginPath();
            this.ctx.arc(px, py, 7, 0, Math.PI * 2);
            this.ctx.fillStyle = '#e53935';
            this.ctx.shadowColor = '#ff0000';
            this.ctx.shadowBlur = 12;
            this.ctx.fill();
            this.ctx.restore();
        });
        // Your player (green arrow)
        if (this.myId && this.players[this.myId]) {
            const me = this.players[this.myId];
            const px = x0 + me.x * scaleX;
            const py = y0 + me.y * scaleY;
            const angle = me.angle || 0;
            this.ctx.save();
            this.ctx.translate(px, py);
            this.ctx.rotate(angle + Math.PI/2); // Fix: arrow points the correct way
            // Sleek triangle pointer
            this.ctx.beginPath();
            this.ctx.moveTo(0, -8); // tip
            this.ctx.lineTo(5, 6);  // right base
            this.ctx.lineTo(0, 3);  // center base
            this.ctx.lineTo(-5, 6); // left base
            this.ctx.closePath();
            this.ctx.fillStyle = '#00c853';
            this.ctx.shadowColor = '#00e676';
            this.ctx.shadowBlur = 6;
            this.ctx.fill();
            this.ctx.restore();
        }
        // Minimap border
        this.ctx.save();
        this.ctx.lineWidth = 2.5;
        this.ctx.strokeStyle = '#888';
        this.ctx.beginPath();
        this.ctx.roundRect(x0, y0, mapW, mapH, 18);
        this.ctx.stroke();
        this.ctx.restore();
    }
}

// Start the game when page loads
window.addEventListener('load', () => {
    new TankGameClient();
}); 

window.addEventListener('DOMContentLoaded', () => {
    const quitOverlay = document.getElementById('quitOverlay');
    const quitBar = document.getElementById('quitBar');
    let quitInterval = null;
    let quitStart = null;
    let quitting = false;
    document.addEventListener('keydown', (e) => {
        if (e.key === 'p' || e.key === 'P') {
            if (!quitting) {
                quitting = true;
                quitOverlay.style.display = 'flex';
                quitStart = Date.now();
                quitBar.style.width = '0';
                quitInterval = setInterval(() => {
                    const elapsed = (Date.now() - quitStart) / 1000;
                    const percent = Math.min(elapsed / 3, 1);
                    quitBar.style.width = (percent * 100) + '%';
                    if (percent >= 1) {
                        clearInterval(quitInterval);
                        window.location.href = 'menu.html';
                    }
                }, 30);
            }
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'p' || e.key === 'P') {
            quitting = false;
            quitOverlay.style.display = 'none';
            quitBar.style.width = '0';
            if (quitInterval) clearInterval(quitInterval);
        }
    });
}); 