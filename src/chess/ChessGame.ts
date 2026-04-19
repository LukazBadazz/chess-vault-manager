
import { Chess, Move } from 'chess.js';
import { parse } from 'pgn-parser';

export interface ChessNode {
    id: string;
    parentId: string | null;
    fen: string;
    san: string;
    uci: string; // e2e4
    moveNumber: number;
    color: 'w' | 'b';
    children: ChessNode[]; // We still keep children for tree traversal (next move)
    comments: string[];
}

interface PgnMove {
    move: string;
    move_number?: number;
    ravs?: { moves: PgnMove[] }[];
    comments?: string[];
}

export class ChessGame {
    private root: ChessNode;
    private currentNode: ChessNode;
    private nodeMap: Map<string, ChessNode> = new Map();
    private chess: Chess;
    private headers: { name: string, value: string }[] = [];

    constructor(initialFen: string = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
        this.chess = new Chess(initialFen);
        this.root = {
            id: 'root',
            parentId: null,
            fen: initialFen,
            san: '',
            uci: '',
            moveNumber: 0,
            color: 'b',
            children: [],
            comments: []
        };
        this.nodeMap.set('root', this.root);
        this.currentNode = this.root;
    }

    public loadPgn(pgn: string) {
        if (!pgn || pgn.trim() === "") {
            return;
        }

        let pgnToParse = pgn.trim();
        // Standard PGN results to check for
        const results = ['1-0', '0-1', '1/2-1/2', '*'];
        const lastToken = pgnToParse.split(/\s+/).pop();

        if (lastToken && !results.includes(lastToken)) {
            pgnToParse += " *";
        }

        try {
            const parsed = parse(pgnToParse);
            if (parsed && Array.isArray(parsed) && parsed.length > 0) {
                const game = parsed[0];
                if (game && game.moves) {
                    this.headers = game.headers || [];
                    this.reset();
                    this.buildTree(this.root, game.moves);
                }
            }
        } catch (e) {
            console.error("ChessGame: loadPgn error:", e);
        }
    }

    private reset() {
        this.nodeMap.clear();
        this.root.children = [];
        this.nodeMap.set('root', this.root);
        this.currentNode = this.root;
    }

    private buildTree(parent: ChessNode, moves: PgnMove[]) {
        let currentPointer = parent;

        for (const pgnMove of moves) {
            // State at currentPointer
            const game = new Chess(currentPointer.fen);
            const result = game.move(pgnMove.move);

            if (!result) continue;

            // Safe Parsing of move number
            let moveNumber = 0;
            if (result.before && typeof result.before === 'string') {
                const parts = result.before.split(' ');
                if (parts.length > 5 && parts[5]) {
                    moveNumber = parseInt(parts[5], 10) || 0;
                }
            }
            if (result.color === 'w') moveNumber += 1;

            const moveId = `${currentPointer.id}-${result.san.replace(/[^a-zA-Z0-9]/g, '')}`;
            const newNode: ChessNode = {
                id: moveId,
                parentId: currentPointer.id,
                fen: game.fen(),
                san: result.san,
                uci: result.from + result.to,
                moveNumber: moveNumber,
                color: result.color,
                children: [],
                comments: pgnMove.comments || []
            };

            this.nodeMap.set(newNode.id, newNode);
            currentPointer.children.push(newNode);

            // Handle Variations
            if (pgnMove.ravs) {
                for (const rav of pgnMove.ravs) {
                    this.buildTree(currentPointer, rav.moves);
                }
            }

            // Advance main line
            currentPointer = newNode;
        }
    }

    public getCurrentNode(): ChessNode {
        return this.currentNode;
    }

    public getFen(): string {
        return this.currentNode.fen;
    }

    public getHeaders(): { [key: string]: string } {
        const headers: { [key: string]: string } = {};
        this.headers.forEach(h => {
            headers[h.name] = h.value;
        });
        return headers;
    }

    public getDests(): Map<string, string[]> {
        const dests = new Map<string, string[]>();
        const game = new Chess(this.currentNode.fen);
        const moves = game.moves({ verbose: true });

        for (const move of moves) {
            const from = move.from;
            const to = move.to;
            if (!dests.has(from)) {
                dests.set(from, []);
            }
            dests.get(from)?.push(to);
        }
        return dests;
    }

    public getLastMove(): string[] | undefined {
        if (!this.currentNode.uci) return undefined;
        return [this.currentNode.uci.slice(0, 2), this.currentNode.uci.slice(2, 4)];
    }

    public next(variationIndex = 0) {
        if (this.currentNode.children && this.currentNode.children.length > variationIndex) {
            const nextNode = this.currentNode.children[variationIndex];
            if (nextNode) {
                this.currentNode = nextNode;
            }
        }
    }

    public prev() {
        if (this.currentNode.parentId) {
            const parent = this.nodeMap.get(this.currentNode.parentId);
            if (parent) {
                this.currentNode = parent;
            }
        }
    }

    public goToLastMainlineMove() {
        let node = this.root;
        while (node.children && node.children.length > 0) {
            const nextNode = node.children[0];
            if (!nextNode) break;
            node = nextNode;
        }
        this.currentNode = node;
    }

    public goTo(nodeId: string) {
        const node = this.nodeMap.get(nodeId);
        if (node) this.currentNode = node;
    }

    public deleteBranch(nodeId: string) {
        const node = this.nodeMap.get(nodeId);
        if (!node || node.id === 'root') return;

        const parent = node.parentId ? this.nodeMap.get(node.parentId) : null;
        if (parent) {
            parent.children = parent.children.filter(c => c.id !== nodeId);
            // If we deleted the current node or one of its descendants, move pointer back to parent
            let check: ChessNode | null = this.currentNode;
            while (check) {
                if (check.id === nodeId) {
                    this.currentNode = parent;
                    break;
                }
                check = check.parentId ? this.nodeMap.get(check.parentId) || null : null;
            }
        }

        // Cleanup nodeMap
        const removeRecursive = (n: ChessNode) => {
            this.nodeMap.delete(n.id);
            n.children.forEach(removeRecursive);
        };
        removeRecursive(node);
    }

    public userMove(orig: string, dest: string): boolean {
        const game = new Chess(this.currentNode.fen);
        try {
            const result = game.move({ from: orig, to: dest, promotion: 'q' });
            if (result) {
                const uci = result.from + result.to;
                const existing = this.currentNode.children.find(c => c.uci === uci);
                if (existing) {
                    this.currentNode = existing;
                    return true;
                }

                let moveNumber = this.currentNode.moveNumber;
                if (result.color === 'w') moveNumber++;

                const moveId = `${this.currentNode.id}-${result.san.replace(/[^a-zA-Z0-9]/g, '')}`;

                const newNode: ChessNode = {
                    id: moveId,
                    parentId: this.currentNode.id,
                    fen: game.fen(),
                    san: result.san,
                    uci: uci,
                    moveNumber: moveNumber,
                    color: result.color,
                    children: [],
                    comments: []
                };

                this.nodeMap.set(newNode.id, newNode);
                this.currentNode.children.push(newNode);
                this.currentNode = newNode;
                return true;
            }
        } catch (e) {
            return false;
        }
        return false;
    }

    public toPgn(): string {
        let pgn = "";
        if (this.headers && this.headers.length > 0) {
            pgn += this.headers.map(h => `[${h.name} "${h.value}"]`).join('\n') + "\n\n";
        }
        pgn += this.buildPgn(this.root);
        return pgn + " *";
    }

    private buildPgn(node: ChessNode): string {
        if (!node.children || node.children.length === 0) return "";

        const mainLine = node.children[0];
        if (!mainLine) return "";

        let pgn = "";
        const variations = node.children.slice(1);

        if (mainLine.color === 'w') {
            pgn += `${mainLine.moveNumber}. `;
        } else if (node === this.root) {
            pgn += `${mainLine.moveNumber}... `;
        }

        pgn += mainLine.san + " ";

        if (mainLine.comments && mainLine.comments.length > 0) {
            pgn += `{${mainLine.comments.join(' ')}} `;
        }

        for (const variation of variations) {
            if (!variation) continue;
            pgn += "(";
            if (variation.color === 'b') {
                pgn += `${variation.moveNumber}... `;
            } else {
                pgn += `${variation.moveNumber}. `;
            }
            pgn += variation.san + " ";
            if (variation.comments && variation.comments.length > 0) {
                pgn += `{${variation.comments.join(' ')}} `;
            }
            pgn += this.buildPgn(variation);
            pgn += ") ";
        }

        pgn += this.buildPgn(mainLine);
        return pgn.trim();
    }

    private generateId(): string {
        return Math.random().toString(36).substr(2, 9);
    }
}
