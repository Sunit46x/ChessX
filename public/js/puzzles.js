let solution = [];
let correctMoves = 0;
let index = 0;
let gameOver = false;


function onDrop(source, target, piece, newPos, oldPos, orientation) {
    const move = source + target;

    if (move !== solution[index]) {
        return "snapback";
    }
};

function onSnapEnd() {
    correctMoves++;

    if (correctMoves === (solution.length + 1) / 2) {
        gameOver = true;
        $(".sidebar").html("<p>Correct!</p><a href='/'><button>Main menu</button></a>");
    } else {
        const opponentMove = solution[index + 1].slice(0, 2) + "-" + solution[index + 1].slice(2);

        board.move(opponentMove);
    }

    index += 2;

}

function onDragStart(source, piece, position, orientation) {
    // do not pick up pieces if the game is over
    if (gameOver) return false

    // only pick up pieces for the side to move
    if ((chess.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (chess.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false
    }
}

const boardConfig = {
    draggable: true,
    onDrop,
    onSnapEnd,
    onDragStart
};
const board = new Chessboard("board", boardConfig);
const chess = new Chess();

const $turn = $("#turn");
const $pawn = $(".sidebar img");


fetch("https://lichess.org/api/puzzle/daily")
    .then(res => res.json())
    .then(({ game, puzzle }) => {
        console.log(game, puzzle);

        solution = puzzle.solution;

        chess.load_pgn(game.pgn);

        const turn = chess.turn();

        board.position(chess.fen());
        board.orientation(turn === "w" ? "white" : "black");

        const imgSrc = `./img/chesspieces/wikipedia/${turn}P.png`;

        $pawn.attr("src", imgSrc);
        $turn.html(turn === "w" ? "White to move" : "Black to move")
    })
    .catch(err => console.log(err))
