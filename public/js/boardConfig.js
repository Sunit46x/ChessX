// Game state
let isSpectator = false;
let currentOrientation = 'white';
let isReplayMode = false;
let currentReplayIndex = -1;
let totalMoves = 0;

function onDrop(source, target, piece, newPos, oldPos, orientation) {
    // Spectators cannot make moves
    if (isSpectator) {
        return 'snapback';
    }
    
    // If in replay mode, exit it first
    if (isReplayMode) {
        exitReplayMode();
    }
    
    const move = {
        source,
        target,
        piece,
        newPos,
        oldPos,
        orientation,
    };

    socket.emit("move", move);
}

function onDragStart(source, piece, position, orientation) {
    // Spectators cannot drag pieces
    if (isSpectator) {
        return false;
    }
    
    // Cannot drag in replay mode
    if (isReplayMode) {
        return false;
    }
    
    if (
        (orientation === "white" && piece.search(/^w/) === -1) ||
        (orientation === "black" && piece.search(/^b/) === -1)
    ) {
        return false;
    }
}

function onChange() {
    $(".modal").fadeOut(500);
}

// Enter replay mode
function enterReplayMode() {
    isReplayMode = true;
    boardConfig.draggable = false;
    $('#board').addClass('replay-mode');
    $('.replay-controls').addClass('active');
}

// Exit replay mode and return to current position
function exitReplayMode() {
    isReplayMode = false;
    if (!isSpectator) {
        boardConfig.draggable = true;
    }
    currentReplayIndex = totalMoves - 1;
    $('#board').removeClass('replay-mode');
    $('.replay-controls').removeClass('active');
    
    // Request current position
    socket.emit("get replay position", totalMoves - 1);
}

const boardConfig = {
    draggable: true,
    position: "start",
    onDrop,
    onDragStart,
    onChange
};

const board = new Chessboard("board", boardConfig);
