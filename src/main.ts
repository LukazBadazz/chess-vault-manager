import { Notice, Plugin, TFile, MarkdownPostProcessorContext, ButtonComponent } from 'obsidian';
import { ChessVaultSettings, ChessVaultSettingTab, DEFAULT_SETTINGS } from "./settings";
import { TournamentModal, TournamentData } from "./modals/tournament-modal";
import { FideApiService } from "./api/fide-api";
import { GameModal, GameData } from "./modals/game-modal";
import { Chess } from "chess.js";
import { ChessUtils } from "./utils/chess-utils";
import { ChessboardView } from "./chess/ChessboardView";

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

export default class MyPlugin extends Plugin {
	settings: ChessVaultSettings;

	async onload() {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor("chess-tournament-controls", (source, el, ctx) => {
			void this.processTournamentControls(source, el, ctx);
		});

		this.registerMarkdownCodeBlockProcessor("chess-view", (source, el, ctx) => {
			const pgn = source.trim();
			// Or parse params from source if it's YAML-like, but standard is PGN body
			// If the block contains "pgn: ...", parse it.
			// But for simplicity, let's look for "pgn:" or assume raw PGN.
			// Existing `chessStudy` used `chessStudyId: ...`.
			// Let's support `pgn: ...` or just the PGN content.

			// Allow parsing PGN from block
			let pgnContent = source.trim();
			if (pgnContent.startsWith('pgn:')) {
				pgnContent = pgnContent.replace('pgn:', '').trim();
			}

			const section = ctx.getSectionInfo(el);
			const blockId = `${ctx.sourcePath}:${section?.lineStart || 0}`;
			ctx.addChild(new ChessboardView(el, pgnContent, blockId, this.settings));
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


		// Generate Game ID
		const gameId = this.generateRandomId(20);

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

\`\`\`chess-view
pgn: ${pgn}
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
			new Notice(`Failed to create game note: ${error}`);
			console.error(error);
		}
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
