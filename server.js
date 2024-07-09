const express = require("express");
const socketio = require("socket.io");
const path = require("path");
const http = require("http");
// Game Logic Functions
const { Chess, makeMove, getResult, getLastMove } = require("./game");

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

io.on("connection", (socket) => {
    socket.on("join", (roomID, updateBoardPosition) => {
        socket.join(roomID);

        // Create a room in games: [] if doesn't exist already
        if (games.findIndex((game) => game.roomID === roomID) === -1) {
            const game = {
                roomID,
                chess: new Chess(),
                players: [{
                    color: "white",
                    id: socket.id
                }]
            };

            games.push(game);
        }

        // Relevant chess instance
        const { chess, players } = games.find((game) => game.roomID === roomID);

        // the user who is trying to join is disconnected if two players already in the same room
        if (players.length < 2 && players.findIndex(player => player.id === socket.id) === -1) {
            players.push({
                color: "black",
                id: socket.id
            });

            socket.broadcast.to(roomID).emit("join");
            io.to(socket.id).emit("orientation", "black")
        } else if (players.length >= 2) {
            socket.emit("full");
            socket.disconnect();
        };

        const lastMove = getLastMove(chess);

        updateBoardPosition(chess.fen(), lastMove.to, lastMove.from, chess.turn());

        // ON MOVE
        socket.on("move", (move) => {
            if (makeMove(chess, move)) {
                const newMove = {
                    newPos: chess.fen(),
                    source: move.source,
                    target: move.target
                };

                io.to(roomID).emit("move", newMove);
                io.to(roomID).emit("turn", chess.turn());

                if (chess.game_over()) {
                    io.to(roomID).emit("gameover", getResult(chess))
                }
            } else {
                socket.emit("invalid move", chess.fen());
            }
        });

        // ON RESET
        socket.on("reset", () => {
            chess.reset();
            io.to(roomID).emit("reset");
            io.to(roomID).emit("turn", chess.turn());


            // Swap colors
            for (let i = 0; i < players.length; i++) {
                const player = players[i];

                player.color = player.color === "white" ? "black" : "white";

                io.to(player.id).emit("orientation", player.color);
            }
        });

        // ON UNDO REQUEST
        socket.on("undo request", (orientation) => {
            const turn = chess.turn();

            if ((orientation === "white" && turn === "w") || (orientation === "black" && turn === "b")) {
                chess.undo();

                const { to, from } = getLastMove(chess);

                io.to(roomID).emit("undo", chess.fen(), to, from, chess.turn());
            } else {
                socket.emit("undo request", true)
                socket.broadcast.to(roomID).emit("undo request");
            }
        });
        socket.on("undo accepted", () => {
            chess.undo();

            const { to, from } = getLastMove(chess);

            io.to(roomID).emit("undo", chess.fen(), to, from, chess.turn());
        });

        socket.on("undo declined", () => {
            socket.broadcast.to(roomID).emit("undo declined");
        })
        // -->


        // ON SURRENDER
        socket.on("surrender", (player) => {
            io.to(roomID).emit("gameover", `${player === "white" ? "Black" : "White"} wins!`)
        })


        // ON DRAW OFFER

        // accepted can be:
        // undefined if the user is asking for a draw
        // true if the opponent accepted
        // false if the opponent declined
        socket.on("draw offer", (accepted) => {
            if (accepted) {
                io.to(roomID).emit("gameover", "Draw!")
            } else if (accepted === false) {
                socket.broadcast.to(roomID).emit("offer draw", false);
            } else {
                socket.broadcast.to(roomID).emit("offer draw");
            }
        })

        socket.on("disconnect", () => {
            const player = players.find(player => player.id !== socket.id);
            if (player) {
                socket.broadcast.to(roomID).emit("user leave");
            }
        })
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
