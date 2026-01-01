import { Notice, Plugin, TFile, MarkdownPostProcessorContext, ButtonComponent } from 'obsidian';
import { ChessVaultSettings, ChessVaultSettingTab, DEFAULT_SETTINGS } from "./settings";
import { TournamentModal, TournamentData } from "./modals/tournament-modal";
import { FideApiService } from "./api/fide-api";
import { GameModal, GameData } from "./modals/game-modal";
import { Chess } from "chess.js";
import { ChessUtils } from "./utils/chess-utils";
import { OnlineGameModal } from "./modals/online-game-modal";
import { LichessApiService } from "./api/lichess-api";

interface TournamentFrontmatter {
	status?: string;
	start_rating?: number;
	end_rating?: number;
	performance_rating?: number;
	score?: string;
	rating_change?: number;
}

interface GameFrontmatter {
	tournament?: string;
	result?: string;
	my_color?: string;
	opponent_rating?: number;
}

export default class ChessVaultManager extends Plugin {
	settings: ChessVaultSettings;

	async onload() {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor("chess-tournament-controls", (source, el, ctx) => {
			void this.processTournamentControls(source, el, ctx);
		});

		this.addCommand({
			id: 'log-tournament',
			name: 'Log tournament',
			callback: () => {
				new TournamentModal(this.app, (result) => {
					void this.createTournamentNote(result);
				}).open();
			}
		});

		this.addCommand({
			id: 'log-tournament-game',
			name: 'Log tournament game',
			callback: () => {
				const tournamentFolder = this.settings.tournamentsFolder;
				const files = this.app.vault.getFiles().filter(file => {
					if (!file.path.startsWith(tournamentFolder) || file.extension !== 'md') return false;
					const cache = this.app.metadataCache.getFileCache(file);
					return cache?.frontmatter?.status === 'active';
				});

				if (files.length === 0) {
					new Notice('No active tournaments found! Start a tournament first.');
					return;
				}

				new GameModal(this.app, files, (result) => {
					void this.createGameNote(result);
				}).open();
			}
		});

		this.addCommand({
			id: 'log-player-data',
			name: 'Log player data',
			callback: async () => {
				const fideId = this.settings.fideId;
				if (!fideId) {
					new Notice('Please set a player ID in settings first.');
					return;
				}
				new Notice('Fetching player data...');
				const data = await FideApiService.getFullPlayerInfo(fideId);
				if (data) {
					const filename = `FIDE_Data_${fideId}.md`;
					const content = JSON.stringify(data, null, 2);
					try {
						await this.app.vault.create(filename, content);
						new Notice(`Created ${filename}`);
					} catch (error) {
						new Notice(`Failed to create file: ${String(error)}`);
					}
				} else {
					new Notice('Failed to fetch player data.');
				}
			}
		});

		this.addCommand({
			id: 'log-online-game',
			name: 'Log online game',
			callback: () => {
				new OnlineGameModal(this.app, async (url) => {
					const gameId = LichessApiService.extractGameId(url);
					if (!gameId) {
						new Notice('Invalid game URL!');
						return;
					}

					new Notice('Fetching game data...');
					const pgn = await LichessApiService.getPgn(gameId);
					if (pgn) {
						void this.createOnlineGameNote(pgn, 'Lichess');
					} else {
						new Notice('Failed to fetch game data.');
					}
				}).open();
			}
		});

		this.addSettingTab(new ChessVaultSettingTab(this.app, this));
	}

	async processTournamentControls(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const filePath = ctx.sourcePath;
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!(file instanceof TFile)) return;

		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as TournamentFrontmatter | undefined;
		const status = frontmatter?.status || 'pending';

		const container = el.createDiv({ cls: 'chess-tournament-controls' });

		if (status === 'pending') {
			new ButtonComponent(container)
				.setButtonText('Start tournament')
				.setCta()
				.onClick(async () => {
					await this.startTournament(file);
				});
		} else if (status === 'active') {
			new ButtonComponent(container)
				.setButtonText('End tournament')
				.setWarning()
				.onClick(async () => {
					await this.endTournament(file);
				});
		} else {
			container.createEl('span', { text: `Tournament Status: ${status}` });
		}
	}

	async startTournament(file: TFile) {
		try {
			await this.app.fileManager.processFrontMatter(file, (frontmatter: TournamentFrontmatter) => {
				frontmatter.status = 'active';
			});
			new Notice('Tournament started!');
		} catch (error) {
			console.error("Error starting tournament:", error);
			new Notice("Error starting tournament.");
		}
	}

	async endTournament(file: TFile) {
		try {
			await this.updateTournamentStats(file);

			await this.app.fileManager.processFrontMatter(file, (frontmatter: TournamentFrontmatter) => {
				frontmatter.status = 'completed';
			});

			new Notice(`Tournament "${file.basename}" ended and stats updated!`);
		} catch (error) {
			console.error("Error ending tournament:", error);
			new Notice("Error ending tournament.");
		}
	}

	async updateTournamentStats(file: TFile) {
		// Get current frontmatter
		const fileCache = this.app.metadataCache.getFileCache(file);
		const tournamentName = file.basename;
		const startRating = (fileCache?.frontmatter as TournamentFrontmatter | undefined)?.start_rating || 0;

		// Find matches
		const gamesFolder = this.settings.gamesFolder;
		const allFiles = this.app.vault.getFiles();
		const gameFiles = allFiles.filter(f => f.path.startsWith(gamesFolder) && f.extension === 'md');

		let totalScore = 0;
		let totalGames = 0;
		const opponentRatings: number[] = [];

		let ratingChange = 0;

		// We need to parse frontmatter of all games to find those belonging to this tournament
		for (const gameFile of gameFiles) {
			const gameCache = this.app.metadataCache.getFileCache(gameFile);
			const gameFrontmatter = gameCache?.frontmatter as GameFrontmatter | undefined;

			// Check if game belongs to this tournament
			const gameTournament = gameFrontmatter?.tournament;

			if (gameTournament && (gameTournament.includes(tournamentName) || gameTournament === `[[${tournamentName}]]` || gameTournament === tournamentName)) {
				const result = gameFrontmatter.result || '*'; // 1-0, 0-1, 1/2-1/2
				const myColor = gameFrontmatter.my_color || 'White';
				const opponentRating = gameFrontmatter.opponent_rating || 0;

				if (opponentRating > 0) {
					opponentRatings.push(opponentRating);
				}

				const parsedScore = ChessUtils.parseResult(result, myColor);
				totalScore += parsedScore;
				totalGames++;

				if (opponentRating > 0) {
					const change = ChessUtils.calculateRatingChange(startRating, opponentRating, parsedScore, this.settings.kFactor);
					ratingChange += change;
				}
			}
		}

		// Calculate Stats
		const performanceRating = totalGames > 0 ? ChessUtils.calculatePerformanceRating(opponentRatings, totalScore) : 0;
		const endRatingFloat = startRating + ratingChange;

		// Update Tournament Note
		await this.app.fileManager.processFrontMatter(file, (frontmatter: TournamentFrontmatter) => {
			frontmatter.end_rating = Math.round(endRatingFloat);
			frontmatter.performance_rating = performanceRating;
			frontmatter.score = `${totalScore}/${totalGames}`;
			frontmatter.rating_change = parseFloat(ratingChange.toFixed(2));
		});
	}

	async createTournamentNote(data: TournamentData) {
		const {
			name,
			date_start,
			location,
			time_control,
			time_control_details,
			total_rounds,
			link
		} = data;

		if (!name) {
			new Notice('Tournament name is required!');
			return;
		}

		const folderPath = this.settings.tournamentsFolder;
		if (!(await this.app.vault.adapter.exists(folderPath))) {
			await this.app.vault.createFolder(folderPath);
		}

		const startRating = await FideApiService.getPlayerRating(this.settings.fideId);

		const filename = `${folderPath}/${name}.md`;

		const content = `---
type: tournament
status: pending
date_start: ${date_start}
location: ${location}
time_control: ${time_control}
time_control_details: ${time_control_details}
total_rounds: ${total_rounds}
start_rating: ${startRating}
end_rating: ${startRating}
performance_rating: 0
score: 0/0
tournament_link: "${link}"
tags:
  - chess/tournament
rating_change: 0
---

# 🏆 Tournament: ${name}

\`\`\`chess-tournament-controls
\`\`\`

## 🎯 Goals & Prep




---

## ⚔️ Games
\`\`\`dataview
TABLE opponent as "Opponent", result as "Result", opening as "Opening"
			FROM "Games"
WHERE tournament = [[${name}]]
SORT date ASC
\`\`\`


## 🧠 Post-Tournament Reflection

### What went well?

### What went wrong?

### 💡 Major Improvement Lesson
`;

		try {
			const file = await this.app.vault.create(filename, content);
			const leaf = this.app.workspace.getLeaf(false);
			if (leaf) {
				await leaf.openFile(file);
			}
			new Notice(`Tournament "${name}" created!`);
		} catch (error) {
			new Notice(`Failed to create tournament note: ${String(error)}`);
			console.error(error);
		}
	}

	async createGameNote(data: GameData) {
		const {
			tournament,
			opponentFideId,
			round,
			color,
			pgn
		} = data;

		// Parse PGN
		const chess = new Chess();
		try {
			chess.loadPgn(pgn);
		} catch {
			new Notice('Invalid pgn!');
			return;
		}

		const header = chess.getHeaders();
		const result = header.Result || '*';
		const eco = header.ECO || '';
		const opening = header.Opening || '';

		let date = header['Date'];
		// If date is invalid or missing, use current date
		if (!date || date.includes("?") || date.length < 10) {
			date = new Date().toISOString().split('T')[0];
		} else {
			// ensure YYYY-MM-DD
			date = date.replace(/\./g, '-');
		}

		// Get Opponent Info
		let opponentName = "Unknown Opponent";
		let opponentRating = 0;
		if (opponentFideId) {
			const opponentInfo = await FideApiService.getPlayerInfo(opponentFideId);
			if (opponentInfo) {
				opponentName = opponentInfo.name;
				opponentRating = opponentInfo.rating;
			}
		}

		// Calculate Results
		let myResult = 'Draw';
		if (result === '1-0') {
			myResult = color === 'White' ? 'Win' : 'Loss';
		} else if (result === '0-1') {
			myResult = color === 'Black' ? 'Win' : 'Loss';
		} else if (result === '1/2-1/2') {
			myResult = 'Draw';
		} else {
			myResult = 'Unknown';
		}

		// Generate Game ID and JSON for chess-study
		const gameId = this.generateRandomId(20);
		const chessStudyJson = this.generateChessStudyJson(chess);

		// Write JSON to chess-study storage
		const configDir = this.app.vault.configDir;
		const storagePath = `${configDir}/plugins/chess-study/storage`;

		try {
			if (!(await this.app.vault.adapter.exists(storagePath))) {
				await this.app.vault.adapter.mkdir(storagePath);
			}
			await this.app.vault.adapter.write(`${storagePath}/${gameId}.json`, JSON.stringify(chessStudyJson, null, 2));
		} catch (error) {
			new Notice(`Failed to write chess-study data: ${String(error)}`);
			console.error(error);
		}

		const gamesFolder = this.settings.gamesFolder;
		if (!(await this.app.vault.adapter.exists(gamesFolder))) {
			await this.app.vault.createFolder(gamesFolder);
		}

		// Sanitize Name
		const safeOpponentName = opponentName.replace(/[^a-zA-Z0-9]/g, '_');
		const filename = `${gamesFolder}/${date}-Round-${round}-${safeOpponentName}.md`;

		const content = `---
type: game
tournament: "[[${tournament}]]"
round: ${round}
result: "${result}"
my_color: "${color}"
my_result: "${myResult}"
opponent: "${opponentName}"
opponent_rating: ${opponentRating}
fide_id: ${opponentFideId}
date: ${date}
tags:
  - chess/games
  - chess/${myResult.toLowerCase()}
opening: "${opening}"
eco: "${eco}"
---

## ♟️ Round ${round} vs ${opponentName} (${myResult})

### 🧩 The Board

\`\`\`chessStudy
chessStudyId: ${gameId}
\`\`\`

### 📝 Analysis
- **Key Moment:** 
`;

		try {
			const file = await this.app.vault.create(filename, content);
			const leaf = this.app.workspace.getLeaf(false);
			if (leaf) {
				await leaf.openFile(file);
			}
			new Notice(`Game logged successfully!`);

			// Update tournament stats
			const tournamentFolder = this.settings.tournamentsFolder;
			const tournamentFile = this.app.vault.getFiles().find(f =>
				f.basename === tournament && f.path.startsWith(tournamentFolder)
			);

			if (tournamentFile) {
				// Give Obsidian a moment to index the new file before recalculating
				setTimeout(() => {
					this.updateTournamentStats(tournamentFile).catch(err => {
						console.error("Failed to update tournament stats", err);
					});
				}, 1000);
			}
		} catch (error) {
			new Notice(`Failed to create game note: ${String(error)}`);
			console.error(error);
		}
	}

	async createOnlineGameNote(pgn: string, platform: 'Lichess' | 'ChessCom') {
		// Parse PGN
		const chess = new Chess();
		try {
			chess.loadPgn(pgn);
		} catch {
			new Notice('Invalid pgn!');
			return;
		}

		const header = chess.getHeaders();
		const result = header.Result || '*';
		const eco = header.ECO || '';
		const opening = header.Opening || '';
		const white = header['White'] || 'Unknown';
		const black = header['Black'] || 'Unknown';
		const whiteElo = parseInt(header['WhiteElo'] ?? '0') || 0;
		const blackElo = parseInt(header['BlackElo'] ?? '0') || 0;

		let date = header['Date'];
		if (!date || date.includes("?") || date.length < 10) {
			date = new Date().toISOString().split('T')[0];
		} else {
			date = date.replace(/\./g, '-');
		}

		// Determine perspective
		let myColor: 'White' | 'Black' = 'White';
		let opponentName = black;
		let opponentRating = blackElo;
		let myRating = whiteElo;

		const myUsername = platform === 'Lichess' ? this.settings.lichessUsername : this.settings.chessComUsername;

		if (!myUsername) {
			new Notice(`Please set your ${platform} username in settings first!`);
			return;
		}

		if (black.toLowerCase() === myUsername.toLowerCase()) {
			myColor = 'Black';
			opponentName = white;
			opponentRating = whiteElo;
			myRating = blackElo;
		} else if (white.toLowerCase() !== myUsername.toLowerCase()) {
			new Notice(`Lichess username "${myUsername}" does not match White (${white}) or Black (${black})`);
			// Continue anyway, defaulting to White perspective? 
			// Or stop? The user likely wants to log THEIR game.
			// Let's just warn and default to White for now, but usually it should match.
		}

		// Calculate Results
		let myResult = 'Draw';
		if (result === '1-0') {
			myResult = myColor === 'White' ? 'Win' : 'Loss';
		} else if (result === '0-1') {
			myResult = myColor === 'Black' ? 'Win' : 'Loss';
		} else if (result === '1/2-1/2') {
			myResult = 'Draw';
		} else {
			myResult = 'Unknown';
		}

		// Generate Game ID and JSON for chess-study
		const studyGameId = this.generateRandomId(20);
		const chessStudyJson = this.generateChessStudyJson(chess);

		// Write JSON to chess-study storage
		const configDir = this.app.vault.configDir;
		const storagePath = `${configDir}/plugins/chess-study/storage`;

		try {
			if (!(await this.app.vault.adapter.exists(storagePath))) {
				await this.app.vault.adapter.mkdir(storagePath);
			}
			await this.app.vault.adapter.write(`${storagePath}/${studyGameId}.json`, JSON.stringify(chessStudyJson, null, 2));
		} catch (error) {
			new Notice(`Failed to write chess-study data: ${String(error)}`);
			console.error(error);
		}

		const platformFolder = `${this.settings.gamesFolder}/${platform}`;
		if (!(await this.app.vault.adapter.exists(platformFolder))) {
			// Create Games folder if it doesn't exist, then platform folder
			if (!(await this.app.vault.adapter.exists(this.settings.gamesFolder))) {
				await this.app.vault.createFolder(this.settings.gamesFolder);
			}
			await this.app.vault.createFolder(platformFolder);
		}

		// Sanitize Name
		const safeOpponentName = opponentName.replace(/[^a-zA-Z0-9]/g, '_');
		const filename = `${platformFolder}/${date}-${safeOpponentName}.md`;

		const content = `---
type: online-game
platform: ${platform}
result: "${result}"
my_color: "${myColor}"
my_result: "${myResult}"
my_rating: ${myRating}
opponent: "${opponentName}"
opponent_rating: ${opponentRating}
date: ${date}
tags:
  - chess/games
  - chess/online
  - chess/${platform.toLowerCase()}
  - chess/${myResult.toLowerCase()}
opening: "${opening}"
eco: "${eco}"
---

## ♟️ vs ${opponentName} (${myResult})

### 🧩 The Board

\`\`\`chessStudy
chessStudyId: ${studyGameId}
\`\`\`

### 📝 Analysis
- **Key Moment:** 
`;

		try {
			// Check if file already exists
			if (await this.app.vault.adapter.exists(filename)) {
				new Notice('Game already logged!');
				return;
			}
			const file = await this.app.vault.create(filename, content);
			const leaf = this.app.workspace.getLeaf(false);
			if (leaf) {
				await leaf.openFile(file);
			}
			new Notice(`${platform} game logged successfully!`);
		} catch (error) {
			new Notice(`Failed to create game note: ${String(error)}`);
			console.error(error);
		}
	}

	generateChessStudyJson(chess: Chess): Record<string, unknown> {
		const history = chess.history({ verbose: true });
		const headers = chess.getHeaders();
		const rootFEN = headers.FEN || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

		const moves = [];
		const replay = new Chess(rootFEN);

		for (const move of history) {
			const before = replay.fen();
			const result = replay.move(move.san);
			const after = replay.fen();

			if (result) {
				moves.push({
					color: result.color,
					piece: result.piece,
					from: result.from,
					to: result.to,
					san: result.san,
					// @ts-ignore - flags is deprecated in chess.js but still useful here
					// eslint-disable-next-line @typescript-eslint/no-deprecated
					flags: result.flags,
					lan: result.from + result.to,
					before: before,
					after: after,
					moveId: this.generateRandomId(),
					variants: [],
					shapes: [],
					comment: null
				});
			}
		}

		return {
			version: "0.0.2",
			header: {
				title: headers.Event || null
			},
			moves: moves,
			rootFEN: rootFEN
		};
	}

	generateRandomId(length = 20): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ChessVaultSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
