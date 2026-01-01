import { App, Modal, Setting, Notice } from 'obsidian';

export class OnlineGameModal extends Modal {
    url: string = '';
    onSubmit: (url: string) => void | Promise<void>;

    constructor(app: App, onSubmit: (url: string) => void | Promise<void>) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Log online game' });

        new Setting(contentEl)
            .setName('Game URL')
            .setDesc('Support Lichess for now (e.g., https://lichess.org/8vgicenB)')
            .addText(text => text
                .setPlaceholder('https://lichess.org/...')
                .onChange(value => {
                    this.url = value;
                }));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Fetch game')
                .setCta()
                .onClick(() => {
                    if (!this.url) {
                        new Notice('Please enter a URL');
                        return;
                    }
                    this.close();
                    void this.onSubmit(this.url);
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
