export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        this.createProceduralTextures();
    }

    create() {
        this.mapSize = 3200;
        this.physics.world.setBounds(0, 0, this.mapSize, this.mapSize);

        this.buildCityGrid();

        this.car = this.physics.add.sprite(800, 800, 'car_starter');
        this.car.setOrigin(0.5, 0.5);
        this.car.setCollideWorldBounds(true);
        this.car.body.setBounce(0.3);

        this.physics.add.collider(this.car, this.buildingsGroup);

        this.carData = {
            speed: 0,
            maxSpeed: 550,
            reverseMaxSpeed: -150,
            acceleration: 400,
            braking: 500,
            drag: 0.985,
            handling: 160,
            driftGrip: 0.93,
            handbrakeGrip: 0.985
        };

        this.cameras.main.setBounds(0, 0, this.mapSize, this.mapSize);
        this.cameras.main.startFollow(this.car, true, 0.08, 0.08);

        this.cursors = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            space: Phaser.Input.Keyboard.KeyCodes.SPACE
        });

        this.touchInput = { left: false, right: false, gas: false, brake: false, handbrake: false };
        this.setupTouchControls();

        this.fpsText = this.add.text(20, 20, 'FPS: 60', { font: '16px Arial', fill: '#00ff00' }).setScrollFactor(0);
        this.speedText = this.add.text(20, 45, 'SPEED: 0 KM/H', { font: '16px Arial', fill: '#ffffff' }).setScrollFactor(0);
    }

    update(time, delta) {
        const dt = delta / 1000;
        this.handleVehiclePhysics(dt);

        const fps = Math.round(this.game.loop.actualFps);
        const speedKm = Math.round(Math.abs(this.carData.speed) * 0.25);
        this.fpsText.setText(`FPS: ${fps}`);
        this.speedText.setText(`SPEED: ${speedKm} KM/H`);
    }

    handleVehiclePhysics(dt) {
        const inputLeft = this.cursors.left.isDown || this.touchInput.left;
        const inputRight = this.cursors.right.isDown || this.touchInput.right;
        const inputGas = this.cursors.up.isDown || this.touchInput.gas;
        const inputBrake = this.cursors.down.isDown || this.touchInput.brake;
        const inputHandbrake = this.cursors.space.isDown || this.touchInput.handbrake;

        if (inputGas) {
            if (this.carData.speed < this.carData.maxSpeed) this.carData.speed += this.carData.acceleration * dt;
        } else if (inputBrake) {
            if (this.carData.speed > this.carData.reverseMaxSpeed) this.carData.speed -= this.carData.braking * dt;
        } else {
            this.carData.speed *= Math.pow(this.carData.drag, dt * 60);
            if (Math.abs(this.carData.speed) < 5) this.carData.speed = 0;
        }

        const speedRatio = Math.min(Math.abs(this.carData.speed) / (this.carData.maxSpeed * 0.5), 1.0);
        if (Math.abs(this.carData.speed) > 10) {
            const dir = this.carData.speed >= 0 ? 1 : -1;
            if (inputLeft) this.car.angle -= this.carData.handling * speedRatio * dir * dt;
            if (inputRight) this.car.angle += this.carData.handling * speedRatio * dir * dt;
        }

        const forwardAngle = Phaser.Math.DegToRad(this.car.angle);
        const forwardVector = new Phaser.Math.Vector2(Math.cos(forwardAngle), Math.sin(forwardAngle)).scale(this.carData.speed);

        let currentVelocity = this.car.body.velocity.clone();
        const gripFactor = inputHandbrake ? this.carData.handbrakeGrip : this.carData.driftGrip;
        let targetVelocity = currentVelocity.lerp(forwardVector, 1 - gripFactor);

        this.car.body.setVelocity(targetVelocity.x, targetVelocity.y);
    }

    buildCityGrid() {
        const graphics = this.add.graphics();
        graphics.fillStyle(0x222225, 1);
        graphics.fillRect(0, 0, this.mapSize, this.mapSize);

        this.buildingsGroup = this.physics.add.staticGroup();
        const blockSize = 400;
        const roadWidth = 160;

        for (let x = roadWidth; x < this.mapSize - blockSize; x += blockSize + roadWidth) {
            for (let y = roadWidth; y < this.mapSize - blockSize; y += blockSize + roadWidth) {
                const building = this.add.graphics();
                building.fillStyle(0x3a3a42, 1);
                building.fillRect(0, 0, blockSize, blockSize);
                building.generateTexture(`b_${x}_${y}`, blockSize, blockSize);
                building.destroy();

                this.buildingsGroup.create(x + blockSize / 2, y + blockSize / 2, `b_${x}_${y}`).refreshBody();
            }
        }
    }

    createProceduralTextures() {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x1e60c8, 1);
        g.fillRoundedRect(0, 0, 68, 34, 6);
        g.fillStyle(0x88ccee, 1);
        g.fillRect(20, 7, 10, 20);
        g.generateTexture('car_starter', 68, 34);
    }

    setupTouchControls() {
        const bindTouch = (id, key) => {
            const el = document.getElementById(id);
            if (!el) return;
            const start = (e) => { e.preventDefault(); this.touchInput[key] = true; };
            const end = (e) => { e.preventDefault(); this.touchInput[key] = false; };
            el.addEventListener('touchstart', start, { passive: false });
            el.addEventListener('touchend', end, { passive: false });
            el.addEventListener('mousedown', start);
            el.addEventListener('mouseup', end);
        };
        bindTouch('btn-left', 'left');
        bindTouch('btn-right', 'right');
        bindTouch('btn-gas', 'gas');
        bindTouch('btn-brake', 'brake');
        bindTouch('btn-handbrake', 'handbrake');
    }
}
