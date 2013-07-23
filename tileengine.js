/*
Isometric rendering engine
Code: Paradigm-Iso Engine
Copyright (c) 2013 Nicholas Kwan.
*/

var ctx = canvas.getContext("2d");
var renderer = new Renderer();

var debug = document.getElementById("debug");
function log(str) {
	debug.innerHTML = str;
}

// Animation frame
window.requestAnimFrame = (function() {
	return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame ||
	function(callback) {
	  window.setTimeout(callback, 1000 / 60);
	};
})();

// Tile Set
function TileSet() {
	this.offset = 0;
	this.tileWidth = 1;
	this.tileHeight = 1;
	this.tileOffsetX = 0;
	this.tileOffsetY = 0;
	this.rows = 0;
	this.cols = 0;
	this.count = 0;
	this.src = "";
	this.texture = new Image();
}
TileSet.prototype.load = function(path, firstgid, tileWidth, tileHeight, imageWidth, imageHeight, tileOffsetX, tileOffsetY) {
	this.texture = new Image();
	this.texture.src = path;
	this.imageCallback = function(tileSet) {
		return function() {
			console.log(tileSet.texture.src + " loaded");
			tileSet.loaded = true;
		}
	}
	this.texture.onload = this.imageCallback(this);
	this.loaded = false;
	this.src = path;
	this.offset = firstgid;
	this.tileWidth = tileWidth;
	this.tileHeight = tileHeight;
	this.tileOffsetX = tileOffsetX;
	this.tileOffsetY = tileOffsetY;
	this.rows = Math.floor(imageHeight / tileHeight);
	this.cols = Math.floor(imageWidth / tileWidth);
	this.count = this.rows * this.cols;
}
TileSet.prototype.drawMarker = function(x, y) {
	ctx.fillStyle="red";
	ctx.fillRect(x, y, 20, 20);
	ctx.fillStyle="yellow";
	ctx.fillRect(x, y, 5, 5);
}
TileSet.prototype.drawTile = function(index, x, y) {
	if (!this.loaded) {
		return;
	}

	var x1 = (index % this.cols) * this.tileWidth;
	var y1 = ((index - (index % this.cols)) / this.cols) * this.tileHeight;
	// Tile drawn bottom centered
	var drawOffsetX = this.tileOffsetX;
	var drawOffsetY = -this.tileHeight + 32 + this.tileOffsetY;
	x = x + drawOffsetX;
	y = y + drawOffsetY;
	
	ctx.drawImage(this.texture, x1, y1, this.tileWidth, this.tileHeight, x, y, this.tileWidth, this.tileHeight)
}

// Tile Map
function TileMap() {
	this.layers = new Array();
	this.tileSets = new Array();
	this.sprites = new Array();
	this.lastTime = 0;
	this.playerLayer = 1; // TODO: Extend to multiple entities
	this.playerVisible = false;
	this.playerX = 24.5;
	this.playerY = 26.5;
	this.playerVX = 0; // velocity
	this.playerVY = 0;
	this.playerdestX = 1; // player destination
	this.playerdestY = 12;
	this.globalX = 340;
	this.globalY = -600;
	this.mouseX = 0;
	this.mouseY = 0;
	this.pick = new Image();
	this.pickLoaded = false;
	this.pickloadedcallback = function(map) {
		return function() {
			map.pickLoaded = true;
		}
	}
	this.pick.onload = this.pickloadedcallback(this);
	this.pick.src = "hilight.png";
	this.collisionMap;
	this.finder;
	this.path = new Array();
	this.pathStep = 0;
	this.key = new Array();
}
// Draw tile using draw coordinates
TileMap.prototype.drawTileWorld = function(index, x, y) {
	for (var i = 0; i < this.tileSets.length; i++) {
		if (index < (this.tileSets[i].offset + this.tileSets[i].count) && index >= this.tileSets[i].offset) {
			this.tileSets[i].drawTile(index - this.tileSets[i].offset, x, y);
			break;
		}
	}
}
// Transform tile to draw coordinates
TileMap.prototype.tileToWorld = function(s, t) {
	var x = 32 * s - 32 * t + this.globalX;
	var y = 16 * s + 16 * t + this.globalY;
	return {'x': x, 'y': y};
}
// Draw tile using tile coordinates
TileMap.prototype.drawTile = function(index, s, t) {
	// Draw player before object (if need object to always be behind player, put into background layer)
	if (this.playerVisible && Math.round(this.playerX) == s && Math.round(this.playerY) == t) {
		// Use round instead of floor for more accurate z-ordering
		this.drawPlayer();
	}
	// Work around to add other entities
	if (this.playerVisible) {
		for (var i = 1; i < this.sprites.length;i++) {
			var c = this.tileToWorld(this.sprites[i].s, this.sprites[i].t);
			this.sprites[i].x = c.x;
			this.sprites[i].y = c.y;
			this.sprites[i].draw();
		}
	}

	var worldCoord = this.tileToWorld(s, t);
	this.drawTileWorld(index, worldCoord.x, worldCoord.y);
	
	
}
// Get player facing direction
TileMap.prototype.getDirection = function(x, y) {
	var angle = Math.atan(Math.abs(y/x)) * 180 / Math.PI;
	
	if (x < 0 && y >= 0) {
		angle = 180 - angle;
	}
	if (x < 0 && y < 0) {
		angle = 180 + angle;
	}
	if (x >= 0 && y < 0) {
		angle = 360 - angle;
	}
	angle += 22.5; // offset half 45 angle to make direction correspond to the animation
	
	if (angle > 360) { // loop-over
		angle -= 360;
	}
	if (angle <= 45) {
		return 5; // down-right
	}
	if (angle <= 90) {
		return 4; // down
	}
	if (angle <= 135) {
		return 6; // down-left
	}
	if (angle <= 180) {
		return 7; // left
	}
	if (angle <= 225) {
		return 3; // up-left
	}
	if (angle <= 270) {
		return 1; // up
	}
	if (angle <= 315) {
		return 2; // up-right
	}
	if (angle <= 360) {
		return 0; // right
	}
	return -1; // impossible value
}
// Calculate player velocity
TileMap.prototype.computePlayerVector = function() {
	// determine current next destination
	if (this.pathStep == 0 && this.path.length > 1) { 
		// skip first one (unless it is the only tile in path) to avoid unneeded movement
		this.pathStep = 1;
	}
	if (this.pathStep < this.path.length) {
		this.playerdestX = this.path[this.pathStep][0];
		this.playerdestY = this.path[this.pathStep][1];
	} else {
		this.playerdestX = this.playerX;
		this.playerdestY = this.playerY;
		this.pathStep = 0;
		this.path = new Array();
	}
	
	var remainingX = this.playerdestX - this.playerX;
	var remainingY = this.playerdestY - this.playerY;
	// Compute preferred velocity with magnitude
	var mag = 4;
	var VX = 0;
	var VY = 0;
	if (remainingX != 0) {
		VX = mag * remainingX / Math.sqrt(remainingX * remainingX + remainingY * remainingY);
	}
	if (remainingY != 0) {
		VY = mag * remainingY / Math.sqrt(remainingX * remainingX + remainingY * remainingY);
	}
	
	// more realistic direction
	var dirX = this.playerX;
	var dirY = this.playerY;
	if (this.pathStep > 0 && this.path != null && this.path.length > 0 && this.pathStep < this.path.length) {
		dirX = this.path[this.pathStep - 1][0];
		dirY = this.path[this.pathStep - 1][1];
	}
	
	//var playerState = this.getDirection(remainingX, remainingY);
	var playerState = this.getDirection(this.playerdestX - dirX, this.playerdestY - dirY);
	if (playerState >= 0) {
		// change player animation
		this.sprites[0].state = playerState;
	} else {
		// switch to idle
		if (this.sprites[0].state < 8) {
			this.sprites[0].state += 8;
		}
	}
	
	// Allow 1 tile allowance
	// Overriding velocity if close to destination
	if (remainingX > 0.1) {
		this.playerVX = VX;
	} else if (remainingX < -0.2) {
		this.playerVX = VX;
	} else {
		this.playerVX = 0;
	}
	if (remainingY > 0.1) {
		this.playerVY = VY;
	} else if (remainingY < -0.2) {
		this.playerVY = VY;
	} else {
		this.playerVY = 0;
	}
	
	if (this.pathStep < this.path.length) {
		if (this.playerVX == 0 && this.playerVY == 0) {
			this.pathStep++
			this.computePlayerVector(); // recompute
		}
	}
	
	// Player idle (note: if remaining X and Y are 0, the velocity may not be 0)
	if (this.playerVX == 0 && this.playerVY == 0) {
		if (playerState >= 0) {
			this.sprites[0].state = playerState + 8;
		}
	}
}
TileMap.prototype.computePlayerVectorFromKey = function() {
	var VX = 0;
	var VY = 0;
	var mag = 4;
	if (this.key[87]) { //W
		VX -= 1;
		VY -= 1;
	}
	if (this.key[65]) { //A
		VX -= 1;
		VY += 1;
	}
	if (this.key[83]) { //S
		VX += 1;
		VY += 1;
	}
	if (this.key[68]) { //D
		VX += 1;
		VY -= 1;
	}
	var vectorMag = VX * VX + VY * VY;
	if (vectorMag > 1) {
		var rootTwo = Math.sqrt(2); // compute sqrt once to reduce computation time
		VX /= rootTwo;
		VY /= rootTwo;
	}
	VX *= mag;
	VY *= mag;
	
	if (VX != 0 || VY != 0) {
		this.sprites[0].state = this.getDirection(VX, VY);
	} else if (this.sprites[0].state < 8) {
		this.sprites[0].state += 8;
	}
	this.playerVX = VX;
	this.playerVY = VY;
}
TileMap.prototype.walkable = function(s, t) {
	var value = this.layers[2].grid[Math.floor(t)][Math.floor(s)];
	if (value == 0) {
		return true;
	}
	return false;
}
TileMap.prototype.performAI = function() {
	for (var i = 1; i < this.sprites.length; i++) {
		var distX = renderer.tileMap.playerX - this.sprites[i].s;
		var distY = renderer.tileMap.playerY - this.sprites[i].t;
		var dist = Math.sqrt(distX * distX + distY * distY);
		if (dist <= this.sprites[i].range) {
			if (this.sprites[i].aggro == 1) {
				this.sprites[i].aggroFunc();
			}
		}
		if (dist > this.sprites[i].chaseRange) { // chasing range if already aggro-ed
			if (this.sprites[i].hasAggro == 1) {
				this.sprites[i].giveupFunc();
			}
		}
		
		if (this.sprites[i].hasAggro == 1) {
			this.sprites[i].aggroFunc();
		}
		if (this.sprites[i].hasAggro == 0) {
			this.sprites[i].idleFunc();
		}
	}
	
}
// Perform a time step, updating entities positions
TileMap.prototype.performStep = function() {
	if (this.lastTime == 0) {
		this.lastTime = Date.now();
	}
	var currentTime = Date.now();
	var elapsedTime = currentTime - this.lastTime;
	this.lastTime = currentTime;
	
	// Update entity (velocity relative to tile grid, 1 unit = 1 tile per second)
	// (-1, 1) = left, (1,-1) = right, (-1, -1) = up, (1, 1) = down
	if (this.path.length > 0) {
		this.computePlayerVector();
	} else {
		this.computePlayerVectorFromKey();
	}
	var nextX = this.playerX + (this.playerVX/1000) * elapsedTime;
	var nextY = this.playerY + (this.playerVY/1000) * elapsedTime;
	if (this.path.length > 0 || this.walkable(nextX, nextY)) { // walkable check if using WSAD movement
		this.playerX = nextX;
		this.playerY = nextY;
	} else {
		this.playerVX = 0;
		this.playerVY = 0;
		this.sprites[0].state += 8;
	}
}
TileMap.prototype.handleClick = function() {
	var clicktile = this.worldToTileRaw(this.mouseX - this.globalX, this.mouseY - this.globalY);
	this.playerdestX = clicktile.s;
	this.playerdestY = clicktile.t;
	
	this.handleNPCTalk(Math.floor(clicktile.s), Math.floor(clicktile.t));

	// Test path finding
	this.path = this.findPath(Math.floor(this.playerX), Math.floor(this.playerY), Math.floor(this.playerdestX), Math.floor(this.playerdestY));
	this.path[this.path.length - 1] = [clicktile.s, clicktile.t]; // override for last tile to be more precise
	this.pathStep = 0;
}
// s, t = position which tile is clicked
TileMap.prototype.handleNPCTalk = function(s, t) {
	s = s + 1; // TODO: fix entity off-by-one
	for (var i = 1; i < this.sprites.length; i++) {
		if (this.sprites[i].s == s && this.sprites[i].t == t) {
			// There is an NPC
			var talkRange = 1.5;
			var distX = this.sprites[i].s - this.playerX;
			var distY = this.sprites[i].t - this.playerY;
			var distanceToNPC = Math.sqrt(distX * distX + distY * distY);
			if (distanceToNPC <= talkRange) {
				this.sprites[i].talkFunc();
			}
			break; // assuming only at most one NPC stands at a tile
		}
	}
	
	
}
TileMap.prototype.handleKeyPress = function(key, isUp) {
	this.path = new Array(); // keyboard movement override existing auto-path
	if (this.key[key] == null) {
		this.key[key] = false; // null and false are treated as different values
	}
	if (!isUp) {
		if (this.key[key] == false) {
			//console.log(key + " was pressed");
		}
		this.key[key] = true;
	} else {
		if (this.key[key] == true) {
			//console.log(key + " was released");
		}
		this.key[key] = false;
	}
}
var disp = false;
var lasts = 0;
var dbg = "";
// Draw a specific layer
TileMap.prototype.drawLayer = function(index) {
	if (!this.layers[index].visible) {
		return;
	}
	if (index == this.playerLayer) {
		this.playerVisible = true;
	} else {
		this.playerVisible = false;
	}
	var layer = this.layers[index];
	for (var i = 0; i < layer.grid.length; i++) {
		for (var j = 0; j < layer.grid[i].length; j++) {
			this.drawTile(layer.grid[i][j], j, i);
		}
	}
	disp = true;
}
// Draw all layers
TileMap.prototype.drawLayers = function() {
	for (var i = 0; i < this.layers.length; i++) {
		this.drawLayer(i);
	}
}
// Draw everything
TileMap.prototype.draw = function() {
	this.performAI();
	this.performStep();
	ctx.fillStyle="black";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	//console.log(ctx);
	this.drawLayers();
	this.drawPick();
	
	//this.drawPath(this.path);
}
// Draw player
TileMap.prototype.drawPlayer = function() {
	var s = this.playerX;
	var t = this.playerY;
	var coord = this.tileToWorld(s, t);
	var offsetx = 32; // Note: default draw offset is +32 for the tile (since drawing for tiles starts from top left instead of center)
	var offsety = 0;
	var x = coord.x + offsetx;
	var y = coord.y + offsety;
	var playerSprite = this.sprites[0];
	playerSprite.x = x;
	playerSprite.y = y;
	playerSprite.draw();
}
// Draw pick
TileMap.prototype.drawPick = function() {
	if (!this.pickLoaded) {
		return;
	}
	var x = this.mouseX - this.globalX;
	var y = this.mouseY - this.globalY;
	var tile = this.worldToTile(x, y);
	var coord = this.tileToWorld(tile.s, tile.t);
	ctx.globalAlpha = 0.5;
	ctx.drawImage(this.pick, coord.x, coord.y);
	ctx.globalAlpha = 1;

	log(tile.s + "," + tile.t); // show tile coordinates which mouse is on
}
// World to Tile mapping
TileMap.prototype.worldToTileRaw = function(x, y) {
	var tileWidth = 64; // depends on map
	var tileHeight = 32;
	/*
	var nearestX = Math.floor(x / tileWidth) * tileWidth;
	var nearestY = Math.floor(y / tileHeight) * tileHeight;
	
	var relativeX = x - nearestX;
	var relativeY = y - nearestY;
	*/
	var pOffsetX = -32;
	var pOffsetY = 0;
	
	/*
	var dOffsetX = 0; // decimal offset
	var dOffsetY = 0;
	var tileType = this.tilePick(relativeX, relativeY);
	if (tileType == 1 || tileType == 4) {
		//pOffsetX = -32;
		dOffsetX = 0.5;
	}
	if (tileType == 2 || tileType == 5) {
		//pOffsetX = 32;
		dOffsetX = -0.5;
	}
	if (tileType == 1 || tileType == 2) {
		//pOffsetY = -16;
		dOffsetY = 0.5;
	}
	if (tileType == 4 || tileType == 5) {
		//pOffsetY = 16;
		dOffsetY = -0.5;
	}
	*/
	//var tileWorldX = nearestX + pOffsetX + relativeX;
	//var tileWorldY = nearestY + pOffsetY + relativeY;
	var tileWorldX = x + pOffsetX;
	var tileWorldY = y + pOffsetY;
	var tilecX = (tileWorldX + 2 * tileWorldY) / 64;
	var tilecY = (tileWorldX - 2 * tileWorldY) / -64;
	
	return {"s": tilecX, "t": tilecY};
}
TileMap.prototype.worldToTile = function(x, y) {
	var tile = this.worldToTileRaw(x, y);
	return {"s": Math.floor(tile.s), "t": Math.floor(tile.t) };
}
TileMap.prototype.tilePick = function(x, y) {
	var halfWidth = 32;
	var halfHeight = 16;
	// Divide to 4 rectangles, then each rectangle divide it along the relevant diagonal
	if (x < halfWidth && y < halfHeight) {
		if (this.linePick(x, y, 1) == 1) {
			return 1;
		} else {
			return 3;
		}
	}
	if (x < halfWidth && y >= halfHeight) {
		if (this.linePick(x, y - halfHeight, 0) == 1) {
			return 3;
		} else {
			return 4;
		}
	}
	if (x >= halfWidth && y < halfHeight) {
		if (this.linePick(x - halfWidth, y, 0) == 1) {
			return 2;
		} else {
			return 3;
		}
	}
	if (x >= halfWidth && y >= halfHeight) {
		if (this.linePick(x - halfWidth, y - halfHeight, 1) == 1) {
			return 3;
		} else {
			return 5;
		}
	}
	return 0;
}
TileMap.prototype.linePick = function(x, y, type) {
	var halfhalfHeight = 16;
	if (type == 0) {
		if (x > y * 2) {
			return 1;
		} else {
			return 2;
		}
	}
	if (type == 1) {
		if (x > (halfhalfHeight - y) * 2) {
			return 2;
		} else {
			return 1;
		}
	}
	return 0;
}
// Generate path finding grid
TileMap.prototype.setCollisionMap = function(index) {
	var layer = this.layers[index];
	var grid = new PF.Grid(layer.grid.length, layer.grid[0].length);
	
	for (var i = 0; i < layer.grid.length; i++) {
		var row = layer.grid[i];
		for (var j = 0; j < row.length; j++) {
			if (layer.grid[i][j] != 0) {
				grid.setWalkableAt(j, i, false);
			} else {
				grid.setWalkableAt(j, i, true);
			}
		}
	}
	this.collisionMap = grid;
	if (this.collisionMap == null) {
		console.log("Cannot generate collision map");
		return;
	}
	this.finder = new PF.AStarFinder({ allowDiagonal: true });
}
// Generate path, returns array of nodes to visit
TileMap.prototype.findPath = function(startX, startY, destX, destY) {
	if (this.collisionMap == null) {
		return;
	}
	var grid = this.collisionMap.clone();
	var path = this.finder.findPath(startX, startY, destX, destY, this.collisionMap);
	this.collisionMap = grid; // collision map was altered by finder, so replace with original grid to reuse it
	return path;
}
TileMap.prototype.drawPath = function(path) {
	if (path != null) {
		for (var i = 0; i < path.length; i++) {
			this.drawPathPoint(path[i][0], path[i][1]);
		}
	}
}
TileMap.prototype.drawPathPoint = function(s, t) {
	if (!this.pickLoaded) {
		return;
	}
	var coord = this.tileToWorld(s, t);
	ctx.globalAlpha = 0.5;
	ctx.drawImage(this.pick, coord.x, coord.y);
	ctx.globalAlpha = 1;
}

// Layer
function Layer() {
	this.name = "";
	this.visible = true;
	this.grid = new Array();
}
Layer.prototype.load = function(src) {
	this.grid = new Array(); // reset any old data
	var httpreq = new XMLHttpRequest();
	httpreq.open("GET", src, false);
	httpreq.send();
	var data = httpreq.responseText;
	var rows = data.split("\r\n");
	for (var i = 0; i < rows.length; i++) {
		var cols = rows[i].split(",");
		this.grid[i] = new Array();
		for (var j = 0; j < cols.length; j++) {
			var tileIndex = parseInt(cols[j], 10);
			if (!isNaN(tileIndex)) {
				this.grid[i][j] = tileIndex;
			}
		}
	}
}

// Sprite
function Sprite() {
	this.name = "";
	this.x = 0;
	this.y = 0;
	this.drawOffsetX = 0;
	this.drawOffsetY = 0;
	this.state = "";
	this.texture = new Image();
	this.texturecallback = function(sprite) {
		return function() {
			sprite.loaded = true;
		}
	}
	this.texture.onload = this.texturecallback(this);
	this.loaded = false;
	
	this.animations = new Array();
	this.lastState = "";
	this.lastTime = 0; // records last timing when the state was changed
	this.pause = false;
}
Sprite.prototype.draw = function() {
	if (!this.loaded) {
		return;
	}
	if (this.lastTime == 0 || this.lastState != this.state) {
		this.lastTime = Date.now();
		this.lastState = this.state;
	}
	
	var animation = null;
	for (var i = 0; i < this.animations.length; i++) {
		if (this.animations[i].name == this.state) {
			animation = this.animations[i];
			break;
		}
	}
	if (animation == null) {
		animation = this.animations[0];
	}
	
	var elaspedTime = Date.now() - this.lastTime;
	var frameNo = Math.floor((elaspedTime/1000) / animation.duration);
	
	var spriteX = animation.offsetX + (frameNo % animation.frames) * animation.width;
	var spriteY = animation.offsetY;
	
	var dOffsetX = this.drawOffsetX;
	var dOffsetY = this.drawOffsetY;
	ctx.drawImage(this.texture, spriteX, spriteY, animation.width, animation.height, this.x + dOffsetX, this.y + dOffsetY, animation.width, animation.height);
	

}

// Animation
function Animation() {
	this.name = "";
	this.offsetX = 0;
	this.offsetY = 0;
	this.width = 0;
	this.height = 0;
	this.frames = 1;
	this.duration = 1; // duration per frame in seconds
}

// Renderer
function Renderer() {
	this.tileMap = new TileMap();
	this.dragging = false;
	this.startX = 0;
	this.startY = 0;
	this.globalStartX = 0;
	this.globalStartY = 0;
	// Mouse functions
	this.onselectstart = function() {
		return false;
	}
}
Renderer.prototype.mouseDown = function(e) {
	if (!renderer.dragging) {
		renderer.startX = e.pageX - canvas.offsetLeft;
		renderer.startY = e.pageY - canvas.offsetTop;
		renderer.globalStartX = renderer.tileMap.globalX;
		renderer.globalStartY = renderer.tileMap.globalY;
	}
	renderer.tileMap.mouseX = e.pageX - canvas.offsetLeft;
	renderer.tileMap.mouseY = e.pageY - canvas.offsetTop;
	renderer.dragging = true;
}
Renderer.prototype.mouseMove = function(e) {
	renderer.tileMap.mouseX = e.pageX - canvas.offsetLeft;
	renderer.tileMap.mouseY = e.pageY - canvas.offsetTop;
	if (renderer.dragging) {
		renderer.tileMap.globalX = renderer.globalStartX + renderer.tileMap.mouseX - renderer.startX;
		renderer.tileMap.globalY = renderer.globalStartY + renderer.tileMap.mouseY - renderer.startY;
	}
}
Renderer.prototype.mouseUp = function(e) {
	renderer.dragging = false;
	if (e.button == 0) {
		renderer.tileMap.handleClick();
	}
}
Renderer.prototype.mouseOut = function(e) {
	renderer.dragging = false;
}
Renderer.prototype.keyDown = function(e) {
	renderer.tileMap.handleKeyPress(e.keyCode, false);
}
Renderer.prototype.keyUp = function(e) {
	renderer.tileMap.handleKeyPress(e.keyCode, true);
}
Renderer.prototype.oncontextmenu = function(e) {
	e.preventDefault();
	e.stopPropagation();
	return false;
}
Renderer.prototype.load = function() {
	canvas.onselectstart = this.onselectstart;
	canvas.oncontextmenu = this.oncontextmenu;
	canvas.addEventListener("mousedown", this.mouseDown, true);
	canvas.addEventListener("mousemove", this.mouseMove, true);
	canvas.addEventListener("mouseup", this.mouseUp, true);
	canvas.addEventListener("mouseout", this.mouseOut, true); // in case user drag out of canvas
	canvas.addEventListener("keydown", this.keyDown, true); // tabindex property must be set for canvas to make it focusable
	canvas.addEventListener("keyup", this.keyUp, true);
	
	this.tileMap.tileSets[0] = new TileSet();
	this.tileMap.tileSets[0].load("grassland.png", 16, 64, 128, 1024, 1024, 0, 0);
	this.tileMap.tileSets[1] = new TileSet();
	this.tileMap.tileSets[1].load("grassland_water.png", 144, 64, 64, 1024, 256, 0, 32); //offsety = +32
	this.tileMap.tileSets[2] = new TileSet();
	this.tileMap.tileSets[2].load("grassland_structures.png", 208, 64, 256, 1024, 512, 0, 0);
	this.tileMap.tileSets[3] = new TileSet();
	this.tileMap.tileSets[3].load("grassland_trees.png", 240, 128, 256, 1024, 512, -32, 0); //offsetx = -32
	this.tileMap.tileSets[4] = new TileSet();
	this.tileMap.tileSets[4].load("tiled_grassland_2x2.png", 264, 128, 64, 512, 512, 0, 16); //offsety = +16

	this.tileMap.layers[0] = new Layer();
	this.tileMap.layers[0].load("map.txt");
	this.tileMap.layers[1] = new Layer();
	this.tileMap.layers[1].load("map2.txt");
	this.tileMap.layers[2] = new Layer();
	this.tileMap.layers[2].visible = false;
	this.tileMap.layers[2].load("mapc.txt");
	this.tileMap.setCollisionMap(2);
	
	this.tileMap.sprites[0] = new Sprite();
	this.tileMap.sprites[0].name = "player";
	this.tileMap.sprites[0].texture.src = "vlad48x48.png";
	this.tileMap.sprites[0].animations[0] = new Animation();
	this.tileMap.sprites[0].animations[0].name = 0;
	this.tileMap.sprites[0].animations[0].offsetX = 0;
	this.tileMap.sprites[0].animations[0].offsetY = 0;
	this.tileMap.sprites[0].animations[0].width = 48;
	this.tileMap.sprites[0].animations[0].height = 48;
	this.tileMap.sprites[0].animations[0].frames = 8;
	this.tileMap.sprites[0].animations[0].duration = 0.1;
	
	this.tileMap.sprites[0].animations[1] = new Animation();
	this.tileMap.sprites[0].animations[1].name = 1;
	this.tileMap.sprites[0].animations[1].offsetX = 0;
	this.tileMap.sprites[0].animations[1].offsetY = 48;
	this.tileMap.sprites[0].animations[1].width = 48;
	this.tileMap.sprites[0].animations[1].height = 48;
	this.tileMap.sprites[0].animations[1].frames = 8;
	this.tileMap.sprites[0].animations[1].duration = 0.1;
	
	this.tileMap.sprites[0].animations[2] = new Animation();
	this.tileMap.sprites[0].animations[2].name = 2;
	this.tileMap.sprites[0].animations[2].offsetX = 0;
	this.tileMap.sprites[0].animations[2].offsetY = 48 * 2;
	this.tileMap.sprites[0].animations[2].width = 48;
	this.tileMap.sprites[0].animations[2].height = 48;
	this.tileMap.sprites[0].animations[2].frames = 8;
	this.tileMap.sprites[0].animations[2].duration = 0.1;
	
	this.tileMap.sprites[0].animations[3] = new Animation();
	this.tileMap.sprites[0].animations[3].name = 3;
	this.tileMap.sprites[0].animations[3].offsetX = 0;
	this.tileMap.sprites[0].animations[3].offsetY = 48 * 3;
	this.tileMap.sprites[0].animations[3].width = 48;
	this.tileMap.sprites[0].animations[3].height = 48;
	this.tileMap.sprites[0].animations[3].frames = 8;
	this.tileMap.sprites[0].animations[3].duration = 0.1;
	
	this.tileMap.sprites[0].animations[4] = new Animation();
	this.tileMap.sprites[0].animations[4].name = 4;
	this.tileMap.sprites[0].animations[4].offsetX = 0;
	this.tileMap.sprites[0].animations[4].offsetY = 48 * 4;
	this.tileMap.sprites[0].animations[4].width = 48;
	this.tileMap.sprites[0].animations[4].height = 48;
	this.tileMap.sprites[0].animations[4].frames = 8;
	this.tileMap.sprites[0].animations[4].duration = 0.1;
	
	this.tileMap.sprites[0].animations[5] = new Animation();
	this.tileMap.sprites[0].animations[5].name = 5;
	this.tileMap.sprites[0].animations[5].offsetX = 0;
	this.tileMap.sprites[0].animations[5].offsetY = 48 * 5;
	this.tileMap.sprites[0].animations[5].width = 48;
	this.tileMap.sprites[0].animations[5].height = 48;
	this.tileMap.sprites[0].animations[5].frames = 8;
	this.tileMap.sprites[0].animations[5].duration = 0.1;
	
	this.tileMap.sprites[0].animations[6] = new Animation();
	this.tileMap.sprites[0].animations[6].name = 6;
	this.tileMap.sprites[0].animations[6].offsetX = 0;
	this.tileMap.sprites[0].animations[6].offsetY = 48 * 6;
	this.tileMap.sprites[0].animations[6].width = 48;
	this.tileMap.sprites[0].animations[6].height = 48;
	this.tileMap.sprites[0].animations[6].frames = 8;
	this.tileMap.sprites[0].animations[6].duration = 0.1;
	
	this.tileMap.sprites[0].animations[7] = new Animation();
	this.tileMap.sprites[0].animations[7].name = 7;
	this.tileMap.sprites[0].animations[7].offsetX = 0;
	this.tileMap.sprites[0].animations[7].offsetY = 48 * 7;
	this.tileMap.sprites[0].animations[7].width = 48;
	this.tileMap.sprites[0].animations[7].height = 48;
	this.tileMap.sprites[0].animations[7].frames = 8;
	this.tileMap.sprites[0].animations[7].duration = 0.1;
	
	for (var i = 8; i <= 15; i++) {
		this.tileMap.sprites[0].animations[i] = new Animation();
		this.tileMap.sprites[0].animations[i].name = i;
		this.tileMap.sprites[0].animations[i].offsetX = 0;
		this.tileMap.sprites[0].animations[i].offsetY = 48 * (i-8);
		this.tileMap.sprites[0].animations[i].width = 48;
		this.tileMap.sprites[0].animations[i].height = 48;
		this.tileMap.sprites[0].animations[i].frames = 1;
		this.tileMap.sprites[0].animations[i].duration = 1;
	}
	
	this.tileMap.sprites[0].drawOffsetX = -24;
	this.tileMap.sprites[0].drawOffsetY = -38;
	
	// extra entity
	this.tileMap.sprites[1] = new Sprite();
	this.tileMap.sprites[1].name = "John";
	this.tileMap.sprites[1].s = 4 + 1; //TODO: s-axis seems off by 1
	this.tileMap.sprites[1].t = 12;
	this.tileMap.sprites[1].texture.src = "vlad48x48.png";
	this.tileMap.sprites[1].animations[0] = new Animation();
	this.tileMap.sprites[1].animations[0].name = 0;
	this.tileMap.sprites[1].animations[0].offsetX = 0;
	this.tileMap.sprites[1].animations[0].offsetY = 0;
	this.tileMap.sprites[1].animations[0].width = 48;
	this.tileMap.sprites[1].animations[0].height = 48;
	this.tileMap.sprites[1].animations[0].frames = 1;
	this.tileMap.sprites[1].animations[0].duration = 1;
	this.tileMap.sprites[1].drawOffsetX = -24;
	this.tileMap.sprites[1].drawOffsetY = -38;
	this.tileMap.sprites[1].aggro = 1;
	this.tileMap.sprites[1].range = 3;
	this.tileMap.sprites[1].chaseRange = 7;
	this.tileMap.sprites[1].hasAggro = 0;
	this.tileMap.sprites[1].lastAction = 0;
	this.tileMap.sprites[1].lastUpdate = 0;
	this.tileMap.sprites[1].destS = 5;
	this.tileMap.sprites[1].destT = 12;
	this.tileMap.sprites[1].homeS = 5;
	this.tileMap.sprites[1].homeT = 12;
	this.tileMap.sprites[1].speed = 3;
	this.tileMap.sprites[1].updatePosFunc = function() {
		var currentTime = Date.now();
		// TODO: Move position updates to another place (not to be handled by AI)
		// Update position
		
		// Simple linear path (no collision detection)
		var interval = currentTime - renderer.tileMap.sprites[1].lastUpdate;
		var directionX = renderer.tileMap.sprites[1].destS - renderer.tileMap.sprites[1].s;
		var directionY = renderer.tileMap.sprites[1].destT - renderer.tileMap.sprites[1].t;
		var magnitude = Math.sqrt(directionX * directionX + directionY * directionY);
		
		if (magnitude < 0.5) {
			renderer.tileMap.sprites[1].s = renderer.tileMap.sprites[1].destS;
			renderer.tileMap.sprites[1].t = renderer.tileMap.sprites[1].destT;
			magnitude = 0;
		}
		
		var moveDistance = renderer.tileMap.sprites[1].speed * interval/1000;
		var VX = 0;
		var VY = 0;
		if (magnitude != 0) {
			VX = directionX / magnitude * moveDistance;
			VY = directionY / magnitude * moveDistance;
		}
		var direction = renderer.tileMap.getDirection(VX, VY);
		// TODO: add animation (this sprite does not have those defined)
		
		renderer.tileMap.sprites[1].s += VX;
		renderer.tileMap.sprites[1].t += VY;
		
		renderer.tileMap.sprites[1].lastUpdate = currentTime;
	}
	this.tileMap.sprites[1].aggroFunc = function() {
		if (renderer.tileMap.sprites[1].hasAggro == 0) {
			renderer.tileMap.sprites[1].lastAction = Date.now() - 1000; // trigger first action immediately
			renderer.tileMap.sprites[1].lastUpdate = Date.now();
			console.log("Player is nearby entity");
		}
		renderer.tileMap.sprites[1].hasAggro = 1;
		var currentTime = Date.now();
		
		if (currentTime - renderer.tileMap.sprites[1].lastAction >= 1000) {
			console.log("Entity is performing action at 1 second intervals");
			renderer.tileMap.sprites[1].lastAction = currentTime;
			
			// Action: chase player
			renderer.tileMap.sprites[1].destS = renderer.tileMap.playerX;
			renderer.tileMap.sprites[1].destT = renderer.tileMap.playerY;
			console.log(renderer.tileMap.sprites[1].destS + "," + renderer.tileMap.sprites[1].destT);
		}
		
		renderer.tileMap.sprites[1].updatePosFunc();
		
	}
	this.tileMap.sprites[1].giveupFunc = function() {
		if (renderer.tileMap.sprites[1].hasAggro == 1) {
			console.log("Player is now far away");
		}
		renderer.tileMap.sprites[1].hasAggro = 0;
		
		// Go back to original place
		renderer.tileMap.sprites[1].destS = renderer.tileMap.sprites[1].homeS;
		renderer.tileMap.sprites[1].destT = renderer.tileMap.sprites[1].homeT;
	}
	this.tileMap.sprites[1].talkFunc = function() {
		console.log("Talking to John");
		renderer.tileMap.sprites[1].hasAggro = 1;
	}
	this.tileMap.sprites[1].idleFunc = function() {
		var currentTime = Date.now();
		if (currentTime - renderer.tileMap.sprites[1].lastAction > 2000) {
			//console.log("Entity is idling");
			renderer.tileMap.sprites[1].lastAction = currentTime;
		}
		
		renderer.tileMap.sprites[1].updatePosFunc();
	}
	this.tileMap.sprites[1].deathFunc = function() {
	}
	
	// DEMO, hide extra entity
	this.tileMap.sprites.length--;
}
Renderer.prototype.draw = function() {
	this.tileMap.draw();
	requestAnimFrame(function() {
		renderer.draw();
	});
}