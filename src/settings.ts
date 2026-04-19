import { App, PluginSettingTab, Setting } from "obsidian";
import ChessVaultManager from "./main";

export interface ChessVaultSettings {
	gamesFolder: string;
	tournamentsFolder: string;
	playerName: string;
	fideId: string;
	kFactor: number;
}

export const DEFAULT_SETTINGS: ChessVaultSettings = {
	gamesFolder: 'Games',
	tournamentsFolder: 'Tournaments',
	playerName: '',
	fideId: '',
	kFactor: 20
}

export class ChessVaultSettingTab extends PluginSettingTab {
	plugin: ChessVaultManager;

	constructor(app: App, plugin: ChessVaultManager) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Games folder')
			.setDesc('Folder where your chess games will be stored')
			.addText(text => text
				.setPlaceholder('Games')
				.setValue(this.plugin.settings.gamesFolder)
				.onChange(async (value) => {
					this.plugin.settings.gamesFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Tournaments folder')
			.setDesc('Folder where your tournaments will be stored')
			.addText(text => text
				.setPlaceholder('Tournaments')
				.setValue(this.plugin.settings.tournamentsFolder)
				.onChange(async (value) => {
					this.plugin.settings.tournamentsFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Player Identification')
			.setDesc('Your name and FIDE ID for auto-detecting perspective in PGNs')
			.addText(text => text
				.setPlaceholder('Name (e.g. Magnus Carlsen)')
				.setValue(this.plugin.settings.playerName)
				.onChange(async (value) => {
					this.plugin.settings.playerName = value;
					await this.plugin.saveSettings();
				}))
			.addText(text => text
				.setPlaceholder('FIDE ID (e.g. 12345678)')
				.setValue(this.plugin.settings.fideId)
				.onChange(async (value) => {
					this.plugin.settings.fideId = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('K-factor')
			.setDesc('The development coefficient used for rating calculations (usually 40, 20 or 10)')
			.addText(text => text
				.setPlaceholder('20')
				.setValue(String(this.plugin.settings.kFactor))
				.onChange(async (value) => {
					this.plugin.settings.kFactor = parseInt(value) || 20;
					await this.plugin.saveSettings();
				}));


	}
}
