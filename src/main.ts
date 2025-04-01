import * as THREE from 'three';

class Game {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private road: THREE.Mesh;
    private car: THREE.Group;
    private currentLane: number = 1; // 0: left, 1: center, 2: right
    private readonly LANE_WIDTH: number = 4;
    private readonly LANE_POSITIONS: number[] = [-4, 0, 4]; // Three lanes
    private isMoving: boolean = false;
    private gameOver: boolean = false;

    // Speed and obstacle related properties
    private speed: number = 15; // Reduced base speed (was 30)
    private readonly MAX_SPEED: number = 50; // Reduced max speed (was 100)
    private readonly SPEED_INCREMENT: number = 2; // Reduced speed increment (was 5)
    private lastSpeedIncrease: number = 0;
    private readonly SPEED_INCREASE_INTERVAL: number = 7000; // Increased interval (was 5000)
    private totalDistance: number = 0;

    // Road properties
    private readonly ROAD_LENGTH: number = 1000;
    private readonly ROAD_SEGMENTS: number = 3;
    private roadSegments: THREE.Mesh[] = [];

    // Obstacle properties
    private obstacles: THREE.Mesh[] = [];
    private lastObstacleSpawn: number = 0;
    private obstacleSpawnInterval: number = 3000; // Increased initial spawn interval (was 2000)
    private readonly MIN_SPAWN_INTERVAL: number = 1500; // Increased minimum interval (was 800)
    private readonly OBSTACLE_SPEED_MULTIPLIER: number = 1.5;

    private gameStartTime: number = 0;
    private readonly INITIAL_DELAY: number = 5000; // 5 seconds delay
    private isGameStarted: boolean = false;

    // Coin related properties
    private coins: THREE.Mesh[] = [];
    private coinCount: number = 0;
    private lastCoinSpawn: number = 0;
    private readonly COIN_SPAWN_INTERVAL: number = 500; // Changed from 1000 to 500 (spawn twice as fast)
    private highScore: { distance: number; coins: number } = {
        distance: 0,
        coins: 0
    };

    // Add new properties for lane markings
    private laneMarkings: THREE.Mesh[][] = [];

    constructor() {
        // Load high scores from localStorage
        this.loadHighScores();
        
        // Initialize scene
        this.scene = new THREE.Scene();
        
        // Initialize camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 5.5, 8); // Adjusted height from 4.5 to 5.5
        this.camera.rotation.x = -0.3; // Slightly increased tilt for new height

        // Initialize renderer with better shadows
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            logarithmicDepthBuffer: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x87CEEB);
        document.body.appendChild(this.renderer.domElement);

        // Setup game elements
        this.setupLighting();
        this.createRoad();
        this.createCar();
        this.setupEventListeners();
        this.createGameOverScreen();
        this.createDistanceCounter();
        this.createCountdown();
        this.gameStartTime = Date.now();

        // After creating car, set initial position to center lane
        this.car.position.x = this.LANE_POSITIONS[1]; // Position at center lane

        // Start game loop
        this.animate();
    }

    private setupLighting(): void {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(10, 20, 10);
        this.scene.add(directionalLight);
        // Removed fog
    }

    private createRoad(): void {
        // Create multiple road segments for infinite scrolling
        for (let i = 0; i < this.ROAD_SEGMENTS; i++) {
            const roadGeometry = new THREE.PlaneGeometry(16, this.ROAD_LENGTH); // Adjusted width for 3 lanes
            const roadMaterial = new THREE.MeshPhongMaterial({
                color: 0x333333,
                side: THREE.DoubleSide
            });
            const roadSegment = new THREE.Mesh(roadGeometry, roadMaterial);
            roadSegment.rotation.x = -Math.PI / 2;
            roadSegment.position.z = -(i * this.ROAD_LENGTH);
            this.scene.add(roadSegment);
            this.roadSegments.push(roadSegment);

            // Add lane markings for each segment
            const segmentMarkings = this.createLaneMarkings(roadSegment.position.z);
            this.laneMarkings.push(segmentMarkings);
        }
    }

    private createLaneMarkings(roadZ: number): THREE.Mesh[] {
        const markings: THREE.Mesh[] = [];

        // Solid outer lines
        const leftLine = this.createSolidLine(-6, roadZ);
        const rightLine = this.createSolidLine(6, roadZ);
        markings.push(leftLine, rightLine);

        // Dotted inner lines
        const leftDotted = this.createDottedLine(-2, roadZ);
        const rightDotted = this.createDottedLine(2, roadZ);
        markings.push(...leftDotted, ...rightDotted);

        return markings;
    }

    private createSolidLine(x: number, roadZ: number): THREE.Mesh {
        const markingGeometry = new THREE.PlaneGeometry(0.25, this.ROAD_LENGTH);
        const markingMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });
        const line = new THREE.Mesh(markingGeometry, markingMaterial);
        line.rotation.x = -Math.PI / 2;
        line.position.set(x, 0.01, roadZ);
        this.scene.add(line);
        return line;
    }

    private createDottedLine(x: number, roadZ: number): THREE.Mesh[] {
        const dots: THREE.Mesh[] = [];
        const dotLength = 3;
        const gapLength = 3;
        const totalLength = this.ROAD_LENGTH;
        const numSegments = Math.floor(totalLength / (dotLength + gapLength));

        for (let i = 0; i < numSegments; i++) {
            const markingGeometry = new THREE.PlaneGeometry(0.25, dotLength);
            const markingMaterial = new THREE.MeshPhongMaterial({
                color: 0xffffff,
                side: THREE.DoubleSide
            });
            const dot = new THREE.Mesh(markingGeometry, markingMaterial);
            dot.rotation.x = -Math.PI / 2;
            const zOffset = (i * (dotLength + gapLength)) - (totalLength / 2);
            dot.position.set(x, 0.01, roadZ + zOffset);
            this.scene.add(dot);
            dots.push(dot);
        }
        return dots;
    }

    private createCar(): void {
        this.car = new THREE.Group();

        // Simple car body
        const bodyGeometry = new THREE.BoxGeometry(2, 1, 4);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        const carBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.car.add(carBody);

        // Add wheels
        const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.4);
        const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });

        // Front wheels
        const frontLeftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        frontLeftWheel.rotation.z = Math.PI / 2;
        frontLeftWheel.position.set(-1.2, -0.4, 1);
        this.car.add(frontLeftWheel);

        const frontRightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        frontRightWheel.rotation.z = Math.PI / 2;
        frontRightWheel.position.set(1.2, -0.4, 1);
        this.car.add(frontRightWheel);

        // Back wheels
        const backLeftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        backLeftWheel.rotation.z = Math.PI / 2;
        backLeftWheel.position.set(-1.2, -0.4, -1);
        this.car.add(backLeftWheel);

        const backRightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        backRightWheel.rotation.z = Math.PI / 2;
        backRightWheel.position.set(1.2, -0.4, -1);
        this.car.add(backRightWheel);

        // Position the car lower
        this.car.position.y = 0.5; // Changed from 1 to 0.5
        this.scene.add(this.car);
    }

    private setupEventListeners(): void {
        document.addEventListener('keydown', (event) => {
            if (this.isMoving) return;

            switch (event.key) {
                case 'ArrowLeft':
                    this.moveLane(-1);
                    break;
                case 'ArrowRight':
                    this.moveLane(1);
                    break;
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    private moveLane(direction: number): void {
        const newLane = this.currentLane + direction;
        if (newLane >= 0 && newLane <= 2 && !this.isMoving) {
            this.isMoving = true;
            this.currentLane = newLane;
            const targetX = this.LANE_POSITIONS[this.currentLane];
            
            // Simple animation
            const startX = this.car.position.x;
            const duration = 100;
            const startTime = Date.now();

            const animate = () => {
                const currentTime = Date.now();
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Smooth easing
                const easeProgress = progress * (2 - progress);
                this.car.position.x = startX + (targetX - startX) * easeProgress;

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.car.position.x = targetX;
                    this.isMoving = false;
                }
            };

            animate();
        }
    }

    private spawnObstacle(): void {
        // Create a list of available lanes
        const availableLanes = [0, 1, 2]; // Updated for three lanes
        
        // Remove lanes that have recent obstacles
        this.obstacles = this.obstacles.filter(obstacle => {
            if (obstacle.position.z > this.car.position.z + 20) {
                // If obstacle is too far behind the car, remove it
                this.scene.remove(obstacle);
                return false;
            }
            
            // If obstacle is within 15 units of spawn point, mark its lane as unavailable
            if (obstacle.position.z < this.car.position.z - 100) { // Increased from -40 to -100
                const laneIndex = this.LANE_POSITIONS.indexOf(obstacle.position.x);
                const index = availableLanes.indexOf(laneIndex);
                if (index > -1) {
                    availableLanes.splice(index, 1);
                }
            }
            
            return true;
        });

        // Only spawn if we have available lanes
        if (availableLanes.length > 0) {
            // Randomly select an available lane
            const laneIndex = availableLanes[Math.floor(Math.random() * availableLanes.length)];
            
            // Create obstacle with emissive material for better visibility
            const obstacleGeometry = new THREE.BoxGeometry(2.5, 3, 2.5); // Slightly larger obstacles
            const obstacleMaterial = new THREE.MeshPhongMaterial({ 
                color: 0xff0000, // Changed to red
                emissive: 0x990000, // Add emissive glow
                shininess: 100, // Make it more reflective
                specular: 0xffffff // Add specular highlights
            });
            const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
            
            // Position obstacle farther ahead
            obstacle.position.set(
                this.LANE_POSITIONS[laneIndex],
                1.5, // Raised slightly for better visibility
                this.car.position.z - 100 // Spawn farther ahead (changed from -50 to -100)
            );
            
            // Add a point light to the obstacle for extra visibility
            const obstacleLight = new THREE.PointLight(0xff0000, 1, 10);
            obstacleLight.position.set(0, 2, 0);
            obstacle.add(obstacleLight);
            
            this.scene.add(obstacle);
            this.obstacles.push(obstacle);
        }
    }

    private updateSpeed(): void {
        const currentTime = Date.now();
        
        // Increase speed every SPEED_INCREASE_INTERVAL
        if (currentTime - this.lastSpeedIncrease >= this.SPEED_INCREASE_INTERVAL) {
            if (this.speed < this.MAX_SPEED) {
                this.speed += this.SPEED_INCREMENT;
                // Decrease spawn interval as speed increases
                this.obstacleSpawnInterval = Math.max(
                    this.MIN_SPAWN_INTERVAL,
                    this.obstacleSpawnInterval - 100
                );
            }
            this.lastSpeedIncrease = currentTime;
        }
    }

    private createGameOverScreen(): void {
        const gameOverDiv = document.createElement('div');
        gameOverDiv.id = 'gameOverScreen';
        gameOverDiv.style.display = 'none';
        gameOverDiv.style.position = 'fixed';
        gameOverDiv.style.top = '50%';
        gameOverDiv.style.left = '50%';
        gameOverDiv.style.transform = 'translate(-50%, -50%)';
        gameOverDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        gameOverDiv.style.color = 'white';
        gameOverDiv.style.padding = '20px';
        gameOverDiv.style.borderRadius = '10px';
        gameOverDiv.style.textAlign = 'center';
        gameOverDiv.style.zIndex = '1000';

        const gameOverText = document.createElement('h2');
        gameOverText.textContent = 'Game Over!';
        gameOverText.style.marginBottom = '20px';

        const scoreText = document.createElement('p');
        scoreText.id = 'finalScore';
        scoreText.style.marginBottom = '20px';

        const restartButton = document.createElement('button');
        restartButton.textContent = 'Restart Game';
        restartButton.style.padding = '10px 20px';
        restartButton.style.fontSize = '16px';
        restartButton.style.cursor = 'pointer';
        restartButton.style.backgroundColor = '#4CAF50';
        restartButton.style.border = 'none';
        restartButton.style.color = 'white';
        restartButton.style.borderRadius = '5px';
        restartButton.onclick = () => this.restartGame();

        gameOverDiv.appendChild(gameOverText);
        gameOverDiv.appendChild(scoreText);
        gameOverDiv.appendChild(restartButton);
        document.body.appendChild(gameOverDiv);
    }

    private showGameOver(): void {
        this.gameOver = true;
        this.updateHighScores();
        
        const gameOverScreen = document.getElementById('gameOverScreen');
        const finalScore = document.getElementById('finalScore');
        if (gameOverScreen && finalScore) {
            const distance = Math.floor(this.totalDistance);
            finalScore.innerHTML = `
                Distance: ${distance}m<br>
                Coins Collected: ${this.coinCount}<br>
                Best Distance: ${this.highScore.distance}m<br>
                Most Coins: ${this.highScore.coins}
            `;
            gameOverScreen.style.display = 'block';
        }
    }

    private restartGame(): void {
        // Update high scores before resetting
        this.updateHighScores();
        
        // Reset game state
        this.gameOver = false;
        this.speed = 15;
        this.totalDistance = 0;
        this.obstacleSpawnInterval = 3000;
        this.lastSpeedIncrease = Date.now();
        this.lastObstacleSpawn = Date.now();
        this.lastCoinSpawn = Date.now();
        this.gameStartTime = Date.now();
        this.isGameStarted = false;
        this.coinCount = 0;
        
        // Reset car position to center lane
        this.car.position.set(this.LANE_POSITIONS[1], 0.5, 0);
        this.currentLane = 1;
        
        // Remove all obstacles and coins
        this.obstacles.forEach(obstacle => this.scene.remove(obstacle));
        this.coins.forEach(coin => this.scene.remove(coin));
        this.obstacles = [];
        this.coins = [];
        
        // Hide game over screen
        const gameOverScreen = document.getElementById('gameOverScreen');
        if (gameOverScreen) {
            gameOverScreen.style.display = 'none';
        }

        // Show countdown again
        const countdown = document.getElementById('countdown');
        if (countdown) {
            countdown.style.display = 'block';
        }
        
        // Reset UI
        this.updateDistanceCounter();
    }

    private checkCollisions(): boolean {
        if (this.gameOver) return false;
        
        const carBoundingBox = new THREE.Box3().setFromObject(this.car);
        
        for (const obstacle of this.obstacles) {
            const obstacleBoundingBox = new THREE.Box3().setFromObject(obstacle);
            
            if (carBoundingBox.intersectsBox(obstacleBoundingBox)) {
                this.showGameOver();
                return true;
            }
        }
        
        return false;
    }

    private updateRoad(): void {
        const moveAmount = this.speed * 0.016;
        this.totalDistance += moveAmount;

        // Update road segments and their lane markings
        for (let i = 0; i < this.roadSegments.length; i++) {
            const segment = this.roadSegments[i];
            const segmentMarkings = this.laneMarkings[i];
            
            // If a road segment is too far behind, move it to the front
            if (segment.position.z > this.car.position.z + this.ROAD_LENGTH) {
                const lastSegmentZ = Math.min(...this.roadSegments.map(s => s.position.z));
                segment.position.z = lastSegmentZ - this.ROAD_LENGTH;
                
                // Move the corresponding lane markings
                segmentMarkings.forEach(marking => {
                    marking.position.z = segment.position.z;
                });
            }
        }
    }

    private createDistanceCounter(): void {
        const distanceDiv = document.createElement('div');
        distanceDiv.id = 'distanceCounter';
        distanceDiv.style.position = 'fixed';
        distanceDiv.style.top = '20px';
        distanceDiv.style.left = '20px';
        distanceDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        distanceDiv.style.color = 'white';
        distanceDiv.style.padding = '10px 20px';
        distanceDiv.style.borderRadius = '5px';
        distanceDiv.style.fontFamily = 'Arial, sans-serif';
        distanceDiv.style.fontSize = '18px';
        distanceDiv.style.zIndex = '1000';
        document.body.appendChild(distanceDiv);
    }

    private updateDistanceCounter(): void {
        const distanceCounter = document.getElementById('distanceCounter');
        if (distanceCounter) {
            const distance = Math.floor(this.totalDistance);
            distanceCounter.innerHTML = `
                Distance: ${distance}m<br>
                Coins: ${this.coinCount}<br>
                Best Distance: ${this.highScore.distance}m<br>
                Most Coins: ${this.highScore.coins}
            `;
        }
    }

    private createCountdown(): void {
        const countdownDiv = document.createElement('div');
        countdownDiv.id = 'countdown';
        countdownDiv.style.position = 'fixed';
        countdownDiv.style.top = '50%';
        countdownDiv.style.left = '50%';
        countdownDiv.style.transform = 'translate(-50%, -50%)';
        countdownDiv.style.color = 'white';
        countdownDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        countdownDiv.style.padding = '20px 40px';
        countdownDiv.style.borderRadius = '10px';
        countdownDiv.style.fontSize = '48px';
        countdownDiv.style.fontFamily = 'Arial, sans-serif';
        countdownDiv.style.zIndex = '1000';
        document.body.appendChild(countdownDiv);
    }

    private updateCountdown(): void {
        if (this.isGameStarted) return;

        const countdown = document.getElementById('countdown');
        if (countdown) {
            const timeLeft = Math.ceil((this.INITIAL_DELAY - (Date.now() - this.gameStartTime)) / 1000);
            if (timeLeft > 0) {
                countdown.textContent = timeLeft.toString();
            } else {
                countdown.style.display = 'none';
                this.isGameStarted = true;
            }
        }
    }

    private loadHighScores(): void {
        const savedHighScores = localStorage.getItem('highScores');
        if (savedHighScores) {
            this.highScore = JSON.parse(savedHighScores);
        }
    }

    private updateHighScores(): void {
        const distance = Math.floor(this.totalDistance);
        const coins = this.coinCount;

        if (distance > this.highScore.distance) {
            this.highScore.distance = distance;
        }
        if (coins > this.highScore.coins) {
            this.highScore.coins = coins;
        }

        localStorage.setItem('highScores', JSON.stringify(this.highScore));
    }

    private createCoin(): THREE.Mesh {
        const coinGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32);
        const coinMaterial = new THREE.MeshPhongMaterial({
            color: 0xFFD700,
            emissive: 0xFFD700,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        const coin = new THREE.Mesh(coinGeometry, coinMaterial);
        coin.rotation.x = Math.PI / 2; // Make coin face up
        return coin;
    }

    private spawnCoin(): void {
        // Create multiple coins at once
        const numCoins = Math.random() < 0.3 ? 2 : 1; // 30% chance to spawn 2 coins
        const availableLanes = [0, 1, 2]; // Updated for three lanes
        
        for (let i = 0; i < numCoins; i++) {
            if (availableLanes.length === 0) break;
            
            // Randomly select a lane
            const randomIndex = Math.floor(Math.random() * availableLanes.length);
            const laneIndex = availableLanes[randomIndex];
            availableLanes.splice(randomIndex, 1); // Remove used lane
            
            const coin = this.createCoin();
            coin.position.set(
                this.LANE_POSITIONS[laneIndex],
                1, // Height of coin
                this.car.position.z - 100 + (Math.random() * 10 - 5) // Add slight random offset
            );

            // Add point light to coin
            const coinLight = new THREE.PointLight(0xFFD700, 1, 5);
            coinLight.position.set(0, 0, 0);
            coin.add(coinLight);
            
            this.scene.add(coin);
            this.coins.push(coin);
        }
    }

    private checkCoinCollisions(): void {
        const carBoundingBox = new THREE.Box3().setFromObject(this.car);
        
        this.coins = this.coins.filter(coin => {
            if (coin.position.z > this.car.position.z + 20) {
                // Remove coins that are too far behind
                this.scene.remove(coin);
                return false;
            }

            const coinBoundingBox = new THREE.Box3().setFromObject(coin);
            
            if (carBoundingBox.intersectsBox(coinBoundingBox)) {
                // Coin collected!
                this.scene.remove(coin);
                this.coinCount++;
                // Play coin collection sound or animation here if desired
                return false;
            }
            
            return true;
        });
    }

    private animate(): void {
        requestAnimationFrame(() => this.animate());

        // Update countdown if game hasn't started
        this.updateCountdown();

        if (!this.gameOver) {
            // Update speed
            this.updateSpeed();

            // Update road position for infinite scrolling
            this.updateRoad();

            // Move car forward
            this.car.position.z -= this.speed * 0.016;

            // Update distance counter
            this.updateDistanceCounter();

            if (this.isGameStarted) {
                // Spawn obstacles
                const currentTime = Date.now();
                
                if (currentTime - this.lastObstacleSpawn >= this.obstacleSpawnInterval) {
                    this.spawnObstacle();
                    this.lastObstacleSpawn = currentTime;
                }

                // Spawn coins
                if (currentTime - this.lastCoinSpawn >= this.COIN_SPAWN_INTERVAL) {
                    this.spawnCoin();
                    this.lastCoinSpawn = currentTime;
                }

                // Move obstacles and check collisions
                for (const obstacle of this.obstacles) {
                    obstacle.position.z += this.speed * 0.016;
                }

                // Rotate and move coins
                for (const coin of this.coins) {
                    coin.rotation.z += 0.02; // Rotate coins
                    coin.position.z += this.speed * 0.016;
                }

                // Check collisions
                this.checkCollisions();
                this.checkCoinCollisions();
            }
        }

        // Update camera position to follow the car
        this.camera.position.x = this.car.position.x;
        this.camera.position.y = 5.5;
        this.camera.position.z = this.car.position.z + 8;
        this.camera.rotation.x = -0.3;

        this.renderer.render(this.scene, this.camera);
    }
}

// Start the game
new Game(); 