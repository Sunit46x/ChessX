const express =  require("express");
const socketio = require("socket.io");
const path = require("path");
const http = require("http");
// Game Logic Functions
const { Chess, makeMove, getResult, getLastMove, getMoveHistory, getPGN, getFenAtMove, GameTimer } = require("./game");

const app = express();

const server = http.createServer(app);

const io = socketio(server);

app.use(express.static(path.join(__dirname, "public")));

app.get("/board", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "board.html"));
});

app.get("/puzzle", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "puzzle.html"));
})

let games = [];

// ==================== HELPER FUNCTIONS ====================

// Get game by roomID
const getGame = (roomID) => games.find((game) => game.roomID === roomID);

// Broadcast timer update to all in room
const broadcastTimerUpdate = (roomID, game) => {
    if (game.timer) {
        io.to(roomID).emit("timer update", game.timer.getTimeState());
    }
};

// Check for timer timeout
const checkTimerTimeout = (roomID, game) => {
    if (game.timer && game.timer.isTimeUp()) {
        const loser = game.timer.getLoser();
        game.timer.stop();
        clearInterval(game.timerInterval);
        io.to(roomID).emit("gameover", `${loser === 'white' ? 'Black' : 'White'} wins on time!`);
        return true;
    }
    return false;
};

// Start timer interval for a game
const startTimerInterval = (roomID, game) => {
    if (game.timerInterval) {
        clearInterval(game.timerInterval);
    }
    
    game.timerInterval = setInterval(() => {
        if (!checkTimerTimeout(roomID, game)) {
            broadcastTimerUpdate(roomID, game);
        }
    }, 100); // Update every 100ms for smooth countdown
};

// Broadcast move history to all in room
const broadcastMoveHistory = (roomID, chess) => {
    io.to(roomID).emit("move history", getMoveHistory(chess));
};

// Get spectator count for a room
const getSpectatorCount = (game) => game.spectators ? game.spectators.length : 0;

io.on("connection", (socket) => {
    socket.on("join", (roomID, options = {}, updateBoardPosition) => {
        socket.join(roomID);

        // Parse options
        const isSpectator = options.spectator === true;
        const timeControl = options.timeControl || 10 * 60 * 1000; // Default 10 minutes
        const increment = options.increment || 0;

        // Create a room in games: [] if doesn't exist already
        if (games.findIndex((game) => game.roomID === roomID) === -1) {
            const game = {
                roomID,
                chess: new Chess(),
                players: [{
                    color: "white",
                    id: socket.id
                }],
                spectators: [],
                timer: new GameTimer(timeControl, increment),
                timerInterval: null,
                gameStarted: false
            };

            games.push(game);
        }

        // Get the game
        const game = getGame(roomID);
        const { chess, players, spectators } = game;

        // Handle spectator joining
        if (isSpectator) {
            if (!spectators.includes(socket.id)) {
                spectators.push(socket.id);
            }
            socket.emit("role", "spectator");
            socket.emit("orientation", "white"); // Spectators see from white's perspective
            io.to(roomID).emit("spectator count", getSpectatorCount(game));
            
            // Send current game state to spectator
            const lastMove = getLastMove(chess);
            if (typeof updateBoardPosition === 'function') {
                updateBoardPosition(chess.fen(), lastMove.to, lastMove.from, chess.turn());
            }
            
            // Send move history to spectator
            socket.emit("move history", getMoveHistory(chess));
            
            // Send current timer state
            if (game.timer) {
                socket.emit("timer update", game.timer.getTimeState());
            }
        }
        // Handle player joining
        else if (players.length < 2 && players.findIndex(player => player.id === socket.id) === -1) {
            players.push({
                color: "black",
                id: socket.id
            });

            socket.emit("role", "player");
            socket.broadcast.to(roomID).emit("join");
            io.to(socket.id).emit("orientation", "black");
            
            // Start the game timer when second player joins
            if (players.length === 2 && !game.gameStarted) {
                game.gameStarted = true;
                game.timer.start('w'); // White starts
                startTimerInterval(roomID, game);
            }
        } else if (players.length >= 2 && !isSpectator) {
            // Room is full, offer spectator mode
            socket.emit("full");
            return;
        } else if (players.findIndex(player => player.id === socket.id) !== -1) {
            // Existing player reconnecting
            socket.emit("role", "player");
        }

        const lastMove = getLastMove(chess);

        if (typeof updateBoardPosition === 'function') {
            updateBoardPosition(chess.fen(), lastMove.to, lastMove.from, chess.turn());
        }
        
        // Send current state
        io.to(roomID).emit("spectator count", getSpectatorCount(game));
        broadcastMoveHistory(roomID, chess);
        if (game.timer) {
            socket.emit("timer update", game.timer.getTimeState());
        }

        // ON MOVE
        socket.on("move", (move) => {
            // Only players can make moves
            if (spectators.includes(socket.id)) {
                return;
            }
            
            if (makeMove(chess, move)) {
                const newMove = {
                    newPos: chess.fen(),
                    source: move.source,
                    target: move.target
                };

                io.to(roomID).emit("move", newMove);
                io.to(roomID).emit("turn", chess.turn());
                
                // Switch timer to next player
                if (game.timer && game.gameStarted) {
                    game.timer.switchTurn(chess.turn());
                    broadcastTimerUpdate(roomID, game);
                }
                
                // Broadcast updated move history
                broadcastMoveHistory(roomID, chess);

                if (chess.game_over()) {
                    // Stop timer on game over
                    if (game.timer) {
                        game.timer.stop();
                        clearInterval(game.timerInterval);
                    }
                    io.to(roomID).emit("gameover", getResult(chess));
                }
            } else {
                socket.emit("invalid move", chess.fen());
            }
        });

        // ON RESET
        socket.on("reset", () => {
            // Only players can reset
            if (spectators.includes(socket.id)) {
                return;
            }
            
            chess.reset();
            io.to(roomID).emit("reset");
            io.to(roomID).emit("turn", chess.turn());

            // Reset and restart timer
            if (game.timer) {
                clearInterval(game.timerInterval);
                game.timer.reset();
                game.timer.start('w');
                startTimerInterval(roomID, game);
                broadcastTimerUpdate(roomID, game);
            }
            
            // Clear move history
            broadcastMoveHistory(roomID, chess);

            // Swap colors
            for (let i = 0; i < players.length; i++) {
                const player = players[i];

                player.color = player.color === "white" ? "black" : "white";

                io.to(player.id).emit("orientation", player.color);
            }
        });

        // ON UNDO REQUEST
        socket.on("undo request", (orientation) => {
            // Only players can request undo
            if (spectators.includes(socket.id)) {
                return;
            }
            
            const turn = chess.turn();

            if ((orientation === "white" && turn === "w") || (orientation === "black" && turn === "b")) {
                chess.undo();

                const { to, from } = getLastMove(chess);

                io.to(roomID).emit("undo", chess.fen(), to, from, chess.turn());
                
                // Switch timer back
                if (game.timer && game.gameStarted) {
                    game.timer.switchTurn(chess.turn());
                    broadcastTimerUpdate(roomID, game);
                }
                
                // Update move history
                broadcastMoveHistory(roomID, chess);
            } else {
                socket.emit("undo request", true)
                socket.broadcast.to(roomID).emit("undo request");
            }
        });
        
        socket.on("undo accepted", () => {
            chess.undo();

            const { to, from } = getLastMove(chess);

            io.to(roomID).emit("undo", chess.fen(), to, from, chess.turn());
            
            // Switch timer back
            if (game.timer && game.gameStarted) {
                game.timer.switchTurn(chess.turn());
                broadcastTimerUpdate(roomID, game);
            }
            
            // Update move history
            broadcastMoveHistory(roomID, chess);
        });

        socket.on("undo declined", () => {
            socket.broadcast.to(roomID).emit("undo declined");
        })
        // -->
        
        // ==================== REPLAY & HISTORY HANDLERS ====================
        
        // Get position at specific move index (for replay)
        socket.on("get replay position", (moveIndex) => {
            const history = chess.history({ verbose: true });
            
            if (moveIndex < 0) {
                // Starting position
                socket.emit("replay position", {
                    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                    moveIndex: -1,
                    move: null,
                    totalMoves: history.length
                });
            } else if (moveIndex < history.length) {
                const fen = getFenAtMove(chess, moveIndex);
                const move = history[moveIndex];
                
                socket.emit("replay position", {
                    fen,
                    moveIndex,
                    move: {
                        from: move.from,
                        to: move.to,
                        san: move.san
                    },
                    totalMoves: history.length
                });
            }
        });
        
        // Get PGN of current game
        socket.on("get pgn", () => {
            const pgn = getPGN(chess);
            socket.emit("pgn", pgn);
        });
        
        // ==================== TIMER CONTROL HANDLERS ====================
        
        // Pause timer (for both players to agree)
        socket.on("pause timer", () => {
            if (spectators.includes(socket.id)) return;
            
            if (game.timer && game.timer.isRunning) {
                game.timer.stop();
                io.to(roomID).emit("timer paused");
                broadcastTimerUpdate(roomID, game);
            }
        });
        
        // Resume timer
        socket.on("resume timer", () => {
            if (spectators.includes(socket.id)) return;
            
            if (game.timer && !game.timer.isRunning && game.gameStarted) {
                game.timer.start(chess.turn());
                io.to(roomID).emit("timer resumed");
                startTimerInterval(roomID, game);
            }
        });


        // ON SURRENDER
        socket.on("surrender", (player) => {
            // Only players can surrender
            if (spectators.includes(socket.id)) {
                return;
            }
            
            // Stop timer
            if (game.timer) {
                game.timer.stop();
                clearInterval(game.timerInterval);
            }
            
            io.to(roomID).emit("gameover", `${player === "white" ? "Black" : "White"} wins!`)
        })


        // ON DRAW OFFER

        // accepted can be:
        // undefined if the user is asking for a draw
        // true if the opponent accepted
        // false if the opponent declined
        socket.on("draw offer", (accepted) => {
            // Only players can offer/accept draw
            if (spectators.includes(socket.id)) {
                return;
            }
            
            if (accepted) {
                // Stop timer on draw
                if (game.timer) {
                    game.timer.stop();
                    clearInterval(game.timerInterval);
                }
                io.to(roomID).emit("gameover", "Draw!")
            } else if (accepted === false) {
                socket.broadcast.to(roomID).emit("offer draw", false);
            } else {
                socket.broadcast.to(roomID).emit("offer draw");
            }
        })

        socket.on("disconnect", () => {
            // Check if disconnecting user was a spectator
            const spectatorIndex = spectators.indexOf(socket.id);
            if (spectatorIndex !== -1) {
                spectators.splice(spectatorIndex, 1);
                io.to(roomID).emit("spectator count", getSpectatorCount(game));
                return;
            }
            
            // Check if disconnecting user was a player
            const player = players.find(player => player.id !== socket.id);
            if (player) {
                // Stop timer when a player leaves
                if (game.timer) {
                    game.timer.stop();
                    clearInterval(game.timerInterval);
                }
                socket.broadcast.to(roomID).emit("user leave");
            }
            
            // Clean up empty games
            const playerIndex = players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                players.splice(playerIndex, 1);
            }
            
            // Remove game if no players left
            if (players.length === 0 && spectators.length === 0) {
                const gameIndex = games.findIndex(g => g.roomID === roomID);
                if (gameIndex !== -1) {
                    if (games[gameIndex].timerInterval) {
                        clearInterval(games[gameIndex].timerInterval);
                    }
                    games.splice(gameIndex, 1);
                }
            }
        })
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
