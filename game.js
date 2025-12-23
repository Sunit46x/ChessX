const { Chess } = require("chess.js");

const makeMove = (chess, { piece, source, target }) => {
    return chess.move({
        color: piece[0],
        from: source,
        to: target,
        piece: piece[1],
        promotion: "q"
    });
};

const getResult = (chess) => {
    if (chess.in_checkmate()) {
        return `${chess.turn() === "b" ? "White" : "Black"} Wins!`;
    }

    if (chess.in_stalemate()) {
        return `${chess.turn() === "b" ? "Black" : "White"} has been stalemated!`;
    }

    if (chess.insufficient_material()) {
        return "Draw due to insufficient material"
    }

    if (chess.in_draw()) {
        return "Draw!";
    }
}

const getLastMove = (chess) => {
    const history = chess.history({ verbose: true });

    return history.length > 0 ? history[history.length - 1] : { from: "", to: "" };
}

// Get full move history with detailed information
const getMoveHistory = (chess) => {
    return chess.history({ verbose: true }).map((move, index) => ({
        moveNumber: Math.floor(index / 2) + 1,
        color: move.color,
        from: move.from,
        to: move.to,
        piece: move.piece,
        san: move.san,
        captured: move.captured || null,
        promotion: move.promotion || null,
        flags: move.flags
    }));
};

// Get PGN notation
const getPGN = (chess) => {
    return chess.pgn();
};

// Get FEN at specific move index (for replay)
const getFenAtMove = (chess, moveIndex) => {
    const tempChess = new Chess();
    const history = chess.history({ verbose: true });
    
    for (let i = 0; i <= moveIndex && i < history.length; i++) {
        tempChess.move(history[i]);
    }
    
    return tempChess.fen();
};

// Timer class for chess clock
class GameTimer {
    constructor(initialTimeMs = 600000, incrementMs = 0) { // Default: 10 minutes, no increment
        this.initialTime = initialTimeMs;
        this.increment = incrementMs;
        this.whiteTime = initialTimeMs;
        this.blackTime = initialTimeMs;
        this.activeColor = null; // 'w' or 'b'
        this.lastUpdateTime = null;
        this.timerInterval = null;
        this.isRunning = false;
    }

    start(color) {
        this.activeColor = color;
        this.lastUpdateTime = Date.now();
        this.isRunning = true;
    }

    stop() {
        this.updateTime();
        this.isRunning = false;
        this.activeColor = null;
    }

    switchTurn(newColor) {
        if (this.isRunning) {
            this.updateTime();
            // Add increment to the player who just moved
            if (this.activeColor === 'w') {
                this.whiteTime += this.increment;
            } else if (this.activeColor === 'b') {
                this.blackTime += this.increment;
            }
        }
        this.activeColor = newColor;
        this.lastUpdateTime = Date.now();
        this.isRunning = true;
    }

    updateTime() {
        if (!this.isRunning || !this.lastUpdateTime) return;
        
        const now = Date.now();
        const elapsed = now - this.lastUpdateTime;
        
        if (this.activeColor === 'w') {
            this.whiteTime = Math.max(0, this.whiteTime - elapsed);
        } else if (this.activeColor === 'b') {
            this.blackTime = Math.max(0, this.blackTime - elapsed);
        }
        
        this.lastUpdateTime = now;
    }

    getTimeState() {
        this.updateTime();
        return {
            whiteTime: this.whiteTime,
            blackTime: this.blackTime,
            activeColor: this.activeColor,
            isRunning: this.isRunning
        };
    }

    isTimeUp() {
        this.updateTime();
        return this.whiteTime <= 0 || this.blackTime <= 0;
    }

    getLoser() {
        if (this.whiteTime <= 0) return 'white';
        if (this.blackTime <= 0) return 'black';
        return null;
    }

    reset(initialTimeMs = this.initialTime, incrementMs = this.increment) {
        this.initialTime = initialTimeMs;
        this.increment = incrementMs;
        this.whiteTime = initialTimeMs;
        this.blackTime = initialTimeMs;
        this.activeColor = null;
        this.lastUpdateTime = null;
        this.isRunning = false;
    }
}

module.exports = { 
    makeMove, 
    Chess, 
    getResult, 
    getLastMove, 
    getMoveHistory, 
    getPGN, 
    getFenAtMove,
    GameTimer 
};
