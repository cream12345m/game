// client/src/game.js - Enhanced Tank Deathmatch Client

class TankGameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        // Remove responsive canvas sizing
        // window.addEventListener('resize', () => this.resizeCanvas());
        // this.resizeCanvas();
        
        // Get parameters from URL
        this.gameParams = this.getUrlParameters();
        this.username = this.gameParams.username || 'Player';
        this.serverUrl = this.gameParams.server || 'localhost:8000';
        
        this.socket = io(this.serverUrl);
        
        // Game state
        this.players = {};
        this.bullets = [];
        this.myId = null;
        this.isAlive = true;
        
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
        this.mouseX = 0;
        this.mouseY = 0;
        this.isShooting = false;
        this.mouseInside = false;
        
        // Game settings
        this.tankSize = 30;
        this.bulletSize = 6;
        this.arenaWidth = 1200;
        this.arenaHeight = 800;
        
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
        window.addEventListener('pointerdown', () => {
            if (this.sounds) {
                Object.values(this.sounds).forEach(audio => {
                    if (audio && audio.paused) {
                        audio.play().catch(() => {});
                        audio.pause();
                        audio.currentTime = 0;
                    }
                });
            }
        }, { once: true });
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
        this.mouseX = this.arenaWidth / 2;
        this.mouseY = this.arenaHeight / 2;
        this.mouseInside = false;
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
            this.mouseX = Math.max(0, Math.min((e.clientX - rect.left) * scaleX, this.canvas.width));
            this.mouseY = Math.max(0, Math.min((e.clientY - rect.top) * scaleY, this.canvas.height));
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
            this.playSound('shoot');
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
            this.players = gameState.players;
            this.bullets = gameState.bullets;
            this.obstacles = gameState.obstacles || [];
            
            // Set my ID if not set
            if (!this.myId && this.players[this.socket.id]) {
                this.myId = this.socket.id;
                this.updateUI();
            }
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
    }
    
    sendInput() {
        if (!this.myId || !this.isAlive || !this.mouseInside) return;
        // Send screen mouse coordinates (same as world now)
        this.socket.emit('playerInput', {
            keys: this.keys,
            mouseX: this.mouseX,
            mouseY: this.mouseY,
            shoot: this.isShooting
        });
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
            this.sounds[type].play();
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
        console.log(`🏆 You killed Player ${data.targetId.slice(0, 6)}!`);
    }
    
    handlePlayerRespawn(data) {
        this.gameOver.style.display = 'none';
        this.isAlive = true;
        // Reset input state
        Object.keys(this.keys).forEach(k => this.keys[k] = false);
        this.isShooting = false;
        // Reset mouse to center
        this.mouseX = this.arenaWidth / 2;
        this.mouseY = this.arenaHeight / 2;
        this.mouseInside = false;
    }
    
    render() {
        // Always render the whole map, no camera
        this.canvas.width = this.arenaWidth;
        this.canvas.height = this.arenaHeight;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // No camera translation
        
        // Fill the entire canvas (void) with #F3F3F3
        this.ctx.fillStyle = '#F3F3F3';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw thick #B4B4B4 border around the arena (no shadow, no dark outline)
        const borderThickness = 24;
        this.ctx.save();
        this.ctx.strokeStyle = '#B4B4B4';
        this.ctx.lineWidth = borderThickness;
        this.ctx.shadowBlur = 0;
        this.ctx.strokeRect(
            borderThickness/2,
            borderThickness/2,
            this.arenaWidth - borderThickness,
            this.arenaHeight - borderThickness
        );
        this.ctx.restore();
        
        // Fill the arena area with #EAEAEA
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(borderThickness, borderThickness, this.arenaWidth - 2*borderThickness, this.arenaHeight - 2*borderThickness);
        this.ctx.clip();
        this.ctx.fillStyle = '#EAEAEA';
        this.ctx.fillRect(borderThickness, borderThickness, this.arenaWidth - 2*borderThickness, this.arenaHeight - 2*borderThickness);
        
        // Draw thin gray grid inside the arena
        this.ctx.strokeStyle = '#D0D0D0';
        this.ctx.lineWidth = 1;
        for (let x = borderThickness; x <= this.arenaWidth - borderThickness; x += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, borderThickness);
            this.ctx.lineTo(x, this.arenaHeight - borderThickness);
            this.ctx.stroke();
        }
        for (let y = borderThickness; y <= this.arenaHeight - borderThickness; y += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(borderThickness, y);
            this.ctx.lineTo(this.arenaWidth - borderThickness, y);
            this.ctx.stroke();
        }
        this.ctx.restore();
        
        // Draw obstacles as #B4B4B4
        this.obstacles.forEach(obs => {
            if (
                obs.x + obs.w > 0 &&
                obs.x < this.arenaWidth &&
                obs.y + obs.h > 0 &&
                obs.y < this.arenaHeight
            ) {
                this.ctx.fillStyle = '#B4B4B4';
                this.ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
                this.ctx.strokeStyle = '#888';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
            }
        });
        
        // Optimized rendering: only draw visible players
        Object.entries(this.players).forEach(([id, player]) => {
            if (!player.isAlive) return;
            if (
                player.x + this.tankSize/2 > 0 && // Always draw players in world coordinates
                player.x - this.tankSize/2 < this.arenaWidth &&
                player.y + this.tankSize/2 > 0 && // Always draw players in world coordinates
                player.y - this.tankSize/2 < this.arenaHeight
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
                this.ctx.translate(player.x, player.y);
                // Calculate angle from face to mouse
                let faceAngle = 0;
                if (id === this.myId && this.mouseInside) {
                    faceAngle = Math.atan2(this.mouseY - player.y, this.mouseX - player.x);
                } else if (player.angle !== undefined) {
                    faceAngle = player.angle;
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
        
        // Draw crosshair for current player (no aiming line)
        if (this.myId && this.players[this.myId] && this.isAlive && this.mouseInside) {
            // Draw a '+' crosshair at mouse position
            const size = 10;
            this.ctx.save();
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            // Horizontal line
            this.ctx.moveTo(this.mouseX - size, this.mouseY);
            this.ctx.lineTo(this.mouseX + size, this.mouseY);
            // Vertical line
            this.ctx.moveTo(this.mouseX, this.mouseY - size);
            this.ctx.lineTo(this.mouseX, this.mouseY + size);
            this.ctx.stroke();
            this.ctx.restore();
        }
        
        // Apply flash effect
        if (this.flashEffect > 0) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.flashEffect})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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
        // Get player position in canvas coordinates
        const player = this.players[this.myId];
        // Project to screen coordinates
        const canvas = this.canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        const screenX = rect.left + player.x * scaleX;
        const screenY = rect.top + player.y * scaleY;
        // Position the bar above the player (30px above)
        quitBarContainer.style.left = (screenX - quitBarContainer.offsetWidth/2) + 'px';
        quitBarContainer.style.top = (screenY - 60) + 'px';
        quitBarContainer.style.position = 'fixed';
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

    // Remove resizeCanvas() method
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