import { Chess, Square, PieceSymbol, Color } from "chess.js";

type ZobristTable = {
    pieces: Record<Color, Record<PieceSymbol, Record<Square, bigint>>>;
    sideToMove: bigint;
    castling: Record<string, bigint>;
    enPassant: Record<string, bigint>; // Keyed by file (a-h) or null
};

export class Zobrist {
    private static instance: Zobrist;
    private table: ZobristTable;

    private constructor() {
        this.table = this.initTable();
    }

    public static getInstance(): Zobrist {
        if (!Zobrist.instance) {
            Zobrist.instance = new Zobrist();
        }
        return Zobrist.instance;
    }

    private randomBigInt(): bigint {
        // Generate a random 64-bit unsigned integer (as BigInt)
        // Using Math.random() is sufficient for Zobrist hashing in this context,
        // though crypto-secure random could be used if necessary.
        const high = BigInt(Math.floor(Math.random() * 0x100000000));
        const low = BigInt(Math.floor(Math.random() * 0x100000000));
        return (high << 32n) | low;
    }

    private initTable(): ZobristTable {
        const colors: Color[] = ['w', 'b'];
        const pieces: PieceSymbol[] = ['p', 'n', 'b', 'r', 'q', 'k'];
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

        const table: ZobristTable = {
            pieces: { w: {} as any, b: {} as any },
            sideToMove: this.randomBigInt(),
            castling: {},
            enPassant: {}
        };

        // Initialize pieces
        for (const c of colors) {
            for (const p of pieces) {
                table.pieces[c][p] = {} as any;
                for (const f of files) {
                    for (const r of ranks) {
                        const sq = (f + r) as Square;
                        table.pieces[c][p][sq] = this.randomBigInt();
                    }
                }
            }
        }

        // Initialize castling rights (16 combinations)
        for (let i = 0; i < 16; i++) {
            let key = "";
            if (i & 1) key += "K";
            if (i & 2) key += "Q";
            if (i & 4) key += "k";
            if (i & 8) key += "q";
            table.castling[key || "-"] = this.randomBigInt();
        }

        // Initialize en passant files (8 possible files + none)
        for (const f of files) {
            table.enPassant[f] = this.randomBigInt();
        }
        table.enPassant["-"] = this.randomBigInt();

        return table;
    }

    public calculateHashString(chess: Chess): string {
        const hash = this.calculateHash(chess);
        return hash.toString(16).padStart(16, '0');
    }

    public calculateHash(chess: Chess): bigint {
        let hash = 0n;

        // 1. Pieces
        const board = chess.board();
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const ranks = ['8', '7', '6', '5', '4', '3', '2', '1']; // chess.board() is indexed from a8 to h1

        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const piece = board[r]?.[f];
                if (piece) {
                    const f_char = files[f];
                    const r_char = ranks[r];
                    if (f_char && r_char) {
                        const sq = (f_char + r_char) as Square;
                        const pieceTable = this.table.pieces[piece.color][piece.type];
                        if (pieceTable && pieceTable[sq] !== undefined) {
                            hash ^= pieceTable[sq];
                        }
                    }
                }
            }
        }

        // 2. Side to move
        if (chess.turn() === 'b') {
            hash ^= this.table.sideToMove;
        }

        // 3. Castling rights
        // Format fen castling string
        const fenParts = chess.fen().split(' ');
        const castlingStr = fenParts[2] || '-';
        
        // Ensure castling string is sorted K Q k q or -
        let sortedCastling = "";
        if (castlingStr.includes('K')) sortedCastling += 'K';
        if (castlingStr.includes('Q')) sortedCastling += 'Q';
        if (castlingStr.includes('k')) sortedCastling += 'k';
        if (castlingStr.includes('q')) sortedCastling += 'q';

        const castlingHash = this.table.castling[sortedCastling || '-'];
        if (castlingHash !== undefined) {
            hash ^= castlingHash;
        }

        // 4. En passant
        const epStr = fenParts[3] || '-';
        if (epStr !== '-') {
            const file = epStr[0];
            if (file) {
                const epHash = this.table.enPassant[file];
                if (epHash !== undefined) {
                    hash ^= epHash;
                }
            }
        } else {
            const epNoneHash = this.table.enPassant['-'];
            if (epNoneHash !== undefined) {
                hash ^= epNoneHash;
            }
        }

        return hash;
    }
}
