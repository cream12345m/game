# Tank Deathmatch - Multiplayer Browser Game

A simplified browser-based multiplayer tank game similar to BlockTanks.io's Deathmatch mode, built with Node.js and HTML5 Canvas.

## 🎮 Features

### Core Gameplay
- **Real-time multiplayer combat** with multiple players
- **WASD/Arrow keys movement** with smooth physics
- **Mouse aiming** with crosshair and aiming line
- **Click to shoot** with cooldown system
- **Health and damage system** (100 HP, 25 damage per hit)
- **Death and respawn system** (3-second respawn timer)
- **Kill/death tracking** with live scoreboard

### Visual Features
- **Color-coded tanks**: Green (your tank), Red (enemy tanks)
- **Color-coded bullets**: Cyan (your bullets), Yellow (enemy bullets)
- **Health bars** above enemy tanks
- **Aiming line** from tank to mouse cursor
- **Crosshair** for precise aiming
- **Death screen** with respawn countdown

### Multiplayer Features
- **Real-time synchronization** via WebSockets
- **Live scoreboard** showing kills/deaths
- **Player info panel** with health and stats
- **Automatic respawning** at random locations

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   The server will start on port 3000.

3. **Open your browser** and navigate to `http://localhost:3000`

4. **Open multiple browser tabs** to test multiplayer functionality

## 🎯 Controls

- **WASD** or **Arrow Keys**: Move tank
- **Mouse**: Aim tank cannon
- **Left Click**: Shoot bullets
- **Shooting has a 0.3-second cooldown**

## 🎮 Game Mechanics

### Tank System
- **Tank size**: 30x30 pixels
- **Movement speed**: 200 pixels/second
- **Arena boundaries**: 1200x800 pixels
- **Random spawn points** with margin from edges

### Combat System
- **Health**: 100 HP per tank
- **Bullet damage**: 25 HP per hit (4 hits to kill)
- **Bullet speed**: 500 pixels/second
- **Bullet lifetime**: 2 seconds
- **Bullet size**: 6 pixels radius

### Respawn System
- **Respawn time**: 3 seconds
- **Random spawn locations** avoiding arena edges
- **Full health restoration** on respawn

## 🏗️ Technical Architecture

### Backend (Node.js)
- **Express.js** for HTTP server
- **Socket.IO** for real-time WebSocket communication
- **60 FPS game loop** for smooth gameplay
- **Server-authoritative** game logic for fairness

### Frontend (HTML5 Canvas)
- **Vanilla JavaScript** with Canvas API
- **Real-time rendering** at 60 FPS
- **Responsive input handling** for smooth controls
- **Clean, modular code structure**

### Networking
- **WebSocket communication** for real-time updates
- **Input validation** and anti-cheat measures
- **Efficient state synchronization**
- **Automatic reconnection** handling

## 📁 Project Structure

```
tank-deathmatch/
├── server/
│   ├── index.js          # Express server setup
│   └── gameLogic.js      # Game logic and state management
├── client/
│   └── src/
│       ├── index.html    # Game interface
│       └── game.js       # Client-side game logic
├── package.json          # Dependencies and scripts
└── README.md            # This file
```

## 🎨 Visual Design

### Color Scheme
- **Your tank**: Green (#00ff00)
- **Enemy tanks**: Red (#ff0000)
- **Your bullets**: Cyan (#00ffff)
- **Enemy bullets**: Yellow (#ffff00)
- **Arena**: Dark background (#0a0a0a)
- **UI**: Dark theme with gold accents

### UI Elements
- **Scoreboard**: Top-right corner
- **Player info**: Top-left corner
- **Controls**: Bottom-left corner
- **Death screen**: Center overlay
- **Loading screen**: Connection status

## 🔧 Development

### Running in Development Mode
```bash
npm run dev  # Uses nodemon for auto-restart
```

### Building for Production
```bash
npm run build  # Build client assets
```

### Health Check
Visit `http://localhost:3000/health` for server status and game statistics.

## 🐛 Troubleshooting

### Common Issues

1. **Server won't start**: Check if port 3000 is available
2. **Client won't connect**: Ensure server is running first
3. **Performance issues**: Close other browser tabs
4. **Multiplayer not working**: Check firewall settings

### Browser Compatibility
- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge

## 🚀 Future Enhancements

- [ ] Power-ups and special abilities
- [ ] Different tank types
- [ ] Team-based gameplay modes
- [ ] Customizable controls
- [ ] Sound effects and music
- [ ] Particle effects and animations
- [ ] Chat system
- [ ] Spectator mode
- [ ] Map editor
- [ ] Persistent player stats

## 📄 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests to improve the game!

---

**Enjoy playing Tank Deathmatch! 🎮💥** 