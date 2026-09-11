// ===== ФИЗИКА МАШИНЫ (общая для игрока и полиции) =====
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
      this.forwardSpeed -= this.dragCoefficient * this.forwardSpeed * dt;
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
  constructor() { super('MenuScene'); }

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
  constructor() { super('GameScene'); }

  preload() {
    this.createTextures();
  }

  create() {
    this.worldWidth = 3200;
    this.worldHeight = 3200;
    this.BLOCK = 640;
    this.ROAD_WIDTH = 150;

    this.isBusted = false;
    this.wantedLevel = 0;
    this.wantedCooldown = 0;
    this.wantedDecayTimer = 0;
    this.busterTimer = 0;

    this.buildWorld();
    this.buildPlayerCar();
    this.buildTraffic();
    this.policeCars = [];
    this.setupCamera();
    this.setupKeyboard();
    this.setupTouchControls();
    this.setupHUD();
  }

  // ---------- ТЕКСТУРЫ ----------
  createTextures() {
    this.makeCarTexture('car_player', 0xd63333, 0x7a1414);
    this.makeCarTexture('car_npc', 0x3b6ea5, 0x1f3a5a);
    this.makePoliceTexture('car_police');

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

  makeCarTexture(key, bodyColor, edgeColor) {
    const g = this.add.graphics();
    const w = 44, h = 92;

    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(w / 2, h / 2 + 6, w * 0.9, h * 0.5);

    g.fillStyle(bodyColor, 1);
    g.fillRoundedRect(4, 2, w - 8, h - 4, 14);

    g.fillStyle(0x1b2733, 1);
    g.fillRoundedRect(9, 14, w - 18, 20, 6);
    g.fillRoundedRect(9, h - 34, w - 18, 18, 6);

    g.lineStyle(2, edgeColor, 1);
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

    g.generateTexture(key, w, h);
    g.destroy();
  }

  makePoliceTexture(key) {
    const g = this.add.graphics();
    const w = 44, h = 92;

    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(w / 2, h / 2 + 6, w * 0.9, h * 0.5);

    g.fillStyle(0xf2f2f2, 1);
    g.fillRoundedRect(4, 2, w - 8, h - 4, 14);

    g.fillStyle(0x1b2733, 1);
    g.fillRoundedRect(9, 14, w - 18, 20, 6);
    g.fillRoundedRect(9, h - 34, w - 18, 18, 6);

    // Синяя/красная полоса
    g.fillStyle(0x1e3a8a, 1);
    g.fillRect(6, h / 2 - 10, w - 12, 6);
    g.fillStyle(0xb91c1c, 1);
    g.fillRect(6, h / 2 - 2, w - 12, 6);

    // Мигалка на крыше
    g.fillStyle(0x2563eb, 1);
    g.fillRect(w / 2 - 10, h / 2 - 24, 8, 8);
    g.fillStyle(0xdc2626, 1);
    g.fillRect(w / 2 + 2, h / 2 - 24, 8, 8);

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

    g.generateTexture(key, w, h);
    g.destroy();
  }

  // ---------- МИР: ДОРОГИ + ЗДАНИЯ ----------
  buildWorld() {
    this.add.tileSprite(0, 0, this.worldWidth, this.worldHeight, 'asphalt_tile').setOrigin(0, 0);

    this.roadsX = [];
    this.roadsY = [];
    for (let x = this.ROAD_WIDTH / 2; x < this.worldWidth; x += this.BLOCK) this.roadsX.push(x);
    for (let y = this.ROAD_WIDTH / 2; y < this.worldHeight; y += this.BLOCK) this.roadsY.push(y);

    const gfx = this.add.graphics();

    // Здания в клетках между дорогами
    for (let i = 0; i <= this.roadsX.length; i++) {
      const left = i === 0 ? 0 : this.roadsX[i - 1] + this.ROAD_WIDTH / 2;
      const right = i === this.roadsX.length ? this.worldWidth : this.roadsX[i] - this.ROAD_WIDTH / 2;
      if (right - left < 60) continue;

      for (let j = 0; j <= this.roadsY.length; j++) {
        const top = j === 0 ? 0 : this.roadsY[j - 1] + this.ROAD_WIDTH / 2;
        const bottom = j === this.roadsY.length ? this.worldHeight : this.roadsY[j] - this.ROAD_WIDTH / 2;
        if (bottom - top < 60) continue;

        const margin = 24;
        const bx = left + margin;
        const by = top + margin;
        const bw = (right - left) - margin * 2;
        const bh = (bottom - top) - margin * 2;
        if (bw < 30 || bh < 30) continue;

        const shade = Phaser.Math.Between(40, 90);
        const color = Phaser.Display.Color.GetColor(shade, shade + 10, shade + 20);
        gfx.fillStyle(color, 1);
        gfx.fillRect(bx, by, bw, bh);
        gfx.fillStyle(Phaser.Display.Color.GetColor(shade + 25, shade + 35, shade + 45), 1);
        gfx.fillRect(bx, by, bw, 10);

        this.buildings = this.buildings || [];
        this.buildings.push(new Phaser.Geom.Rectangle(bx, by, bw, bh));
      }
    }

    // Разметка дорог
    gfx.lineStyle(4, 0xf5c518, 0.6);
    this.roadsX.forEach((rx) => {
      for (let y = 0; y < this.worldHeight; y += 60) {
        gfx.beginPath();
        gfx.moveTo(rx, y);
        gfx.lineTo(rx, y + 30);
        gfx.strokePath();
      }
    });
    this.roadsY.forEach((ry) => {
      for (let x = 0; x < this.worldWidth; x += 60) {
        gfx.beginPath();
        gfx.moveTo(x, ry);
        gfx.lineTo(x + 30, ry);
        gfx.strokePath();
      }
    });

    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
  }

  // ---------- ИГРОК ----------
  buildPlayerCar() {
    this.playerSprite = this.add.image(this.worldWidth / 2, this.worldHeight / 2, 'car_player').setDepth(10);

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

  // ---------- NPC ТРАФИК ----------
  buildTraffic() {
    this.npcCars = [];
    const NUM_NPCS = 16;

    for (let i = 0; i < NUM_NPCS; i++) {
      const vertical = Math.random() < 0.5;
      const laneSign = Math.random() < 0.5 ? 1 : -1;

      let x, y, vx, vy;
      const baseSpeed = Phaser.Math.Between(90, 150);

      if (vertical && this.roadsX.length > 0) {
        const roadX = Phaser.Utils.Array.GetRandom(this.roadsX);
        x = roadX + laneSign * (this.ROAD_WIDTH / 4);
        y = Phaser.Math.Between(0, this.worldHeight);
        vx = 0;
        vy = baseSpeed * laneSign;
      } else if (this.roadsY.length > 0) {
        const roadY = Phaser.Utils.Array.GetRandom(this.roadsY);
        y = roadY + laneSign * (this.ROAD_WIDTH / 4);
        x = Phaser.Math.Between(0, this.worldWidth);
        vx = baseSpeed * laneSign;
        vy = 0;
      } else {
        continue;
      }

      const sprite = this.add.image(x, y, 'car_npc').setDepth(5);
      sprite.rotation = Math.atan2(vy, vx) + Math.PI / 2;

      this.npcCars.push({ sprite, x, y, vx, vy, baseSpeed, currentSpeed: baseSpeed });
    }
  }

  updateTraffic(dt) {
    // Замедление, если впереди другая машина на той же полосе
    this.npcCars.forEach((npc) => {
      let blocked = false;
      this.npcCars.forEach((other) => {
        if (other === npc) return;
        const sameLane = (npc.vx !== 0 && other.vx !== 0 && Math.sign(npc.vx) === Math.sign(other.vx) && Math.abs(npc.y - other.y) < 20) ||
                          (npc.vy !== 0 && other.vy !== 0 && Math.sign(npc.vy) === Math.sign(other.vy) && Math.abs(npc.x - other.x) < 20);
        if (!sameLane) return;

        const ahead = npc.vx !== 0
          ? Math.sign(npc.vx) * (other.x - npc.x) > 0 && Math.sign(npc.vx) * (other.x - npc.x) < 90
          : Math.sign(npc.vy) * (other.y - npc.y) > 0 && Math.sign(npc.vy) * (other.y - npc.y) < 90;

        if (ahead) blocked = true;
      });

      npc.currentSpeed = Phaser.Math.Linear(npc.currentSpeed, blocked ? 0 : npc.baseSpeed, dt * 3);
      const speedFactor = npc.currentSpeed / (npc.baseSpeed || 1);

      npc.x += npc.vx * speedFactor * dt;
      npc.y += npc.vy * speedFactor * dt;

      // Заворачиваем в начало карты, если уехал за границу
      if (npc.x < -60) npc.x = this.worldWidth + 60;
      if (npc.x > this.worldWidth + 60) npc.x = -60;
      if (npc.y < -60) npc.y = this.worldHeight + 60;
      if (npc.y > this.worldHeight + 60) npc.y = -60;

      npc.sprite.x = npc.x;
      npc.sprite.y = npc.y;
    });
  }

  // ---------- ПОЛИЦИЯ ----------
  spawnPoliceCar() {
    const angle = Math.random() * Math.PI * 2;
    const dist = Phaser.Math.Between(500, 800);
    const x = Phaser.Math.Clamp(this.car.x + Math.cos(angle) * dist, 50, this.worldWidth - 50);
    const y = Phaser.Math.Clamp(this.car.y + Math.sin(angle) * dist, 50, this.worldHeight - 50);

    const sprite = this.add.image(x, y, 'car_police').setDepth(8);

    const levelBoost = this.wantedLevel;
    const carModel = new Car({
      x, y,
      heading: 0,
      maxSpeed: 380 + levelBoost * 20,
      acceleration: 240 + levelBoost * 15,
      braking: 400,
      mass: 1.05,
      grip: 2.4,
      handling: 2.9 + levelBoost * 0.15,
      drift: 0.4
    });

    this.policeCars.push({ sprite, car: carModel });
  }

  updatePolice(dt) {
    this.policeCars.forEach((p) => {
      const dx = this.car.x - p.car.x;
      const dy = this.car.y - p.car.y;
      const targetHeading = Math.atan2(dy, dx);

      let angleDiff = targetHeading - p.car.heading;
      angleDiff = Phaser.Math.Angle.Wrap(angleDiff);

      const steer = Phaser.Math.Clamp(angleDiff / (Math.PI / 3), -1, 1);
      const dist = Math.hypot(dx, dy);

      const input = {
        steer,
        throttle: dist > 40 ? 1 : 0.3,
        brake: 0,
        handbrake: Math.abs(angleDiff) > 1.6 && dist < 200
      };

      p.car.update(dt, input, 1.0);
      p.sprite.x = p.car.x;
      p.sprite.y = p.car.y;
      p.sprite.rotation = p.car.heading + Math.PI / 2;
    });
  }

  // ---------- WANTED LEVEL ----------
  updateWanted(dt) {
    if (this.wantedCooldown > 0) this.wantedCooldown -= dt;

    // Триггер: столкновение с NPC на скорости
    if (this.wantedCooldown <= 0 && Math.abs(this.car.forwardSpeed) > 140) {
      for (const npc of this.npcCars) {
        const d = Phaser.Math.Distance.Between(this.car.x, this.car.y, npc.x, npc.y);
        if (d < 45) {
          this.increaseWanted();
          this.wantedCooldown = 3;
          break;
        }
      }
    }

    // Спад розыска, если полиция долго не рядом
    const anyPoliceClose = this.policeCars.some(p =>
      Phaser.Math.Distance.Between(this.car.x, this.car.y, p.car.x, p.car.y) < 700
    );

    if (this.wantedLevel > 0 && !anyPoliceClose) {
      this.wantedDecayTimer += dt;
      if (this.wantedDecayTimer > 12) {
        this.decreaseWanted();
        this.wantedDecayTimer = 0;
      }
    } else {
      this.wantedDecayTimer = 0;
    }

    // Проверка поимки (BUSTED)
    const anyPoliceVeryClose = this.policeCars.some(p =>
      Phaser.Math.Distance.Between(this.car.x, this.car.y, p.car.x, p.car.y) < 55
    );

    if (anyPoliceVeryClose && this.wantedLevel > 0) {
      this.busterTimer += dt;
      if (this.busterTimer > 1.4 && !this.isBusted) {
        this.triggerBusted();
      }
    } else {
      this.busterTimer = 0;
    }
  }

  increaseWanted() {
    if (this.wantedLevel >= 5) return;
    this.wantedLevel++;
    this.spawnPoliceCar();
    this.updateWantedHUD();
  }

  decreaseWanted() {
    this.wantedLevel = Math.max(0, this.wantedLevel - 1);
    if (this.policeCars.length > this.wantedLevel) {
      const removed = this.policeCars.pop();
      removed.sprite.destroy();
    }
    this.updateWantedHUD();
  }

  triggerBusted() {
    this.isBusted = true;
    const { width, height } = this.scale;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75).setScrollFactor(0).setDepth(2000);
    const bustedText = this.add.text(width / 2, height * 0.35, 'BUSTED', {
      fontFamily: 'Arial Black, Arial', fontSize: '52px', color: '#ef4444'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);
    const failedText = this.add.text(width / 2, height * 0.35 + 60, 'MISSION FAILED', {
      fontFamily: 'Arial', fontSize: '20px', color: '#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    const retryBtn = this.add.rectangle(width / 2, height * 0.6, 220, 56, 0x2563eb).setInteractive().setScrollFactor(0).setDepth(2001);
    this.add.text(width / 2, height * 0.6, 'RETRY', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    const exitBtn = this.add.rectangle(width / 2, height * 0.6 + 70, 220, 56, 0x374151).setInteractive().setScrollFactor(0).setDepth(2001);
    this.add.text(width / 2, height * 0.6 + 70, 'EXIT', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    retryBtn.on('pointerdown', () => this.scene.restart());
    exitBtn.on('pointerdown', () => this.scene.start('MenuScene'));
  }

  // ---------- КАМЕРА / УПРАВЛЕНИЕ ----------
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
      this.add.circle(x, y, radius, 0xffffff, 0.15).setScrollFactor(0).setDepth(1000).setInteractive()
        .on('pointerdown', onDown).on('pointerup', onUp).on('pointerout', onUp);
      this.add.text(x, y, label, { fontSize: '15px', color: '#ffffff' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    };

    const w = this.scale.width, h = this.scale.height;

    // Руль — слева, две кнопки рядом
    makeButton(w * 0.13, h * 0.86, 38, '◀', () => this.touchInput.steerLeft = true, () => this.touchInput.steerLeft = false);
    makeButton(w * 0.30, h * 0.86, 38, '▶', () => this.touchInput.steerRight = true, () => this.touchInput.steerRight = false);

    // BRK выше и левее GAS, чтобы не пересекались
    makeButton(w * 0.72, h * 0.76, 34, 'BRK', () => this.touchInput.brake = true, () => this.touchInput.brake = false);
    makeButton(w * 0.90, h * 0.86, 48, 'GAS', () => this.touchInput.gas = true, () => this.touchInput.gas = false);

    // Ручник — по центру, отдельная нижняя строка
    makeButton(w * 0.5, h * 0.94, 28, 'HB', () => this.touchInput.handbrake = true, () => this.touchInput.handbrake = false);
  }

  setupHUD() {
    this.speedText = this.add.text(16, 16, '0 km/h', { fontSize: '18px', color: '#ffffff' })
      .setScrollFactor(0).setDepth(1000);
    this.wantedText = this.add.text(16, 44, '', { fontSize: '20px', color: '#facc15' })
      .setScrollFactor(0).setDepth(1000);
    this.updateWantedHUD();
  }

  updateWantedHUD() {
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < this.wantedLevel ? '★' : '☆';
    this.wantedText.setText(stars);
  }

  // ---------- ГЛАВНЫЙ ЦИКЛ ----------
  update(time, delta) {
    if (this.isBusted) return;

    const dt = delta / 1000;
    const input = { steer: 0, throttle: 0, brake: 0, handbrake: false };

    if (this.cursors.left.isDown || this.keys.left.isDown || this.touchInput.steerLeft) input.steer -= 1;
    if (this.cursors.right.isDown || this.keys.right.isDown || this.touchInput.steerRight) input.steer += 1;
    if (this.cursors.up.is
