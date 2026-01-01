import { App, Modal, Setting, TFile, TextAreaComponent } from 'obsidian';

export interface GameData {
    tournament: string;
    opponentFideId: string;
    round: number;
    color: 'White' | 'Black';
    pgn: string;
}

export class GameModal extends Modal {
    result: GameData;
    onSubmit: (result: GameData) => void;
    tournaments: TFile[];

    constructor(app: App, tournaments: TFile[], onSubmit: (result: GameData) => void) {
        super(app);
        this.tournaments = tournaments;
        this.onSubmit = onSubmit;
        this.result = {
            tournament: '',
            opponentFideId: '',
            round: 1,
            color: 'White',
            pgn: ''
        };

        // Default to first tournament if available
        // Default to first tournament if available
        const firstTournament = this.tournaments[0];
        if (firstTournament) {
            this.result.tournament = firstTournament.basename;
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Log Tournament Game' });

        new Setting(contentEl)
            .setName('Tournament')
            .addDropdown(dropdown => {
                this.tournaments.forEach(file => {
                    dropdown.addOption(file.basename, file.basename);
                });
                dropdown.setValue(this.result.tournament);
                dropdown.onChange(value => this.result.tournament = value);
            });

        new Setting(contentEl)
            .setName('Opponent FIDE ID')
            .addText(text => text
                .onChange(value => {
                    this.result.opponentFideId = value;
                }));

        new Setting(contentEl)
            .setName('Round Number')
            .addText(text => text
                .setValue(String(this.result.round))
                .onChange(value => {
                    this.result.round = parseInt(value) || 0;
                }));

        new Setting(contentEl)
            .setName('Color')
            .addDropdown(dropdown => dropdown
                .addOption('White', 'White')
                .addOption('Black', 'Black')
                .setValue(this.result.color)
                .onChange(value => {
                    this.result.color = value as 'White' | 'Black';
                }));

        new Setting(contentEl)
            .setName('PGN')
            .addTextArea(text => {
                text.inputEl.rows = 5;
                text.inputEl.cols = 50;
                text.onChange(value => {
                    this.result.pgn = value;
                });
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Log Game')
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onSubmit(this.result);
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
