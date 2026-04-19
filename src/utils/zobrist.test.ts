import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { Zobrist } from "./zobrist";

describe("Zobrist Hashing", () => {
    it("should generate the same hash for transposed moves", () => {
        const zobrist = Zobrist.getInstance();

        // Line 1: 1. e4 e5 2. Nf3 Nc6
        const chess1 = new Chess();
        chess1.move("e4");
        chess1.move("e5");
        chess1.move("Nf3");
        chess1.move("Nc6");
        const hash1 = zobrist.calculateHashString(chess1);

        // Line 2: 1. Nf3 Nc6 2. e4 e5
        const chess2 = new Chess();
        chess2.move("Nf3");
        chess2.move("Nc6");
        chess2.move("e4");
        chess2.move("e5");
        const hash2 = zobrist.calculateHashString(chess2);

        expect(hash1).toBe(hash2);
    });

    it("should generate different hashes for different side to move", () => {
        const zobrist = Zobrist.getInstance();

        const chess1 = new Chess("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        const hash1 = zobrist.calculateHashString(chess1);

        const chess2 = new Chess("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1");
        const hash2 = zobrist.calculateHashString(chess2);

        expect(hash1).not.toBe(hash2);
    });

    it("should generate different hashes when castling rights are lost", () => {
        const zobrist = Zobrist.getInstance();

        // White has castling rights
        const chess1 = new Chess();
        chess1.move("e4");
        chess1.move("e5");
        const hash1 = zobrist.calculateHashString(chess1);

        // White loses castling rights by moving king
        const chess2 = new Chess();
        chess2.move("e4");
        chess2.move("e5");
        chess2.move("Ke2"); // Loss of rights
        chess2.move("Ke7"); // Black too
        chess2.move("Ke1"); // Back to original square
        chess2.move("Ke8");
        const hash2 = zobrist.calculateHashString(chess2);

        expect(hash1).not.toBe(hash2);
    });

    it("should verify collision resistance (100 random positions)", () => {
        const zobrist = Zobrist.getInstance();
        const hashes = new Set<string>();

        const chess = new Chess();
        for (let i = 0; i < 100; i++) {
            const moves = chess.moves();
            if (moves.length === 0) break;
            
            const randomMove = moves[Math.floor(Math.random() * moves.length)];
            if (randomMove) {
                chess.move(randomMove);
            }
            
            const hash = zobrist.calculateHashString(chess);
            expect(hashes.has(hash)).toBe(false); // Should be unique
            hashes.add(hash);
        }
    });

    it("should generate same hash for same FEN regardless of history", () => {
        const zobrist = Zobrist.getInstance();

        const chess1 = new Chess();
        chess1.move("e4");
        chess1.move("e5");
        const fen = chess1.fen();
        const hash1 = zobrist.calculateHashString(chess1);

        const chess2 = new Chess(fen);
        const hash2 = zobrist.calculateHashString(chess2);

        expect(hash1).toBe(hash2);
    });
});
