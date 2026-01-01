import { requestUrl } from 'obsidian';

export class LichessApiService {
    static async getPgn(gameId: string): Promise<string | null> {
        try {
            const url = `https://lichess.org/game/export/${gameId}?moves=true&pgnInJson=false&tags=true&clocks=false&evals=false&accuracy=false&opening=true&division=false&literate=false&withBookmarked=false`;

            const response = await requestUrl({
                url: url,
                headers: {
                    'Accept': 'application/x-chess-pgn',
                }
            });

            if (response.status !== 200) {
                console.error(`Lichess API error: ${response.status}`);
                return null;
            }

            return response.text;
        } catch (error) {
            console.error('Error fetching Lichess PGN:', error);
            return null;
        }
    }

    static extractGameId(url: string): string | null {
        // Handle various lichess URL formats
        // https://lichess.org/8vgicenB1KqZ
        // https://lichess.org/8vgicenB
        // https://lichess.org/8vgicenB/white

        try {
            const match = url.match(/lichess\.org\/([a-zA-Z0-9]{8,12})/);
            if (match && match[1]) {
                // Lichess IDs are usually 8 characters, sometimes 12
                return match[1].substring(0, 8);
            }
            return null;
        } catch {
            return null;
        }
    }
}
