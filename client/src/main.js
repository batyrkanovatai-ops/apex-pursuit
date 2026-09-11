const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#111318',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight
  },
  input: { activePointers: 3 },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [MenuScene, GameScene],
  fps: { target: 60, forceSetTimeOut: false }
};

const game = new Phaser.Game(config);
