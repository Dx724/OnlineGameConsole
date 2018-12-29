var http = require("http");
var url = require("url");
var fs = require("fs");

/* TODO
	- Games! (A game-switching interface could also serve as a method of manually pausing the current game.)
	- Kick a connecting player if there are too many for the current game.
	- Disconnect players on server restart
	- Show when a game is paused
	- Hit enter to join room once a number is typed in
*/

var server = http.createServer(function(request, response) {
		var pathName = url.parse(request.url).pathname;
		console.log("Path: " + pathName);
		if (pathName == "/") {
			fs.readFile("./html/Index.html", "utf8", function(error, file) {
				if (error) {
					console.log(error);
					response.writeHead(500, {"Content-Type": "text/plain"});
					response.write(error + "\n");
					response.end();
				}
				else {
					response.writeHead(200, {"Content-Type": "text/html"});
					response.write(file);
					response.end();
				}
			});
		}
		else if (pathName == "/socket-io.js") {
			fs.readFile("./html/socket-io.js", "utf8", function(error, file) {
				if (error) {
					console.log(error);
					response.writeHead(500, {"Content-Type": "text/plain"});
					response.write(error + "\n");
					response.end();
				}
				else {
					response.writeHead(200, {"Content-Type": "text/javascript"});
					response.write(file);
					response.end();
				}
			});
		}
		else if (pathName == "/css.css") {
			fs.readFile("./html/css.css", "utf8", function(error, file) {
				if (error) {
					console.log(error);
					response.writeHead(500, {"Content-Type": "text/plain"});
					response.write(error + "\n");
					response.end();
				}
				else {
					response.writeHead(200, {"Content-Type": "text/css"});
					response.write(file);
					response.end();
				}
			});
		}
		else if (pathName == "/knob_pointer.png") {
			fs.readFile("./html/knob_pointer.png", function(error, file) {
				if (error) {
					console.log(error);
					response.writeHead(500, {"Content-Type": "text/plain"});
					response.write(error + "\n");
					response.end();
				}
				else {
					response.writeHead(200, {"Content-Type": "image/png"});
					response.write(file);
					response.end();
				}
			});
		}
		else {
			console.log("Returning 404.");
			response.writeHead(404, {"Content-Type": "text/plain"});
			response.write("404 Not Found");
			response.end();
		}
	}
).listen(8756);
console.log("Server started.");

var games = require("./games");
const TARGET_FPS = 15;

function getTime() {
	return (new Date()).getTime();
}

var rooms = {};
function createRoom() {
	var roomID;
	do { //TODO: Extend to five-digit numbers if all four-digit numbers are already being used as room IDs?
		roomID = Math.floor(Math.random() * 9000) + 1000;
	} while (rooms[roomID]);
	var newRoomObject = {
		id: roomID,
		controllers: [],
		displays: [],
		users: [], //Undecided connections (Not a controller or a display yet)
		currentGame: games.snake(), //TODO: Implement interface to choose a game once more games are added
		isPaused: true,
		pauseReasons: ["insufficientPlayers"],
		lastTickTime: getTime(),
		intervalID: setInterval(function() { //Note: In this context, *this* is not equal to *newRoomObject*.
			if (newRoomObject.isPaused) {
				return;
			}
			
			var currentTickTime = getTime();
			newRoomObject.currentGame.tick(currentTickTime - newRoomObject.lastTickTime);
			newRoomObject.lastTickTime = currentTickTime;
			
			var gameDisplayData = newRoomObject.currentGame.draw();
			for (var display of newRoomObject.displays) {
				display.emit("colorizeDisplay", gameDisplayData);
			}
		}, 1000 / TARGET_FPS),
		addUser: function(socket) {
			this.removeUser(socket); //This also runs pause checks.
			this.users.push(socket);
		},
		setController: function(socket) {
			this.removeUser(socket); //This also runs pause checks.
			if (this.controllers.length < this.currentGame.maxPlayers) {
				this.controllers.push(socket);
				this.currentGame.onPlayerConnect();
			}
			else {
				kickPlayer(socket, "The room  you attempted to join is currently full.");
			}
		},
		setDisplay: function(socket) {
			this.removeUser(socket); //This also runs pause checks.
			this.displays.push(socket);
		},
		removeUser: function(socket) {
			var lists = [this.users, this.controllers, this.displays];
			for (var list of lists) {
				if (list.includes(socket)) {
					if (list == this.controllers) {
						this.currentGame.onPlayerDisconnect(socket.data_playerNumber);
					}
					list.splice(list.indexOf(socket), 1);
				}
			}
			this.runPauseChecks();
		},
		runPauseChecks: function() { //Note: If any players are moved in any of these checks, the checks may have to be run again to ensure that the new circumstances do not necessitate a pause.
			if (this.isPaused) {
				if (this.pauseReasons.includes("insufficientPlayers")) {
					if (this.controllers.length >= this.currentGame.minPlayers) {
						this.pauseReasons.splice(this.pauseReasons.indexOf("insufficientPlayers"), 1);
					}
				}
				if (this.pauseReasons.includes("insufficientDisplays")) {
					if (this.displays.length > 0) {
						this.pauseReasons.splice(this.pauseReasons.indexOf("insufficientPlayers"), 1);
					}
				}

				if (this.pauseReasons.length == 0) {
					this.isPaused = false;
				}
			}
			else {
				if (this.controllers.length < this.currentGame.minPlayers) {
					this.pauseReasons.push("insufficientPlayers");
					this.isPaused = true;
				}
				if (this.displays.length == 0) {
					this.pauseReasons.push("insufficientDisplays");
					this.isPaused = true;
				}
			}
		},
		redistributePlayerNumbers: function() {
			var playerNumber = 1;
			for (socket of this.controllers) {
				socket.data_playerNumber = playerNumber;
				socket.emit("playerNumber", "Player Number: " + String(playerNumber));
				playerNumber += 1;
			}
		}
	};
	rooms[String(roomID)] = newRoomObject;
	return roomID;
}
function removeRoom(roomID) {
	clearInterval(rooms[roomID].intervalID);
	delete rooms[roomID];
}

function kickPlayer(socket, reason) {
	socket.emit("kicked", reason);
	console.log("User Kicked. (" + socket.request.connection.remoteAddress + ", Reason: " + reason + "."); //*socket.request.connection* may be undefined if this is run after the user is kicked.
	socket.disconnect();
	runDisconnectChecks(socket);
}

function runDisconnectChecks(socket) {
	if (socket.data_roomID != 0000) {
		var room = rooms[String(socket.data_roomID)];
		if ((room.users.length + room.controllers.length + room.displays.length) <= 0) {
			removeRoom(room.id);
		}
		room.removeUser(socket); //[This runs pause checks!] Ensure that the connection is not still registered as a player in the room it was connected to.
		room.redistributePlayerNumbers(); //Note: This runs after the disconnected user is removed from the room.
	}
}

var socketsModule = require("socket.io")(server);

socketsModule.on("connection", function(socket) {
	socket.data_roomID = 0000; //Room IDs are from 1000-9999 (inclusive).
	console.log("User Connected. (" + socket.request.connection.remoteAddress + ")");
	socket.on("disconnect", function() {
		console.log("User Disconnected. (" + socket.request.connection.remoteAddress + ")");
		runDisconnectChecks(socket);
	});
	socket.on("test", function(message) {
		console.log("Test: " + message);
		socket.emit("test", 10);
	});
	socket.on("roomJoin", function(message) {
		if (message == "new") {
			socket.data_roomID = createRoom();
			console.log(socket.request.connection.remoteAddress + " | Created Room: " + socket.data_roomID + ".");
			socket.emit("roomStatus", "SUCCESS");
		}
		else {
			roomNumber = parseInt(message);
			if (roomNumber == NaN || !rooms.hasOwnProperty(String(roomNumber))) {
				socket.emit("roomStatus", "FAILED");
				console.log("Request failed with room number: " + message + ".");
			}
			else {
				rooms[String(roomNumber)].addUser(socket);
				socket.data_roomID = roomNumber;
				console.log(socket.request.connection.remoteAddress + " | Joined Room: " + socket.data_roomID + ".");
				socket.emit("roomStatus", "SUCCESS");
			}
		}
	});
	socket.on("set-mode", function(message) {
		if (socket.data_roomID == 0000) {
			return;
		}
		console.log(socket.request.connection.remoteAddress + " | Set Mode: " + message);
		if (message == "display") {
			console.log("Changing mode from \"" + socket.data_mode + "\" to \"display\".");
			socket.data_mode = "display";
			var room = rooms[String(socket.data_roomID)];
			room.setDisplay(socket);
			socket.emit("roomNumber", "Room Number: " + socket.data_roomID);
			//socket.leave("controllers");
			//socket.join("displays");
		}
		else if (message == "controller") {
			console.log("Changing mode from \"" + socket.data_mode + "\" to \"controller\".");
			socket.data_mode = "controller";
			//socket.leave("displays");
			//socket.join("controllers");
			var room = rooms[String(socket.data_roomID)];
			room.setController(socket);
			socket.data_playerNumber = room.controllers.indexOf(socket) + 1;
			
			socket.emit("playerNumber", "Player Number: " + String(socket.data_playerNumber));
			socket.on("controlButton", function(data) { //Pass to the socket's current game
				rooms[String(socket.data_roomID)].currentGame.input(socket.data_playerNumber, data[0], data[1]);
				
				/*if (data[1] == 0) { //Button released
					if (data[0] == 0) { //Left button
						socketsModule.to("displays").emit("colorizeDisplay", [["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"],  ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"], ["red", "blue", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red", "red"]]);
					}
					else if (data[0] == 1) { //Right button
						var dataToSend = [];
						var rowForData = [];
						for (var x = 0; x < 32; x++) {
							rowForData.push("green");
						}
						for (var y = 0; y < 32; y++) {
							dataToSend.push(rowForData);
						}
						socketsModule.to("displays").emit("colorizeDisplay", dataToSend);
					}
				}*/
			});
		}
	});
});