import Phaser from 'phaser';
import io from 'socket.io-client';
import MainScene from './scenes/MainScene';

const socket = io('http://localhost:3000');

const config = {
  type: Phaser.AUTO,
  width: 1024,
  height: 768,
  physics: { default: 'arcade' },
  scene: [MainScene]
};

const game = new Phaser.Game(config);
game.socket = socket;
