import { requestUrl } from 'obsidian';

export class FideApiService {
    static async getPlayerRating(fideId: string): Promise<number | null> {
        if (!fideId) return 0;
        try {
            const response = await requestUrl({
                url: `https://fide-api.vercel.app/player_info/?fide_id=${fideId}`,
                method: 'GET'
            });

            if (response.status === 200) {
                const data = response.json;
                // parsed response usually has classical_rating, rapid_rating, blitz_rating
                return data.classical_rating || 0;
            }
        } catch (error) {
            console.error("Failed to fetch FIDE rating", error);
        }
        return 0;
    }
    static async getPlayerInfo(fideId: string): Promise<{ name: string, rating: number } | null> {
        if (!fideId) return null;
        try {
            const response = await requestUrl({
                url: `https://fide-api.vercel.app/player_info/?fide_id=${fideId}`,
                method: 'GET'
            });

            if (response.status === 200) {
                const data = response.json;
                return {
                    name: data.name || "Unknown",
                    rating: data.classical_rating || 0
                };
            }
        } catch (error) {
            console.error("Failed to fetch FIDE info", error);
        }
        return null;
    }

    static async getFullPlayerInfo(fideId: string): Promise<any> {
        if (!fideId) return null;
        try {
            const response = await requestUrl({
                url: `https://fide-api.vercel.app/player_info/?fide_id=${fideId}`,
                method: 'GET'
            });

            if (response.status === 200) {
                return response.json;
            }
        } catch (error) {
            console.error("Failed to fetch FIDE data", error);
        }
        return null;
    }
}
