// ==================== AI GAME CLIENT ====================

// Game state
let isReplayMode = false;
let currentReplayIndex = -1;
let totalMoves = 0;
let isAIThinking = false;

// ==================== UTILITY FUNCTIONS ====================

function highlightSquare(target, source) {
    $("div[class^='square']").each(function () {
        $(this).removeClass("highlight-target");
        $(this).removeClass("highlight-source");
        $(this).removeClass("hint-square");
    });

    if (target && source) {
        $(`.square-${target}`).addClass("highlight-target");
        $(`.square-${source}`).addClass("highlight-source");
    }
}

function highlightHint(from, to) {
    $("div[class^='square']").each(function () {
        $(this).removeClass("hint-square");
    });
    
    if (from && to) {
        $(`.square-${from}`).addClass("hint-square");
        $(`.square-${to}`).addClass("hint-square");
    }
}

const displayTurn = (turn) => {
    const imgSrc = `./img/chesspieces/wikipedia/${turn}P.png`;
    $("#turn").html(`${turn === "w" ? "Your" : "Computer's"} turn`);
    $(".sidebar img").attr("src", imgSrc);
};

const updateAIStatus = (thinking) => {
    const $status = $('#ai-status');
    const $text = $('#ai-status-text');
    
    if (thinking) {
        $status.addClass('thinking');
        $text.text('Computer thinking...');
        $('#board').addClass('ai-thinking');
    } else {
        $status.removeClass('thinking');
        $text.text('Your turn');
        $('#board').removeClass('ai-thinking');
    }
};

// Render move history
const renderMoveHistory = (moves) => {
    const $history = $('#move-history');
    $history.empty();
    
    if (moves.length === 0) {
        $history.html('<div class="no-moves">No moves yet</div>');
        return;
    }
    
    let currentMoveNumber = 0;
    let $row = null;
    
    moves.forEach((move, index) => {
        if (move.color === 'w') {
            currentMoveNumber = move.moveNumber;
            $row = $(`<div class="move-row" data-move="${currentMoveNumber}"></div>`);
            $row.append(`<span class="move-number">${currentMoveNumber}.</span>`);
            $row.append(`<span class="move white-move" data-index="${index}">${move.san}</span>`);
            $history.append($row);
        } else {
            if ($row) {
                $row.append(`<span class="move black-move" data-index="${index}">${move.san}</span>`);
            }
        }
    });
    
    totalMoves = moves.length;
    
    // Scroll to bottom
    $history.scrollTop($history[0].scrollHeight);
    
    // Highlight current move in replay mode
    if (isReplayMode && currentReplayIndex >= 0) {
        $(`.move[data-index="${currentReplayIndex}"]`).addClass('current-move');
    }
};

// Enter replay mode
function enterReplayMode() {
    isReplayMode = true;
    boardConfig.draggable = false;
    $('#board').addClass('replay-mode');
    $('.replay-controls').addClass('active');
}

// Exit replay mode
function exitReplayMode() {
    isReplayMode = false;
    boardConfig.draggable = true;
    currentReplayIndex = totalMoves - 1;
    $('#board').removeClass('replay-mode');
    $('.replay-controls').removeClass('active');
    
    // Request current position
    socket.emit("ai get replay position", totalMoves - 1);
}

// ==================== BOARD CONFIGURATION ====================

function onDrop(source, target, piece, newPos, oldPos, orientation) {
    // Cannot move during AI's turn or while thinking
    if (isAIThinking) {
        return 'snapback';
    }
    
    // Only white pieces (player)
    if (piece[0] !== 'w') {
        return 'snapback';
    }
    
    // Exit replay mode if active
    if (isReplayMode) {
        exitReplayMode();
    }
    
    // Clear any hint highlights
    highlightHint(null, null);
    
    const move = {
        source,
        target,
        piece
    };

    socket.emit("ai move", move);
}

function onDragStart(source, piece, position, orientation) {
    // Cannot drag during AI's turn or replay mode
    if (isAIThinking || isReplayMode) {
        return false;
    }
    
    // Only allow dragging white pieces
    if (piece.search(/^w/) === -1) {
        return false;
    }
}

function onChange() {
    $(".modal").fadeOut(500);
}

const boardConfig = {
    draggable: true,
    position: "start",
    onDrop,
    onDragStart,
    onChange
};

const board = new Chessboard("board", boardConfig);

// ==================== SOCKET CONNECTION ====================

const socket = io();

// Start AI game with default difficulty
const difficulty = parseInt($('#difficulty').val()) || 2;
socket.emit("ai start", difficulty);

// ==================== SOCKET EVENT HANDLERS ====================

socket.on("ai game started", ({ fen, turn }) => {
    board.position(fen);
    displayTurn(turn);
    highlightSquare(null, null);
    updateAIStatus(false);
    boardConfig.draggable = true;
    $(".modal").css("display", "none");
});

socket.on("ai position", ({ fen, source, target, turn }) => {
    board.position(fen);
    highlightSquare(target, source);
    displayTurn(turn);
});

socket.on("ai invalid move", (fen) => {
    board.position(fen);
});

socket.on("ai move history", renderMoveHistory);

socket.on("ai thinking", (thinking) => {
    isAIThinking = thinking;
    updateAIStatus(thinking);
    boardConfig.draggable = !thinking;
});

socket.on("ai gameover", (msg) => {
    boardConfig.draggable = false;
    updateAIStatus(false);
    
    $(".modal").html(`<h1>${msg}</h1><button id="new-game-btn">Play Again</button>`);
    $(".modal").css("display", "flex");
});

socket.on("ai hint", ({ from, to }) => {
    highlightHint(from, to);
    
    // Clear hint after 3 seconds
    setTimeout(() => {
        highlightHint(null, null);
    }, 3000);
});

socket.on("ai pgn", (pgn) => {
    navigator.clipboard.writeText(pgn).then(() => {
        $(".modal").html("<p>PGN copied to clipboard!</p>");
        $(".modal").css("display", "flex").delay(2000).fadeOut(500);
    }).catch(() => {
        $(".modal").html(`<p>PGN:</p><textarea readonly style="width:100%;height:100px">${pgn}</textarea>`);
        $(".modal").css("display", "flex");
    });
});

socket.on("ai replay position", ({ fen, moveIndex, move, totalMoves: total }) => {
    board.position(fen);
    currentReplayIndex = moveIndex;
    totalMoves = total;
    
    if (move) {
        highlightSquare(move.to, move.from);
    } else {
        highlightSquare(null, null);
    }
    
    $('.move').removeClass('current-move');
    $(`.move[data-index="${moveIndex}"]`).addClass('current-move');
});

socket.on("ai error", (msg) => {
    $(".modal").html(`<p>${msg}</p><button id="new-game-btn">Start New Game</button>`);
    $(".modal").css("display", "flex");
});

// ==================== UI EVENT HANDLERS ====================

// Difficulty change
$('#difficulty').on('change', function() {
    const newDifficulty = parseInt($(this).val());
    socket.emit("ai difficulty", newDifficulty);
});

// Undo button
$('#undo-button').on('click', () => {
    if (!isAIThinking) {
        socket.emit("ai undo");
        highlightHint(null, null);
    }
});

// Hint button
$('#hint-button').on('click', () => {
    if (!isAIThinking) {
        socket.emit("ai hint");
    }
});

// Reset button
$('#reset-button').on('click', () => {
    const difficulty = parseInt($('#difficulty').val()) || 2;
    socket.emit("ai reset", difficulty);
    highlightHint(null, null);
});

// New game button (in modal)
$(document).on('click', '#new-game-btn', () => {
    const difficulty = parseInt($('#difficulty').val()) || 2;
    socket.emit("ai reset", difficulty);
    $(".modal").css("display", "none");
});

// Copy PGN
$('#copy-pgn').on('click', () => {
    socket.emit("ai get pgn");
});

// ==================== REPLAY CONTROLS ====================

// Click on a move to go to that position
$(document).on("click", ".move", function() {
    const index = parseInt($(this).data('index'));
    if (!isNaN(index)) {
        enterReplayMode();
        socket.emit("ai get replay position", index);
    }
});

// Replay navigation buttons
$("#replay-start").on("click", () => {
    if (totalMoves > 0) {
        enterReplayMode();
        currentReplayIndex = -1;
        board.start();
        highlightSquare(null, null);
        $('.move').removeClass('current-move');
    }
});

$("#replay-prev").on("click", () => {
    if (currentReplayIndex > 0) {
        enterReplayMode();
        currentReplayIndex--;
        socket.emit("ai get replay position", currentReplayIndex);
    } else if (currentReplayIndex === 0) {
        currentReplayIndex = -1;
        board.start();
        highlightSquare(null, null);
        $('.move').removeClass('current-move');
    }
});

$("#replay-next").on("click", () => {
    if (currentReplayIndex < totalMoves - 1) {
        enterReplayMode();
        currentReplayIndex++;
        socket.emit("ai get replay position", currentReplayIndex);
    }
});

$("#replay-end").on("click", () => {
    exitReplayMode();
});

// Keyboard navigation
$(document).on("keydown", (e) => {
    if (e.key === "ArrowLeft") {
        $("#replay-prev").click();
    } else if (e.key === "ArrowRight") {
        $("#replay-next").click();
    } else if (e.key === "Home") {
        $("#replay-start").click();
    } else if (e.key === "End") {
        $("#replay-end").click();
    }
});

