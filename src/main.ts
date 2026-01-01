import { App, Editor, MarkdownView, Modal, Notice, Plugin, TFile, MarkdownPostProcessorContext, ButtonComponent } from 'obsidian';
import { ChessVaultSettings, ChessVaultSettingTab, DEFAULT_SETTINGS } from "./settings";
import { TournamentModal, TournamentData } from "./modals/tournament-modal";
import { FideApiService } from "./api/fide-api";
import { GameModal, GameData } from "./modals/game-modal";
import { Chess } from "chess.js";
import { ChessUtils } from "./utils/chess-utils";

export default class MyPlugin extends Plugin {
	settings: ChessVaultSettings;

	async onload() {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor("chess-tournament-controls", (source, el, ctx) => {
			this.processTournamentControls(source, el, ctx);
		});

		this.addCommand({
			id: 'log-tournament',
			name: 'Log Tournament',
			callback: () => {
				new TournamentModal(this.app, (result) => this.createTournamentNote(result)).open();
			}
		});

		this.addCommand({
			id: 'log-tournament-game',
			name: 'Log Tournament Game',
			callback: () => {
				const tournamentFolder = this.settings.tournamentsFolder;
				const files = this.app.vault.getFiles().filter(file => file.path.startsWith(tournamentFolder) && file.extension === 'md');
				new GameModal(this.app, files, (result) => this.createGameNote(result)).open();
			}
		});

		this.addCommand({
			id: 'log-player-data',
			name: 'Log Player Data',
			callback: async () => {
				const fideId = this.settings.fideId;
				if (!fideId) {
					new Notice('Please set a FIDE ID in settings first.');
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
					} catch (e) {
						new Notice(`Failed to create file: ${e}`);
					}
				} else {
					new Notice('Failed to fetch player data.');
				}
			}
		});

		this.addSettingTab(new ChessVaultSettingTab(this.app, this));
	}

	async processTournamentControls(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const filePath = ctx.sourcePath;
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!(file instanceof TFile)) return;

		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const status = frontmatter?.status || 'pending';

		const container = el.createDiv({ cls: 'chess-tournament-controls' });

		if (status === 'pending') {
			new ButtonComponent(container)
				.setButtonText('Start Tournament')
				.setCta()
				.onClick(async () => {
					await this.startTournament(file);
				});
		} else if (status === 'active') {
			new ButtonComponent(container)
				.setButtonText('End Tournament')
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
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter['status'] = 'active';
			});
			new Notice('Tournament Started!');
		} catch (e) {
			console.error("Error starting tournament:", e);
			new Notice("Error starting tournament.");
		}
	}

	async endTournament(file: TFile) {
		try {
			// Get current frontmatter
			const fileCache = this.app.metadataCache.getFileCache(file);
			const tournamentName = file.basename;
			const startRating = fileCache?.frontmatter?.start_rating || 0;

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
				const gameFrontmatter = gameCache?.frontmatter;

				// Check if game belongs to this tournament
				const gameTournament = gameFrontmatter?.tournament;

				if (gameTournament && (gameTournament.includes(tournamentName) || gameTournament === `[[${tournamentName}]]`)) {
					const result = gameFrontmatter.result; // 1-0, 0-1, 1/2-1/2
					const myColor = gameFrontmatter.my_color;
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

			if (totalGames === 0) {
				new Notice("No games found for this tournament!");
				return;
			}

			// Calculate Stats
			const performanceRating = ChessUtils.calculatePerformanceRating(opponentRatings, totalScore);
			const endRating = startRating + ratingChange;

			// Update Tournament Note
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter['status'] = 'completed';
				frontmatter['end_rating'] = Math.round(endRating);
				frontmatter['performance_rating'] = performanceRating;
				frontmatter['score'] = `${totalScore}/${totalGames}`;
				frontmatter['rating_change'] = parseFloat(ratingChange.toFixed(2));
			});

			new Notice(`Tournament Ended! Score: ${totalScore}/${totalGames}, Rating Change: ${ratingChange.toFixed(2)}`);

		} catch (e) {
			console.error("Error ending tournament:", e);
			new Notice("Error ending tournament.");
		}
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
				leaf.openFile(file);
			}
			new Notice(`Tournament "${name}" created!`);
		} catch (error) {
			new Notice(`Failed to create tournament note: ${error}`);
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
		} catch (e) {
			new Notice('Invalid PGN!');
			return;
		}

		const header = chess.header();
		const result = header['Result'] || '*';
		const eco = header['ECO'] || '';
		const opening = header['Opening'] || '';

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
			new Notice(`Failed to write chess-study data: ${error}`);
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
				leaf.openFile(file);
			}
			new Notice(`Game logged successfully!`);
		} catch (error) {
			new Notice(`Failed to create game note: ${error}`);
			console.error(error);
		}
	}

	generateChessStudyJson(chess: any): any {
		const history = chess.history({ verbose: true });
		const headers = chess.header();
		const rootFEN = headers['FEN'] || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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
				title: headers['Event'] || null
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
