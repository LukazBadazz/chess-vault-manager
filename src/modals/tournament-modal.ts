import { App, Modal, Setting } from 'obsidian';

export interface TournamentData {
    name: string;
    date_start: string;
    location: string;
    time_control: string;
    time_control_details: string;
    total_rounds: number;
    link: string;
}

export class TournamentModal extends Modal {
    result: TournamentData;
    onSubmit: (result: TournamentData) => void;

    constructor(app: App, onSubmit: (result: TournamentData) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.result = {
            name: '',
            date_start: new Date().toISOString().split('T')[0] || '',
            location: '',
            time_control: 'Standard',
            time_control_details: '',
            total_rounds: 9,
            link: ''
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Log tournament' });

        new Setting(contentEl)
            .setName('Tournament name')
            .addText(text => text
                .onChange(value => {
                    this.result.name = value;
                }));

        new Setting(contentEl)
            .setName('Start date')
            .addText(text => text
                .setValue(this.result.date_start)
                .onChange(value => {
                    this.result.date_start = value;
                }));

        new Setting(contentEl)
            .setName('Location')
            .addText(text => text
                .onChange(value => {
                    this.result.location = value;
                }));

        new Setting(contentEl)
            .setName('Time control')
            .addDropdown(dropdown => dropdown
                .addOption('Standard', 'Standard')
                .addOption('Rapid', 'Rapid')
                .addOption('Blitz', 'Blitz')
                .setValue(this.result.time_control)
                .onChange(value => {
                    this.result.time_control = value;
                }));

        new Setting(contentEl)
            .setName('Time control details')
            .setDesc('E.g. 90m + 30s')
            .addText(text => text
                .onChange(value => {
                    this.result.time_control_details = value;
                }));

        new Setting(contentEl)
            .setName('Total rounds')
            .addText(text => text
                .setValue(String(this.result.total_rounds))
                .onChange(value => {
                    this.result.total_rounds = parseInt(value);
                }));

        new Setting(contentEl)
            .setName('Tournament link')
            .addText(text => text
                .onChange(value => {
                    this.result.link = value;
                }));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Create tournament')
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
