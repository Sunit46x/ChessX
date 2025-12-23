// ==================== UTILITY FUNCTIONS ====================

function highlightSquare(target, source) {
    $("div[class^='square']").each(function () {
        $(this).removeClass("highlight-target");
        $(this).removeClass("highlight-source");
    });

    if (target && source) {
        $(`.square-${target}`).addClass("highlight-target");
        $(`.square-${source}`).addClass("highlight-source");
    }
}

const displayTurn = (turn) => {
    const imgSrc = `./img/chesspieces/wikipedia/${turn}P.png`;
    $("#turn").html(`${turn === "w" ? "White" : "Black"} to move`);
    $(".sidebar img").attr("src", imgSrc);
};

const updateBoardPosition = (position, target, source, turn) => {
    board.position(position);
    highlightSquare(target, source);
    displayTurn(turn);
};

// Format milliseconds to MM:SS
const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Update timer display
const updateTimerDisplay = (timeState) => {
    const { whiteTime, blackTime, activeColor, isRunning } = timeState;
    
    // Determine which timer is player's and which is opponent's based on orientation
    let playerTime, opponentTime, playerActive, opponentActive;
    
    if (currentOrientation === 'white') {
        playerTime = whiteTime;
        opponentTime = blackTime;
        playerActive = activeColor === 'w';
        opponentActive = activeColor === 'b';
    } else {
        playerTime = blackTime;
        opponentTime = whiteTime;
        playerActive = activeColor === 'b';
        opponentActive = activeColor === 'w';
    }
    
    // Update timer displays
    $('#timer-player .timer-display').text(formatTime(playerTime));
    $('#timer-opponent .timer-display').text(formatTime(opponentTime));
    
    // Highlight active timer
    $('#timer-player').toggleClass('timer-active', playerActive && isRunning);
    $('#timer-opponent').toggleClass('timer-active', opponentActive && isRunning);
    
    // Add low time warning (under 1 minute)
    $('#timer-player').toggleClass('timer-low', playerTime < 60000);
    $('#timer-opponent').toggleClass('timer-low', opponentTime < 60000);
    
    // Critical time warning (under 10 seconds)
    $('#timer-player').toggleClass('timer-critical', playerTime < 10000);
    $('#timer-opponent').toggleClass('timer-critical', opponentTime < 10000);
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
    
    // Update total moves count
    totalMoves = moves.length;
    
    // Scroll to bottom
    $history.scrollTop($history[0].scrollHeight);
    
    // Highlight current move in replay mode
    if (isReplayMode && currentReplayIndex >= 0) {
        $(`.move[data-index="${currentReplayIndex}"]`).addClass('current-move');
    }
};

// ==================== SOCKET CONNECTION ====================

// Prompt alert when user try to refresh the page
window.addEventListener('beforeunload', function (e) {
    e.preventDefault();
    e.returnValue = '';
});

// Create roomID if not exist
const roomID = location.hash
    ? location.hash
    : "#" + Math.floor(Math.random() * 1000) + Date.now().toString();

location.hash = roomID;

// Check if joining as spectator (via URL param)
const urlParams = new URLSearchParams(window.location.search);
const joinAsSpectator = urlParams.get('spectator') === 'true';

const socket = io();

// Join with options (callback must be last argument for socket.io)
socket.emit("join", roomID, {
    spectator: joinAsSpectator,
    timeControl: 10 * 60 * 1000, // 10 minutes
    increment: 5 * 1000 // 5 second increment
}, updateBoardPosition);

// ==================== SOCKET EVENT HANDLERS ====================

socket.on("join", () => {
    $(".modal").html("Your opponent has joined the game");
    $(".modal").css("display", "flex").delay(4000).fadeOut(500);
});

socket.on("role", (role) => {
    if (role === "spectator") {
        isSpectator = true;
        boardConfig.draggable = false;
        $('#spectator-badge').show();
        $('.sidebar-buttons').hide();
        $('body').addClass('spectator-mode');
    } else {
        isSpectator = false;
        boardConfig.draggable = true;
        $('#spectator-badge').hide();
        $('.sidebar-buttons').show();
        $('body').removeClass('spectator-mode');
    }
});

socket.on("orientation", (color) => {
    currentOrientation = color;
    board.orientation(color);
});

socket.on("spectator count", (count) => {
    $('#spectator-num').text(count);
});

// Timer events
socket.on("timer update", updateTimerDisplay);

socket.on("timer paused", () => {
    $(".modal").html("Game paused");
    $(".modal").css("display", "flex");
});

socket.on("timer resumed", () => {
    $(".modal").fadeOut(500);
});

// Move events
socket.on("move", ({ newPos, source, target }) => {
    // Exit replay mode on new move
    if (isReplayMode) {
        exitReplayMode();
    }
    
    board.position(newPos);
    highlightSquare(target, source);
});

socket.on("move history", renderMoveHistory);

socket.on("invalid move", (oldPos) => {
    board.position(oldPos);
});

socket.on("gameover", (msg) => {
    boardConfig.draggable = false;
    $(".sidebar-buttons button").attr("disabled", true);

    $(".modal").html(`<h1>${msg}</h1><button id="reset">Play again</button>`);
    $(".modal").css("display", "flex");
});

socket.on("turn", displayTurn);

socket.on("full", () => {
    // Instead of destroying, offer spectator mode
    $(".modal").html(`
        <h2>Game is full</h2>
        <p>Would you like to watch as a spectator?</p>
        <button id="watch-game">Watch Game</button>
    `);
    $(".modal").css("display", "flex");
});

socket.on("reset", () => {
    board.start();
    if (!isSpectator) {
        boardConfig.draggable = true;
        $(".sidebar-buttons button").attr("disabled", false);
    }
    $(".modal").css("display", "none");
    currentReplayIndex = -1;
    totalMoves = 0;
});

socket.on("undo request", (requesting) => {
    if (requesting) {
        $(".modal").html("<p>Request sent</p>");
        $(".modal").css("display", "flex");
    } else {
        $(".modal").html(`<p>Your opponent wants to take back their last move</p>
                          <div>
                            <button id="decline-undo">Decline</button> <button id="accept-undo">Accept</button>
                          </div>
        `);
        $(".modal").css("display", "flex");
    }
});

socket.on("undo", (fen, to, from, turn) => {
    if (isReplayMode) {
        exitReplayMode();
    }
    updateBoardPosition(fen, to, from, turn);
});

socket.on("undo declined", () => {
    $(".modal").html("Your opponent did not agree to take back your last move");
    $(".modal").css("display", "flex").delay(4000).fadeOut(500);
});

socket.on("offer draw", (accepted) => {
    if (accepted === false) {
        $(".modal").html("<p>Your opponent declined your offer</p>");
        $(".modal").delay(4000).fadeOut(500);
    } else {
        $(".modal").html(`<p>Your opponent offers a draw</p>
                      <div>
                        <button id="decline-draw">Decline</button>   <button id="accept-draw">Accept</button>
                      </div>
                    `);
    }
    $(".modal").css("display", "flex");
});

socket.on("user leave", () => {
    boardConfig.draggable = false;
    $(".sidebar-buttons button").attr("disabled", true);

    $(".modal").html("Your opponent left. You Win!");
    $(".modal").css("display", "flex");
});

// Replay position received
socket.on("replay position", ({ fen, moveIndex, move, totalMoves: total }) => {
    board.position(fen);
    currentReplayIndex = moveIndex;
    totalMoves = total;
    
    // Highlight the move
    if (move) {
        highlightSquare(move.to, move.from);
    } else {
        highlightSquare(null, null);
    }
    
    // Update UI to show current move
    $('.move').removeClass('current-move');
    $(`.move[data-index="${moveIndex}"]`).addClass('current-move');
});

// PGN received
socket.on("pgn", (pgn) => {
    navigator.clipboard.writeText(pgn).then(() => {
        $(".modal").html("<p>PGN copied to clipboard!</p>");
        $(".modal").css("display", "flex").delay(2000).fadeOut(500);
    }).catch(() => {
        $(".modal").html(`<p>PGN:</p><textarea readonly style="width:100%;height:100px">${pgn}</textarea>`);
        $(".modal").css("display", "flex");
    });
});

// ==================== UI EVENT HANDLERS ====================

// Play again button
$(document).on("click", "#reset", () => {
    socket.emit("reset");
});

// Watch game as spectator
$(document).on("click", "#watch-game", () => {
    window.location.href = window.location.pathname + window.location.hash + '?spectator=true';
});

// Draw offer buttons
$(document).on("click", "#decline-draw", () => {
    socket.emit("draw offer", false);
    $(".modal").css("display", "none");
});

$(document).on("click", "#accept-draw", () => {
    socket.emit("draw offer", true);
    $(".modal").css("display", "none");
});

// Undo buttons
$(document).on("click", "#accept-undo", () => {
    socket.emit("undo accepted");
    $(".modal").css("display", "none");
});

$(document).on("click", "#decline-undo", () => {
    socket.emit("undo declined");
    $(".modal").css("display", "none");
});

// Sidebar buttons
$("#undo-button").on("click", () => {
    if (!isSpectator) {
        socket.emit("undo request", board.orientation());
    }
});

$("#leave-button").on("click", () => {
    if (!isSpectator) {
        socket.emit("surrender", board.orientation());
    }
});

$("#draw-button").on("click", () => {
    if (!isSpectator) {
        socket.emit("draw offer");
        $(".modal").html("<p>Draw offer sent. Waiting for opponent.</p>");
        $(".modal").css("display", "flex");
    }
});

// Copy PGN button
$("#copy-pgn").on("click", () => {
    socket.emit("get pgn");
});

// ==================== REPLAY CONTROLS ====================

// Click on a move to go to that position
$(document).on("click", ".move", function() {
    const index = parseInt($(this).data('index'));
    if (!isNaN(index)) {
        enterReplayMode();
        socket.emit("get replay position", index);
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
        socket.emit("get replay position", currentReplayIndex);
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
        socket.emit("get replay position", currentReplayIndex);
    }
});

$("#replay-end").on("click", () => {
    exitReplayMode();
    socket.emit("get replay position", totalMoves - 1);
});

// Keyboard navigation for replay
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
