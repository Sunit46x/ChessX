function highlightSquare(target, source) {
    $("div[class^='square']").each(function () {
        $(this).removeClass("highlight-target")
        $(this).removeClass("highlight-source")
    });

    if (target && source) {
        $(`.square-${target}`).addClass("highlight-target");
        $(`.square-${source}`).addClass("highlight-source");
    }
}

const displayTurn = (turn) => {
    const imgSrc = `./img/chesspieces/wikipedia/${turn}P.png`
    $("#turn").html(`${turn === "w" ? "White" : "Black"} to move`);
    $(".sidebar img").attr("src", imgSrc);
}

const updateBoardPosition = (position, target, source, turn) => {
    board.position(position);
    highlightSquare(target, source);

    displayTurn(turn);
}

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

const socket = io();

socket.emit("join", roomID, updateBoardPosition);

socket.on("join", () => {
    $(".modal").html("Your opponent has joined the game");
    $(".modal").css("display", "flex").delay(4000).fadeOut(500);
})

socket.on("orientation", (color) => {
    board.orientation(color);
});

// newPos and oldPos are FEN string from chess.fen() on the back end
socket.on("move", ({ newPos, source, target }) => {
    board.position(newPos);

    // highlight last move
    highlightSquare(target, source);
});

socket.on("invalid move", (oldPos) => {
    board.position(oldPos);
});

socket.on("gameover", (msg) => {
    boardConfig.draggable = false;
    $(".sidebar-buttons button").attr("disabled", true);

    $(".modal").html(`<h1>${msg}</h1><button id="reset">Play again</button>`)
    $(".modal").css("display", "flex");
});

socket.on("turn", displayTurn)

socket.on("full", () => {
    board.destroy();
    document.body.innerHTML = "Error - This link has expired"
});

// When the client receive the "reset" event the board will be resetted to the initial position
socket.on("reset", () => {
    board.start();
    boardConfig.draggable = true;

    $(".sidebar-buttons button").attr("disabled", false);

    $(".modal").css("display", "none");
})

socket.on("undo request", (requesting) => {
    if (requesting) {
        $(".modal").html("<p>Request sent</p>");
        $(".modal").css("display", "flex");
    } else {
        $(".modal").html(`<p>Your opponent wants to take back his last move</p>
                          <div>
                            <button id="decline-undo">Decline</button> <button id="accept-undo">Accept</button>
                          </div>
        `);
        $(".modal").css("display", "flex");
    }
});

socket.on("undo", updateBoardPosition);

socket.on("undo declined", () => {
    $(".modal").html("Your opponed did not agree to take back your last move");
    $(".modal").css("display", "flex").delay(4000).fadeOut(500);
})

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
})

socket.on("user leave", () => {
    boardConfig.draggable = false;
    $(".sidebar-buttons button").attr("disabled", true);

    $(".modal").html("Your opponent left. You Win!");
    $(".modal").css("display", "flex");
})

// When the play again button is clicked it sends a "reset" event to the server
// The server will reset the chess instance and send a "reset" event to all the clients in the rooms
$(document).on("click", "#reset", () => {
    socket.emit("reset");
})

$(document).on("click", "#decline-draw", () => {
    socket.emit("draw offer", false);
    $(".modal").css("display", "none");
})

$(document).on("click", "#accept-draw", () => {
    socket.emit("draw offer", true);
    $(".modal").css("display", "none");
})

$(document).on("click", "#accept-undo", () => {
    socket.emit("undo accepted")
    $(".modal").css("display", "none");
})

$(document).on("click", "#decline-undo", () => {
    socket.emit("undo declined");
    $(".modal").css("display", "none");
})

$("#undo-button").on("click", () => {
    socket.emit("undo request", board.orientation());
})

$("#leave-button").on("click", () => {
    socket.emit("surrender", board.orientation());
})

$("#draw-button").on("click", () => {
    socket.emit("draw offer");

    $(".modal").html("<p>Draw offer sent. Waiting for the opponent.</p>")
    $(".modal").css("display", "flex");
})