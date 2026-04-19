
import { MarkdownRenderChild } from 'obsidian';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Config } from 'chessground/config';
import { Key } from 'chessground/types';
import { ChessGame, ChessNode } from './ChessGame';
import { ChessVaultSettings } from '../settings';

export class ChessboardView extends MarkdownRenderChild {
    private game: ChessGame;
    private boardApi: Api | null = null;
    private moveListContainer: HTMLElement | null = null;
    private pgn: string;
    private blockId: string;
    private orientation: 'white' | 'black' = 'white';
    private settings: ChessVaultSettings;

    private static lastPositions = new Map<string, string>();
    private static lastOrientations = new Map<string, 'white' | 'black'>();

    constructor(container: HTMLElement, pgn: string, blockId: string, settings: ChessVaultSettings) {
        super(container);
        this.pgn = pgn;
        this.blockId = blockId;
        this.settings = settings;
        this.game = new ChessGame();
    }

    onload() {
        this.game.loadPgn(this.pgn);

        // Load saved node position
        const savedNodeId = ChessboardView.lastPositions.get(this.blockId);
        if (savedNodeId) {
            this.game.goTo(savedNodeId);
        } else {
            this.game.goToLastMainlineMove();
        }

        // Handle orientation
        const savedOrientation = ChessboardView.lastOrientations.get(this.blockId);
        if (savedOrientation) {
            this.orientation = savedOrientation;
        } else {
            // Auto-detect perspective
            const headers = this.game.getHeaders();
            const blackPlayer = headers['Black']?.toLowerCase() || '';
            const whitePlayer = headers['White']?.toLowerCase() || '';
            const myName = this.settings.playerName?.toLowerCase() || '';
            const myFideId = this.settings.fideId || '';

            if (myName && blackPlayer === myName) {
                this.orientation = 'black';
            } else if (myFideId && headers['BlackFideId'] === myFideId) {
                this.orientation = 'black';
            } else if (myName && whitePlayer === myName) {
                this.orientation = 'white';
            } else if (myFideId && headers['WhiteFideId'] === myFideId) {
                this.orientation = 'white';
            } else {
                this.orientation = 'white'; // Default
            }
            ChessboardView.lastOrientations.set(this.blockId, this.orientation);
        }

        this.render();
    }

    private render() {
        this.containerEl.empty();
        this.containerEl.addClass('chess-view-container');

        // Main Layout Container
        const layout = this.containerEl.createDiv({ cls: 'chess-layout' });

        // Left Column: Board and Controls
        const leftCol = layout.createDiv({ cls: 'chess-board-column' });
        const boardWrapper = leftCol.createDiv({ cls: 'chess-board-wrapper' });
        boardWrapper.style.width = '100%';
        boardWrapper.style.aspectRatio = '1/1';
        boardWrapper.style.margin = '0 auto';

        // Initialize Chessground
        const config: Config = {
            fen: this.game.getFen(),
            orientation: this.orientation,
            movable: {
                color: 'both',
                free: false,
                dests: this.game.getDests() as unknown as Map<Key, Key[]>,
                events: {
                    after: (orig, dest) => {
                        if (this.game.userMove(orig, dest)) {
                            const newNodeId = this.game.getCurrentNode().id;
                            ChessboardView.lastPositions.set(this.blockId, newNodeId);
                            this.savePgn(); // Auto-save
                            this.render(); // Re-render to update move list
                        }
                    }
                }
            },
            drawable: {
                enabled: true,
                onChange: () => this.savePgn() // Auto-save on drawings
            },
            lastMove: this.game.getLastMove() as Key[] | undefined
        };

        this.boardApi = Chessground(boardWrapper, config);

        // Basic Controls
        const controls = leftCol.createDiv({ cls: 'chess-controls' });

        const btnPrev = controls.createEl('button', { text: '←' });
        btnPrev.onclick = () => { this.game.prev(); this.render(); };

        const btnNext = controls.createEl('button', { text: '→' });
        btnNext.onclick = () => { this.game.next(); this.render(); };

        const btnFlip = controls.createEl('button', { text: 'Flip' });
        btnFlip.onclick = () => {
            this.orientation = this.orientation === 'white' ? 'black' : 'white';
            ChessboardView.lastOrientations.set(this.blockId, this.orientation);
            this.render();
        };

        // Right Column: Move List
        const rightCol = layout.createDiv({ cls: 'chess-moves-column' });
        const moveListHeader = rightCol.createEl('h4', { text: 'Analysis' });

        this.moveListContainer = rightCol.createDiv({ cls: 'chess-move-tree' });
        this.renderMoveList();

        this.injectStyles();
    }

    private renderMoveList() {
        if (!this.moveListContainer) return;
        this.moveListContainer.empty();

        // We start from root
        // Lichess style: Main line as blocks, variations as nested lines
        this.renderNodesRecursive(this.moveListContainer, (this.game as any).root);
    }

    private renderNodesRecursive(container: HTMLElement, node: ChessNode, isVariation = false) {
        if (!node.children || node.children.length === 0) return;

        const mainLine = node.children[0];
        if (!mainLine) return; // Should not happen with current logic, but for TS

        const variations = node.children.slice(1);

        // Container for this level
        const levelContainer = container.createDiv({ cls: isVariation ? 'chess-variation' : 'chess-mainline' });

        // Render main move
        const moveEl = levelContainer.createEl('span', {
            cls: 'chess-move-item' +
                (!isVariation ? ' is-main-line' : '') +
                (this.game.getCurrentNode().id === mainLine.id ? ' is-active' : ''),
            text: `${mainLine.color === 'w' ? mainLine.moveNumber + '. ' : ''}${mainLine.san} `
        });

        moveEl.onclick = () => {
            this.game.goTo(mainLine.id);
            ChessboardView.lastPositions.set(this.blockId, mainLine.id);
            this.render();
        };

        moveEl.oncontextmenu = (e) => {
            e.preventDefault();
            if (confirm(`Delete variation starting with ${mainLine.san}?`)) {
                this.game.deleteBranch(mainLine.id);
                ChessboardView.lastPositions.set(this.blockId, this.game.getCurrentNode().id);
                this.savePgn();
                this.render();
            }
        };

        // Render variations
        for (const variation of variations) {
            if (!variation) continue;
            const varWrapper = levelContainer.createDiv({ cls: 'chess-variation-wrapper' });
            varWrapper.createEl('span', { text: '( ', cls: 'chess-bracket' });

            const varMoveEl = varWrapper.createEl('span', {
                cls: 'chess-move-item variation-start' + (this.game.getCurrentNode().id === variation.id ? ' is-active' : ''),
                text: `${variation.moveNumber}${variation.color === 'w' ? '. ' : '... '}${variation.san} `
            });
            varMoveEl.onclick = () => {
                this.game.goTo(variation.id);
                ChessboardView.lastPositions.set(this.blockId, variation.id);
                this.render();
            };
            varMoveEl.oncontextmenu = (e) => {
                e.preventDefault();
                if (confirm(`Delete variation ${variation.san}?`)) {
                    this.game.deleteBranch(variation.id);
                    ChessboardView.lastPositions.set(this.blockId, this.game.getCurrentNode().id);
                    this.savePgn();
                    this.render();
                }
            };

            this.renderNodesRecursive(varWrapper, variation, true);
            varWrapper.createEl('span', { text: ') ', cls: 'chess-bracket' });
        }

        // Continue main line recursively
        this.renderNodesRecursive(levelContainer, mainLine, isVariation);
    }

    private injectStyles() {
        // Simple scoped styles if not already in main.css
        const styleId = 'chess-view-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .chess-layout {
                display: flex;
                flex-wrap: wrap;
                gap: 20px;
                margin-top: 10px;
            }
            .chess-board-column {
                flex: 1 1 400px;
                max-width: 500px;
                min-width: 300px; /* Prevent total collapse */
            }
            .chess-board-wrapper {
                width: 100%;
                aspect-ratio: 1/1;
            }
            .chess-moves-column {
                flex: 1 1 250px;
                background: var(--background-secondary);
                padding: 10px;
                border-radius: 8px;
                max-height: 500px;
                overflow-y: auto;
            }
            .chess-move-item {
                cursor: pointer;
                padding: 2px 4px;
                border-radius: 3px;
                transition: background 0.2s;
            }
            .chess-move-item:hover {
                background: var(--background-modifier-hover);
            }
            .chess-move-item.is-active {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
            }
            .chess-variation-wrapper {
                display: inline;
                color: var(--text-muted);
                font-size: 0.9em;
            }
            .chess-bracket {
                opacity: 0.6;
            }
            .chess-mainline { display: inline; }
            .chess-variation { display: inline; }
            .chess-controls {
                display: flex;
                justify-content: center;
                gap: 10px;
                margin-top: 10px;
            }
            .chess-move-item.is-main-line {
                font-weight: bold;
                font-size: 1.1em;
            }
        `;
        document.head.appendChild(style);
    }

    private async savePgn() {
        const pgn = this.game.toPgn();
        // @ts-ignore
        const app = (this as any).app || (window as any).app;
        if (!app) return;

        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) return;

        // Parse lineStart from blockId
        const parts = this.blockId.split(':');
        const lastPart = parts.pop();
        const lineStart = parseInt(lastPart || '0', 10);

        try {
            await app.vault.process(activeFile, (data: string) => {
                const lines = data.split(/\r?\n/);

                // We trust blockId's lineStart if possible
                let foundIndex = -1;
                const targetLine = lines[lineStart];
                if (targetLine && targetLine.trim().startsWith('```chess-view')) {
                    foundIndex = lineStart;
                } else {
                    // Fallback to heuristic if lines shifted
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (line && line.trim().startsWith('```chess-view')) {
                            const blockContent: string[] = [];
                            let j = i + 1;
                            while (j < lines.length) {
                                const bLine = lines[j];
                                if (!bLine || bLine.trim().startsWith('```')) break;
                                blockContent.push(bLine);
                                j++;
                            }
                            const content = blockContent.join('\n').trim();
                            const cleanContent = content.startsWith('pgn:') ? content.replace('pgn:', '').trim() : content;
                            const cleanPgn = this.pgn.trim();
                            if (cleanContent === cleanPgn || cleanPgn.includes(cleanContent) || cleanContent.includes(cleanPgn)) {
                                foundIndex = i;
                                break;
                            }
                        }
                    }
                }

                if (foundIndex !== -1) {
                    // Find end of block
                    let endIndex = foundIndex + 1;
                    while (endIndex < lines.length && !lines[endIndex]?.trim().startsWith('```')) {
                        endIndex++;
                    }

                    if (endIndex < lines.length) {
                        const newLines = [`pgn: ${pgn}`];
                        lines.splice(foundIndex + 1, endIndex - foundIndex - 1, ...newLines);
                        return lines.join('\n');
                    }
                }

                return data;
            });
            this.pgn = pgn;
        } catch (e) {
            console.error("Auto-save failed", e);
            new (window as any).obsidian.Notice('Auto-save failed');
        }
    }
}
