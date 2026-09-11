// ===== ФИЗИКА МАШИНЫ =====
class Car {
  constructor(config) {
    this.x = config.x || 0;
    this.y = config.y || 0;
    this.heading = config.heading || 0;

    this.maxSpeed = config.maxSpeed ?? 420;
    this.maxReverseSpeed = config.maxReverseSpeed ?? 160;
    this.acceleration = config.acceleration ?? 260;
    this.braking = config.braking ?? 420;
    this.mass = config.mass ?? 1.0;
    this.grip = config.grip ?? 2.6;
    this.handling = config.handling ?? 2.6;
    this.drift = config.drift ?? 0.55;
    this.dragCoefficient = 0.6;

    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
  }

  update(dt, input, surfaceGrip = 1.0) {
    const massFactor = 1 / this.mass;

    if (input.throttle > 0) {
      this.forwardSpeed += this.acceleration * massFactor * input.throttle * dt;
    } else if (input.brake > 0) {
      if (this.forwardSpeed > 0) {
        this.forwardSpeed -= this.braking * massFactor * input.brake * dt;
      } else {
        this.forwardSpeed -= this.acceleration * 0.6 * massFactor * input.brake * dt;
      }
    } else {
      const drag = this.dragCoefficient * this.forwardSpeed * dt;
      this.forwardSpeed -= drag;
    }

    let currentGrip = this.grip * surfaceGrip;
    if (input.handbrake) {
      currentGrip *= 0.18;
      this.forwardSpeed -= this.forwardSpeed * 1.4 * dt;
    }

    this.forwardSpeed = Phaser.Math.Clamp(this.forwardSpeed, -this.maxReverseSpeed, this.maxSpeed);

    const speedRatio = Phaser.Math.Clamp(Math.abs(this.forwardSpeed) / this.maxSpeed, 0, 1);
    const turnEfficiency = 0.35 + speedRatio * 0.65;
    const direction = this.forwardSpeed >= 0 ? 1 : -1;

    const turnRate = input.steer * this.handling * turnEfficiency * direction;
    this.heading += turnRate * dt;

    const slipAmount = -input.steer * this.forwardSpeed * this.drift * (0.4 + speedRatio * 0.6) * dt;
    this.lateralSpeed += slipAmount;

    this.lateralSpeed -= this.lateralSpeed * currentGrip * dt;

    const cos = Math.cos(this.heading);
    const sin = Math.sin(this.heading);

    const vx = cos * this.forwardSpeed - sin * this.lateralSpeed;
    const vy = sin * this.forwardSpeed + cos * this.lateralSpeed;

    this.x += vx * dt;
    this.y += vy * dt;
  }

  getSpeedKmh() {
    return Math.round(Math.abs(this.forwardSpeed) * 0.12);
  }
}

// ===== МЕНЮ =====
class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#111318');

    this.add.text(width / 2, height * 0.28, 'ШАШКИ ПО БИШКЕКУ', {
      fontFamily: 'Arial Black, Arial', fontSize: '38px', color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.28 + 44, 'art by atai', {
      fontFamily: 'Arial', fontSize: '14px', color: '#888888'
    }).setOrigin(0.5);

    this.createButton(width / 2, height * 0.5, 'SINGLE PLAYER', () => {
      this.scene.start('GameScene');
    });

    this.createButton(width / 2, height * 0.5 + 80, 'MULTIPLAYER', () => {
      this.showComingSoon();
    });
  }

  createButton(x, y, label, onClick) {
    const btn = this.add.rectangle(x, y, 280, 60, 0x2563eb).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontFamily: 'Arial', fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(0x3b82f6));
    btn.on('pointerout', () => btn.setFillStyle(0x2563eb));
    btn.on('pointerdown', onClick);
  }

  showComingSoon() {
    if (this.comingSoonText) return;
    this.comingSoonText = this.add.text(this.scale.width / 2, this.scale.height * 0.5 + 140,
      'Мультиплеер будет добавлен на этапе 3', { fontSize: '14px', color: '#f59e0b' }
    ).setOrigin(0.5);
    this.time.delayedCall(2000, () => {
      this.comingSoonText.destroy();
      this.comingSoonText = null;
    });
  }
}

// ===== ИГРОВАЯ СЦЕНА =====
class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    this.createCarTexture();
  }

  create() {
    this.buildWorld();
    this.buildPlayerCar();
    this.setupCamera();
    this.setupKeyboard();
    this.setupTouchControls();
    this.setupHUD();
  }

  createCarTexture() {
    const g = this.add.graphics();
    const w = 44, h = 92;

    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(w / 2, h / 2 + 6, w * 0.9, h * 0.5);

    g.fillStyle(0xd63333, 1);
    g.fillRoundedRect(4, 2, w - 8, h - 4, 14);

    g.fillStyle(0x1b2733, 1);
    g.fillRoundedRect(9, 14, w - 18, 20, 6);
    g.fillRoundedRect(9, h - 34, w - 18, 18, 6);

    g.lineStyle(2, 0x7a1414, 1);
    g.strokeRoundedRect(4, 2, w - 8, h - 4, 14);

    g.fillStyle(0xfff3b0, 1);
    g.fillRoundedRect(6, 2, 8, 6, 2);
    g.fillRoundedRect(w - 14, 2, 8, 6, 2);

    g.fillStyle(0xff3b3b, 1);
    g.fillRoundedRect(6, h - 8, 8, 6, 2);
    g.fillRoundedRect(w - 14, h - 8, 8, 6, 2);

    g.fillStyle(0x111111, 1);
    g.fillRoundedRect(-2, 16, 8, 18, 3);
    g.fillRoundedRect(w - 6, 16, 8, 18, 3);
    g.fillRoundedRect(-2, h - 34, 8, 18, 3);
    g.fillRoundedRect(w - 6, h - 34, 8, 18, 3);

    g.generateTexture('car_player', w, h);
    g.destroy();

    const tile = this.add.graphics();
    const ts = 128;
    tile.fillStyle(0x2b2f36, 1);
    tile.fillRect(0, 0, ts, ts);
    tile.fillStyle(0x3a3f47, 1);
    for (let i = 0; i < 40; i++) {
      tile.fillRect(Phaser.Math.Between(0, ts), Phaser.Math.Between(0, ts), 2, 2);
    }
    tile.generateTexture('asphalt_tile', ts, ts);
    tile.destroy();
  }

  buildWorld() {
    this.worldWidth = 3000;
    this.worldHeight = 3000;

    this.add.tileSprite(0, 0, this.worldWidth, this.worldHeight, 'asphalt_tile').setOrigin(0, 0);

    const lines = this.add.graphics();
    lines.lineStyle(4, 0xf5c518, 0.6);
    for (let x = 200; x < this.worldWidth; x += 400) {
      lines.beginPath();
      for (let y = 0; y < this.worldHeight; y += 60) {
        lines.moveTo(x, y);
        lines.lineTo(x, y + 30);
      }
      lines.strokePath();
    }

    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
  }

  buildPlayerCar() {
    this.playerSprite = this.add.image(this.worldWidth / 2, this.worldHeight / 2, 'car_player');
    this.playerSprite.setOrigin(0.5, 0.5);

    this.car = new Car({
      x: this.playerSprite.x,
      y: this.playerSprite.y,
      heading: -Math.PI / 2,
      maxSpeed: 420,
      acceleration: 260,
      braking: 420,
      mass: 1.0,
      grip: 2.6,
      handling: 2.6,
      drift: 0.55
    });
  }

  setupCamera() {
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.startFollow(this.playerSprite, true, 0.08, 0.08);
    this.cameras.main.setZoom(1);
  }

  setupKeyboard() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      handbrake: Phaser.Input.Keyboard.KeyCodes.SPACE
    });
  }

  setupTouchControls() {
    this.touchInput = { steerLeft: false, steerRight: false, gas: false, brake: false, handbrake: false };

    const makeButton = (x, y, radius, label, onDown, onUp) => {
      const circle = this.add.circle(x, y, radius, 0xffffff, 0.15)
        .setScrollFactor(0).setDepth(1000).setInteractive();
      this.add.text(x, y, label, { fontSize: '16px', color: '#ffffff' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(1001);
      circle.on('pointerdown', onDown);
      circle.on('pointerup', onUp);
      circle.on('pointerout', onUp);
    };

    const w = this.scale.width, h = this.scale.height;

    makeButton(70, h - 90, 45, '◀', () => this.touchInput.steerLeft = true, () => this.touchInput.steerLeft = false);
    makeButton(170, h - 90, 45, '▶', () => this.touchInput.steerRight = true, () => this.touchInput.steerRight = false);
    makeButton(w - 70, h - 90, 50, 'GAS', () => this.touchInput.gas = true, () => this.touchInput.gas = false);
    makeButton(w - 170, h - 90, 45, 'BRK', () => this.touchInput.brake = true, () => this.touchInput.brake = false);
    makeButton(w / 2, h - 60, 40, 'HB', () => this.touchInput.handbrake = true, () => this.touchInput.handbrake = false);
  }

  setupHUD() {
    this.speedText = this.add.text(16, 16, '0 km/h', { fontSize: '18px', color: '#ffffff' })
      .setScrollFactor(0).setDepth(1000);
  }

  update(time, delta) {
    const dt = delta / 1000;

    const input = { steer: 0, throttle: 0, brake: 0, handbrake: false };

    if (this.cursors.left.isDown || this.keys.left.isDown || this.touchInput.steerLeft) input.steer -= 1;
    if (this.cursors.right.isDown || this.keys.right.isDown || this.touchInput.steerRight) input.steer += 1;
    if (this.cursors.up.isDown || this.keys.up.isDown || this.touchInput.gas) input.throttle = 1;
    if (this.cursors.down.isDown || this.keys.down.isDown || this.touchInput.brake) input.brake = 1;
    if (this.keys.handbrake.isDown || this.touchInput.handbrake) input.handbrake = true;

    this.car.update(dt, input, 1.0);

    this.playerSprite.x = this.car.x;
    this.playerSprite.y = this.car.y;
    this.playerSprite.rotation = this.car.heading + Math.PI / 2;

    this.speedText.setText(this.car.getSpeedKmh() + ' km/h');
  }
}
