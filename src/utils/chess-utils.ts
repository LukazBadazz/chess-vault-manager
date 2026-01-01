export class ChessUtils {
    static calculateExpectedScore(playerRating: number, opponentRating: number): number {
        // FIDE 400-point rule (Handbook B.02.8.3):
        // A difference in rating of more than 400 points shall be counted for rating purposes as though it were a difference of 400 points.
        let diff = opponentRating - playerRating;
        if (diff > 400) diff = 400;
        if (diff < -400) diff = -400;

        return 1 / (1 + Math.pow(10, diff / 400));
    }

    /**
     * Calculates the FIDE rating change.
     * Note: This calculates per game. If calculation is done tournament-wise, 
     * it assumes we sum up the expected scores first.
     * FIDE Rule: ratingChange = K * (Score - Expected)
     */
    static calculateRatingChange(playerRating: number, opponentRating: number, result: number, kFactor: number = 20): number {
        const expected = this.calculateExpectedScore(playerRating, opponentRating);
        return kFactor * (result - expected);
    }

    static calculatePerformanceRating(opponentRatings: number[], totalScore: number): number {
        if (opponentRatings.length === 0) return 0;

        const avgOpponentRating = opponentRatings.reduce((a, b) => a + b, 0) / opponentRatings.length;
        const percentage = totalScore / opponentRatings.length;

        const dp = this.getFideDp(percentage);
        return Math.round(avgOpponentRating + dp);
    }

    private static getFideDp(p: number): number {
        if (p >= 1.0) return 800;
        if (p <= 0.0) return -800;

        const roundedP = Math.round(p * 100) / 100;

        const table: { [key: number]: number } = {
            1.00: 800, 0.99: 677, 0.98: 589, 0.97: 538, 0.96: 501, 0.95: 470, 0.94: 444, 0.93: 422, 0.92: 401, 0.91: 383,
            0.90: 366, 0.89: 351, 0.88: 336, 0.87: 322, 0.86: 309, 0.85: 296, 0.84: 284, 0.83: 273, 0.82: 262, 0.81: 251,
            0.80: 240, 0.79: 230, 0.78: 220, 0.77: 211, 0.76: 202, 0.75: 193, 0.74: 184, 0.73: 175, 0.72: 166, 0.71: 158,
            0.70: 149, 0.69: 141, 0.68: 133, 0.67: 125, 0.66: 117, 0.65: 110, 0.64: 102, 0.63: 95, 0.62: 87, 0.61: 80,
            0.60: 72, 0.59: 65, 0.58: 57, 0.57: 50, 0.56: 43, 0.55: 36, 0.54: 29, 0.53: 21, 0.52: 14, 0.51: 7,
            0.50: 0,
            0.49: -7, 0.48: -14, 0.47: -21, 0.46: -29, 0.45: -36, 0.44: -43, 0.43: -50, 0.42: -57, 0.41: -65, 0.40: -72,
            0.39: -80, 0.38: -87, 0.37: -95, 0.36: -102, 0.35: -110, 0.34: -117, 0.33: -125, 0.32: -133, 0.31: -141, 0.30: -149,
            0.29: -158, 0.28: -166, 0.27: -175, 0.26: -184, 0.25: -193, 0.24: -202, 0.23: -211, 0.22: -220, 0.21: -230, 0.20: -240,
            0.19: -251, 0.18: -262, 0.17: -273, 0.16: -284, 0.15: -296, 0.14: -309, 0.13: -322, 0.12: -336, 0.11: -351, 0.10: -366,
            0.09: -383, 0.08: -401, 0.07: -422, 0.06: -444, 0.05: -470, 0.04: -501, 0.03: -538, 0.02: -589, 0.01: -677, 0.00: -800
        };

        if (table[roundedP] !== undefined) return table[roundedP];
        return Math.round(-400 * Math.log10(1 / p - 1));
    }

    static parseResult(result: string, myColor: string): number {
        // Result string from PGN: 1-0, 0-1, 1/2-1/2
        if (result === '1/2-1/2') return 0.5;
        if (result === '1-0') return myColor.toLowerCase() === 'white' ? 1.0 : 0.0;
        if (result === '0-1') return myColor.toLowerCase() === 'black' ? 1.0 : 0.0;
        return 0; // Unknown or *
    }
}
