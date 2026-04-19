"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Zobrist = void 0;
var Zobrist = /** @class */ (function () {
    function Zobrist() {
        this.table = this.initTable();
    }
    Zobrist.getInstance = function () {
        if (!Zobrist.instance) {
            Zobrist.instance = new Zobrist();
        }
        return Zobrist.instance;
    };
    Zobrist.prototype.randomBigInt = function () {
        // Generate a random 64-bit unsigned integer (as BigInt)
        // Using Math.random() is sufficient for Zobrist hashing in this context,
        // though crypto-secure random could be used if necessary.
        var high = BigInt(Math.floor(Math.random() * 0x100000000));
        var low = BigInt(Math.floor(Math.random() * 0x100000000));
        return (high << 32n) | low;
    };
    Zobrist.prototype.initTable = function () {
        var colors = ['w', 'b'];
        var pieces = ['p', 'n', 'b', 'r', 'q', 'k'];
        var files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        var ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
        var table = {
            pieces: { w: {}, b: {} },
            sideToMove: this.randomBigInt(),
            castling: {},
            enPassant: {}
        };
        // Initialize pieces
        for (var _i = 0, colors_1 = colors; _i < colors_1.length; _i++) {
            var c = colors_1[_i];
            for (var _a = 0, pieces_1 = pieces; _a < pieces_1.length; _a++) {
                var p = pieces_1[_a];
                table.pieces[c][p] = {};
                for (var _b = 0, files_1 = files; _b < files_1.length; _b++) {
                    var f = files_1[_b];
                    for (var _c = 0, ranks_1 = ranks; _c < ranks_1.length; _c++) {
                        var r = ranks_1[_c];
                        var sq = (f + r);
                        table.pieces[c][p][sq] = this.randomBigInt();
                    }
                }
            }
        }
        // Initialize castling rights (16 combinations)
        for (var i = 0; i < 16; i++) {
            var key = "";
            if (i & 1)
                key += "K";
            if (i & 2)
                key += "Q";
            if (i & 4)
                key += "k";
            if (i & 8)
                key += "q";
            table.castling[key || "-"] = this.randomBigInt();
        }
        // Initialize en passant files (8 possible files + none)
        for (var _d = 0, files_2 = files; _d < files_2.length; _d++) {
            var f = files_2[_d];
            table.enPassant[f] = this.randomBigInt();
        }
        table.enPassant["-"] = this.randomBigInt();
        return table;
    };
    Zobrist.prototype.calculateHashString = function (chess) {
        var hash = this.calculateHash(chess);
        return hash.toString(16).padStart(16, '0');
    };
    Zobrist.prototype.calculateHash = function (chess) {
        var hash = 0n;
        // 1. Pieces
        var board = chess.board();
        var files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        var ranks = ['8', '7', '6', '5', '4', '3', '2', '1']; // chess.board() is indexed from a8 to h1
        for (var r = 0; r < 8; r++) {
            for (var f = 0; f < 8; f++) {
                var piece = board[r][f];
                if (piece) {
                    var sq = (files[f] + ranks[r]);
                    hash ^= this.table.pieces[piece.color][piece.type][sq];
                }
            }
        }
        // 2. Side to move
        if (chess.turn() === 'b') {
            hash ^= this.table.sideToMove;
        }
        // 3. Castling rights
        // Format fen castling string
        var fenParts = chess.fen().split(' ');
        var castlingStr = fenParts.length > 2 ? fenParts[2] : '-';
        // Ensure castling string is sorted K Q k q or -
        var sortedCastling = "";
        if (castlingStr.includes('K'))
            sortedCastling += 'K';
        if (castlingStr.includes('Q'))
            sortedCastling += 'Q';
        if (castlingStr.includes('k'))
            sortedCastling += 'k';
        if (castlingStr.includes('q'))
            sortedCastling += 'q';
        hash ^= this.table.castling[sortedCastling || '-'];
        // 4. En passant
        var epStr = fenParts.length > 3 ? fenParts[3] : '-';
        if (epStr !== '-') {
            var file = epStr[0];
            hash ^= this.table.enPassant[file];
        }
        else {
            hash ^= this.table.enPassant['-'];
        }
        return hash;
    };
    return Zobrist;
}());
exports.Zobrist = Zobrist;
