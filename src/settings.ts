import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";

export interface ChessVaultSettings {
	gamesFolder: string;
	tournamentsFolder: string;
	fideId: string;
	lichessUsername: string;
	chessComUsername: string;
	kFactor: number;
}

export const DEFAULT_SETTINGS: ChessVaultSettings = {
	gamesFolder: 'Games',
	tournamentsFolder: 'Tournaments',
	fideId: '',
	lichessUsername: '',
	chessComUsername: '',
	kFactor: 20
}

export class ChessVaultSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Games Folder')
			.setDesc('Folder where your chess games will be stored')
			.addText(text => text
				.setPlaceholder('Games')
				.setValue(this.plugin.settings.gamesFolder)
				.onChange(async (value) => {
					this.plugin.settings.gamesFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Tournaments Folder')
			.setDesc('Folder where your tournaments will be stored')
			.addText(text => text
				.setPlaceholder('Tournaments')
				.setValue(this.plugin.settings.tournamentsFolder)
				.onChange(async (value) => {
					this.plugin.settings.tournamentsFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('FIDE ID')
			.setDesc('Your FIDE ID')
			.addText(text => text
				.setPlaceholder('12345678')
				.setValue(this.plugin.settings.fideId)
				.onChange(async (value) => {
					this.plugin.settings.fideId = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('K-Factor')
			.setDesc('The development coefficient used for rating calculations (usually 40, 20 or 10)')
			.addText(text => text
				.setPlaceholder('20')
				.setValue(String(this.plugin.settings.kFactor))
				.onChange(async (value) => {
					this.plugin.settings.kFactor = parseInt(value) || 20;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Lichess Username')
			.setDesc('Your Lichess username')
			.addText(text => text
				.setPlaceholder('MagnusCarlsen')
				.setValue(this.plugin.settings.lichessUsername)
				.onChange(async (value) => {
					this.plugin.settings.lichessUsername = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Chess.com Username')
			.setDesc('Your Chess.com username')
			.addText(text => text
				.setPlaceholder('MagnusCarlsen')
				.setValue(this.plugin.settings.chessComUsername)
				.onChange(async (value) => {
					this.plugin.settings.chessComUsername = value;
					await this.plugin.saveSettings();
				}));
	}
}
