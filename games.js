function draw_getPlayerColor(playerNumber) {
	switch (playerNumber) {
		case 1:
			return "#ee0000";
		case 2:
			return "#ee8400";
		case 3:
			return "#ecee00";
		case 4:
			return "#38ee00";
		case 5:
			return "#00b8ee";
		case 6:
			return "#5000ee";
		case 7:
			return "#ffa0a0";
		case 8:
			return "#ffd0a0";
		case 9:
			return "#feffa0";
		case 10:
			return "#a0ffbe";
		case 11:
			return "#a0e5ff";
		case 12:
			return "#b6a0ff";
		default:
			snake_warn("Player Number: " + playerNumber);
			return "white";
	}
}

function snake_findSuitableLocation(snakes, foodPellets) {
	function isNearby(x, y, space2) {
		if ([x, y] == space2 ||
			[x - 1, y] == space2 ||
			[x + 1, y] == space2 ||
			[x, y - 1] == space2 ||
			[x, y + 1] == space2 ||
			[x - 1, y - 1] == space2 ||
			[x + 1, y - 1] == space2 ||
			[x - 1, y + 1] == space2 ||
			[x + 1, y + 1] == space2) {
			
			return true;
			
		}
		else {
			return false;
		}
	}

	var locationFound = false;
	var x, y;
	do {
		x = Math.floor(Math.random() * 32);
		y = Math.floor(Math.random() * 32);
		locationFound = true;
		for (snake of snakes) {
			for (segment of snake.segments) {
				if (isNearby(x, y, segment)) {
					locationFound = false;
					break;
				}
			}
			if (locationFound == false) {
				break;
			}
		}
		if (locationFound == true) { //Only check for nearby food if there are no nearby snake segments found already.
			for (pellet of foodPellets) {
				if (isNearby(x, y, pellet)) {
					locationFound = false;
					break;
				}
			}
		}
	} while (locationFound != true);
	return [x, y];
}

function snake_getTileBasedOnDirection(x, y, direction) {
	if (direction == "north") {
		return [x, y - 1];
	}
	else if (direction == "south") {
		return [x, y + 1];
	}
	else if (direction == "east") {
		return [x + 1, y];
	}
	else if (direction == "west") {
		return [x - 1, y];
	}
	else {
		snake_warn("Direction: " + direction);
	}
}

function snake_getRelativeDirection(direction, relativeDirection) {
	directions = ["north", "east", "south", "west"]; //Clockwise
	if (relativeDirection == "right") {
		if (direction == "west") {
			return "north";
		}
		else {
			return directions[directions.indexOf(direction) + 1];
		}
	}
	else if (relativeDirection == "left") {
		if (direction == "north") {
			return "west";
		}
		else {
			return directions[directions.indexOf(direction) - 1];
		}
	}
}

function snake_warn(message) {
	console.log("[GAME_SNAKE] " + message);
}

function draw_getFilledCanvas(color) { //This returns a 32x32 canvas.
	var canvas = [];
	for (var y = 0; y < 32; y++) {
		canvas.push([]);
		for (var x = 0; x < 32; x++) {
			canvas[y].push(color);
		}
	}
	return canvas;
}

exports.snake = () => ({ //TODO: Food eating
	snakes: [],
	foodPellets: [],
	FOOD_SPAWNS_PER_PLAYER: 3,
	accumulator: 0,
	MILLISECONDS_BETWEEN_MOVEMENTS: 750, //~4 movements every 3 seconds
	colors: {
		foodPellet: "#fff7a8"
	},
	tick: function(delta) {
		this.accumulator += delta;
		if (this.accumulator > this.MILLISECONDS_BETWEEN_MOVEMENTS) {
			this.accumulator = 0;
			for (var snake of this.snakes) {
				if (snake.pendingSegments == 0) {
					snake.segments.pop(); //Remove the last segment
				}
				else {
					snake.pendingSegments -= 1;
				}
				snake.segments.unshift(snake_getTileBasedOnDirection(...snake.segments[0], snake.direction));
				switch (this.checkCollisions(snake)) { //This technically puts players with lower player numbers at a slight disadvantage for this game, as they will collide first with other snakes in this game.
					case "wall":
					case "snake":
						snake.alive = false;
						break;
					case "food":
						snake.pendingSegments += 1;
						for (foodPellet of this.foodPellets) {
							if (foodPellet[0] == snake.segments[0][0] && foodPellet[1] == snake.segments[0][1]) {
								this.foodPellets.splice(this.foodPellets.indexOf(foodPellet), 1);
							}
						}
						this.spawnFoodPellet();
						break;
				}
			}
		}
	},
	input: function(playerNumber, button, state) {
		if (state == 1) { //Button pressed down
			if (button == 0 || button == 1) {
				this.snakes[playerNumber - 1].direction = snake_getRelativeDirection(this.snakes[playerNumber - 1].direction, (button == 0 ? "left" : "right"));
			}
		}
	},
	checkCollisions: function(snake) {
		location = snake.segments[0];
		if (location[0] < 0 || location[0] >= 32 || location[1] < 0 || location[1] >= 32) {
			return "wall";
		}
		for (var foodPellet of this.foodPellets) {
			if (foodPellet[0] == location[0] && foodPellet[1] == location[1]) {
				return "food";
			}
		}
		for (var iterSnake of this.snakes) {
			if (!iterSnake.alive) {
				continue;
			}
			if (snake == iterSnake) {
			 iterSnake = {
				segments: iterSnake.segments.slice(1)
			 }
			}
			for (segment of iterSnake.segments) {
				if (segment == location) {
					return "snake";
				}
			}
		}
	},
	draw: function() { //A 32x32 array should be returned.
		var canvas = draw_getFilledCanvas("#545454");
		for (var foodPellet of this.foodPellets) {
			canvas[foodPellet[1]][foodPellet[0]] = this.colors.foodPellet;
		}
		for (var index = 0; index < this.snakes.length; index++) {
			var snake = this.snakes[index];
			if (!snake.alive) {
				continue;
			}
			for (segment of snake.segments) {
				canvas[segment[1]][segment[0]] = draw_getPlayerColor(index + 1);
			}
		}
		return canvas;
	},
	onPlayerConnect: function() {
		var [x, y] = snake_findSuitableLocation(this.snakes, this.foodPellets);
		var startingDirection;
		if (x < 16) {
			startingDirection = "east";
		}
		else {
			startingDirection = "west";
		}
		this.snakes.push({
			segments: [[x, y]],
			pendingSegments: 3, //Start with a snake length of 4.
			alive: true,
			direction: startingDirection
		});
		
		for (var i = 0; i < this.FOOD_SPAWNS_PER_PLAYER; i++) {
			this.spawnFoodPellet();
		}
	},
	onPlayerDisconnect: function(playerNumber) {
		this.snakes.splice(playerNumber - 1, 1);
		for (var i = 0; i < this.FOOD_SPAWNS_PER_PLAYER; i++) {
			this.foodPellets.shift();
		}
	},
	spawnFoodPellet: function() {
		var [x, y] = snake_findSuitableLocation(this.snakes, this.foodPellets);
		this.foodPellets.push([x, y]);
	},
	minPlayers: 1,
	maxPlayers: 12
});

exports.pong = () => ({
	tick: function(delta) {
	
	},
	input: function(playerNumber, button, state) {
	
	},
	draw: function() {
	
	},
	onPlayerConnect: function() {
	
	},
	onPlayerDisconnect: function(playerNumber) {
	
	},
	minPlayers: 1,
	maxPlayers: 2
});

//Platformer, Chess, Checkers, Climbing-style Game