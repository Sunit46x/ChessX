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

// ==================== CHESS AI ====================

// Piece values for evaluation
const PIECE_VALUES = {
    p: 100,   // Pawn
    n: 320,   // Knight
    b: 330,   // Bishop
    r: 500,   // Rook
    q: 900,   // Queen
    k: 20000  // King
};

// Position bonus tables for pieces (encourages good positioning)
const PAWN_TABLE = [
    0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,
    5, -5,-10,  0,  0,-10, -5,  5,
    5, 10, 10,-20,-20, 10, 10,  5,
    0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
];

const BISHOP_TABLE = [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
];

const ROOK_TABLE = [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0
];

const QUEEN_TABLE = [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
];

const KING_TABLE = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20
];

const POSITION_TABLES = {
    p: PAWN_TABLE,
    n: KNIGHT_TABLE,
    b: BISHOP_TABLE,
    r: ROOK_TABLE,
    q: QUEEN_TABLE,
    k: KING_TABLE
};

// Chess AI class
class ChessAI {
    constructor(depth = 2) {
        this.depth = depth;
    }

    // Set difficulty (1=Easy, 2=Medium, 3=Hard)
    setDifficulty(level) {
        switch(level) {
            case 1: this.depth = 1; break;
            case 2: this.depth = 2; break;
            case 3: this.depth = 3; break;
            default: this.depth = 2;
        }
    }

    // Get best move for current position
    getBestMove(chess) {
        const moves = chess.moves({ verbose: true });
        if (moves.length === 0) return null;

        let bestMove = null;
        let bestValue = -Infinity;
        const isMaximizing = chess.turn() === 'w';

        // Shuffle moves for variety
        this.shuffleArray(moves);

        for (const move of moves) {
            chess.move(move);
            const value = this.minimax(chess, this.depth - 1, -Infinity, Infinity, !isMaximizing);
            chess.undo();

            const adjustedValue = isMaximizing ? value : -value;
            if (adjustedValue > bestValue) {
                bestValue = adjustedValue;
                bestMove = move;
            }
        }

        return bestMove;
    }

    // Get a hint for the player
    getHint(chess) {
        return this.getBestMove(chess);
    }

    // Minimax with alpha-beta pruning
    minimax(chess, depth, alpha, beta, isMaximizing) {
        if (depth === 0 || chess.game_over()) {
            return this.evaluate(chess);
        }

        const moves = chess.moves({ verbose: true });

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of moves) {
                chess.move(move);
                const evaluation = this.minimax(chess, depth - 1, alpha, beta, false);
                chess.undo();
                maxEval = Math.max(maxEval, evaluation);
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) break; // Alpha-beta pruning
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of moves) {
                chess.move(move);
                const evaluation = this.minimax(chess, depth - 1, alpha, beta, true);
                chess.undo();
                minEval = Math.min(minEval, evaluation);
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) break; // Alpha-beta pruning
            }
            return minEval;
        }
    }

    // Evaluate board position
    evaluate(chess) {
        if (chess.in_checkmate()) {
            return chess.turn() === 'w' ? -100000 : 100000;
        }
        if (chess.in_draw() || chess.in_stalemate()) {
            return 0;
        }

        let score = 0;
        const board = chess.board();

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = board[row][col];
                if (piece) {
                    const pieceValue = PIECE_VALUES[piece.type];
                    const positionTable = POSITION_TABLES[piece.type];
                    
                    // Get position value (flip for black pieces)
                    let positionValue;
                    if (piece.color === 'w') {
                        positionValue = positionTable[row * 8 + col];
                    } else {
                        positionValue = positionTable[(7 - row) * 8 + col];
                    }

                    if (piece.color === 'w') {
                        score += pieceValue + positionValue;
                    } else {
                        score -= pieceValue + positionValue;
                    }
                }
            }
        }

        // Add small random factor for variety
        score += (Math.random() - 0.5) * 10;

        return score;
    }

    // Shuffle array for move variety
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}

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
    GameTimer,
    ChessAI
};
