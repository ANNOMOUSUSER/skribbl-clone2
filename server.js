const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Game state
let rooms = {};
let players = {};

// Word list
const words = [
    'apple', 'banana', 'house', 'car', 'tree', 'sun', 'moon', 'star', 'cat', 'dog',
    'bird', 'fish', 'book', 'phone', 'computer', 'chair', 'table', 'window', 'door', 'flower',
    'mountain', 'river', 'bridge', 'castle', 'pizza', 'cake', 'rainbow', 'cloud', 'lightning',
    'butterfly', 'elephant', 'giraffe', 'penguin', 'turtle', 'airplane', 'bicycle', 'guitar',
    'piano', 'camera', 'umbrella', 'sandwich', 'hamburger', 'ice cream', 'basketball', 'football'
];

// Helper functions
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function findRoomBySocketId(socketId) {
    return Object.keys(rooms).find(roomId =>
        rooms[roomId].players.some(player => player.id === socketId) ||
        rooms[roomId].spectators.some(spectator => spectator.id === socketId)
    );
}

function getRandomWord() {
    return words[Math.floor(Math.random() * words.length)];
}

function calculateScore(timeLeft, maxTime = 60) {
    return Math.max(100 - (maxTime - timeLeft) * 5, 10);
}

function getNextDrawer(room) {
    const currentDrawerIndex = room.players.findIndex(p => p.id === room.currentDrawer);
    return room.players[(currentDrawerIndex + 1) % room.players.length];
}

function createRoom(hostId, hostUsername, settings = {}, isSpectator = false, isAdmin = false) {
    const roomId = generateRoomCode();
    
    // Apply custom settings or use defaults
    const roomSettings = {
        maxRounds: settings.maxRounds || 3,
        roundTime: settings.roundTime || 60,
        totalTime: settings.totalTime || 15
    };

    rooms[roomId] = {
        id: roomId,
        players: [],
        spectators: [],
        gameStarted: false,
        currentDrawer: null,
        currentWord: '',
        round: 1,
        maxRounds: roomSettings.maxRounds,
        roundTime: roomSettings.roundTime,
        totalTime: roomSettings.totalTime,
        timeLeft: roomSettings.roundTime,
        timer: null,
        wordHint: '',
        settings: roomSettings,
        adminId: null
    };

    if (isAdmin) {
        // Admin is always a spectator
        const admin = {
            id: hostId,
            username: hostUsername,
            isAdmin: true,
            isSpectator: true
        };
        rooms[roomId].spectators.push(admin);
        rooms[roomId].adminId = hostId;
        players[hostId] = { roomId, username: hostUsername, isSpectator: true, isAdmin: true };
    } else if (isSpectator) {
        // Regular spectator
        const spectator = {
            id: hostId,
            username: hostUsername,
            isAdmin: false,
            isSpectator: true
        };
        rooms[roomId].spectators.push(spectator);
        players[hostId] = { roomId, username: hostUsername, isSpectator: true, isAdmin: false };
    } else {
        // Regular player host
        const host = {
            id: hostId,
            username: hostUsername,
            score: 0,
            isHost: true,
            hasGuessed: false
        };
        rooms[roomId].players.push(host);
        players[hostId] = { roomId, username: hostUsername, isSpectator: false, isAdmin: false };
    }

    return roomId;
}

function addPlayerToRoom(roomId, playerId, username, isSpectator = false, isAdmin = false) {
    if (!rooms[roomId]) return false;
    
    const room = rooms[roomId];
    
    if (isAdmin) {
        // Admin is always a spectator
        const admin = {
            id: playerId,
            username: username,
            isSpectator: true,
            isAdmin: true
        };
        room.spectators.push(admin);
        room.adminId = playerId;
        players[playerId] = { roomId, username, isSpectator: true, isAdmin: true };
    } else if (isSpectator) {
        // Regular spectator
        const spectator = {
            id: playerId,
            username: username,
            isSpectator: true,
            isAdmin: false
        };
        room.spectators.push(spectator);
        players[playerId] = { roomId, username, isSpectator: true, isAdmin: false };
    } else {
        // Regular player
        if (room.players.length >= 8) return false;
        
        const player = {
            id: playerId,
            username: username,
            score: 0,
            isHost: room.players.length === 0,
            hasGuessed: false
        };
        room.players.push(player);
        players[playerId] = { roomId, username, isSpectator: false, isAdmin: false };
    }

    return true;
}

function removePlayerFromRoom(socketId) {
    const roomId = findRoomBySocketId(socketId);
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    const playerInfo = players[socketId];

    if (playerInfo && playerInfo.isSpectator) {
        // Remove spectator
        room.spectators = room.spectators.filter(s => s.id !== socketId);
        if (room.adminId === socketId) {
            room.adminId = null;
        }
    } else {
        // Remove player
        room.players = room.players.filter(p => p.id !== socketId);
        
        // If drawer left, move to next player
        if (room.currentDrawer === socketId && room.gameStarted) {
            endRound(roomId);
        }

        // Assign new host if needed
        if (room.players.length > 0 && !room.players.some(p => p.isHost)) {
            room.players[0].isHost = true;
        }
    }

    // If room is empty (no players and no spectators), delete it
    if (room.players.length === 0 && room.spectators.length === 0) {
        if (room.timer) clearInterval(room.timer);
        delete rooms[roomId];
    }

    delete players[socketId];
}

function startGame(roomId, customSettings = null) {
    const room = rooms[roomId];
    if (!room || room.gameStarted || room.players.length === 0) return false;

    // Apply custom settings if provided
    if (customSettings) {
        room.maxRounds = customSettings.maxRounds || room.maxRounds;
        room.roundTime = customSettings.roundTime || room.roundTime;
        room.totalTime = customSettings.totalTime || room.totalTime;
        room.settings = {
            maxRounds: room.maxRounds,
            roundTime: room.roundTime,
            totalTime: room.totalTime
        };
    }

    room.gameStarted = true;
    room.round = 1;
    room.currentDrawer = room.players[0].id;
    room.currentWord = getRandomWord();
    room.wordHint = '_ '.repeat(room.currentWord.length).trim();

    // Reset all players
    room.players.forEach(player => {
        player.score = 0;
        player.hasGuessed = false;
    });

    startRound(roomId);
    return true;
}

function startRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.timeLeft = room.roundTime;
    room.players.forEach(player => {
        player.hasGuessed = false;
    });

    // Emit game state to players (they see hint)
    room.players.forEach(player => {
        const wordToSend = player.id === room.currentDrawer ? room.currentWord : room.wordHint;
        io.to(player.id).emit('roundStart', {
            drawer: room.players.find(p => p.id === room.currentDrawer),
            word: wordToSend,
            hint: room.wordHint,
            round: room.round,
            maxRounds: room.maxRounds,
            timeLeft: room.timeLeft
        });
    });

    // Emit game state to spectators (they see actual word)
    room.spectators.forEach(spectator => {
        io.to(spectator.id).emit('roundStart', {
            drawer: room.players.find(p => p.id === room.currentDrawer),
            word: room.currentWord, // Admin/spectators see the actual word
            hint: room.wordHint,
            round: room.round,
            maxRounds: room.maxRounds,
            timeLeft: room.timeLeft
        });
    });

    // Send actual word to drawer
    if (room.currentDrawer) {
        io.to(room.currentDrawer).emit('wordReveal', room.currentWord);
    }

    // Send actual word to all spectators (including admin)
    room.spectators.forEach(spectator => {
        io.to(spectator.id).emit('wordReveal', room.currentWord);
    });

    // Start timer
    room.timer = setInterval(() => {
        room.timeLeft--;
        io.to(roomId).emit('timeUpdate', room.timeLeft);

        if (room.timeLeft <= 0) {
            endRound(roomId);
        }
    }, 1000);
}

function endRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
    }

    // Emit round end
    io.to(roomId).emit('roundEnd', {
        word: room.currentWord,
        players: room.players
    });

    // Check if game should end
    if (room.round >= room.maxRounds) {
        endGame(roomId);
    } else {
        // Move to next round
        setTimeout(() => {
            if (room.players.length > 0) {
                room.round++;
                const nextDrawer = getNextDrawer(room);
                room.currentDrawer = nextDrawer.id;
                room.currentWord = getRandomWord();
                room.wordHint = '_ '.repeat(room.currentWord.length).trim();
                startRound(roomId);
            }
        }, 3000);
    }
}

function endGame(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.gameStarted = false;
    room.currentDrawer = null;
    room.currentWord = '';
    room.round = 1;

    // Clear timer if exists
    if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
    }

    // Sort players by score
    const finalScores = [...room.players].sort((a, b) => b.score - a.score);

    io.to(roomId).emit('gameEnd', {
        finalScores: finalScores,
        winner: finalScores[0] || null
    });
}

function checkGuess(roomId, playerId, guess) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return false;

    const player = room.players.find(p => p.id === playerId);
    if (!player || player.hasGuessed || playerId === room.currentDrawer) return false;

    if (guess.toLowerCase().trim() === room.currentWord.toLowerCase()) {
        const score = calculateScore(room.timeLeft, room.roundTime);
        player.score += score;
        player.hasGuessed = true;

        io.to(roomId).emit('correctGuess', {
            player: player.username,
            score: score,
            players: room.players
        });

        // Check if all players have guessed
        const allGuessed = room.players.every(p =>
            p.id === room.currentDrawer || p.hasGuessed
        );

        if (allGuessed) {
            setTimeout(() => endRound(roomId), 1000);
        }

        return true;
    }

    return false;
}

function isAdmin(socketId) {
    const playerInfo = players[socketId];
    return playerInfo && playerInfo.isAdmin === true;
}

function canStartGame(socketId, roomId) {
    if (!rooms[roomId]) return false;
    
    const room = rooms[roomId];
    const playerInfo = players[socketId];

    // Admin can always start game (but must have at least 1 player in room)
    if (playerInfo && playerInfo.isAdmin && room.players.length > 0) {
        return true;
    }

    // Host can start game
    const player = room.players.find(p => p.id === socketId);
    return player && player.isHost;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create room
    socket.on('createRoom', (data) => {
        console.log('Create room request:', data);
        const username = typeof data === 'string' ? data : data.username;
        const settings = typeof data === 'object' ? data.settings : undefined;
        const isSpectator = typeof data === 'object' ? data.isSpectator : false;
        const isAdmin = typeof data === 'object' ? data.isAdmin : false;

        const roomId = createRoom(socket.id, username, settings, isSpectator, isAdmin);
        socket.join(roomId);
        socket.emit('roomCreated', roomId);

        const room = rooms[roomId];
        socket.emit('playersUpdate', room.players);
        socket.emit('spectatorsUpdate', room.spectators);

        if (isAdmin) {
            socket.emit('adminStatusUpdate', {
                isAdmin: true,
                roomId: roomId,
                canControlGame: true
            });
        }
    });

    // Join room
    socket.on('joinRoom', ({ roomId, username, isSpectator = false, isAdmin = false }) => {
        console.log('Join room request:', { roomId, username, isSpectator, isAdmin });
        if (rooms[roomId]) {
            const room = rooms[roomId];
            
            if (!isSpectator && !isAdmin && room.players.length >= 8) {
                socket.emit('joinError', 'Room is full');
                return;
            }

            if (addPlayerToRoom(roomId, socket.id, username, isSpectator, isAdmin)) {
                socket.join(roomId);
                socket.emit('roomJoined', {
                    roomId: roomId,
                    settings: room.settings
                });

                if (isAdmin) {
                    socket.emit('adminStatusUpdate', {
                        isAdmin: true,
                        roomId: roomId,
                        canControlGame: true
                    });
                }

                if (room.gameStarted) {
                    const wordToSend = (isSpectator || isAdmin) ? room.currentWord : room.wordHint;
                    socket.emit('roundStart', {
                        drawer: room.players.find(p => p.id === room.currentDrawer),
                        word: wordToSend,
                        hint: room.wordHint,
                        round: room.round,
                        maxRounds: room.maxRounds,
                        timeLeft: room.timeLeft
                    });

                    if (isSpectator || isAdmin) {
                        socket.emit('wordReveal', room.currentWord);
                    }
                }

                io.to(roomId).emit('playersUpdate', room.players);
                io.to(roomId).emit('spectatorsUpdate', room.spectators);

                if (isSpectator || isAdmin) {
                    io.to(roomId).emit('spectatorJoined', {
                        spectator: username,
                        isAdmin: isAdmin
                    });
                } else {
                    io.to(roomId).emit('playerJoined', {
                        player: username,
                        players: room.players
                    });
                }
            }
        } else {
            socket.emit('joinError', 'Room not found');
        }
    });

    // Start game
    socket.on('startGame', (customSettings) => {
        console.log('Start game requested by:', socket.id, 'settings:', customSettings);
        const roomId = findRoomBySocketId(socket.id);
        
        if (!roomId || !rooms[roomId]) {
            socket.emit('startGameError', 'Room not found');
            return;
        }

        const room = rooms[roomId];
        
        if (!canStartGame(socket.id, roomId)) {
            socket.emit('startGameError', 'You do not have permission to start the game');
            return;
        }

        if (room.gameStarted) {
            socket.emit('startGameError', 'Game is already started');
            return;
        }

        if (room.players.length === 0) {
            socket.emit('startGameError', 'Cannot start game: no players in room');
            return;
        }

        const started = startGame(roomId, customSettings);
        if (started) {
            if (isAdmin(socket.id)) {
                socket.emit('adminActionSuccess', 'Game started successfully');
            }
        } else {
            socket.emit('startGameError', 'Failed to start game');
        }
    });

    // ADMIN ACTIONS
    socket.on('adminSkipTurn', () => {
        console.log('Admin skip turn requested by:', socket.id);
        if (!isAdmin(socket.id)) {
            socket.emit('adminError', 'Not authorized');
            return;
        }

        const roomId = findRoomBySocketId(socket.id);
        if (!roomId || !rooms[roomId]) {
            socket.emit('adminError', 'Room not found');
            return;
        }

        const room = rooms[roomId];
        if (!room.gameStarted) {
            socket.emit('adminError', 'No active game to skip');
            return;
        }

        endRound(roomId);
        io.to(roomId).emit('adminAction', { action: 'Turn skipped by admin' });
        socket.emit('adminActionSuccess', 'Turn skipped successfully');
    });

    socket.on('adminEndGame', () => {
        console.log('Admin end game requested by:', socket.id);
        if (!isAdmin(socket.id)) {
            socket.emit('adminError', 'Not authorized');
            return;
        }

        const roomId = findRoomBySocketId(socket.id);
        if (!roomId || !rooms[roomId]) {
            socket.emit('adminError', 'Room not found');
            return;
        }

        const room = rooms[roomId];
        if (!room.gameStarted) {
            socket.emit('adminError', 'No game is currently running');
            return;
        }

        endGame(roomId);
        io.to(roomId).emit('adminAction', { action: 'Game ended by admin' });
        socket.emit('adminActionSuccess', 'Game ended successfully');
    });

    socket.on('adminKickPlayer', (playerId) => {
        console.log('Admin kick player requested by:', socket.id, 'target:', playerId);
        if (!isAdmin(socket.id)) {
            socket.emit('adminError', 'Not authorized');
            return;
        }

        const roomId = findRoomBySocketId(socket.id);
        if (!roomId || !rooms[roomId]) {
            socket.emit('adminError', 'Room not found');
            return;
        }

        const room = rooms[roomId];
        const playerToKick = room.players.find(p => p.id === playerId);
        if (!playerToKick) {
            socket.emit('adminError', 'Player not found');
            return;
        }

        // Store player info before removing
        const playerUsername = playerToKick.username;

        // Notify the player being kicked
        io.to(playerId).emit('kicked', 'You have been kicked by an admin');

        // Remove player from room
        removePlayerFromRoom(playerId);

        // Force disconnect the player
        const kickedSocket = io.sockets.sockets.get(playerId);
        if (kickedSocket) {
            kickedSocket.leave(roomId);
            kickedSocket.disconnect(true);
        }

        // Update players list for remaining players
        io.to(roomId).emit('playersUpdate', room.players);
        io.to(roomId).emit('spectatorsUpdate', room.spectators);

        // Notify room about the kick
        io.to(roomId).emit('adminAction', {
            action: `Player ${playerUsername} was kicked by admin`
        });

        socket.emit('adminActionSuccess', `Player ${playerUsername} kicked successfully`);
    });

    socket.on('adminKickAll', () => {
        console.log('Admin kick all requested by:', socket.id);
        if (!isAdmin(socket.id)) {
            socket.emit('adminError', 'Not authorized');
            return;
        }

        const roomId = findRoomBySocketId(socket.id);
        if (!roomId || !rooms[roomId]) {
            socket.emit('adminError', 'Room not found');
            return;
        }

        const room = rooms[roomId];
        if (room.players.length === 0) {
            socket.emit('adminError', 'No players to kick');
            return;
        }

        // Store player list before kicking
        const playersToKick = [...room.players];
        const kickCount = playersToKick.length;

        // Kick all players
        playersToKick.forEach(player => {
            io.to(player.id).emit('kicked', 'You have been kicked by an admin');
            
            // Remove from room
            removePlayerFromRoom(player.id);
            
            // Force disconnect
            const playerSocket = io.sockets.sockets.get(player.id);
            if (playerSocket) {
                playerSocket.leave(roomId);
                playerSocket.disconnect(true);
            }
        });

        // End game if it was running
        if (room.gameStarted) {
            endGame(roomId);
        }

        // Update room state
        io.to(roomId).emit('playersUpdate', []);
        io.to(roomId).emit('spectatorsUpdate', room.spectators);
        io.to(roomId).emit('adminAction', { action: 'All players kicked by admin' });
        socket.emit('adminActionSuccess', `${kickCount} players kicked successfully`);
    });

    socket.on('adminChatMessage', (message) => {
        console.log('Admin chat message from:', socket.id, 'message:', message);
        if (!isAdmin(socket.id)) {
            socket.emit('adminError', 'Not authorized');
            return;
        }

        const roomId = findRoomBySocketId(socket.id);
        if (!roomId || !rooms[roomId]) {
            socket.emit('adminError', 'Room not found');
            return;
        }

        const adminInfo = players[socket.id];
        io.to(roomId).emit('chatMessage', {
            player: `[ADMIN] ${adminInfo.username}`,
            message: message,
            isAdmin: true
        });
    });

    // Handle drawing - FIXED: broadcast to ALL including spectators & admin
    socket.on('drawingData', (data) => {
        const roomId = findRoomBySocketId(socket.id);
        if (roomId && rooms[roomId] && rooms[roomId].currentDrawer === socket.id) {
            console.log('Broadcasting drawing data to room:', roomId);
            socket.broadcast.to(roomId).emit('drawingData', data); // includes spectators/admin
        }
    });

    // Clear canvas - FIXED: broadcast to ALL including spectators & admin  
    socket.on('clearCanvas', () => {
        const roomId = findRoomBySocketId(socket.id);
        if (roomId && rooms[roomId] && rooms[roomId].currentDrawer === socket.id) {
            console.log('Broadcasting clear canvas to room:', roomId);
            socket.broadcast.to(roomId).emit('clearCanvas');
        }
    });

    // Handle chat/guesses
    socket.on('chatMessage', (message) => {
        const roomId = findRoomBySocketId(socket.id);
        if (!roomId || !rooms[roomId]) return;

        const room = rooms[roomId];
        const playerInfo = players[socket.id];

        if (playerInfo && playerInfo.isSpectator) {
            const displayName = playerInfo.isAdmin ? `[ADMIN] ${playerInfo.username}` : `[SPECTATOR] ${playerInfo.username}`;
            io.to(roomId).emit('chatMessage', {
                player: displayName,
                message: message,
                isAdmin: playerInfo.isAdmin,
                isSpectator: true
            });
            return;
        }

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        if (room.gameStarted && socket.id !== room.currentDrawer) {
            const isCorrect = checkGuess(roomId, socket.id, message);
            if (!isCorrect) {
                io.to(roomId).emit('chatMessage', {
                    player: player.username,
                    message: message
                });
            }
        } else {
            io.to(roomId).emit('chatMessage', {
                player: player.username,
                message: message
            });
        }
    });

    // Get room info
    socket.on('getRoomInfo', (roomId) => {
        if (rooms[roomId]) {
            socket.emit('roomInfo', {
                roomId: roomId,
                settings: rooms[roomId].settings,
                players: rooms[roomId].players,
                spectators: rooms[roomId].spectators,
                gameStarted: rooms[roomId].gameStarted
            });
        } else {
            socket.emit('roomNotFound');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const roomId = findRoomBySocketId(socket.id);
        
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            const playerInfo = players[socket.id];

            if (playerInfo) {
                if (playerInfo.isSpectator) {
                    io.to(roomId).emit('spectatorLeft', {
                        spectator: playerInfo.username,
                        isAdmin: playerInfo.isAdmin
                    });
                } else {
                    const player = room.players.find(p => p.id === socket.id);
                    if (player) {
                        io.to(roomId).emit('playerLeft', {
                            player: player.username,
                            players: room.players.filter(p => p.id !== socket.id)
                        });
                    }
                }
            }

            removePlayerFromRoom(socket.id);
            
            // Update lists after removal
            if (rooms[roomId]) {
                io.to(roomId).emit('playersUpdate', rooms[roomId].players);
                io.to(roomId).emit('spectatorsUpdate', rooms[roomId].spectators);
            }
        }
    });
});

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// API endpoint to get active rooms
app.get('/api/rooms', (req, res) => {
    const activeRooms = Object.keys(rooms).map(roomId => ({
        id: roomId,
        players: rooms[roomId].players.length,
        spectators: rooms[roomId].spectators.length,
        gameStarted: rooms[roomId].gameStarted,
        settings: rooms[roomId].settings
    }));
    res.json(activeRooms);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎨 Skribbl.io Clone server running on http://localhost:${PORT}`);
    console.log(`📁 Admin interface: http://localhost:${PORT}/admin`);
    console.log(`👥 Player interface: http://localhost:${PORT}/`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    Object.values(rooms).forEach(room => {
        if (room.timer) {
            clearInterval(room.timer);
        }
    });
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = { app, server, io };
