# ♟️ Chess Vault Manager

Manage your chess journey directly within Obsidian. Log tournaments, track your rating, and analyze games with ease.

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-purple.svg)](https://obsidian.md)
[![Release](https://img.shields.io/github/v/release/LukazBadazz/chess-vault-manager?label=Download)](https://github.com/LukazBadazz/chess-vault-manager/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 🚀 Overview

**Chess Vault Manager** is an Obsidian plugin designed for chess players who want to maintain a structured training diary and game database. It bridges the gap between your over-the-board (OTB) tournaments, online games, and your personal knowledge base.

---

## ✨ Key Features

### 🏆 Tournament Management
*   **Structured Notes**: Create dedicated tournament notes with detailed frontmatter (location, dates, time control).
*   **Live Controls**: Use the interactive `chess-tournament-controls` block to start and end tournaments.
*   **Auto-Stats**: Automatically calculates your total score, performance rating, and ELO change (using FIDE formulas) based on logged games.
*   **Dataview Integration**: Built-in templates to list all games within a tournament.

### 📝 Game Logging
*   **Over-the-Board (OTB)**: Log your tournament games with opponent FIDE ID lookups.
*   **Online Integration**: Instantly import your Lichess games via URL.
*   **Interactive Boards**: Deep integration with the [Chess Study](https://github.com/Chess-Study/obsidian-chess-study) plugin allows for interactive move-by-move analysis directly in your notes.

### 🌐 API Integrations
*   **FIDE Lookup**: Automatically fetches player names and ratings using the FIDE API.
*   **Lichess Import**: Pull PGNs and game metadata directly from Lichess.

---

## 🛠️ Setup & Configuration

1.  **Install the plugin** via community plugins or manual installation.
2.  **Configure Folders**: Set your preferred folders for Games and Tournaments in the settings.
3.  **Identify Yourself**:
    *   Enter your **FIDE ID** for automatic OTB rating tracking.
    *   Enter your **Lichess/Chess.com usernames** to ensure games are logged from your perspective.
4.  **Set K-Factor**: Adjust the development coefficient for rating calculations (default is 20).

---

## 📖 Usage

### Logging a Tournament
1.  Run the command `Chess Vault Manager: Log tournament`.
2.  Enter the tournament details in the modal.
3.  In the generated note, click **Start tournament** to begin tracking.

### Logging a Game
1.  Run `Chess Vault Manager: Log tournament game`.
2.  Select an active tournament.
3.  Enter the round, opponent info, and paste the PGN.
4.  The plugin will generate a game note and update your tournament stats.

### Import Online Games
1.  Run `Chess Vault Manager: Log online game`.
2.  Paste the Lichess game URL.
3.  Review your analysis in the newly created note!

---

## 🏗️ Development

### Local Setup
1.  Clone the repository.
2.  Run `npm install`.
3.  Run `npm run dev` to start the build in watch mode.
4.  Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder: `.obsidian/plugins/chess-vault-manager/`.

### Releasing
1.  Update version in `manifest.json`.
2.  Run `npm run version-bump` to update `package.json` and `versions.json`.
3.  Create a GitHub release with the compiled files.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an issue for feature requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Crafted for chess lovers by [Lukas Badazz](https://github.com/LukazBadazz)*

